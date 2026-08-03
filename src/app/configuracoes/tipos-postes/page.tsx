import type { Metadata } from "next";
import { GerenciarTiposPostes } from "@/components/GerenciarTiposPostes";
import { ConfigShell } from "../_components/ConfigShell";
import { getConfigSection } from "../_components/sections";

const SECTION = getConfigSection("tipos-postes")!;

export const metadata: Metadata = {
  title: "Tipos de poste — Configurações — OrcaRede",
  description: SECTION.description,
};

export default function TiposPostesPage() {
  return (
    <ConfigShell
      title={SECTION.label}
      description={SECTION.description}
      sectionId={SECTION.id}
      breadcrumb={[{ label: SECTION.label }]}
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <GerenciarTiposPostes hideHeading />
      </div>
    </ConfigShell>
  );
}
