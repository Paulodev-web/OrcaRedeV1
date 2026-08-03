import type { Metadata } from "next";
import { ConfigShell } from "../_components/ConfigShell";
import { GruposListClient } from "../_components/GruposListClient";
import { getConfigSection } from "../_components/sections";

const SECTION = getConfigSection("grupos")!;

export const metadata: Metadata = {
  title: "Grupos de itens — Configurações — OrcaRede",
  description: SECTION.description,
};

export default function GruposPage() {
  return (
    <ConfigShell
      title={SECTION.label}
      description={SECTION.description}
      sectionId={SECTION.id}
      breadcrumb={[{ label: SECTION.label }]}
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <GruposListClient />
      </div>
    </ConfigShell>
  );
}
