'use client';

import { useEffect, useState, useTransition } from 'react';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  getConciliationPayloadBySessionAction,
  acceptAiSuggestionAction,
  saveManualMatchAction,
  type SessionConciliationMaterialRow,
  type BudgetMaterialOption,
  type SupplierQuoteItemWithMaterial,
} from '@/actions/supplierQuotes';

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

interface Props {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type LinkedItem = SupplierQuoteItemWithMaterial & {
  supplier_name: string;
  suggestion_id?: string | null;
};

function StatusBadge({ item }: { item: SupplierQuoteItemWithMaterial }) {
  if (item.match_status === 'automatico' && item.match_method === 'exact_memory') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 border border-blue-200">
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

function MaterialRow({
  row,
  budgetMaterials,
  onItemApproved,
}: {
  row: SessionConciliationMaterialRow;
  budgetMaterials: BudgetMaterialOption[];
  onItemApproved: (itemId: string, newStatus: string) => void;
}) {
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
          onItemApproved(item.id, 'automatico');
        }
      }
      setApprovingId(null);
    });
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="grid grid-cols-2 gap-0 divide-x divide-gray-100">
        {/* Left: material from source of truth */}
        <div className="p-4">
          <p className="text-sm font-semibold text-[#1D3140]">{row.material_name}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {row.material_code} &middot; {row.material_unit}
          </p>
        </div>

        {/* Right: linked supplier items */}
        <div className="p-4 space-y-3">
          {row.linked_items.length === 0 && (
            <p className="text-xs text-gray-400 italic">Nenhum item vinculado</p>
          )}
          {row.linked_items.map((item) => {
            const needsApproval = item.match_status === 'ia_suggested';
            const isApproving = approvingId === item.id && isPending;
            return (
              <div key={item.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-800 truncate">{item.descricao}</p>
                  <p className="text-xs text-gray-500">
                    {item.supplier_name} &middot; {fmtCurrency(item.preco_unit)} &middot;
                    Fator: {item.conversion_factor}
                  </p>
                  {item.suggestion_rationale && (
                    <p className="text-xs text-gray-400 mt-0.5 italic">{item.suggestion_rationale}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge item={item} />
                  {needsApproval && (
                    <button
                      type="button"
                      onClick={() => handleApprove(item)}
                      disabled={isApproving}
                      className="inline-flex items-center gap-1 rounded-md bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                      {isApproving ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3 w-3" />
                      )}
                      Aprovar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function ConciliationCurationModal({ sessionId, open, onOpenChange }: Props) {
  const router = useRouter();
  const [materials, setMaterials] = useState<SessionConciliationMaterialRow[]>([]);
  const [unlinked, setUnlinked] = useState<(SupplierQuoteItemWithMaterial & { supplier_name: string })[]>([]);
  const [budgetMaterials, setBudgetMaterials] = useState<BudgetMaterialOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    void getConciliationPayloadBySessionAction(sessionId).then((res) => {
      setLoading(false);
      if (res.success) {
        setMaterials(res.data.materials);
        setUnlinked(res.data.unlinked_items);
        setBudgetMaterials(res.data.budgetMaterials);
      } else {
        setError(res.error);
      }
    });
  }, [open, sessionId]);

  const handleItemApproved = (itemId: string, newStatus: string) => {
    setMaterials((prev) =>
      prev.map((mat) => ({
        ...mat,
        linked_items: mat.linked_items.map((it) =>
          it.id === itemId
            ? { ...it, match_status: newStatus as typeof it.match_status }
            : it,
        ),
      })),
    );
  };

  const needle = searchFilter.toLowerCase();
  const filteredMaterials = searchFilter
    ? materials.filter(
        (m) =>
          m.material_name.toLowerCase().includes(needle) ||
          m.material_code.toLowerCase().includes(needle) ||
          m.linked_items.some((it) => it.descricao.toLowerCase().includes(needle)),
      )
    : materials;

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
  const totalLinked = materials.reduce((sum, m) => sum + m.linked_items.length, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Curadoria de conciliação</DialogTitle>
          <DialogDescription>
            Lado esquerdo: materiais do orçamento (fonte da verdade). Lado direito: itens de
            fornecedores vinculados. Aprove sugestões da IA para salvar na memória.
          </DialogDescription>
          <div className="flex flex-wrap items-center gap-3 pt-2 text-xs">
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
          </div>
        </DialogHeader>

        <div className="px-6 pt-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm placeholder:text-gray-400 focus:border-[#64ABDE] focus:outline-none"
              placeholder="Buscar material ou item…"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto px-6 py-4 space-y-3">
          {loading && (
            <div className="flex items-center justify-center py-12 text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Carregando conciliação…
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {!loading && !error && filteredMaterials.length === 0 && unlinked.length === 0 && (
            <p className="py-8 text-center text-sm text-gray-500">
              Nenhum material ou item disponível para conciliação.
            </p>
          )}

          {!loading &&
            filteredMaterials.map((mat) => (
              <MaterialRow
                key={mat.material_id}
                row={mat}
                budgetMaterials={budgetMaterials}
                onItemApproved={handleItemApproved}
              />
            ))}

          {!loading && unlinked.length > 0 && !searchFilter && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Itens sem vínculo ({unlinked.length})
              </h3>
              <div className="space-y-2">
                {unlinked.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg border border-dashed border-gray-200 bg-gray-50/50 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-800 truncate">{item.descricao}</p>
                      <p className="text-xs text-gray-500">
                        {item.supplier_name} &middot; {fmtCurrency(item.preco_unit)}
                      </p>
                    </div>
                    <StatusBadge item={item} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              router.refresh();
            }}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Fechar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
