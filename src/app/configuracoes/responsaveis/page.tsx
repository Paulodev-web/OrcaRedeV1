import type { Metadata } from "next";
import { ConfigShell } from "../_components/ConfigShell";
import { ResponsaveisManager } from "../_components/ResponsaveisManager";
import { getConfigSection } from "../_components/sections";
import { listTechnicalResponsibles } from "../_data/company";

const SECTION = getConfigSection("responsaveis")!;

export const metadata: Metadata = {
  title: "Responsáveis técnicos — Configurações — OrcaRede",
  description: SECTION.description,
};

export default async function ResponsaveisPage() {
  const responsibles = await listTechnicalResponsibles();

  return (
    <ConfigShell
      title={SECTION.label}
      description={SECTION.description}
      sectionId={SECTION.id}
      breadcrumb={[{ label: SECTION.label }]}
    >
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <ResponsaveisManager responsibles={responsibles} />
      </div>
    </ConfigShell>
  );
}
