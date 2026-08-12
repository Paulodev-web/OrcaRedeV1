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
export const getModuleAccess = cache(async (): Promise<ModuleAccessState> => {
  const supabase = await createSupabaseServerClient();
  const user = await getCachedAuthUser(supabase);
  if (!user) return EMPTY_STATE;

  const { data: orgId } = await supabase.rpc('current_org_id');
  if (!orgId) return EMPTY_STATE;

  const { data: isAdmin } = await supabase.rpc('is_org_admin', { _org_id: orgId });
  if (isAdmin === true) {
    const all = new Set(GRANTABLE_MODULE_IDS);
    return { isOrgAdmin: true, canView: all, canEdit: all };
  }

  const { data: rows } = await supabase
    .from('module_permissions')
    .select('module_key, can_view, can_edit')
    .eq('org_id', orgId)
    .eq('user_id', user.id);

  const canView = new Set<AppModuleId>();
  const canEdit = new Set<AppModuleId>();
  for (const row of (rows ?? []) as { module_key: string; can_view: boolean; can_edit: boolean }[]) {
    const moduleId = row.module_key as AppModuleId;
    if (row.can_view) canView.add(moduleId);
    if (row.can_edit) canEdit.add(moduleId);
  }
  return { isOrgAdmin: false, canView, canEdit };
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
