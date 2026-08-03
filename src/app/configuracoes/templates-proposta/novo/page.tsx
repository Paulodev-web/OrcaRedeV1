import type { Metadata } from "next";

import { DEFAULT_SECTIONS } from "@/services/proposals/defaults";

import { ConfigShell } from "../../_components/ConfigShell";
import { TemplateEditorClient } from "../../_components/TemplateEditorClient";

export const metadata: Metadata = {
  title: "Novo template de proposta — OrcaRede",
};

export default function NovoTemplatePage() {
  return (
    <ConfigShell
      title="Novo template de proposta"
      description="Comece pelas 19 seções padrão e ajuste o que a sua empresa usa"
      sectionId="templates-proposta"
      breadcrumb={[
        { label: "Templates de proposta", href: "/configuracoes/templates-proposta" },
        { label: "Novo" },
      ]}
      contentClassName="px-4 py-6 sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-5xl">
        <TemplateEditorClient template={null} defaultSections={DEFAULT_SECTIONS} description={null} />
      </div>
    </ConfigShell>
  );
}
