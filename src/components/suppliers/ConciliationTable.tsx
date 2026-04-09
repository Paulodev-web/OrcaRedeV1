'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Search,
  Zap,
} from 'lucide-react';
import {
  saveManualMatchAction,
  markQuoteConciliatedAction,
} from '@/actions/supplierQuotes';
import type { SupplierQuote } from '@/types';
import type { SupplierQuoteItemWithMaterial, BudgetMaterialOption } from '@/actions/supplierQuotes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const formatNumber = (v: number) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const STATUS_CONFIG = {
  sem_match: {
    label: 'Sem vínculo',
    className: 'bg-red-100 text-red-700 border border-red-200',
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  automatico: {
    label: 'Auto',
    className: 'bg-blue-100 text-blue-700 border border-blue-200',
    icon: <Zap className="h-3 w-3" />,
  },
  manual: {
    label: 'Manual',
    className: 'bg-green-100 text-green-700 border border-green-200',
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
} as const;

// ---------------------------------------------------------------------------
// Sub-component: linha expandida para vinculação manual
// ---------------------------------------------------------------------------
interface MatchRowProps {
  item: SupplierQuoteItemWithMaterial;
  budgetMaterials: BudgetMaterialOption[];
  supplierName: string;
  onSaved: (itemId: string, materialId: string, factor: number, matName: string, matCode: string, matUnit: string) => void;
}

function MatchRow({ item, budgetMaterials, supplierName, onSaved }: MatchRowProps) {
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

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
      <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
        Vincular: <span className="normal-case font-normal text-blue-900">{item.descricao}</span>
      </p>

      {/* Search + lista de materiais */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar material do orçamento..."
          className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
        />
      </div>

      <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-md bg-white divide-y divide-gray-100">
        {filtered.length === 0 ? (
          <p className="p-3 text-sm text-gray-400 text-center">Nenhum material encontrado.</p>
        ) : (
          filtered.map((mat) => (
            <button
              key={mat.id}
              type="button"
              onClick={() => setSelectedMaterialId(mat.id)}
              className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-blue-50 ${
                selectedMaterialId === mat.id ? 'bg-blue-100 font-medium text-blue-800' : 'text-gray-700'
              }`}
            >
              <span className="font-mono text-xs text-gray-400 mr-2">{mat.code}</span>
              {mat.name}
              <span className="ml-1 text-xs text-gray-400">({mat.unit})</span>
            </button>
          ))
        )}
      </div>

      {/* Fator de conversão */}
      {selectedMat && (
        <div className="flex items-end gap-4 pt-1">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Fator de conversão
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0.0001"
                step="any"
                value={conversionFactor}
                onChange={(e) => setConversionFactor(e.target.value)}
                className="w-28 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500">
                Fornecedor vende em{' '}
                <span className="font-medium">{item.unidade}</span>
                {factorNum !== 1 && (
                  <>
                    {' '}→ 1 {item.unidade} ={' '}
                    <span className="font-medium">{formatNumber(factorNum)}</span>{' '}
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
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
interface Props {
  quote: SupplierQuote;
  items: SupplierQuoteItemWithMaterial[];
  budgetMaterials: BudgetMaterialOption[];
}

export default function ConciliationTable({ quote, items: initialItems, budgetMaterials }: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isFinalizing, startFinalizing] = useTransition();
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

  const matchedCount = items.filter((i) => i.match_status !== 'sem_match').length;
  const totalCount = items.length;
  const allMatched = matchedCount === totalCount;
  const progressPct = totalCount > 0 ? Math.round((matchedCount / totalCount) * 100) : 0;

  useEffect(() => {
    if (!quote.session_id) return;
    const href = `/fornecedores/sessao/${quote.session_id}/cenarios`;
    void router.prefetch(href);
  }, [quote.session_id, router]);

  const handleSaved = (
    itemId: string,
    materialId: string,
    factor: number,
    matName: string,
    matCode: string,
    matUnit: string
  ) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === itemId
          ? {
              ...it,
              matched_material_id: materialId,
              conversion_factor: factor,
              match_status: 'manual' as const,
              material_name: matName,
              material_code: matCode,
              material_unit: matUnit,
            }
          : it
      )
    );
    setExpandedId(null);
  };

  const handleFinalize = () => {
    setFinalizeError(null);
    const start = performance.now();
    startFinalizing(async () => {
      const result = await markQuoteConciliatedAction(quote.id);
      if (!result.success) {
        setFinalizeError(result.error);
        return;
      }
      if (quote.session_id) {
        console.info(
          `[perf] finalize_to_cenarios ${quote.session_id}: ${Math.round(performance.now() - start)}ms`
        );
        router.push(`/fornecedores/sessao/${quote.session_id}/cenarios`);
      } else {
        router.push('/fornecedores');
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Progresso */}
      <div className="bg-white rounded-lg shadow p-5">
        <div className="flex items-center justify-between mb-2">
          <div>
            <span className="text-sm font-semibold text-gray-800">
              {matchedCount} de {totalCount} itens vinculados
            </span>
            {allMatched && (
              <span className="ml-2 inline-flex items-center gap-1 text-xs text-green-700 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Tudo pronto!
              </span>
            )}
          </div>
          <span className="text-sm font-bold text-gray-700">{progressPct}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-1.5">
          Itens sem vínculo são ignorados nos cenários de compra.
        </p>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Item do Fornecedor
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Material Interno Vinculado
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                Preço Normalizado
              </th>
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {items.map((item) => {
              const statusCfg = STATUS_CONFIG[item.match_status];
              const isExpanded = expandedId === item.id;
              const preco_normalizado =
                item.conversion_factor > 0 ? item.preco_unit / item.conversion_factor : item.preco_unit;

              return (
                <React.Fragment key={item.id}>
                  <tr
                    className={`transition-colors ${
                      item.match_status === 'sem_match'
                        ? 'bg-red-50 hover:bg-red-100'
                        : 'hover:bg-gray-50'
                    } ${isExpanded ? 'border-b-0' : ''}`}
                  >
                    {/* Status badge */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusCfg.className}`}
                      >
                        {statusCfg.icon}
                        {statusCfg.label}
                      </span>
                    </td>

                    {/* Descrição do fornecedor */}
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-900 line-clamp-2 max-w-xs" title={item.descricao}>
                        {item.descricao}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {item.unidade} · Qtd {formatNumber(item.quantidade)} · {formatCurrency(item.preco_unit)}
                      </p>
                    </td>

                    {/* Material interno */}
                    <td className="px-4 py-3">
                      {item.matched_material_id ? (
                        <div>
                          <p className="text-sm text-gray-900 font-medium">{item.material_name}</p>
                          <p className="text-xs text-gray-400">
                            <span className="font-mono">{item.material_code}</span>
                            {item.conversion_factor !== 1 && (
                              <span className="ml-1">
                                · Fator {formatNumber(item.conversion_factor)}×
                              </span>
                            )}
                          </p>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : item.id)}
                          className="text-sm text-blue-600 hover:underline"
                        >
                          + Vincular material
                        </button>
                      )}
                    </td>

                    {/* Preço normalizado */}
                    <td className="px-4 py-3 text-right">
                      {item.matched_material_id ? (
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            {formatCurrency(preco_normalizado)}
                          </p>
                          <p className="text-xs text-gray-400">/{item.material_unit ?? item.unidade}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>

                    {/* Expand toggle */}
                    <td className="px-2 py-3 text-center">
                      {item.matched_material_id ? (
                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : item.id)}
                          className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
                          title="Editar vínculo"
                        >
                          <ChevronRight
                            className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                          />
                        </button>
                      ) : null}
                    </td>
                  </tr>

                  {/* Linha expandida de vinculação */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={5} className="px-4 pb-4 pt-0 bg-white">
                        <MatchRow
                          item={item}
                          budgetMaterials={budgetMaterials}
                          supplierName={quote.supplier_name}
                          onSaved={handleSaved}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer de ação */}
      <div className="bg-white rounded-lg shadow p-5 flex items-center justify-between">
        <div className="text-sm text-gray-500">
          {allMatched ? (
            <span className="text-green-700 font-medium flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" />
              Todos os itens estão vinculados. Pronto para gerar cenários.
            </span>
          ) : (
            <span>
              <strong>{totalCount - matchedCount}</strong> item(ns) ainda sem vínculo serão
              ignorados nos cenários.
            </span>
          )}
          {finalizeError && (
            <p className="text-red-600 mt-1 text-xs">{finalizeError}</p>
          )}
        </div>

        <button
          type="button"
          onClick={handleFinalize}
          disabled={isFinalizing}
          className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          {isFinalizing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Finalizando...</span>
            </>
          ) : (
            <>
              <span>Ver Cenários de Compra</span>
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
