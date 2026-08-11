"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, requireAuthUserId } from "@/lib/supabaseServer";
import type { ProposalRichBlock, ProposalSectionKey } from "@/types/proposal";

type ActionResult<T = undefined> = { success: boolean; error?: string; data?: T };

export interface TemplateSectionInput {
  key: ProposalSectionKey;
  title: string;
  order: number;
  enabled: boolean;
}

export interface TemplateResponsibilityInput {
  description: string;
  responsible: "contratada" | "contratante" | "ambos";
}

export interface ProposalTemplateInput {
  id?: string;
  name: string;
  description: string | null;
  scopeLabel: string;
  isDefault: boolean;
  sections: TemplateSectionInput[];
  institutional: {
    quemSomos: ProposalRichBlock | null;
    identidade: ProposalRichBlock | null;
    compromisso: ProposalRichBlock | null;
    diferencialOrcaRede: ProposalRichBlock | null;
  };
  billingConditions: ProposalRichBlock | null;
  finalConsiderations: ProposalRichBlock[];
  acceptanceClosingText: string | null;
  responsibilityItems: TemplateResponsibilityInput[];
}

function nullify(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function revalidate(id?: string) {
  revalidatePath("/configuracoes/templates-proposta");
  if (id) revalidatePath(`/configuracoes/templates-proposta/${id}`);
}

/**
 * Cria ou atualiza um template.
 *
 * O template é boilerplate copiado na criação da proposta: salvar aqui não
 * altera nenhuma proposta existente, de propósito — peça enviada ao cliente não
 * pode mudar porque alguém corrigiu um parágrafo institucional depois.
 */
export async function saveProposalTemplateAction(
  input: ProposalTemplateInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const name = input.name.trim();
    if (!name) return { success: false, error: "Dê um nome ao template." };

    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const row = {
      user_id: userId,
      name,
      description: nullify(input.description),
      scope_label: input.scopeLabel.trim() || "TIPO DE ESCOPO",
      is_default: input.isDefault,
      default_sections: input.sections
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((section, index) => ({
          key: section.key,
          title: section.title.trim() || section.key,
          order: index + 1,
          enabled: section.enabled,
        })),
      institutional: input.institutional,
      billing_conditions: input.billingConditions,
      final_considerations: input.finalConsiderations,
      acceptance_closing_text: nullify(input.acceptanceClosingText),
    };

    const query = input.id
      ? supabase.from("proposal_templates").update(row).eq("id", input.id)
      : supabase.from("proposal_templates").insert(row);

    const { data, error } = await query.select("id").single();
    if (error || !data) {
      return { success: false, error: error?.message ?? "Falha ao salvar o template." };
    }

    const templateId = String(data.id);

    // Só um template padrão por organização: marcar este desmarca os demais.
    if (input.isDefault) {
      await supabase
        .from("proposal_templates")
        .update({ is_default: false })
        .neq("id", templateId);
    }

    // A matriz é substituída inteira: reconciliar item a item não vale a
    // complexidade para uma lista curta e sempre editada em bloco.
    await supabase
      .from("proposal_template_responsibility_items")
      .delete()
      .eq("template_id", templateId);

    const items = input.responsibilityItems
      .map((item, index) => ({
        template_id: templateId,
        order_index: index + 1,
        description: item.description.trim(),
        responsible: item.responsible,
      }))
      .filter((item) => item.description.length > 0);

    if (items.length > 0) {
      const { error: itemsError } = await supabase
        .from("proposal_template_responsibility_items")
        .insert(items);
      if (itemsError) return { success: false, error: itemsError.message };
    }

    revalidate(templateId);
    return { success: true, data: { id: templateId } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro inesperado ao salvar o template.";
    return { success: false, error: message };
  }
}

export async function setDefaultProposalTemplateAction(id: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    await requireAuthUserId(supabase);

    const { error } = await supabase
      .from("proposal_templates")
      .update({ is_default: true })
      .eq("id", id);

    if (error) return { success: false, error: error.message };

    await supabase
      .from("proposal_templates")
      .update({ is_default: false })
      .neq("id", id);

    revalidate(id);
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro inesperado ao definir o padrão.";
    return { success: false, error: message };
  }
}

export async function deleteProposalTemplateAction(id: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    await requireAuthUserId(supabase);

    const { error } = await supabase
      .from("proposal_templates")
      .delete()
      .eq("id", id);

    if (error) return { success: false, error: error.message };

    revalidate();
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro inesperado ao excluir o template.";
    return { success: false, error: message };
  }
}
