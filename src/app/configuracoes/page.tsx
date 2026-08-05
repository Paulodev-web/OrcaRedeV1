import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ConfigShell } from "./_components/ConfigShell";
import { ThemeToggleRow } from "@/components/theme/ThemeToggle";
import {
  CONFIG_GROUP_LABELS,
  CONFIG_GROUP_ORDER,
  CONFIG_SECTIONS,
  type ConfigSection,
} from "./_components/sections";

export const metadata: Metadata = {
  title: "Configurações — OrcaRede",
  description: "Catálogos, dados da empresa e cadastros do sistema.",
};

export default function ConfiguracoesPage() {
  return (
    <ConfigShell
      title="Configurações"
      description="Catálogos do orçamento, identidade da empresa e cadastros do sistema."
    >
      <div className="mx-auto w-full max-w-7xl space-y-10 px-4 py-8 sm:px-6 lg:px-8">
        {/* Preferência local do navegador, não configuração da empresa — por
            isso fica em uma linha própria antes dos grupos de catálogo, e não
            como um cartão entre eles. */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Preferências
          </h2>
          <div className="mt-4">
            <ThemeToggleRow />
          </div>
        </section>

        {CONFIG_GROUP_ORDER.map((group) => {
          const sections = CONFIG_SECTIONS.filter((section) => section.group === group);
          if (sections.length === 0) return null;

          return (
            <section key={group}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                {CONFIG_GROUP_LABELS[group]}
              </h2>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {sections.map((section) => (
                  <SectionCard key={section.id} section={section} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </ConfigShell>
  );
}

function SectionCard({ section }: { section: ConfigSection }) {
  const Icon = section.icon;
  const isSoon = section.status === "soon" || !section.href;

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
            isSoon
              ? "border-slate-200 bg-slate-100"
              : "border-brand-blue/40 bg-brand-blue/15"
          }`}
        >
          <Icon className={`h-5 w-5 ${isSoon ? "text-slate-400" : "text-brand-navy"}`} />
        </span>
        {isSoon ? (
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
            Em breve
          </span>
        ) : null}
      </div>

      <h3 className={`mt-4 text-base font-bold ${isSoon ? "text-slate-500" : "text-brand-navy"}`}>
        {section.label}
      </h3>
      <p className="mt-1 text-sm leading-relaxed text-slate-500">{section.description}</p>

      {isSoon ? null : (
        <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-blue">
          Abrir
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      )}
    </>
  );

  const baseClass =
    "group flex h-full flex-col rounded-2xl border bg-surface p-5 text-left shadow-sm transition-all";

  if (isSoon) {
    return (
      <div
        className={`${baseClass} cursor-not-allowed border-slate-200 opacity-70`}
        title="Disponível em uma fase seguinte"
      >
        {body}
      </div>
    );
  }

  return (
    <Link
      href={section.href!}
      prefetch
      className={`${baseClass} border-brand-blue/40 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue`}
    >
      {body}
    </Link>
  );
}
