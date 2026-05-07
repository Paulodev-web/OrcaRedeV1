'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Brain,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Database,
  HelpCircle,
  Loader2,
  Plus,
  Search,
  Sparkles,
  XCircle,
} from 'lucide-react';
import {
  getConciliationPayloadBySessionAction,
  acceptAiSuggestionAction,
  rejectAiSuggestionAction,
  saveManualMatchAction,
  type SessionConciliationMaterialRow,
  type SessionConciliationQuoteSummary,
  type BudgetMaterialOption,
  type SupplierQuoteItemWithMaterial,
} from '@/actions/supplierQuotes';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
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

function SupplierItemPickerDialog({
  open,
  onOpenChange,
  candidateItems,
  materialId,
  materialName,
  supplierName,
  onLinked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateItems: LinkedItem[];
  materialId: string;
  materialName: string;
  supplierName: string;
  onLinked: (itemId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const needle = search.toLowerCase();
  const filtered = candidateItems.filter(
    (it) =>
      it.descricao.toLowerCase().includes(needle) ||
      it.unidade.toLowerCase().includes(needle),
  );

  const handlePick = (item: LinkedItem) => {
    setSavingId(item.id);
    startTransition(async () => {
      const res = await saveManualMatchAction({
        itemId: item.id,
        materialId,
        conversionFactor: 1,
        supplierName: item.supplier_name,
        supplierMaterialName: item.descricao,
      });
      if (res.success) {
        onLinked(item.id);
        onOpenChange(false);
      }
      setSavingId(null);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Vincular item de {supplierName}</DialogTitle>
          <DialogDescription>
            Escolha um item da cotação para vincular ao material <strong>{materialName}</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm placeholder:text-gray-400 focus:border-[#64ABDE] focus:outline-none"
              placeholder="Buscar item do fornecedor…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto px-6 pb-6">
          {filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-gray-400">Nenhum item encontrado.</p>
          )}
          <div className="space-y-1.5">
            {filtered.map((item) => {
              const isSaving = savingId === item.id && isPending;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={isSaving}
                  onClick={() => handlePick(item)}
                  className="flex w-full items-start gap-3 rounded-lg border border-gray-100 bg-white p-3 text-left transition-colors hover:bg-gray-50 disabled:opacity-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium text-gray-800">{item.descricao}</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {fmtCurrency(item.preco_unit)} · {item.unidade}
                      {item.quantidade > 0 && <span className="ml-1">({item.quantidade})</span>}
                    </p>
                  </div>
                  {isSaving ? (
                    <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-gray-400" />
                  ) : (
                    <Plus className="mt-0.5 h-4 w-4 shrink-0 text-gray-300" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SupplierCell({
  items,
  materialId,
  materialName,
  supplierName,
  candidateItems,
  onApproved,
  onRejected,
  onLinked,
}: {
  items: LinkedItem[];
  materialId: string;
  materialName: string;
  supplierName: string;
  candidateItems: LinkedItem[];
  onApproved: (itemId: string, newStatus: string) => void;
  onRejected: (itemId: string) => void;
  onLinked: (itemId: string, materialId: string, supplierName: string) => void;
}) {
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pickerOpen, setPickerOpen] = useState(false);

  const matchedItems = items.filter((it) => it.match_status !== 'sem_match');
  const hasOnlyUnmatched = items.length > 0 && matchedItems.length === 0;
  const showPicker = items.length === 0 || hasOnlyUnmatched;

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

  const handleReject = (item: LinkedItem) => {
    setRejectingId(item.id);
    startTransition(async () => {
      if (item.suggestion_id) {
        const res = await rejectAiSuggestionAction({
          itemId: item.id,
          suggestionId: item.suggestion_id,
        });
        if (res.success) {
          onRejected(item.id);
        }
      }
      setRejectingId(null);
    });
  };

  return (
    <div className="space-y-2">
      {matchedItems.map((item) => {
        const needsApproval = item.match_status === 'ia_suggested';
        const isApproving = approvingId === item.id && isPending;
        const isRejecting = rejectingId === item.id && isPending;
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
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleReject(item)}
                    disabled={isRejecting || isApproving}
                    className="inline-flex items-center gap-1 rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors border border-red-200"
                  >
                    {isRejecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                    Recusar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApprove(item)}
                    disabled={isApproving || isRejecting}
                    className="inline-flex items-center gap-1 rounded bg-green-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {isApproving ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                    Aprovar
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {showPicker && (
        <>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-gray-300 bg-white px-3 py-3 text-xs text-gray-400 transition-colors hover:border-[#64ABDE] hover:text-[#64ABDE]"
          >
            <Plus className="h-3.5 w-3.5" />
            Escolher item do fornecedor
          </button>
          <SupplierItemPickerDialog
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            candidateItems={candidateItems}
            materialId={materialId}
            materialName={materialName}
            supplierName={supplierName}
            onLinked={(itemId) => onLinked(itemId, materialId, supplierName)}
          />
        </>
      )}
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
  const [activeSupplier, setActiveSupplier] = useState<string>(
    () => initialPayload?.supplier_column_order[0] ?? '',
  );

  useEffect(() => {
    if (initialPayload) {
      setMaterials(initialPayload.materials);
      setUnlinked(initialPayload.unlinked_items);
      setSupplierColumnOrder(initialPayload.supplier_column_order);
      setLoadError(null);
      setActiveSupplier((prev) => {
        if (initialPayload.supplier_column_order.includes(prev)) return prev;
        return initialPayload.supplier_column_order[0] ?? '';
      });
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

  const handleItemRejected = (itemId: string) => {
    setMaterials((prev) =>
      prev.map((mat) => ({
        ...mat,
        linked_items: mat.linked_items.map((it) =>
          it.id === itemId ? { ...it, match_status: 'sem_match' as typeof it.match_status, matched_material_id: null } : it,
        ),
      })),
    );
  };

  const handleItemLinked = (itemId: string, materialId: string, supplierName: string) => {
    const fromUnlinked = unlinked.find((it) => it.id === itemId) as LinkedItem | undefined;

    setUnlinked((prev) => prev.filter((it) => it.id !== itemId));

    setMaterials((prev) => {
      let source: LinkedItem | undefined;

      const withoutItem = prev.map((mat) => {
        const found = mat.linked_items.find((it) => it.id === itemId);
        if (found) source = found as LinkedItem;
        return { ...mat, linked_items: mat.linked_items.filter((it) => it.id !== itemId) };
      });

      if (!source) source = fromUnlinked;
      if (!source) return withoutItem;

      const updated: LinkedItem = {
        ...source,
        matched_material_id: materialId,
        match_status: 'manual',
        match_method: 'manual',
        supplier_name: supplierName,
      };

      return withoutItem.map((mat) =>
        mat.material_id === materialId
          ? { ...mat, linked_items: [...mat.linked_items, updated] }
          : mat,
      );
    });
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

  const candidatesBySupplier = useMemo(() => {
    const map = new Map<string, LinkedItem[]>();
    for (const mat of materials) {
      for (const it of mat.linked_items) {
        if (it.match_status === 'sem_match') {
          const list = map.get(it.supplier_name) ?? [];
          list.push(it as LinkedItem);
          map.set(it.supplier_name, list);
        }
      }
    }
    for (const it of unlinked) {
      const list = map.get(it.supplier_name) ?? [];
      list.push(it as LinkedItem);
      map.set(it.supplier_name, list);
    }
    return map;
  }, [materials, unlinked]);

  const activeSupplierIdx = supplierColumnOrder.indexOf(activeSupplier);
  const canGoPrev = activeSupplierIdx > 0;
  const canGoNext = activeSupplierIdx < supplierColumnOrder.length - 1;

  const activeSupplierStats = useMemo(() => {
    if (!activeSupplier) return { approved: 0, iaSuggested: 0, total: 0 };
    let approved = 0;
    let iaSuggested = 0;
    let total = 0;
    for (const mat of materials) {
      for (const it of mat.linked_items) {
        if (it.supplier_name !== activeSupplier) continue;
        total++;
        if (it.match_status === 'automatico' || it.match_status === 'manual') approved++;
        if (it.match_status === 'ia_suggested') iaSuggested++;
      }
    }
    return { approved, iaSuggested, total };
  }, [materials, activeSupplier]);

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

  const showEmpty = !loadError && filteredMaterials.length === 0 && unlinked.length === 0;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#64ABDE]/40 bg-white p-6 shadow-md">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-[#1D3140]">Conciliação de materiais</h1>
            <p className="mt-1 text-sm text-slate-500">
              Concilie fornecedor por fornecedor. Aprove sugestões da IA ou escolha manualmente.
            </p>
            {supplierColumnOrder.length > 0 && (
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  disabled={!canGoPrev}
                  onClick={() => setActiveSupplier(supplierColumnOrder[activeSupplierIdx - 1])}
                  className="rounded-md border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <select
                  value={activeSupplier}
                  onChange={(e) => setActiveSupplier(e.target.value)}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-[#1D3140] focus:border-[#64ABDE] focus:outline-none"
                >
                  {supplierColumnOrder.map((name, idx) => (
                    <option key={name} value={name}>
                      {idx + 1}. {name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!canGoNext}
                  onClick={() => setActiveSupplier(supplierColumnOrder[activeSupplierIdx + 1])}
                  className="rounded-md border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <span className="ml-2 text-xs text-gray-400">
                  {activeSupplierIdx + 1} de {supplierColumnOrder.length}
                </span>
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
              <span className="text-gray-600">
                <span className="font-medium text-[#1D3140]">{activeSupplierStats.approved}</span> validados
              </span>
              {activeSupplierStats.iaSuggested > 0 && (
                <span className="text-amber-600">
                  <span className="font-medium">{activeSupplierStats.iaSuggested}</span> aguardando aprovação
                </span>
              )}
              <span className="text-gray-400">|</span>
              <span className="text-gray-400">
                Geral: <span className="font-medium text-[#1D3140]">{totalApproved}</span> validados
                {totalIaSuggested > 0 && (
                  <span className="ml-1 text-amber-600">{totalIaSuggested} pendentes</span>
                )}
              </span>
              {unlinked.length > 0 && (
                <span className="text-red-600">
                  <span className="font-medium">{unlinked.length}</span> sem vínculo
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

      {!loadError && (filteredMaterials.length > 0 || unlinked.length > 0) && activeSupplier && (
        <div className="min-w-0 overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full table-fixed border-collapse text-sm">
            <colgroup>
              <col style={{ width: '40%' }} />
              <col style={{ width: '60%' }} />
            </colgroup>
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="sticky left-0 top-0 z-30 bg-white px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 shadow-[1px_0_0_0_#e5e7eb,0_1px_0_0_#e5e7eb]">
                  Fonte da verdade
                </th>
                <th className="sticky top-0 z-20 bg-white px-4 py-3 text-left align-bottom text-xs font-semibold uppercase tracking-wide text-[#1D3140] shadow-[0_1px_0_0_#e5e7eb]">
                  <span className="break-words font-semibold normal-case tracking-normal">
                    {activeSupplier}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredMaterials.map((mat) => {
                const cellItems = mat.linked_items.filter(
                  (it) => it.supplier_name === activeSupplier,
                ) as LinkedItem[];
                return (
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
                    <td className="min-w-0 px-4 py-3 align-top">
                      <SupplierCell
                        items={cellItems}
                        materialId={mat.material_id}
                        materialName={mat.material_name}
                        supplierName={activeSupplier}
                        candidateItems={candidatesBySupplier.get(activeSupplier) ?? []}
                        onApproved={handleItemApproved}
                        onRejected={handleItemRejected}
                        onLinked={handleItemLinked}
                      />
                    </td>
                  </tr>
                );
              })}

              {!searchFilter && unlinked.filter((it) => it.supplier_name === activeSupplier).length > 0 && (
                <tr>
                  <td colSpan={2} className="max-w-full min-w-0 px-4 pb-4 pt-6">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Itens sem vínculo — {activeSupplier} ({unlinked.filter((it) => it.supplier_name === activeSupplier).length})
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {unlinked
                        .filter((it) => it.supplier_name === activeSupplier)
                        .map((item) => (
                          <div
                            key={item.id}
                            className="flex items-start gap-2 rounded-lg border border-dashed border-gray-200 bg-gray-50/50 p-3"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="break-words text-xs font-medium text-gray-800">{item.descricao}</p>
                              <p className="mt-0.5 text-xs text-gray-500">
                                {fmtCurrency(item.preco_unit)}
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
