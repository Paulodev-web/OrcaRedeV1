import "server-only";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import type { GrupoItem, PoleStandard } from "@/types";

/**
 * Carregamento por `id` para os editores em rota (Escopo §6.3, "estado de
 * editor na URL").
 *
 * O `AppContext` só sabe buscar coleções por concessionária — o que bastava
 * quando o editor era alcançado a partir da lista, com a entidade já em
 * memória. Um deep link em `/configuracoes/grupos/[id]` não tem essa memória,
 * então a rota resolve a entidade no servidor. O mapeamento espelha o de
 * `fetchItemGroups`/`fetchPoleStandards` para os editores não perceberem
 * diferença entre os dois caminhos.
 */

export async function getItemGroupById(id: string): Promise<GrupoItem | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("item_group_templates")
    .select(
      `
      id,
      name,
      description,
      company_id,
      template_materials (
        material_id,
        quantity
      )
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Erro ao carregar grupo de itens:", error);
    return null;
  }
  if (!data) return null;

  return {
    id: data.id,
    nome: data.name ?? "",
    descricao: data.description ?? "",
    concessionariaId: data.company_id,
    materiais: (data.template_materials ?? []).map((tm) => ({
      materialId: tm.material_id,
      quantidade: tm.quantity,
    })),
  };
}

export async function getPoleStandardById(id: string): Promise<PoleStandard | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("pole_standards")
    .select(
      `
      id,
      name,
      description,
      post_type_id,
      pole_standard_companies (
        company_id
      ),
      pole_standard_groups (
        template_id,
        quantity
      ),
      pole_standard_materials (
        material_id,
        quantity
      )
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Erro ao carregar padrão de poste:", error);
    return null;
  }
  if (!data) return null;

  return {
    id: data.id,
    nome: data.name ?? "",
    descricao: data.description ?? "",
    concessionariaIds: (data.pole_standard_companies ?? []).map((c) => c.company_id),
    postTypeId: data.post_type_id,
    grupos: (data.pole_standard_groups ?? []).map((g) => ({
      templateId: g.template_id,
      quantidade: g.quantity,
    })),
    materiais: (data.pole_standard_materials ?? []).map((m) => ({
      materialId: m.material_id,
      quantidade: m.quantity,
    })),
  };
}
