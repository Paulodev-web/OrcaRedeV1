import type { Metadata } from "next";

import { createSupabaseServerClient, requireAuthUserId } from "@/lib/supabaseServer";
import {
  listProposalTemplates,
  type ProposalTemplateSummary,
} from "@/services/proposals/templates";

import { ConfigShell } from "../_components/ConfigShell";
import { TemplatesListClient } from "../_components/TemplatesListClient";

export const metadata: Metadata = {
  title: "Templates de proposta — OrcaRede",
  description: "Texto institucional e estrutura de seções padrão das propostas.",
};

export default async function TemplatesPropostaPage() {
  let templates: ProposalTemplateSummary[] = [];
  let error: string | null = null;

  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);
    templates = await listProposalTemplates(supabase, userId);
  } catch (err) {
    error = err instanceof Error ? err.message : "Não foi possível carregar os templates.";
  }

  return (
    <ConfigShell
      title="Templates de proposta"
      description="Boilerplate institucional e estrutura de seções copiados por cada proposta nova"
      sectionId="templates-proposta"
      breadcrumb={[{ label: "Templates de proposta" }]}
      contentClassName="px-4 py-6 sm:px-6 lg:px-8"
    >
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : (
        <TemplatesListClient templates={templates} />
      )}
    </ConfigShell>
  );
}
