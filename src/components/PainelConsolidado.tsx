"use client";
import React, { useState } from 'react';
import { Calculator, Package, Edit2, Check, X, FileSpreadsheet, Download, Users } from 'lucide-react';
import { BudgetDetails } from '@/types';
import { useApp } from '@/contexts/AppContext';
import { exportToExcel, exportToCSV, exportToExcelForSuppliers, exportToCSVForSuppliers, MaterialExport, ExportOptions } from '@/services/exportService';

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

export function PainelConsolidado({ budgetDetails, orcamentoNome }: PainelConsolidadoProps) {
  const { updateConsolidatedMaterialPrice } = useApp();
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [editingPrice, setEditingPrice] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);
  
  const consolidarMateriais = (): MaterialConsolidado[] => {
    if (!budgetDetails || !budgetDetails.posts || budgetDetails.posts.length === 0) {
      return [];
    }

    const materiaisMap = new Map<string, MaterialConsolidado>();

    // Percorrer todos os postes
    budgetDetails.posts.forEach(post => {
      // Percorrer todos os grupos do poste
      post.post_item_groups.forEach(group => {
        // Percorrer todos os materiais do grupo
        group.post_item_group_materials.forEach(material => {
          const materialId = material.material_id;
          const materialData = material.materials;

          if (materiaisMap.has(materialId)) {
            // Material já existe, somar quantidade
            const existingMaterial = materiaisMap.get(materialId)!;
            existingMaterial.quantidade += material.quantity;
            existingMaterial.subtotal = existingMaterial.quantidade * existingMaterial.precoUnit;
          } else {
            // Novo material, adicionar ao mapa
            // Sempre priorizar price_at_addition se existir (significa que foi editado manualmente)
            // Caso contrário, usar o preço do catálogo
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
      
      // Percorrer todos os materiais avulsos do poste (incluindo o próprio poste)
      post.post_materials.forEach(material => {
        const materialId = material.material_id;
        const materialData = material.materials;

        if (materiaisMap.has(materialId)) {
          // Material já existe, somar quantidade
          const existingMaterial = materiaisMap.get(materialId)!;
          existingMaterial.quantidade += material.quantity;
          existingMaterial.subtotal = existingMaterial.quantidade * existingMaterial.precoUnit;
        } else {
          // Novo material, adicionar ao mapa
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

      // REMOVIDO: Lógica duplicada que somava post.post_types
      // Agora os postes são automaticamente incluídos via post_materials
    });

    // Converter mapa para array e ordenar por nome
    return Array.from(materiaisMap.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  };

  const materiaisConsolidados = consolidarMateriais();
  const custoTotal = materiaisConsolidados.reduce((total, material) => total + material.subtotal, 0);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
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
    
    // Validações
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
      console.log('💾 Salvando preço:', { materialId, newPrice, budgetId: budgetDetails.id });
      await updateConsolidatedMaterialPrice(budgetDetails.id, materialId, newPrice);
      setEditingMaterialId(null);
      setEditingPrice('');
      alert(`Preço atualizado com sucesso para R$ ${newPrice.toFixed(2)}`);
    } catch (error) {
      console.error('❌ Erro ao salvar:', error);
      alert('Erro ao atualizar preço. Por favor, tente novamente.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handlePriceKeyDown = (e: React.KeyboardEvent, materialId: string) => {
    if (e.key === 'Enter') {
      handleSaveEdit(materialId);
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const handleExportExcel = () => {
    if (materiaisConsolidados.length === 0) {
      alert('Não há materiais para exportar');
      return;
    }

    const exportData: MaterialExport[] = materiaisConsolidados.map(material => ({
      materialId: material.materialId,
      codigo: material.codigo,
      nome: material.nome,
      unidade: material.unidade,
      precoUnit: material.precoUnit,
      quantidade: material.quantidade,
      subtotal: material.subtotal,
    }));

    const exportOptions: ExportOptions = {
      budgetName: orcamentoNome,
      totalCost: custoTotal,
      totalPosts: budgetDetails?.posts?.length || 0,
      totalUniqueMaterials: materiaisConsolidados.length,
      exportDate: new Date().toLocaleString('pt-BR'),
    };

    try {
      exportToExcel(exportData, exportOptions);
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

    const exportData: MaterialExport[] = materiaisConsolidados.map(material => ({
      materialId: material.materialId,
      codigo: material.codigo,
      nome: material.nome,
      unidade: material.unidade,
      precoUnit: material.precoUnit,
      quantidade: material.quantidade,
      subtotal: material.subtotal,
    }));

    const exportOptions: ExportOptions = {
      budgetName: orcamentoNome,
      totalCost: custoTotal,
      totalPosts: budgetDetails?.posts?.length || 0,
      totalUniqueMaterials: materiaisConsolidados.length,
      exportDate: new Date().toLocaleString('pt-BR'),
    };

    try {
      exportToCSV(exportData, exportOptions);
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

    const exportData: MaterialExport[] = materiaisConsolidados.map(material => ({
      materialId: material.materialId,
      codigo: material.codigo,
      nome: material.nome,
      unidade: material.unidade,
      precoUnit: material.precoUnit,
      quantidade: material.quantidade,
      subtotal: material.subtotal,
    }));

    const exportOptions: ExportOptions = {
      budgetName: orcamentoNome,
      totalCost: custoTotal,
      totalPosts: budgetDetails?.posts?.length || 0,
      totalUniqueMaterials: materiaisConsolidados.length,
      exportDate: new Date().toLocaleString('pt-BR'),
    };

    try {
      exportToExcelForSuppliers(exportData, exportOptions);
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

    const exportData: MaterialExport[] = materiaisConsolidados.map(material => ({
      materialId: material.materialId,
      codigo: material.codigo,
      nome: material.nome,
      unidade: material.unidade,
      precoUnit: material.precoUnit,
      quantidade: material.quantidade,
      subtotal: material.subtotal,
    }));

    const exportOptions: ExportOptions = {
      budgetName: orcamentoNome,
      totalCost: custoTotal,
      totalPosts: budgetDetails?.posts?.length || 0,
      totalUniqueMaterials: materiaisConsolidados.length,
      exportDate: new Date().toLocaleString('pt-BR'),
    };

    try {
      exportToCSVForSuppliers(exportData, exportOptions);
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
            {/* Botões de exportação */}
            {materiaisConsolidados.length > 0 && (
              <div className="flex items-center space-x-2">
                {/* Exportação Completa (com preços) */}
                <div className="flex flex-col space-y-1">
                  <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide px-1">Completo</div>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={handleExportExcel}
                      className="flex items-center space-x-1 px-2 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-xs font-medium shadow-sm"
                      title="Exportar para Excel (com preços)"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                      <span>Excel</span>
                    </button>
                    <button
                      onClick={handleExportCSV}
                      className="flex items-center space-x-1 px-2 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-xs font-medium shadow-sm"
                      title="Exportar para CSV (com preços)"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>CSV</span>
                    </button>
                  </div>
                </div>

                {/* Separador */}
                <div className="h-12 w-px bg-gray-300"></div>

                {/* Exportação para Fornecedores (sem preços) */}
                <div className="flex flex-col space-y-1">
                  <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide px-1 flex items-center space-x-1">
                    <Users className="h-3 w-3" />
                    <span>Fornecedores</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={handleExportExcelForSuppliers}
                      className="flex items-center space-x-1 px-2 py-1.5 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors text-xs font-medium shadow-sm"
                      title="Exportar para Fornecedores - Excel (sem preços)"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                      <span>Excel</span>
                    </button>
                    <button
                      onClick={handleExportCSVForSuppliers}
                      className="flex items-center space-x-1 px-2 py-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors text-xs font-medium shadow-sm"
                      title="Exportar para Fornecedores - CSV (sem preços)"
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

      <div className="flex-1 overflow-y-auto">
        {materiaisConsolidados.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <Package className="h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-500 font-medium">Nenhum material encontrado</p>
            <p className="text-sm text-gray-400 mt-1">
              Adicione postes e grupos de itens para ver os materiais
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Material
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Qtd. Total
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Preço Unit.
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Subtotal
                  </th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {materiaisConsolidados.map((material, index) => {
                  const isEditing = editingMaterialId === material.materialId;
                  
                  return (
                    <tr key={material.materialId} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-3">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {material.nome}
                          </div>
                          {material.codigo && (
                            <div className="text-xs text-gray-500">
                              Código: {material.codigo}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-900">
                        <span className="font-medium">{material.quantidade}</span>
                        {material.unidade && (
                          <span className="text-gray-500 ml-1">{material.unidade}</span>
                        )}
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
                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                        {formatCurrency(material.subtotal)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isEditing ? (
                          <div className="flex items-center justify-center space-x-1">
                            {isUpdating ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleSaveEdit(material.materialId)}
                                  disabled={isUpdating}
                                  className="p-1 text-green-600 hover:text-green-800 hover:bg-green-50 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Salvar"
                                >
                                  <Check className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  disabled={isUpdating}
                                  className="p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Cancelar"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </>
                            )}
                          </div>
                        ) : (
                          <button
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

      {/* Rodapé com Total */}
      {materiaisConsolidados.length > 0 && (
        <div className="border-t bg-white mt-4 p-4 rounded-lg flex-shrink-0">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">{materiaisConsolidados.length} materiais únicos</span>
              <span className="text-gray-500">({budgetDetails?.posts?.length || 0} postes)</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-sm font-medium text-gray-700">Custo Total:</span>
              <span className="text-lg font-bold text-green-600">
                {formatCurrency(custoTotal)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
