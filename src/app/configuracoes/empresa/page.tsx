import type { Metadata } from "next";
import { ConfigShell } from "../_components/ConfigShell";
import { EmpresaForm } from "../_components/EmpresaForm";
import { getConfigSection } from "../_components/sections";
import { getCompanySettings } from "../_data/company";

const SECTION = getConfigSection("empresa")!;

export const metadata: Metadata = {
  title: "Empresa — Configurações — OrcaRede",
  description: SECTION.description,
};

export default async function EmpresaPage() {
  const settings = await getCompanySettings();

  return (
    <ConfigShell
      title={SECTION.label}
      description={SECTION.description}
      sectionId={SECTION.id}
      breadcrumb={[{ label: SECTION.label }]}
    >
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <EmpresaForm settings={settings} />
      </div>
    </ConfigShell>
  );
}
