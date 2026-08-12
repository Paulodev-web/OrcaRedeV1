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
 * `profiles.role` (engineer/manager) não entra aqui: é contrato do APK Android.
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
  role: OrgRole;
  sector: OrgSector | null;
  isActive: boolean;
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
  temporaryPassword: string;
  sector: OrgSector | null;
}

export interface CreatedOrgUser {
  userId: string;
  email: string;
  temporaryPassword: string;
}
