import type { Metadata } from "next";
import { GerenciarConcessionarias } from "@/components/GerenciarConcessionarias";
import { ConfigShell } from "../_components/ConfigShell";
import { getConfigSection } from "../_components/sections";

const SECTION = getConfigSection("concessionarias")!;

export const metadata: Metadata = {
  title: "Concessionárias — Configurações — OrcaRede",
  description: SECTION.description,
};

export default function ConcessionariasPage() {
  return (
    <ConfigShell
      title={SECTION.label}
      description={SECTION.description}
      sectionId={SECTION.id}
      breadcrumb={[{ label: SECTION.label }]}
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <GerenciarConcessionarias hideHeading />
      </div>
    </ConfigShell>
  );
}
