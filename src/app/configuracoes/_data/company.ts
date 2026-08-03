import "server-only";
import { createSupabaseServerClient, requireAuthUserId } from "@/lib/supabaseServer";

/**
 * Leitura das telas de Empresa e Responsáveis Técnicos (Escopo §6.4).
 *
 * As duas tabelas são a origem de `ProposalCompany` e
 * `ProposalTechnicalResponsible` (`src/types/proposal.ts`), mas aqui o formato
 * é o da linha do banco: campos institucionais podem estar vazios enquanto o
 * cadastro está pela metade. Quem exige o contrato preenchido é a validação de
 * "proposta publicável", não estas telas.
 */

export interface CompanySettingsRow {
  id: string;
  legal_name: string;
  trade_name: string | null;
  cnpj: string | null;
  address: string | null;
  phone_primary: string | null;
  phone_secondary: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  whatsapp_number: string | null;
  logo_url: string | null;
  logo_storage_path: string | null;
}

export interface TechnicalResponsibleRow {
  id: string;
  full_name: string;
  crea: string;
  signature_url: string | null;
  signature_storage_path: string | null;
  is_active: boolean;
  order_index: number;
}

const COMPANY_COLUMNS =
  "id, legal_name, trade_name, cnpj, address, phone_primary, phone_secondary, email, website, instagram, whatsapp_number, logo_url, logo_storage_path";

const RESPONSIBLE_COLUMNS =
  "id, full_name, crea, signature_url, signature_storage_path, is_active, order_index";

/** `null` enquanto o usuário nunca salvou — a tela abre com o formulário vazio. */
export async function getCompanySettings(): Promise<CompanySettingsRow | null> {
  const supabase = await createSupabaseServerClient();
  const userId = await requireAuthUserId(supabase);

  const { data, error } = await supabase
    .from("company_settings")
    .select(COMPANY_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Erro ao carregar dados da empresa:", error);
    return null;
  }

  return data;
}

/** Inclui inativos: a tela precisa mostrar e permitir reativar. */
export async function listTechnicalResponsibles(): Promise<TechnicalResponsibleRow[]> {
  const supabase = await createSupabaseServerClient();
  const userId = await requireAuthUserId(supabase);

  const { data, error } = await supabase
    .from("technical_responsibles")
    .select(RESPONSIBLE_COLUMNS)
    .eq("user_id", userId)
    .order("is_active", { ascending: false })
    .order("order_index", { ascending: true })
    .order("full_name", { ascending: true });

  if (error) {
    console.error("Erro ao carregar responsáveis técnicos:", error);
    return [];
  }

  return data ?? [];
}
