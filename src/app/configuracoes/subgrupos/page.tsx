import type { Metadata } from "next";
import { GerenciarMaterialSubgroups } from "@/components/GerenciarMaterialSubgroups";
import { ConfigShell } from "../_components/ConfigShell";
import { getConfigSection } from "../_components/sections";

const SECTION = getConfigSection("subgrupos")!;

export const metadata: Metadata = {
  title: "Subgrupos de materiais — Configurações — OrcaRede",
  description: SECTION.description,
};

export default function SubgruposPage() {
  return (
    <ConfigShell
      title={SECTION.label}
      description={SECTION.description}
      sectionId={SECTION.id}
      breadcrumb={[{ label: SECTION.label }]}
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <GerenciarMaterialSubgroups hideHeading />
      </div>
    </ConfigShell>
  );
}
