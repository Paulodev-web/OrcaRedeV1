import type { Metadata } from "next";
import { ConfigShell } from "../../_components/ConfigShell";
import { EditorGrupoClient } from "../../_components/EditorGrupoClient";
import { getConfigSection } from "../../_components/sections";

const SECTION = getConfigSection("grupos")!;

export const metadata: Metadata = {
  title: "Novo grupo de itens — Configurações — OrcaRede",
};

export default function NovoGrupoPage() {
  return (
    <ConfigShell
      title="Novo grupo de itens"
      description="Monte um kit de materiais reutilizável para uma ou mais concessionárias."
      sectionId={SECTION.id}
      breadcrumb={[
        { label: SECTION.label, href: "/configuracoes/grupos" },
        { label: "Novo" },
      ]}
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <EditorGrupoClient grupo={null} />
      </div>
    </ConfigShell>
  );
}
