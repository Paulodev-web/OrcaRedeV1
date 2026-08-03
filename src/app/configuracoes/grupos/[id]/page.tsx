import type { Metadata } from "next";
import Link from "next/link";
import { ConfigShell } from "../../_components/ConfigShell";
import { EditorGrupoClient } from "../../_components/EditorGrupoClient";
import { getConfigSection } from "../../_components/sections";
import { getItemGroupById } from "../../_data/entities";

const SECTION = getConfigSection("grupos")!;

export const metadata: Metadata = {
  title: "Editar grupo de itens — Configurações — OrcaRede",
};

export default async function EditarGrupoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const grupo = await getItemGroupById(id);

  if (!grupo) {
    return (
      <ConfigShell
        title="Grupo não encontrado"
        sectionId={SECTION.id}
        breadcrumb={[{ label: SECTION.label, href: "/configuracoes/grupos" }, { label: "Editar" }]}
      >
        <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-600">
              Este grupo de itens não existe mais ou não está acessível na sua conta.
            </p>
            <Link
              href="/configuracoes/grupos"
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
      title={grupo.nome || "Editar grupo de itens"}
      description="Altere a composição do grupo. Orçamentos que já usam este grupo são atualizados em cascata."
      sectionId={SECTION.id}
      breadcrumb={[
        { label: SECTION.label, href: "/configuracoes/grupos" },
        { label: grupo.nome || "Editar" },
      ]}
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <EditorGrupoClient grupo={grupo} />
      </div>
    </ConfigShell>
  );
}
