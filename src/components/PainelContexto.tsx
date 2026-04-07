"use client";
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Copy, Check, X, Loader2 } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { useAlertDialog } from '@/hooks/useAlertDialog';
import { AlertDialog } from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Orcamento, Poste, TipoFixacao, BudgetPostDetail } from '@/types';
import { getPostDisplayName } from '@/lib/utils';

const EMPTY_FIXACAO_VALUE = '__no_tipo_fixacao__';

interface PainelContextoProps {
  orcamento: Orcamento;
  selectedPoste: Poste | null;
  selectedPostDetail?: BudgetPostDetail | null;
  onUpdatePoste: (posteId: string, updates: Partial<Poste>) => void;
}

export function PainelContexto({ orcamento, selectedPoste, selectedPostDetail, onUpdatePoste }: PainelContextoProps) {
  const { gruposItens, concessionarias, itemGroups, addGroupToPost, fetchItemGroups, utilityCompanies, removeGroupFromPost, updateMaterialQuantityInPostGroup } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [addingGroup, setAddingGroup] = useState(false);
  const [removingGroup, setRemovingGroup] = useState<string | null>(null);
  
  const alertDialog = useAlertDialog();

  const concessionaria = concessionarias.find(c => c.id === orcamento.concessionariaId);

  // Buscar grupos da concessionária quando um poste do Supabase for selecionado
  useEffect(() => {
    if (selectedPostDetail && utilityCompanies.length > 0) {

      
      // Encontrar a empresa correspondente no Supabase
      const company = utilityCompanies.find(c => c.nome === concessionaria?.nome || c.sigla === concessionaria?.sigla);

      
      if (company) {

        fetchItemGroups(company.id);
      } else {
        // Empresa não encontrada - não há grupos para carregar
      }
    }
  }, [selectedPostDetail, utilityCompanies, concessionaria, fetchItemGroups]);
  
  // Debug logs para rastrear o fluxo de dados

  
  // Usar grupos do Supabase (itemGroups) quando disponíveis, senão fallback para local (gruposItens)
  const availableGroups = selectedPostDetail && itemGroups.length > 0 ? itemGroups : gruposItens;
  
  const gruposFiltrados = availableGroups.filter(g => {
    // Para dados do Supabase, usar concessionariaId diretamente
    // Para dados locais, usar orcamento.concessionariaId
    const matchesCompany = selectedPostDetail 
      ? true // itemGroups já vem filtrados pela empresa
      : g.concessionariaId === orcamento.concessionariaId;
    
    return matchesCompany && g.nome.toLowerCase().includes(searchTerm.toLowerCase());
  });
  


  const handleAddGrupo = async (grupoId: string) => {
    // Se temos dados do Supabase (selectedPostDetail), usar a função do Supabase
    if (selectedPostDetail) {
      setAddingGroup(true);
      try {
        await addGroupToPost(grupoId, selectedPostDetail.id);
        setSearchTerm('');
      } catch (error) {
        console.error('Erro ao adicionar grupo:', error);
        alertDialog.showError(
          'Erro ao Adicionar',
          'Erro ao adicionar grupo. Tente novamente.'
        );
      } finally {
        setAddingGroup(false);
      }
    } else if (selectedPoste) {
      // Fallback para dados locais
      if (!selectedPoste.gruposItens.includes(grupoId)) {
        const novosGrupos = [...selectedPoste.gruposItens, grupoId];
        onUpdatePoste(selectedPoste.id, { gruposItens: novosGrupos });
      }
      setSearchTerm('');
    }
  };

  const handleRemoveGrupo = async (grupoId: string, isSupabaseGroup: boolean = false) => {
    // Para grupos do Supabase, usar a função de remoção do banco
    if (isSupabaseGroup && selectedPostDetail) {
      alertDialog.showConfirm(
        'Remover Grupo',
        'Tem certeza que deseja remover este grupo? Todos os materiais associados também serão removidos.',
        async () => {
          setRemovingGroup(grupoId);
          
          try {
            await removeGroupFromPost(grupoId);
            alertDialog.showSuccess(
              'Grupo Removido',
              'O grupo foi removido com sucesso.'
            );
          } catch (error) {
            console.error('Erro ao remover grupo:', error);
            alertDialog.showError(
              'Erro ao Remover',
              'Erro ao remover grupo. Tente novamente.'
            );
          } finally {
            setRemovingGroup(null);
          }
        },
        {
          type: 'destructive',
          confirmText: 'Remover',
          cancelText: 'Cancelar'
        }
      );
    } else if (selectedPoste) {
      // Fallback para dados locais
      const novosGrupos = selectedPoste.gruposItens.filter(id => id !== grupoId);
      onUpdatePoste(selectedPoste.id, { gruposItens: novosGrupos });
    }
  };

  const handleDuplicarPoste = () => {
    if (!selectedPoste) return;
    
    // Esta funcionalidade seria implementada no componente pai

  };

  const handleToggleConcluido = () => {
    if (!selectedPoste) return;
    
    onUpdatePoste(selectedPoste.id, { concluido: !selectedPoste.concluido });
  };

  if (!selectedPoste && !selectedPostDetail) {
    return (
      <div className="p-4 space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {orcamento.nome}
          </h3>
          <p className="text-sm text-gray-600">
            Concessionária: {concessionaria?.sigla}
          </p>
        </div>

        <div className="space-y-2">
          <button className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
            Adicionar Cabeamento
          </button>
          <button 
            className={`w-full px-4 py-2 rounded-lg transition-colors ${
              orcamento.status === 'Finalizado'
                ? 'bg-gray-400 text-gray-700 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
            disabled={orcamento.status === 'Finalizado'}
          >
            Finalizar Orçamento
          </button>
        </div>
      </div>
    );
  }

  // Determinar qual poste está selecionado
  const postName = selectedPostDetail ? getPostDisplayName(selectedPostDetail) : selectedPoste?.nome;

  return (
    <div className="p-4 space-y-4">
      <div className="border-b pb-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Configuração do {postName}
        </h3>
        
        {/* Mostrar tipo de poste quando temos dados do Supabase */}
        {selectedPostDetail?.post_types && (
          <div className="mb-4 p-3 bg-blue-50 rounded-md">
            <div className="text-sm font-medium text-blue-900">
              {selectedPostDetail.post_types.name}
              {selectedPostDetail.post_types.code && ` (${selectedPostDetail.post_types.code})`}
            </div>
            {selectedPostDetail.post_types.height_m && (
              <div className="text-xs text-blue-700">
                Altura: {selectedPostDetail.post_types.height_m}m
              </div>
            )}
            <div className="text-xs text-blue-700">
              Preço: R$ {selectedPostDetail.post_types.price.toFixed(2)}
            </div>
          </div>
        )}
        
        {selectedPoste && (
          <div className="flex items-center space-x-2">
            <button
              onClick={handleToggleConcluido}
              className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm transition-colors ${
                selectedPoste.concluido
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Check className="h-4 w-4" />
              <span>{selectedPoste.concluido ? 'Concluído' : 'Marcar como Concluído'}</span>
            </button>
          </div>
        )}

        {selectedPoste && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tipo de Fixação
            </label>
            <Select
              value={selectedPoste.tipoFixacao || EMPTY_FIXACAO_VALUE}
              onValueChange={(value) =>
                onUpdatePoste(selectedPoste.id, {
                  tipoFixacao: (value === EMPTY_FIXACAO_VALUE ? '' : value) as TipoFixacao,
                })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione o tipo de fixação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={EMPTY_FIXACAO_VALUE}>Selecione o tipo de fixação</SelectItem>
                <SelectItem value="Direto">Direto</SelectItem>
                <SelectItem value="Cruzeta">Cruzeta</SelectItem>
                <SelectItem value="Suporte">Suporte</SelectItem>
                <SelectItem value="Outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {(selectedPoste || selectedPostDetail) && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Adicionar Grupos de Itens
              {selectedPostDetail && (
                <span className="ml-2 text-xs text-blue-600">
                  (Dados do banco)
                </span>
              )}
            </label>
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar grupos de itens..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={addingGroup}
            />
            {addingGroup && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              </div>
            )}
            {searchTerm && gruposFiltrados.length > 0 && !addingGroup && (
              <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-md mt-1 max-h-40 overflow-y-auto z-10 shadow-lg">
                {gruposFiltrados.map((grupo) => (
                  <button
                    key={grupo.id}
                    onClick={() => handleAddGrupo(grupo.id)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 transition-colors border-b last:border-b-0"
                    disabled={addingGroup}
                  >
                    <div className="font-medium text-sm">{grupo.nome}</div>
                    <div className="text-xs text-gray-500">{grupo.descricao}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Grupos Adicionados
          </label>
          {selectedPostDetail ? (
            // Dados do Supabase
            selectedPostDetail.post_item_groups.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhum grupo adicionado</p>
            ) : (
              <div className="space-y-1">
                {selectedPostDetail.post_item_groups.map((group) => (
                  <div key={group.id} className="bg-gray-50 px-3 py-2 rounded-md">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium">{group.name}</span>
                        <span className="text-xs text-gray-500">
                          {group.post_item_group_materials.length} materiais
                        </span>
                      </div>
                      <button
                        onClick={() => handleRemoveGrupo(group.id, true)}
                        className="text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
                        disabled={removingGroup === group.id}
                        title="Remover grupo"
                      >
                        {removingGroup === group.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <X className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                    {group.post_item_group_materials.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {group.post_item_group_materials.map((material) => (
                          <div key={material.material_id} className="text-xs text-gray-600 pl-2 border-l-2 border-gray-200">
                            <div className="flex justify-between items-center">
                              <span className="flex-1">{material.materials.name}</span>
                              <QuantityEditor
                                postGroupId={group.id}
                                materialId={material.material_id}
                                currentQuantity={material.quantity}
                                unit={material.materials.unit}
                                onUpdateQuantity={updateMaterialQuantityInPostGroup}
                              />
                            </div>
                            <div className="text-gray-500 mt-1">
                              R$ {material.price_at_addition.toFixed(2)} x {material.quantity} = R$ {(material.price_at_addition * material.quantity).toFixed(2)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : (
            // Dados locais (fallback)
            !selectedPoste || selectedPoste.gruposItens.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhum grupo adicionado</p>
            ) : (
              <div className="space-y-1">
                {selectedPoste.gruposItens.map((grupoId) => {
                  const grupo = gruposItens.find(g => g.id === grupoId);
                  if (!grupo) return null;
                  
                  return (
                    <div key={grupoId} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-md">
                      <span className="text-sm font-medium">{grupo.nome}</span>
                      <button
                        onClick={() => handleRemoveGrupo(grupoId, false)}
                        className="text-red-500 hover:text-red-700 transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>

        {selectedPoste && (
          <button
            onClick={handleDuplicarPoste}
            className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            <Copy className="h-4 w-4" />
            <span>Duplicar Poste</span>
          </button>
        )}
      </div>
      )}
      
      <AlertDialog {...alertDialog.dialogProps} />
    </div>
  );
}

// Componente para edição inline de quantidade com debounce
interface QuantityEditorProps {
  postGroupId: string;
  materialId: string;
  currentQuantity: number;
  unit: string;
  onUpdateQuantity: (postGroupId: string, materialId: string, newQuantity: number) => Promise<void>;
}

function QuantityEditor({ postGroupId, materialId, currentQuantity, unit, onUpdateQuantity }: QuantityEditorProps) {
  const [localQuantity, setLocalQuantity] = useState(currentQuantity);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  // Atualizar valor local quando prop mudar
  useEffect(() => {
    setLocalQuantity(currentQuantity);
  }, [currentQuantity]);

  // Debounce function
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  const handleQuantityChange = useCallback((newValue: number) => {
    setLocalQuantity(newValue);

    // Limpar timer anterior
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    // Se a quantidade for diferente da atual, salvar após delay
    if (newValue !== currentQuantity && newValue >= 0) {
      debounceTimer.current = setTimeout(async () => {
        setIsSaving(true);
        try {
          await onUpdateQuantity(postGroupId, materialId, newValue);
          setShowSaved(true);
          setTimeout(() => setShowSaved(false), 1500); // Mostrar "salvo" por 1.5s
        } catch (error) {
          console.error('Erro ao salvar quantidade:', error);
          setLocalQuantity(currentQuantity); // Reverter para valor original
          alert('Erro ao salvar quantidade. Tente novamente.');
        } finally {
          setIsSaving(false);
        }
      }, 800); // Debounce de 800ms
    }
  }, [currentQuantity, onUpdateQuantity, postGroupId, materialId]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || 0;
    handleQuantityChange(value);
  };

  const handleBlur = () => {
    // Garantir que o valor seja válido no blur
    if (localQuantity < 0) {
      setLocalQuantity(0);
      handleQuantityChange(0);
    }
  };

  // Cleanup do timer
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  return (
    <div className="flex items-center space-x-1">
      <input
        type="number"
        min="0"
        value={localQuantity}
        onChange={handleInputChange}
        onBlur={handleBlur}
        className="w-16 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
        disabled={isSaving}
      />
      <span className="text-xs text-gray-500">{unit}</span>
      
      {/* Feedback visual */}
      <div className="w-4 flex justify-center">
        {isSaving ? (
          <Loader2 className="h-3 w-3 animate-spin text-blue-600" />
        ) : showSaved ? (
          <Check className="h-3 w-3 text-green-600" />
        ) : null}
      </div>
    </div>
  );
}