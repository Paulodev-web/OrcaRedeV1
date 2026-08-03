import type { Metadata } from "next";
import { ConfigShell } from "../_components/ConfigShell";
import { PadroesPosteListClient } from "../_components/PadroesPosteListClient";
import { getConfigSection } from "../_components/sections";

const SECTION = getConfigSection("padroes-poste")!;

export const metadata: Metadata = {
  title: "Padrões de poste — Configurações — OrcaRede",
  description: SECTION.description,
};

export default function PadroesPostePage() {
  return (
    <ConfigShell
      title={SECTION.label}
      description={SECTION.description}
      sectionId={SECTION.id}
      breadcrumb={[{ label: SECTION.label }]}
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <PadroesPosteListClient />
      </div>
    </ConfigShell>
  );
}
