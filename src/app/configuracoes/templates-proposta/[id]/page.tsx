import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { createSupabaseServerClient, requireAuthUserId } from "@/lib/supabaseServer";
import { DEFAULT_SECTIONS } from "@/services/proposals/defaults";
import { listProposalTemplates, loadProposalTemplate } from "@/services/proposals/templates";

import { ConfigShell } from "../../_components/ConfigShell";
import { TemplateEditorClient } from "../../_components/TemplateEditorClient";

export const metadata: Metadata = {
  title: "Template de proposta — OrcaRede",
};

interface TemplatePageProps {
  params: Promise<{ id: string }>;
}

export default async function TemplatePage({ params }: TemplatePageProps) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const userId = await requireAuthUserId(supabase);

  // A descrição é campo da listagem, não do registro completo — buscar as duas
  // coisas é mais barato do que ampliar o select do serviço, que é consumido
  // pela criação de proposta e não precisa dela.
  const [template, summaries] = await Promise.all([
    loadProposalTemplate(supabase, userId, id),
    listProposalTemplates(supabase, userId),
  ]);

  if (!template) notFound();

  const description = summaries.find((item) => item.id === id)?.description ?? null;

  return (
    <ConfigShell
      title={template.name}
      description="Editar não altera propostas já criadas — o template é copiado na criação"
      sectionId="templates-proposta"
      breadcrumb={[
        { label: "Templates de proposta", href: "/configuracoes/templates-proposta" },
        { label: template.name },
      ]}
      contentClassName="px-4 py-6 sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-5xl">
        <TemplateEditorClient
          template={template}
          defaultSections={DEFAULT_SECTIONS}
          description={description}
        />
      </div>
    </ConfigShell>
  );
}
