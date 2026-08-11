import type { Metadata } from "next";
import { ConfigShell } from "../_components/ConfigShell";
import { OrganizacaoManager } from "../_components/OrganizacaoManager";
import { getConfigSection } from "../_components/sections";
import { getOrganizationScreenData } from "../_data/organization";

const SECTION = getConfigSection("organizacao")!;

export const metadata: Metadata = {
  title: "Organização e equipe — Configurações — OrcaRede",
  description: SECTION.description,
};

export default async function OrganizacaoPage() {
  const data = await getOrganizationScreenData();

  return (
    <ConfigShell
      title={SECTION.label}
      description={SECTION.description}
      sectionId={SECTION.id}
      breadcrumb={[{ label: SECTION.label }]}
    >
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <OrganizacaoManager data={data} />
      </div>
    </ConfigShell>
  );
}
