'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Brain,
  CheckCircle2,
  Database,
  HelpCircle,
  Loader2,
  Search,
  Sparkles,
} from 'lucide-react';
import {
  getConciliationPayloadBySessionAction,
  acceptAiSuggestionAction,
  type SessionConciliationMaterialRow,
  type SessionConciliationQuoteSummary,
  type BudgetMaterialOption,
  type SupplierQuoteItemWithMaterial,
} from '@/actions/supplierQuotes';
import { onPortalPrimaryButtonSmClass } from '@/lib/branding';

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export type SessionConciliationPayload = {
  materials: SessionConciliationMaterialRow[];
  unlinked_items: (SupplierQuoteItemWithMaterial & { supplier_name: string })[];
  budgetMaterials: BudgetMaterialOption[];
  supplier_column_order: string[];
  quotes_summary: SessionConciliationQuoteSummary[];
};

interface Props {
  sessionId: string;
  budgetId: string | null;
  initialPayload: SessionConciliationPayload | null;
  initialError: string | null;
}

type LinkedItem = SupplierQuoteItemWithMaterial & {
  supplier_name: string;
  suggestion_id?: string | null;
};

function StatusBadge({ item }: { item: SupplierQuoteItemWithMaterial }) {
  if (item.match_status === 'automatico' && item.match_method === 'exact_memory') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[#64ABDE]/40 bg-[#64ABDE]/15 px-2 py-0.5 text-xs text-[#1D3140]">
        <Database className="h-3 w-3" /> Memória
      </span>
    );
  }
  if (item.match_status === 'ia_suggested') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 border border-amber-200">
        <Sparkles className="h-3 w-3" /> Sugestão IA
      </span>
    );
  }
  if (item.match_status === 'automatico' && item.match_method === 'semantic_ai') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700 border border-purple-200">
        <Brain className="h-3 w-3" /> IA validada
      </span>
    );
  }
  if (item.match_status === 'manual') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700 border border-green-200">
        <CheckCircle2 className="h-3 w-3" /> Manual
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700 border border-red-200">
      <HelpCircle className="h-3 w-3" /> Pendente
    </span>
  );
}

