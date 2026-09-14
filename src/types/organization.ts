/**
 * Modelo compartilhado da camada de organização (MD/PLANO-ORG-MULTITENANCY.md §5).
 *
 * Fica em `src/types/` — e não em `configuracoes/_data/` — porque a tela é um
 * client component e o módulo de leitura é `server-only`: importar as constantes
 * de lá arrastaria o cliente Supabase de servidor para o bundle do browser.
 *
 * Os três eixos abaixo são independentes e não devem ser confundidos:
 *
 *   role   → quem administra a organização (governança)
 *   sector → onde a pessoa trabalha (roteamento do Quadro de Trabalho)
 *   módulo → o que ela vê e edita (`module_permissions`)
 *
 * `profiles.role` (engineer/manager) é o quarto eixo — contrato do APK Android,
 * não da organização. Aparece aqui só como `isWorkManager`, porque desde que o
 * cadastro de gerente saiu de Andamento de Obra esta tela é o único lugar que
 * o liga e desliga.
 */

export const ORG_SECTORS = ["comercial", "engenharia", "compras", "execucao"] as const;
export type OrgSector = (typeof ORG_SECTORS)[number];

export const ORG_SECTOR_LABELS: Record<OrgSector, string> = {
  comercial: "Comercial",
  engenharia: "Engenharia",
  compras: "Compras",
  execucao: "Execução",
};

export const ORG_ROLES = ["owner", "admin", "member"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Dono",
  admin: "Administrador",
  member: "Membro",
};

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  cnpj: string | null;
  isActive: boolean;
}

export interface OrgMemberRow {
  id: string;
  userId: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  role: OrgRole;
  sector: OrgSector | null;
  isActive: boolean;
  /**
   * `profiles.role = 'manager'`: a pessoa entra no APK de campo e pode ser
   * escolhida no campo "Gerente" de uma obra. É o quarto eixo, e o único que
   * não vive em tabela da organização — `profiles` é contrato do Android.
   */
  isWorkManager: boolean;
  /** Módulos com `can_view`, e quais deles também têm `can_edit`. */
  modules: { moduleKey: string; canView: boolean; canEdit: boolean }[];
}

export interface OrganizationScreenData {
  /** `null` quando o usuário não pertence a organização nenhuma. */
  activeOrgId: string | null;
  /** Todas as organizações que o usuário pode eleger como ativa. */
  organizations: OrgSummary[];
  members: OrgMemberRow[];
  /** Se `false`, a tela é somente leitura. */
  canManage: boolean;
  /** Só o `owner` (ou admin de plataforma) — mais restrito que `canManage`. */
  canInvite: boolean;
  viewerUserId: string;
}

export interface CreateOrgUserInput {
  fullName: string;
  email: string;
  phone: string | null;
  temporaryPassword: string;
  sector: OrgSector | null;
  /** Cria a conta já como gerente de obra (acesso ao app de campo). */
  isWorkManager: boolean;
}

export interface UpdateWorkManagerInput {
  userId: string;
  fullName: string;
  phone: string | null;
}

export interface CreatedOrgUser {
  userId: string;
  email: string;
  temporaryPassword: string;
}
