import type { Metadata } from "next";
import { ConfigShell } from "../../_components/ConfigShell";
import { EditorPadraoPosteClient } from "../../_components/EditorPadraoPosteClient";
import { getConfigSection } from "../../_components/sections";
import { getPoleStandardById } from "../../_data/entities";

const SECTION = getConfigSection("padroes-poste")!;

export const metadata: Metadata = {
  title: "Novo padrão de poste — Configurações — OrcaRede",
};

export default async function NovoPadraoPostePage({
  searchParams,
}: {
  searchParams: Promise<{ base?: string }>;
}) {
  const { base } = await searchParams;

  // "Criar a partir de": copia a composição de um padrão existente e zera o
  // `id`, que é como o editor distingue criação de edição.
  const baseStandard = base ? await getPoleStandardById(base) : null;
  const padrao = baseStandard ? { ...baseStandard, id: "" } : null;

  return (
    <ConfigShell
      title="Novo padrão de poste"
      description={
        baseStandard
          ? `Criando a partir de "${baseStandard.nome}". Ajuste o que precisar antes de salvar.`
          : "Combine tipo de poste, grupos de itens e materiais avulsos em um padrão reutilizável."
      }
      sectionId={SECTION.id}
      breadcrumb={[
        { label: SECTION.label, href: "/configuracoes/padroes-poste" },
        { label: "Novo" },
      ]}
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <EditorPadraoPosteClient padrao={padrao} />
      </div>
    </ConfigShell>
  );
}
