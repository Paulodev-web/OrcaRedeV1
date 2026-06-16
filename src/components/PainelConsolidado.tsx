"use client";
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Calculator, Package, Edit2, Check, X, FileSpreadsheet, Download, Users, Plus, Trash2 } from 'lucide-react';
import { BudgetDetails, ExtraCostItem } from '@/types';
import { useApp } from '@/contexts/AppContext';
import {
  exportToExcel,
  exportToCSV,
  exportToExcelForSuppliers,
  exportToCSVForSuppliers,
  MaterialExport,
  ExportOptions,
} from '@/services/exportService';

interface PainelConsolidadoProps {
  budgetDetails: BudgetDetails | null;
  orcamentoNome: string;
}

interface MaterialConsolidado {
  materialId: string;
  codigo: string;
  nome: string;
  unidade: string;
  precoUnit: number;
  quantidade: number;
  subtotal: number;
}

function newExtraItem(): ExtraCostItem {
  return {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `extra_${Date.now()}`,
    description: '',
    value: 0,
  };
}

export function PainelConsolidado({ budgetDetails, orcamentoNome }: PainelConsolidadoProps) {
  const { updateConsolidatedMaterialPrice, updateBudgetMargin, updateBudgetExtras } = useApp();
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [editingPrice, setEditingPrice] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [extras, setExtras] = useState<ExtraCostItem[]>([]);
  const [marginInput, setMarginInput] = useState<string>('0');
  const [savingExtras, setSavingExtras] = useState(false);
  const [savingMargin, setSavingMargin] = useState(false);

  useEffect(() => {
    if (budgetDetails?.id) {
      setExtras(budgetDetails.extra_cost_items);
      setMarginInput(String(budgetDetails.profit_margin_percent ?? 0));
    }
  }, [budgetDetails?.id, budgetDetails?.extra_cost_items, budgetDetails?.profit_margin_percent]);

  const materiaisConsolidados = useMemo((): MaterialConsolidado[] => {
    if (!budgetDetails || !budgetDetails.posts || budgetDetails.posts.length === 0) {
      return [];
    }

    const materiaisMap = new Map<string, MaterialConsolidado>();

    budgetDetails.posts.forEach((post) => {
      post.post_item_groups.forEach((group) => {
        group.post_item_group_materials.forEach((material) => {
          const materialId = material.material_id;
          const materialData = material.materials;

          if (materiaisMap.has(materialId)) {
            const existingMaterial = materiaisMap.get(materialId)!;
            existingMaterial.quantidade += material.quantity;
            existingMaterial.subtotal = existingMaterial.quantidade * existingMaterial.precoUnit;
          } else {
            const priceToUse = material.price_at_addition || materialData.price || 0;
            materiaisMap.set(materialId, {
              materialId,
              codigo: materialData.code || '',
              nome: materialData.name || 'Material sem nome',
              unidade: materialData.unit || '',
              precoUnit: priceToUse,
              quantidade: material.quantity,
              subtotal: priceToUse * material.quantity,
            });
          }
        });
      });

      post.post_materials.forEach((material) => {
        const materialId = material.material_id;
        const materialData = material.materials;

        if (materiaisMap.has(materialId)) {
          const existingMaterial = materiaisMap.get(materialId)!;
          existingMaterial.quantidade += material.quantity;
          existingMaterial.subtotal = existingMaterial.quantidade * existingMaterial.precoUnit;
        } else {
          const priceToUse = material.price_at_addition || 0;
          materiaisMap.set(materialId, {
            materialId,
            codigo: materialData.code || '',
            nome: materialData.name || 'Material sem nome',
            unidade: materialData.unit || '',
            precoUnit: priceToUse,
            quantidade: material.quantity,
            subtotal: priceToUse * material.quantity,
          });
        }
      });
    });

    return Array.from(materiaisMap.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [budgetDetails]);

  const { custoMateriais, custoExtras, custoBase, valorMargem, precoFinal, marginPercentUsed } = useMemo(() => {
    const cm = materiaisConsolidados.reduce((total, material) => total + material.subtotal, 0);
    const ce = extras.reduce((s, e) => s + (e.value >= 0 ? e.value : 0), 0);
    const cb = cm + ce;
    const parsed = parseFloat(marginInput.replace(',', '.'));
    const m =
      Number.isFinite(parsed) && parsed >= 0
        ? parsed
        : budgetDetails
          ? Number(budgetDetails.profit_margin_percent)
          : 0;
    const mSafe = Number.isFinite(m) && m >= 0 ? m : 0;
    const vm = cb * (mSafe / 100);
    const pf = cb + vm;
    return {
      custoMateriais: cm,
      custoExtras: ce,
      custoBase: cb,
      valorMargem: vm,
      precoFinal: pf,
      marginPercentUsed: mSafe,
    };
  }, [materiaisConsolidados, extras, marginInput, budgetDetails?.profit_margin_percent]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const handleStartEdit = (materialId: string, currentPrice: number) => {
    setEditingMaterialId(materialId);
    setEditingPrice(currentPrice.toFixed(2));
  };

  const handleCancelEdit = () => {
    setEditingMaterialId(null);
    setEditingPrice('');
  };

  const handleSaveEdit = async (materialId: string) => {
    if (!budgetDetails) return;

    const newPrice = parseFloat(editingPrice);

    if (isNaN(newPrice)) {
      alert('Por favor, insira um preço válido');
      return;
    }

    if (newPrice < 0) {
      alert('O preço não pode ser negativo');
      return;
    }

    try {
      setIsUpdating(true);
      await updateConsolidatedMaterialPrice(budgetDetails.id, materialId, newPrice);
      setEditingMaterialId(null);
      setEditingPrice('');
      alert(
        `Preço atualizado para ${formatCurrency(newPrice)} no orçamento e no catálogo de materiais.`
      );
    } catch (error) {
      console.error('Erro ao salvar preço consolidado:', error);
      const message =
        error instanceof Error ? error.message : 'Erro ao atualizar preço. Por favor, tente novamente.';
      alert(message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handlePriceKeyDown = (e: React.KeyboardEvent, materialId: string) => {
    if (e.key === 'Enter') {
      void handleSaveEdit(materialId);
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const persistExtras = useCallback(
    async (list: ExtraCostItem[]) => {
      if (!budgetDetails) return;
      setSavingExtras(true);
      try {
        await updateBudgetExtras(budgetDetails.id, list);
      } catch (e) {
        console.error(e);
        alert('Erro ao salvar custos extras.');
      } finally {
        setSavingExtras(false);
      }
    },
    [budgetDetails, updateBudgetExtras]
  );

  const addExtraRow = () => {
    const next = [...extras, newExtraItem()];
    setExtras(next);
    void persistExtras(next);
  };

  const removeExtraRow = (id: string) => {
    const next = extras.filter((e) => e.id !== id);
    setExtras(next);
    void persistExtras(next);
  };

  const updateExtraField = (index: number, patch: Partial<ExtraCostItem>) => {
    const next = extras.map((e, i) => (i === index ? { ...e, ...patch } : e));
    setExtras(next);
  };

  const onExtraBlur = (index: number) => {
    setExtras((prev) => {
      const row = prev[index];
      if (!row) return prev;
      if (row.value < 0 || !Number.isFinite(row.value)) {
        alert('O valor do custo extra não pode ser negativo');
        const next = prev.map((e, i) => (i === index ? { ...e, value: 0 } : e));
        void persistExtras(next);
        return next;
      }
      void persistExtras(prev);
      return prev;
    });
  };

  const onMarginBlur = async () => {
    if (!budgetDetails) return;
    const n = parseFloat(marginInput.replace(',', '.'));
    if (isNaN(n) || n < 0) {
      alert('Informe uma margem válida (não negativa).');
      setMarginInput(String(budgetDetails.profit_margin_percent ?? 0));
      return;
    }
    setSavingMargin(true);
    try {
      await updateBudgetMargin(budgetDetails.id, n);
    } catch (e) {
      console.error(e);
      alert('Erro ao salvar margem.');
    } finally {
      setSavingMargin(false);
    }
  };

  const buildExportOptions = (): ExportOptions => ({
    budgetName: orcamentoNome,
    totalCost: precoFinal,
    totalPosts: budgetDetails?.posts?.length || 0,
    totalUniqueMaterials: materiaisConsolidados.length,
    exportDate: new Date().toLocaleString('pt-BR'),
    custoMateriais,
    custoExtras,
    custoBase,
    marginPercent: marginPercentUsed,
    marginValue: valorMargem,
    finalPrice: precoFinal,
    extraItems: extras,
  });

  const handleExportExcel = () => {
    if (materiaisConsolidados.length === 0) {
      alert('Não há materiais para exportar');
      return;
    }
    const exportData: MaterialExport[] = materiaisConsolidados.map((material) => ({
      materialId: material.materialId,
      codigo: material.codigo,
      nome: material.nome,
      unidade: material.unidade,
      precoUnit: material.precoUnit,
      quantidade: material.quantidade,
      subtotal: material.subtotal,
    }));
    try {
      exportToExcel(exportData, buildExportOptions());
    } catch (error) {
      console.error('Erro ao exportar para Excel:', error);
      alert('Erro ao exportar arquivo Excel. Por favor, tente novamente.');
    }
  };

  const handleExportCSV = () => {
    if (materiaisConsolidados.length === 0) {
      alert('Não há materiais para exportar');
      return;
    }
    const exportData: MaterialExport[] = materiaisConsolidados.map((material) => ({
      materialId: material.materialId,
      codigo: material.codigo,
      nome: material.nome,
      unidade: material.unidade,
      precoUnit: material.precoUnit,
      quantidade: material.quantidade,
      subtotal: material.subtotal,
    }));
    try {
      exportToCSV(exportData, buildExportOptions());
    } catch (error) {
      console.error('Erro ao exportar para CSV:', error);
      alert('Erro ao exportar arquivo CSV. Por favor, tente novamente.');
    }
  };

  const handleExportExcelForSuppliers = () => {
    if (materiaisConsolidados.length === 0) {
      alert('Não há materiais para exportar');
      return;
    }
    const exportData: MaterialExport[] = materiaisConsolidados.map((material) => ({
      materialId: material.materialId,
      codigo: material.codigo,
      nome: material.nome,
      unidade: material.unidade,
      precoUnit: material.precoUnit,
      quantidade: material.quantidade,
      subtotal: material.subtotal,
    }));
    try {
      exportToExcelForSuppliers(exportData, buildExportOptions());
    } catch (error) {
      console.error('Erro ao exportar para fornecedores (Excel):', error);
      alert('Erro ao exportar arquivo Excel para fornecedores. Por favor, tente novamente.');
    }
  };

  const handleExportCSVForSuppliers = () => {
    if (materiaisConsolidados.length === 0) {
      alert('Não há materiais para exportar');
      return;
    }
    const exportData: MaterialExport[] = materiaisConsolidados.map((material) => ({
      materialId: material.materialId,
      codigo: material.codigo,
      nome: material.nome,
      unidade: material.unidade,
      precoUnit: material.precoUnit,
      quantidade: material.quantidade,
      subtotal: material.subtotal,
    }));
    try {
      exportToCSVForSuppliers(exportData, buildExportOptions());
    } catch (error) {
      console.error('Erro ao exportar para fornecedores (CSV):', error);
      alert('Erro ao exportar arquivo CSV para fornecedores. Por favor, tente novamente.');
    }
  };

  return (
    <div className="bg-gray-50 rounded-lg p-4 h-full flex flex-col">
      <div className="mb-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2">
              <Calculator className="h-5 w-5 text-green-600" />
              <h3 className="text-lg font-semibold text-gray-900">Consolidação de Materiais</h3>
            </div>
            <p className="text-sm text-gray-600 mt-1">{orcamentoNome}</p>
          </div>
          <div className="flex items-center space-x-3">
            {materiaisConsolidados.length > 0 && (
              <div className="flex items-center space-x-2">
                <div className="flex flex-col space-y-1">
                  <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide px-1">Completo</div>
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={handleExportExcel}
                      className="flex items-center space-x-1 px-2 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-xs font-medium shadow-sm"
                      title="Exportar para Excel (com preços)"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                      <span>Excel</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleExportCSV}
                      className="flex items-center space-x-1 px-2 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-xs font-medium shadow-sm"
                      title="Exportar para CSV (com preços)"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>CSV</span>
                    </button>
                  </div>
                </div>

                <div className="h-12 w-px bg-gray-300" />

                <div className="flex flex-col space-y-1">
                  <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide px-1 flex items-center space-x-1">
                    <Users className="h-3 w-3" />
                    <span>Fornecedores</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={handleExportExcelForSuppliers}
                      className="flex items-center space-x-1 px-2 py-1.5 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors text-xs font-medium shadow-sm"
                      title="Exportar para fornecedores (sem preços de venda; extras apenas descrição)"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                      <span>Excel</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleExportCSVForSuppliers}
                      className="flex items-center space-x-1 px-2 py-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors text-xs font-medium shadow-sm"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>CSV</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div className="flex items-center space-x-1 text-xs text-gray-500">
              <Edit2 className="h-3 w-3" />
              <span>Clique no ícone para editar preços</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 min-h-0">
        {budgetDetails && (
          <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-gray-700">Margem de lucro (%)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={marginInput}
                  onChange={(e) => setMarginInput(e.target.value)}
                  onBlur={onMarginBlur}
                  disabled={savingMargin}
                  className="w-32 px-2 py-1.5 border border-gray-300 rounded-md text-right"
                />
              </label>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-gray-800">Custos extras</h4>
                <button
                  type="button"
                  onClick={addExtraRow}
                  disabled={savingExtras || !budgetDetails}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-amber-50 text-amber-900 border border-amber-200 rounded-md hover:bg-amber-100 disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar linha
                </button>
              </div>
              {extras.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhum custo extra. Use &quot;Adicionar linha&quot; para incluir despesas manuais.</p>
              ) : (
                <div className="overflow-x-auto border border-gray-200 rounded-md">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Valor (R$)</th>
                        <th className="px-3 py-2 w-20" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {extras.map((row, index) => (
                        <tr key={row.id}>
                          <td className="px-3 py-2">
                            <input
                              className="w-full px-2 py-1 border border-gray-200 rounded"
                              value={row.description}
                              onChange={(e) => updateExtraField(index, { description: e.target.value })}
                              onBlur={() => {
                                setExtras((e) => {
                                  void persistExtras(e);
                                  return e;
                                });
                              }}
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              className="w-28 px-2 py-1 border border-gray-200 rounded text-right"
                              value={row.value}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                if (e.target.value === '' || Number.isNaN(v)) {
                                  return;
                                }
                                if (v < 0) return;
                                updateExtraField(index, { value: v });
                              }}
                              onBlur={() => onExtraBlur(index)}
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => removeExtraRow(row.id)}
                              className="p-1 text-red-600 hover:bg-red-50 rounded"
                              title="Remover"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {materiaisConsolidados.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center border border-dashed border-gray-200 rounded-lg">
            <Package className="h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-500 font-medium">Nenhum material encontrado</p>
            <p className="text-sm text-gray-400 mt-1">Adicione postes e grupos de itens para ver os materiais</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Material</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Qtd. Total</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Preço Unit.</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Subtotal</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {materiaisConsolidados.map((material, index) => {
                  const isEditing = editingMaterialId === material.materialId;
                  return (
                    <tr key={material.materialId} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-3">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{material.nome}</div>
                          {material.codigo && <div className="text-xs text-gray-500">Código: {material.codigo}</div>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-900">
                        <span className="font-medium">{material.quantidade}</span>
                        {material.unidade && <span className="text-gray-500 ml-1">{material.unidade}</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-900">
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={editingPrice}
                            onChange={(e) => setEditingPrice(e.target.value)}
                            onKeyDown={(e) => handlePriceKeyDown(e, material.materialId)}
                            className="w-24 px-2 py-1 text-right border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            disabled={isUpdating}
                            autoFocus
                          />
                        ) : (
                          formatCurrency(material.precoUnit)
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">{formatCurrency(material.subtotal)}</td>
                      <td className="px-4 py-3 text-center">
                        {isEditing ? (
                          <div className="flex items-center justify-center space-x-1">
                            {isUpdating ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleSaveEdit(material.materialId)}
                                  disabled={isUpdating}
                                  className="p-1 text-green-600 hover:text-green-800 hover:bg-green-50 rounded disabled:opacity-50"
                                  title="Salvar"
                                >
                                  <Check className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={handleCancelEdit}
                                  disabled={isUpdating}
                                  className="p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded"
                                  title="Cancelar"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </>
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleStartEdit(material.materialId, material.precoUnit)}
                            className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
                            title="Editar Preço"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {budgetDetails && (materiaisConsolidados.length > 0 || extras.length > 0) && (
        <div className="border-t bg-white mt-4 p-4 rounded-lg flex-shrink-0">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Custo de materiais</span>
              <span className="font-medium text-gray-900">{formatCurrency(custoMateriais)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Custos extras</span>
              <span className="font-medium text-gray-900">{formatCurrency(custoExtras)}</span>
            </div>
            <div className="flex justify-between border-t border-gray-100 pt-2">
              <span className="text-gray-700 font-medium">Custo base (materiais + extras)</span>
              <span className="font-semibold text-gray-900">{formatCurrency(custoBase)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Margem ({marginPercentUsed.toFixed(2)}%)</span>
              <span className="font-medium text-gray-900">{formatCurrency(valorMargem)}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-amber-100">
              <span className="font-medium text-gray-800">Preço de venda</span>
              <span className="text-lg font-bold text-green-700">{formatCurrency(precoFinal)}</span>
            </div>
            <p className="text-xs text-gray-500">
              {materiaisConsolidados.length} materiais únicos · {budgetDetails.posts.length} postes
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