function SupplierCell({
  items,
  onApproved,
}: {
  items: LinkedItem[];
  onApproved: (itemId: string, newStatus: string) => void;
}) {
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (items.length === 0) {
    return <span className="text-xs text-gray-300 select-none">—</span>;
  }

  const handleApprove = (item: LinkedItem) => {
    setApprovingId(item.id);
    startTransition(async () => {
      if (item.match_status === 'ia_suggested' && item.suggestion_id && item.matched_material_id) {
        const res = await acceptAiSuggestionAction({
          itemId: item.id,
          suggestionId: item.suggestion_id,
          materialId: item.matched_material_id,
          conversionFactor: item.conversion_factor,
          supplierName: item.supplier_name,
          supplierMaterialName: item.descricao,
        });
        if (res.success) {
          onApproved(item.id, 'automatico');
        }
      }
      setApprovingId(null);
    });
  };

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const needsApproval = item.match_status === 'ia_suggested';
        const isApproving = approvingId === item.id && isPending;
        return (
          <div key={item.id} className="rounded-md border border-gray-100 bg-gray-50/50 p-2.5 text-xs">
            <p className="mb-1 break-words font-medium leading-snug text-gray-800">{item.descricao}</p>
            <p className="text-gray-500 mb-1.5">
              {fmtCurrency(item.preco_unit)}
              {item.conversion_factor !== 1 && (
                <span className="ml-1 text-gray-400">× {item.conversion_factor}</span>
              )}
            </p>
            {item.suggestion_rationale && (
              <p className="mb-1.5 break-words italic leading-snug text-gray-400">{item.suggestion_rationale}</p>
            )}
            <div className="flex items-center justify-between gap-1.5 flex-wrap">
              <StatusBadge item={item} />
              {needsApproval && (
                <button
                  type="button"
                  onClick={() => handleApprove(item)}
                  disabled={isApproving}
                  className="inline-flex items-center gap-1 rounded bg-green-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {isApproving ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                  Aprovar
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ConciliationCurationView({
  sessionId,
  budgetId,
  initialPayload,
  initialError,
}: Props) {
  const router = useRouter();
  const [materials, setMaterials] = useState<SessionConciliationMaterialRow[]>(
    () => initialPayload?.materials ?? [],
  );
  const [unlinked, setUnlinked] = useState<(SupplierQuoteItemWithMaterial & { supplier_name: string })[]>(
    () => initialPayload?.unlinked_items ?? [],
  );
  const [supplierColumnOrder, setSupplierColumnOrder] = useState<string[]>(
    () => initialPayload?.supplier_column_order ?? [],
  );
  const [loadError, setLoadError] = useState<string | null>(() => initialError);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  useEffect(() => {
    if (initialPayload) {
      setMaterials(initialPayload.materials);
      setUnlinked(initialPayload.unlinked_items);
      setSupplierColumnOrder(initialPayload.supplier_column_order);
      setLoadError(null);
    } else if (initialError) {
      setLoadError(initialError);
    }
  }, [initialPayload, initialError]);

  const handleItemApproved = (itemId: string, newStatus: string) => {
    setMaterials((prev) =>
      prev.map((mat) => ({
        ...mat,
        linked_items: mat.linked_items.map((it) =>
          it.id === itemId ? { ...it, match_status: newStatus as typeof it.match_status } : it,
        ),
      })),
    );
  };

  const handleRefresh = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    void getConciliationPayloadBySessionAction(sessionId)
      .then((res) => {
        if (res.success) {
          setMaterials(res.data.materials);
          setUnlinked(res.data.unlinked_items);
          setSupplierColumnOrder(res.data.supplier_column_order);
          setLoadError(null);
          setLastRefreshedAt(
            new Intl.DateTimeFormat('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }).format(new Date()),
          );
        } else {
          setLoadError(res.error);
        }
        router.refresh();
      })
      .finally(() => {
        setIsRefreshing(false);
      });
  };

  const needle = searchFilter.toLowerCase();
  const filteredMaterials = useMemo(
    () =>
      searchFilter
        ? materials.filter(
            (m) =>
              m.material_name.toLowerCase().includes(needle) ||
              m.material_code.toLowerCase().includes(needle) ||
              m.linked_items.some((it) => it.descricao.toLowerCase().includes(needle)),
          )
        : materials,
    [materials, searchFilter, needle],
  );

  const totalApproved = materials.reduce(
    (sum, m) =>
      sum +
      m.linked_items.filter((it) => it.match_status === 'automatico' || it.match_status === 'manual').length,
    0,
  );
  const totalIaSuggested = materials.reduce(
    (sum, m) => sum + m.linked_items.filter((it) => it.match_status === 'ia_suggested').length,
    0,
  );
  const supplierColumnsCount = supplierColumnOrder.length;
  const firstColumnWidthPct = supplierColumnsCount > 0 ? 30 : 100;
  const supplierColumnWidthPct = supplierColumnsCount > 0 ? 70 / supplierColumnsCount : 0;

  const showEmpty = !loadError && filteredMaterials.length === 0 && unlinked.length === 0;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#64ABDE]/40 bg-white p-6 shadow-md">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-[#1D3140]">Conciliação de materiais</h1>
            <p className="mt-1 text-sm text-slate-500">
              Materiais do orçamento (fonte da verdade) e uma coluna por fornecedor, na ordem de importação.
              Aprove sugestões da IA para salvar na memória.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
              <span className="text-gray-600">
                <span className="font-medium text-[#1D3140]">{totalApproved}</span> validados
              </span>
              {totalIaSuggested > 0 && (
                <span className="text-amber-600">
                  <span className="font-medium">{totalIaSuggested}</span> aguardando aprovação
                </span>
              )}
              {unlinked.length > 0 && (
                <span className="text-red-600">
                  <span className="font-medium">{unlinked.length}</span> sem vínculo
                </span>
              )}
              {supplierColumnOrder.length > 0 && (
                <span className="text-gray-400">
                  {supplierColumnOrder.length} fornecedor{supplierColumnOrder.length > 1 ? 'es' : ''}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              {isRefreshing && <Loader2 className="h-4 w-4 animate-spin" />}
              {isRefreshing ? 'Atualizando...' : 'Atualizar'}
            </button>
            {budgetId && (
              <Link
                href={`/fornecedores/sessao/${sessionId}/cenarios`}
                className={`inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium ${onPortalPrimaryButtonSmClass}`}
              >
                Cenários de compra
              </Link>
            )}
          </div>
        </div>
        {lastRefreshedAt && (
          <p className="mt-2 text-xs text-gray-400">Atualizado as {lastRefreshedAt}</p>
        )}

        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm placeholder:text-gray-400 focus:border-[#64ABDE] focus:outline-none"
            placeholder="Buscar material ou item…"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
          />
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError}</div>
      )}

      {!loadError && showEmpty && (
        <p className="rounded-xl border border-dashed border-gray-200 bg-white py-12 text-center text-sm text-gray-500">
          Nenhum material ou item disponível para conciliação.
        </p>
      )}

      {!loadError && (filteredMaterials.length > 0 || unlinked.length > 0) && (
        <div className="min-w-0 overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[640px] table-fixed border-collapse text-sm">
            <colgroup>
              <col style={{ width: `${firstColumnWidthPct}%` }} />
              {supplierColumnOrder.map((name) => (
                <col key={name} style={{ width: `${supplierColumnWidthPct}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="sticky left-0 top-0 z-30 bg-white px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 shadow-[1px_0_0_0_#e5e7eb,0_1px_0_0_#e5e7eb]">
                  Fonte da verdade
                </th>
                {supplierColumnOrder.map((name) => (
                  <th
                    key={name}
                    className="sticky top-0 z-20 border-r border-gray-100 bg-white px-4 py-3 text-left align-bottom text-xs font-semibold uppercase tracking-wide text-[#1D3140] shadow-[0_1px_0_0_#e5e7eb] last:border-r-0"
                    title={name}
                  >
                    <span className="line-clamp-4 break-words font-semibold normal-case tracking-normal">
                      {name}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredMaterials.map((mat) => (
                <tr key={mat.material_id} className="transition-colors hover:bg-gray-50/50">
                  <td className="sticky left-0 z-10 border-r border-gray-200 bg-white px-4 py-3 align-top shadow-[1px_0_0_0_#e5e7eb]">
                    <p className="break-words text-sm font-semibold leading-snug text-[#1D3140]">
                      {mat.material_name}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {mat.material_code}
                      {mat.material_unit && <span className="ml-1 text-gray-300">·</span>}
                      <span className="ml-1">{mat.material_unit}</span>
                    </p>
                  </td>
                  {supplierColumnOrder.map((supplierName) => {
                    const cellItems = mat.linked_items.filter(
                      (it) => it.supplier_name === supplierName,
                    ) as LinkedItem[];
                    return (
                      <td
                        key={supplierName}
                        className="min-w-0 border-r border-gray-100 px-4 py-3 align-top last:border-r-0"
                      >
                        <SupplierCell items={cellItems} onApproved={handleItemApproved} />
                      </td>
                    );
                  })}
                </tr>
              ))}

              {!searchFilter && unlinked.length > 0 && (
                <tr>
                  <td colSpan={1 + supplierColumnOrder.length} className="max-w-full min-w-0 px-4 pb-4 pt-6">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Itens sem vínculo com material ({unlinked.length})
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {unlinked.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-start gap-2 rounded-lg border border-dashed border-gray-200 bg-gray-50/50 p-3"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="break-words text-xs font-medium text-gray-800">{item.descricao}</p>
                            <p className="mt-0.5 text-xs text-gray-500">
                              {item.supplier_name} · {fmtCurrency(item.preco_unit)}
                            </p>
                          </div>
                          <StatusBadge item={item} />
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
