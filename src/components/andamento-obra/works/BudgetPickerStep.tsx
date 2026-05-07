'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FileSearch, FileText, Loader2, Search, AlertTriangle } from 'lucide-react';
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { listImportableBudgets } from '@/actions/works';
import { onPortalPrimaryButtonSmClass } from '@/lib/branding';
import type { ImportableBudget } from '@/types/works';

interface BudgetPickerStepProps {
  onBack: () => void;
  onSelect: (budget: ImportableBudget) => void;
}

export function BudgetPickerStep({ onBack, onSelect }: BudgetPickerStepProps) {
  const [budgets, setBudgets] = useState<ImportableBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listImportableBudgets()
      .then((result) => {
        if (cancelled) return;
        if (!result.success) {
          setError(result.error ?? 'Não foi possível carregar os orçamentos.');
          setBudgets([]);
        } else {
          setBudgets(result.data?.budgets ?? []);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg =
          e instanceof Error
            ? e.message
            : 'Falha ao comunicar com o servidor. Tente atualizar a página.';
        setError(msg);
        setBudgets([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return budgets;
    return budgets.filter(
      (b) =>
        b.projectName.toLowerCase().includes(term) ||
        (b.clientName ?? '').toLowerCase().includes(term) ||
        (b.city ?? '').toLowerCase().includes(term),
    );
  }, [budgets, search]);

  const selected = budgets.find((b) => b.id === selectedId) ?? null;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Importar do OrçaRede</DialogTitle>
        <DialogDescription>
          Selecione um orçamento finalizado. Será criado um snapshot fixo do projeto na obra.
        </DialogDescription>
      </DialogHeader>

      <div className="px-6 py-4">
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, cliente ou cidade"
            className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-[#64ABDE] focus:outline-none focus:ring-1 focus:ring-[#64ABDE]"
          />
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando orçamentos…
          </div>
        )}

        {!loading && error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-gray-500">
            <FileSearch className="h-8 w-8 text-gray-300" />
            {budgets.length === 0
              ? 'Você ainda não tem orçamentos finalizados para importar.'
              : 'Nenhum orçamento corresponde à busca.'}
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {filtered.map((b) => (
              <BudgetRow
                key={b.id}
                budget={b}
                selected={b.id === selectedId}
                onClick={() => setSelectedId(b.id)}
              />
            ))}
          </ul>
        )}

        {selected && selected.persistedConnectionsCount === 0 && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
            <p>
              Este orçamento não tem conexões persistidas. Conexões só são salvas quando há uma
              obra de acompanhamento associada no OrçaRede legado.
            </p>
          </div>
        )}
      </div>

      <DialogFooter>
        <button
          type="button"
          onClick={onBack}
          className="mr-auto inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar
        </button>
        <button
          type="button"
          disabled={!selected}
          onClick={() => selected && onSelect(selected)}
          className={`${onPortalPrimaryButtonSmClass} rounded-lg px-4 py-2 text-sm disabled:opacity-60`}
        >
          Continuar
        </button>
      </DialogFooter>
    </>
  );
}

interface BudgetRowProps {
  budget: ImportableBudget;
  selected: boolean;
  onClick: () => void;
}

function BudgetRow({ budget, selected, onClick }: BudgetRowProps) {
  const finalized = formatDate(budget.finalizedAt);
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
          selected
            ? 'border-[#64ABDE] bg-[#64ABDE]/5'
            : 'border-gray-200 bg-white hover:border-[#64ABDE]/40 hover:bg-gray-50'
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[#1D3140]">{budget.projectName}</p>
            <p className="mt-0.5 truncate text-xs text-gray-500">
              {budget.clientName ?? 'Sem cliente'}
              {budget.city && ` · ${budget.city}`}
            </p>
          </div>
          {budget.hasPdf && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 ring-1 ring-blue-200"
              title="Tem planta/PDF"
            >
              <FileText className="h-3 w-3" /> PDF
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-gray-500">
          <span>{budget.postsCount} postes planejados</span>
          <span>{budget.persistedConnectionsCount} conexões persistidas</span>
          <span>Finalizado em {finalized}</span>
          {budget.existingActiveWorksCount > 0 && (
            <span className="text-amber-700">
              Já importado em {budget.existingActiveWorksCount} obra(s) ativa(s)
            </span>
          )}
        </div>
      </button>
    </li>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return iso;
  }
}
