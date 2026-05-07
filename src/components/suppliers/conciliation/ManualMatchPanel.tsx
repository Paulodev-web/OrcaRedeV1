'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2, Loader2, Search } from 'lucide-react';
import { saveManualMatchAction } from '@/actions/supplierQuotes';
import type { BudgetMaterialOption, SupplierQuoteItemWithMaterial } from '@/actions/supplierQuotes';
import { onPortalPrimaryButtonSmClass } from '@/lib/branding';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const formatNumber = (v: number) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

export interface ManualMatchPanelProps {
  item: SupplierQuoteItemWithMaterial;
  budgetMaterials: BudgetMaterialOption[];
  supplierName: string;
  onSaved: (
    itemId: string,
    materialId: string,
    factor: number,
    matName: string,
    matCode: string,
    matUnit: string
  ) => void;
  /** Menos padding e lista mais baixa (matriz de sessão). */
  variant?: 'default' | 'compact';
}

export default function ManualMatchPanel({
  item,
  budgetMaterials,
  supplierName,
  onSaved,
  variant = 'default',
}: ManualMatchPanelProps) {
  const [search, setSearch] = useState('');
  const [selectedMaterialId, setSelectedMaterialId] = useState(item.matched_material_id ?? '');
  const [conversionFactor, setConversionFactor] = useState(String(item.conversion_factor ?? 1));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const filtered = budgetMaterials.filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.code.toLowerCase().includes(search.toLowerCase())
  );

  const selectedMat = budgetMaterials.find((m) => m.id === selectedMaterialId);
  const factorNum = parseFloat(conversionFactor) || 1;
  const canSave = selectedMaterialId !== '' && factorNum > 0;

  const handleSave = () => {
    if (!canSave) return;
    setError(null);

    startTransition(async () => {
      const result = await saveManualMatchAction({
        itemId: item.id,
        materialId: selectedMaterialId,
        conversionFactor: factorNum,
        supplierName,
        supplierMaterialName: item.descricao,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      const mat = budgetMaterials.find((m) => m.id === selectedMaterialId)!;
      onSaved(item.id, selectedMaterialId, factorNum, mat.name, mat.code, mat.unit);
    });
  };

  const compact = variant === 'compact';
  const listMaxH = compact ? 'max-h-36' : 'max-h-48';
  const padding = compact ? 'p-3 space-y-2' : 'space-y-3 p-4';

  return (
    <div
      className={`rounded-lg border border-[#64ABDE]/40 bg-[#64ABDE]/10 ${padding}`}
      role="region"
      aria-label={`Vincular material ao item ${item.descricao.slice(0, 80)}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-[#1D3140]">
        Vincular: <span className="font-normal normal-case text-[#64ABDE]">{item.descricao}</span>
      </p>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar material do orçamento..."
          className="w-full rounded-md border border-gray-300 bg-white py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#64ABDE]"
        />
      </div>

      <div className={`${listMaxH} overflow-y-auto border border-gray-200 rounded-md bg-white divide-y divide-gray-100`}>
        {filtered.length === 0 ? (
          <p className="p-3 text-sm text-gray-400 text-center">Nenhum material encontrado.</p>
        ) : (
          filtered.map((mat) => (
            <button
              key={mat.id}
              type="button"
              onClick={() => setSelectedMaterialId(mat.id)}
              className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-[#64ABDE]/10 ${
                selectedMaterialId === mat.id ? 'bg-[#64ABDE]/20 font-medium text-[#1D3140]' : 'text-gray-700'
              }`}
            >
              <span className="font-mono text-xs text-gray-400 mr-2">{mat.code}</span>
              {mat.name}
              <span className="ml-1 text-xs text-gray-400">({mat.unit})</span>
            </button>
          ))
        )}
      </div>

      {selectedMat && (
        <div className={`flex flex-col gap-3 ${compact ? 'sm:flex-row sm:items-end' : 'items-end gap-4'} pt-1`}>
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-medium text-gray-600 mb-1">Fator de conversão</label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                min="0.0001"
                step="any"
                value={conversionFactor}
                onChange={(e) => setConversionFactor(e.target.value)}
                className="w-28 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#64ABDE]"
              />
              <p className="text-xs text-gray-500">
                Fornecedor vende em <span className="font-medium">{item.unidade}</span>
                {factorNum !== 1 && (
                  <>
                    {' '}
                    → 1 {item.unidade} = <span className="font-medium">{formatNumber(factorNum)}</span>{' '}
                    {selectedMat.unit}
                  </>
                )}
              </p>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Preço normalizado:{' '}
              <span className="font-semibold text-gray-700">
                {formatCurrency(item.preco_unit / factorNum)} / {selectedMat.unit}
              </span>
            </p>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || isPending}
            className={`flex shrink-0 items-center gap-1.5 rounded-md px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${onPortalPrimaryButtonSmClass}`}
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            Confirmar
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
