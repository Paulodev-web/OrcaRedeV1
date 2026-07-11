"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  Calculator,
  Download,
  FileSpreadsheet,
  Loader2,
  Search,
  Trash2,
} from 'lucide-react';
import { deletePricingBudgetAction } from '@/actions/pricingBudgets';
import type { SavedPricingBudget } from './types';

interface PricingDashboardClientProps {
  initialItems: SavedPricingBudget[];
}

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function modeLabel(item: SavedPricingBudget): string {
  return item.saveMode === 'snapshot' ? 'Snapshot' : 'Atual';
}

function downloadFilenameFromResponse(response: Response, fallback: string): string {
  const disposition = response.headers.get('Content-Disposition');
  const match = disposition?.match(/filename="([^"]+)"/i);
  return match?.[1] || fallback;
}

export function PricingDashboardClient({ initialItems }: PricingDashboardClientProps) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [search, setSearch] = useState('');
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;

    return items.filter((item) => {
      return (
        item.budgetName.toLowerCase().includes(term) ||
        item.clientName?.toLowerCase().includes(term) ||
        item.city?.toLowerCase().includes(term)
      );
    });
  }, [items, search]);

  const totals = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.totalCliente += item.result.precoTotalCliente;
        acc.lucroLiquido += item.result.lucroLiquido;
        return acc;
      },
      { totalCliente: 0, lucroLiquido: 0 }
    );
  }, [items]);

  const handleExport = async (item: SavedPricingBudget) => {
    setExportingId(item.id);
    try {
      const response = await fetch(`/api/pricing/export?savedId=${encodeURIComponent(item.id)}`);
      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error || 'Erro ao exportar Excel.');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = downloadFilenameFromResponse(response, `precificacao-${item.budgetName}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success('Excel gerado com sucesso.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao exportar Excel.';
      toast.error(message);
    } finally {
      setExportingId(null);
    }
  };

  const handleDelete = (item: SavedPricingBudget) => {
    if (!window.confirm(`Excluir a precificação salva de "${item.budgetName}"?`)) {
      return;
    }

    setDeletingId(item.id);
    startTransition(async () => {
      const result = await deletePricingBudgetAction(item.id);
      setDeletingId(null);

      if (result.success) {
        setItems((prev) => prev.filter((saved) => saved.id !== item.id));
        toast.success('Precificação removida.');
        return;
      }

      toast.error(result.error);
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs text-gray-400">
            <Link href="/" className="hover:text-[#64ABDE]">
              Portal
            </Link>
            <span className="mx-1">/</span>
            <span className="text-gray-600">Módulo de Precificação</span>
          </p>
          <h1 className="mt-1 text-2xl font-bold text-[#1D3140]">Dashboard de Precificação</h1>
          <p className="mt-1 text-sm text-gray-500">
            Orçamentos precificados salvos como cards. Clique em um card para editar.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/tools/precificacao/nova"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#64ABDE] px-4 text-sm font-medium text-white shadow-sm transition hover:brightness-95"
          >
            <Calculator className="h-4 w-4" />
            Nova precificação
          </Link>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-500">Cards salvos</p>
          <p className="mt-1 text-2xl font-bold text-[#1D3140]">{items.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-500">Total ao cliente</p>
          <p className="mt-1 text-2xl font-bold text-[#1D3140]">
            {currencyFormatter.format(totals.totalCliente)}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-500">Lucro líquido</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">
            {currencyFormatter.format(totals.lucroLiquido)}
          </p>
        </div>
      </section>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por orçamento, cliente ou cidade..."
            className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-[#64ABDE] focus:ring-2 focus:ring-[#64ABDE]/15"
          />
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 bg-white p-10 text-center">
          <Calculator className="mx-auto h-10 w-10 text-gray-300" />
          <h2 className="mt-3 text-lg font-semibold text-[#1D3140]">Nenhuma precificação salva</h2>
          <p className="mt-1 text-sm text-gray-500">
            Crie uma precificação vinculada a um orçamento para gerar o primeiro card.
          </p>
          <Link
            href="/tools/precificacao/nova"
            className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-[#64ABDE] px-4 text-sm font-medium text-white transition hover:brightness-95"
          >
            Criar precificação
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredItems.map((item) => {
            const lucroNegativo = item.result.lucroLiquido < 0;
            const deleting = deletingId === item.id && isPending;
            const exporting = exportingId === item.id;

            return (
              <article
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/tools/precificacao/editar/${item.id}`)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    router.push(`/tools/precificacao/editar/${item.id}`);
                  }
                }}
                className="cursor-pointer rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-[#64ABDE]/40 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-[#1D3140]" title={item.budgetName}>
                      {item.budgetName}
                    </h2>
                    <p className="mt-0.5 truncate text-sm text-gray-500">
                      {[item.clientName, item.city].filter(Boolean).join(' · ') || 'Sem cliente/cidade'}
                    </p>
                  </div>
                  <span className="rounded-full border border-[#64ABDE]/30 bg-[#64ABDE]/10 px-2.5 py-1 text-xs font-medium text-[#1D3140]">
                    {modeLabel(item)}
                  </span>
                </div>

                <div className="mt-4 grid gap-2 text-sm">
                  <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                    <span className="text-gray-600">Materiais</span>
                    <span className="font-medium text-[#1D3140]">{currencyFormatter.format(item.result.valorMateriais)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                    <span className="text-gray-600">Serviço</span>
                    <span className="font-medium text-[#1D3140]">{currencyFormatter.format(item.result.valorServico)}</span>
                  </div>
                  <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${lucroNegativo ? 'bg-red-50' : 'bg-emerald-50'}`}>
                    <span className="text-gray-600">Lucro líquido</span>
                    <span className={`font-semibold ${lucroNegativo ? 'text-red-700' : 'text-emerald-700'}`}>
                      {currencyFormatter.format(item.result.lucroLiquido)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-[#64ABDE]/30 bg-[#64ABDE]/5 px-3 py-2">
                    <span className="font-semibold text-[#1D3140]">Total ao cliente</span>
                    <span className="text-lg font-bold text-[#64ABDE]">
                      {currencyFormatter.format(item.result.precoTotalCliente)}
                    </span>
                  </div>
                </div>

                <p className="mt-3 text-xs text-gray-500">
                  Atualizado em {formatDate(item.updatedAt)}
                  <span className="mx-1">·</span>
                  <span className="text-[#64ABDE]">Clique para editar</span>
                </p>

                <div className="mt-4 flex gap-2" onClick={(event) => event.stopPropagation()}>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleExport(item);
                    }}
                    disabled={exporting}
                    className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                    Excel
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleExport(item);
                    }}
                    disabled={exporting}
                    className="inline-flex h-9 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:text-[#1D3140] disabled:cursor-not-allowed disabled:opacity-60"
                    title="Baixar Excel"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDelete(item);
                    }}
                    disabled={deleting}
                    className="inline-flex h-9 w-10 items-center justify-center rounded-lg border border-red-100 bg-white text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                    title="Excluir card"
                  >
                    {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
