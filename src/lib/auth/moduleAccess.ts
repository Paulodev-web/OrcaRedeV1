import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient, getCachedAuthUser } from '@/lib/supabaseServer';
import { APP_MODULES, type AppModuleId } from '@/components/layout/modules';

export interface ModuleAccessState {
  /** owner/admin da org ativa, ou admin de plataforma: enxerga tudo, sem depender de linha. */
  isOrgAdmin: boolean;
  canView: Set<AppModuleId>;
  canEdit: Set<AppModuleId>;
}

const EMPTY_STATE: ModuleAccessState = { isOrgAdmin: false, canView: new Set(), canEdit: new Set() };

/** Todo módulo real, exceto o Portal — que é a casa de todos e nunca é restringido. */
const GRANTABLE_MODULE_IDS = APP_MODULES.filter((mod) => mod.id !== 'portal').map((mod) => mod.id);

/**
 * Fonte única da verdade para "o que esta pessoa pode ver/editar" — usada tanto
 * para esconder da navegação (sidebar, Portal) quanto para barrar a URL direta.
 *
 * `cache()`: uma consulta por request, mesmo chamada de layout E página na
 * mesma árvore (mesmo padrão de `createSupabaseServerClient`/`requireAuthUserId`
 * em `supabaseServer.ts`).
 *
 * owner/admin da org (e admin de plataforma, via `is_org_admin`) sempre vê
 * tudo, SEM depender de ter linha em `module_permissions`. Sem isso, um admin
 * conseguiria se trancar para fora da própria tela de permissões.
 */
interface PermissionRow {
  module_key: string;
  can_view: boolean;
  can_edit: boolean;
}

/** Monta o estado a partir das linhas de `module_permissions`. */
function buildState(rows: PermissionRow[]): ModuleAccessState {
  const canView = new Set<AppModuleId>();
  const canEdit = new Set<AppModuleId>();
  for (const row of rows) {
    const moduleId = row.module_key as AppModuleId;
    if (row.can_view) canView.add(moduleId);
    if (row.can_edit) canEdit.add(moduleId);
  }
  return { isOrgAdmin: false, canView, canEdit };
}

const ADMIN_STATE = (): ModuleAccessState => {
  const all = new Set(GRANTABLE_MODULE_IDS);
  return { isOrgAdmin: true, canView: all, canEdit: all };
};

/**
 * Caminho antigo: três consultas EM SÉRIE.
 *
 * Continua aqui só como rede de segurança para o intervalo entre subir este
 * código e rodar a migration `20260817120000_current_module_access`. Sem isso,
 * quem publicasse o código antes da migration derrubaria a permissão de TODO
 * mundo — `redirect('/')` em cada página — porque a função ainda não existiria
 * no banco. Pode ser removido assim que a migration estiver aplicada em
 * produção.
 */
async function getModuleAccessLegacy(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string
): Promise<ModuleAccessState> {
  const { data: orgId } = await supabase.rpc('current_org_id');
  if (!orgId) return EMPTY_STATE;

  const { data: isAdmin } = await supabase.rpc('is_org_admin', { _org_id: orgId });
  if (isAdmin === true) return ADMIN_STATE();

  const { data: rows } = await supabase
    .from('module_permissions')
    .select('module_key, can_view, can_edit')
    .eq('org_id', orgId)
    .eq('user_id', userId);

  return buildState((rows ?? []) as PermissionRow[]);
}

export const getModuleAccess = cache(async (): Promise<ModuleAccessState> => {
  const supabase = await createSupabaseServerClient();
  const user = await getCachedAuthUser(supabase);
  if (!user) return EMPTY_STATE;

  // UMA chamada no lugar de três em série (org ativa → é admin? → permissões).
  // Cada ida ao PostgREST custa ~250ms de rede nesta produção, contra ~37ms de
  // execução no banco; encadeadas, eram ~500-750ms em toda navegação, antes de
  // a página buscar qualquer dado próprio. A regra de acesso não mudou — ela só
  // passou a ser resolvida de uma vez, dentro do banco.
  const { data, error } = await supabase.rpc('current_module_access');

  if (error) {
    // Só chega aqui se a migration ainda não rodou (função inexistente). Ver
    // `getModuleAccessLegacy`.
    console.error('current_module_access indisponível, usando caminho antigo:', error.message);
    return getModuleAccessLegacy(supabase, user.id);
  }

  const access = data as {
    org_id: string | null;
    is_admin: boolean;
    permissions: PermissionRow[];
  } | null;

  if (!access?.org_id) return EMPTY_STATE;
  if (access.is_admin) return ADMIN_STATE();

  return buildState(access.permissions ?? []);
});

/**
 * Portão de servidor para a raiz de um módulo (layout ou página).
 *
 * Cobre sessão ausente e permissão ausente com o mesmo `redirect('/')` — as
 * duas coisas já se comportavam assim nas páginas que tinham checagem própria.
 *
 * ⚠ Chamar FORA de blocos try/catch genéricos: `redirect()` funciona lançando
 * uma exceção interna do Next, que um `catch` sem filtro engoliria antes do
 * redirecionamento acontecer.
 */
export async function requireModuleAccess(moduleId: AppModuleId): Promise<void> {
  const access = await getModuleAccess();
  if (access.isOrgAdmin || access.canView.has(moduleId)) return;
  redirect('/');
}
