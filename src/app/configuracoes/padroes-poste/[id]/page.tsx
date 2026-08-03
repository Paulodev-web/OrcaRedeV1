import type { Metadata } from "next";
import Link from "next/link";
import { ConfigShell } from "../../_components/ConfigShell";
import { EditorPadraoPosteClient } from "../../_components/EditorPadraoPosteClient";
import { getConfigSection } from "../../_components/sections";
import { getPoleStandardById } from "../../_data/entities";

const SECTION = getConfigSection("padroes-poste")!;

export const metadata: Metadata = {
  title: "Editar padrão de poste — Configurações — OrcaRede",
};

export default async function EditarPadraoPostePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const padrao = await getPoleStandardById(id);

  if (!padrao) {
    return (
      <ConfigShell
        title="Padrão não encontrado"
        sectionId={SECTION.id}
        breadcrumb={[
          { label: SECTION.label, href: "/configuracoes/padroes-poste" },
          { label: "Editar" },
        ]}
      >
        <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-600">
              Este padrão de poste não existe mais ou não está acessível na sua conta.
            </p>
            <Link
              href="/configuracoes/padroes-poste"
              className="mt-4 inline-flex text-sm font-medium text-brand-blue hover:brightness-95"
            >
              Voltar para a lista
            </Link>
          </div>
        </div>
      </ConfigShell>
    );
  }

  return (
    <ConfigShell
      title={padrao.nome || "Editar padrão de poste"}
      description="Alterar o padrão aplica a mudança em cascata aos postes de orçamentos que já o usam."
      sectionId={SECTION.id}
      breadcrumb={[
        { label: SECTION.label, href: "/configuracoes/padroes-poste" },
        { label: padrao.nome || "Editar" },
      ]}
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <EditorPadraoPosteClient padrao={padrao} />
      </div>
    </ConfigShell>
  );
}
