"use client";
import React, { useState, useEffect, useCallback, useMemo, ErrorInfo } from 'react';
import { X, Loader2, Search, Plus, Minus, Package, Folder, ArrowUpDown, ArrowUp, ArrowDown, Copy } from 'lucide-react';
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
import { Material } from '@/types';

const EMPTY_POST_TYPE_VALUE = '__no_post_type__';
const EMPTY_SOURCE_POST_VALUE = '__no_source_post__';

// ErrorBoundary específico para o modal
class ModalErrorBoundary extends React.Component<
  { children: React.ReactNode; onError?: () => void },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error) {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {
    if (this.props.onError) {
      this.props.onError();
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md">
            <h3 className="text-lg font-semibold text-red-600 mb-2">Erro no Modal</h3>
            <p className="text-gray-600 mb-4">Ocorreu um erro inesperado. Tente novamente.</p>
            <button
              onClick={() => {
                this.setState({ hasError: false });
                if (this.props.onError) {
                  this.props.onError();
                }
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Fechar
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

interface AddPostModalProps {
  isOpen: boolean;
  onClose: () => void;
  coordinates: {x: number, y: number} | null;
  onSubmit: (postTypeId: string, postName: string) => Promise<void>;
  onSubmitWithItems?: (postTypeId: string, postName: string, selectedGroups: string[], selectedMaterials: {materialId: string, quantity: number}[]) => Promise<void>;
}

type TabType = 'post' | 'groups' | 'materials' | 'duplicate';
type SortField = 'descricao' | 'codigo' | 'precoUnit';
type SortOrder = 'asc' | 'desc';

function AddPostModalContent({ isOpen, onClose, coordinates, onSubmit, onSubmitWithItems }: AddPostModalProps) {
  const { 
    postTypes, 
    loadingPostTypes, 
    itemGroups, 
    loadingGroups,
    materiais,
    loadingMaterials,
    currentOrcamento,
    budgetDetails,
    fetchItemGroups 
  } = useApp();
  
  const alertDialog = useAlertDialog();
  
  // Estados básicos do poste
  const [postName, setPostName] = useState('');
  const [selectedPostType, setSelectedPostType] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Estados das abas
  const [activeTab, setActiveTab] = useState<TabType>('post');
  
  // Estados dos grupos
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [groupSearchTerm, setGroupSearchTerm] = useState('');
  
  // Estados dos materiais avulsos
  const [selectedMaterials, setSelectedMaterials] = useState<{materialId: string, quantity: number}[]>([]);
  const [materialSearchTerm, setMaterialSearchTerm] = useState('');
  const [isAddingMaterial, setIsAddingMaterial] = useState(false);
  const [sortField, setSortField] = useState<SortField>('descricao');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [inputStates, setInputStates] = useState<Record<string, string>>({});
  
  // Estados para duplicação
  const [selectedSourcePostId, setSelectedSourcePostId] = useState<string>('');

  // Resetar formulário quando modal abre/fecha
  useEffect(() => {
    if (isOpen) {
      // Usar setTimeout para garantir que a limpeza aconteça após a renderização
      setTimeout(() => {
        setPostName('');
        setSelectedPostType('');
        setSelectedGroups([]);
        setSelectedMaterials([]);
        setGroupSearchTerm('');
        setMaterialSearchTerm('');
        setActiveTab('post');
        setInputStates({});
        setSelectedSourcePostId('');
      }, 0);
      
      // Carregar grupos da concessionária atual
      if (currentOrcamento?.company_id) {
        fetchItemGroups(currentOrcamento.company_id);
      }
    }
  }, [isOpen, currentOrcamento, fetchItemGroups]);
  
  // Função para copiar configurações de outro poste
  const handleDuplicateFromPost = useCallback((sourcePostId: string) => {
    if (!budgetDetails || !sourcePostId) return;
    
    const sourcePost = budgetDetails.posts.find(p => p.id === sourcePostId);
    if (!sourcePost) return;
    
    // Copiar tipo do poste
    if (sourcePost.post_types?.id) {
      setSelectedPostType(sourcePost.post_types.id);
    }
    
    // Copiar grupos
    const groupTemplateIds: string[] = [];
    sourcePost.post_item_groups.forEach(group => {
      if (group.template_id) {
        groupTemplateIds.push(group.template_id);
      }
    });
    setSelectedGroups(groupTemplateIds);
    
    // Copiar TODOS os materiais avulsos (incluindo o do tipo de poste)
    // Porque quando há itens pré-selecionados, o sistema não adiciona o material do tipo de poste automaticamente
    const materials = sourcePost.post_materials.map(pm => ({
      materialId: pm.material_id,
      quantity: pm.quantity
    }));
    setSelectedMaterials(materials);
    
    alertDialog.showSuccess(
      'Configurações Copiadas',
      `Tipo de poste, grupos e materiais do poste "${sourcePost.name}" foram copiados com sucesso!`
    );
  }, [budgetDetails, alertDialog]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedPostType || !postName.trim()) {
      alertDialog.showError(
        'Campos Obrigatórios',
        'Por favor, preencha todos os campos obrigatórios.'
      );
      return;
    }

    // Prevenir dupla submissão
    if (isSubmitting) {
      return;
    }


    setIsSubmitting(true);
    
    try {
      // Aguardar um tick para garantir que o estado está sincronizado
      await new Promise(resolve => setTimeout(resolve, 0));
      
      if (onSubmitWithItems && (selectedGroups.length > 0 || selectedMaterials.length > 0)) {
        await onSubmitWithItems(selectedPostType, postName.trim(), selectedGroups, selectedMaterials);
      } else {
        await onSubmit(selectedPostType, postName.trim());
      }
      
      // Aguardar um tick antes de fechar o modal
      await new Promise(resolve => setTimeout(resolve, 100));
      alertDialog.showSuccess(
        'Poste Adicionado',
        'O poste foi adicionado com sucesso ao orçamento.'
      );
      onClose();
    } catch {
      alertDialog.showError(
        'Erro ao Adicionar Poste',
        'Não foi possível adicionar o poste. Tente novamente.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Funções para grupos
  const toggleGroup = (groupId: string) => {
    setSelectedGroups(prev => {
      const newSelection = prev.includes(groupId) 
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId];
      return newSelection;
    });
  };

  // Funções para materiais (com useCallback para evitar re-renderizações desnecessárias)
  const addMaterial = useCallback(async (materialId: string) => {
    try {
      // Prevenir dupla adição
      if (isAddingMaterial) {
        return;
      }
      
      // Criar uma snapshot do estado atual para evitar race conditions
      const currentMaterials = [...selectedMaterials];
      const materialExists = currentMaterials.find(m => m.materialId === materialId);
      
      if (materialExists) {
        return;
      }
      
      setIsAddingMaterial(true);
      
      // Aguardar um tick para garantir que o estado foi atualizado
      await new Promise(resolve => setTimeout(resolve, 0));
      
      // Usar uma função que não depende do estado anterior para evitar stale closures
      setSelectedMaterials(currentMaterials => {
        // Verificar novamente se o material já foi adicionado
        if (currentMaterials.find(m => m.materialId === materialId)) {
          return currentMaterials;
        }
        
        const newSelection = [...currentMaterials, { materialId, quantity: 1 }];
        return newSelection;
      });
      
      // Aguardar outro tick para garantir que a renderização foi processada
      await new Promise(resolve => setTimeout(resolve, 100));
    } finally {
      setIsAddingMaterial(false);
    }
  }, []);

  const removeMaterial = useCallback((materialId: string) => {
    setSelectedMaterials(prev => prev.filter(m => m.materialId !== materialId));
  }, []);

  const updateMaterialQuantity = useCallback((materialId: string, quantity: number) => {
    if (quantity <= 0) {
      removeMaterial(materialId);
      return;
    }
    
    setSelectedMaterials(prev => 
      prev.map(m => 
        m.materialId === materialId 
          ? { ...m, quantity }
          : m
      )
    );
  }, [removeMaterial]);

  const handleQuantityInputChange = useCallback((materialId: string, value: string) => {
    // Atualizar o estado do input imediatamente para permitir edição livre
    setInputStates(prev => ({ ...prev, [materialId]: value }));
    
    // Aceitar vírgula ou ponto como separador decimal
    const normalizedValue = value.replace(',', '.');
    const quantity = parseFloat(normalizedValue);
    
    // Se o valor for válido e positivo, atualizar
    if (!isNaN(quantity) && quantity > 0) {
      updateMaterialQuantity(materialId, quantity);
    }
  }, [updateMaterialQuantity]);

  const handleQuantityBlur = useCallback((materialId: string, value: string) => {
    // Ao sair do campo, validar e corrigir se necessário
    const normalizedValue = value.replace(',', '.');
    const quantity = parseFloat(normalizedValue);
    
    if (isNaN(quantity) || quantity <= 0) {
      // Se inválido, definir como 1
      updateMaterialQuantity(materialId, 1);
      setInputStates(prev => ({ ...prev, [materialId]: '1' }));
    } else {
      // Limpar o estado do input (usar o valor do state)
      setInputStates(prev => {
        const newState = { ...prev };
        delete newState[materialId];
        return newState;
      });
    }
  }, [updateMaterialQuantity]);

  // Função para calcular relevância da busca
  const getSearchRelevance = useCallback((material: Material, term: string): number => {
    if (!term) return 0;
    
    const searchLower = term.toLowerCase();
    const codigoLower = material.codigo.toLowerCase();
    const descricaoLower = material.descricao.toLowerCase();
    
    let score = 0;
    
    // Pontuação para código
    if (codigoLower === searchLower) {
      score += 1000;
    } else if (codigoLower.startsWith(searchLower)) {
      score += 500;
    } else if (codigoLower.includes(searchLower)) {
      score += 100;
    }
    
    // Pontuação para descrição
    const palavras = descricaoLower.split(/\s+/);
    
    if (palavras.some(palavra => palavra === searchLower)) {
      score += 800;
    }
    
    const palavrasComeçam = palavras.filter(palavra => palavra.startsWith(searchLower));
    if (palavrasComeçam.length > 0) {
      score += 400 * palavrasComeçam.length;
    }
    
    if (palavras[0]?.startsWith(searchLower)) {
      score += 300;
    }
    
    if (descricaoLower.startsWith(searchLower)) {
      score += 200;
    }
    
    if (descricaoLower.includes(searchLower)) {
      score += 50;
    }
    
    return score;
  }, []);

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  }, [sortField, sortOrder]);

  const getSortIcon = useCallback((field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3 w-3 ml-1 opacity-30" />;
    }
    return sortOrder === 'asc' 
      ? <ArrowUp className="h-3 w-3 ml-1 text-blue-600" />
      : <ArrowDown className="h-3 w-3 ml-1 text-blue-600" />;
  }, [sortField, sortOrder]);

  // Filtros (memoizados para evitar re-cálculos desnecessários)
  const filteredGroups = useMemo(() => {
    return itemGroups.filter(group =>
      group.nome.toLowerCase().includes(groupSearchTerm.toLowerCase())
    );
  }, [itemGroups, groupSearchTerm]);

  const filteredMaterials = useMemo(() => {
    return materiais
      .filter(material => {
        const searchLower = materialSearchTerm.toLowerCase();
        return material.descricao.toLowerCase().includes(searchLower) ||
               material.codigo.toLowerCase().includes(searchLower);
      })
      .map(material => ({
        material,
        relevance: materialSearchTerm ? getSearchRelevance(material, materialSearchTerm) : 0
      }))
      .sort((a, b) => {
        // Se há busca ativa, ordenar por relevância primeiro
        if (materialSearchTerm) {
          const relevanceDiff = b.relevance - a.relevance;
          if (relevanceDiff !== 0) return relevanceDiff;
        }
        
        // Ordenação normal quando não há busca ou relevância igual
        let comparison = 0;
        
        switch (sortField) {
          case 'descricao':
            comparison = a.material.descricao.localeCompare(b.material.descricao, 'pt-BR', { sensitivity: 'base' });
            break;
          case 'codigo':
            comparison = a.material.codigo.localeCompare(b.material.codigo, 'pt-BR', { sensitivity: 'base' });
            break;
          case 'precoUnit':
            comparison = a.material.precoUnit - b.material.precoUnit;
            break;
        }
        
        return sortOrder === 'asc' ? comparison : -comparison;
      })
      .map(item => item.material);
  }, [materiais, materialSearchTerm, sortField, sortOrder, getSearchRelevance]);

  const availableMaterials = useMemo(() => {
    // Criar uma cópia dos arrays para evitar mutações
    const materialsFiltered = [...filteredMaterials];
    const materialsSelected = [...selectedMaterials];
    
    const result = materialsFiltered.filter(material => {
      const isSelected = materialsSelected.some(m => m.materialId === material.id);
      return !isSelected;
    });
    
    return result;
  }, [filteredMaterials, selectedMaterials]);

  if (!isOpen) return null;

  const hasAdditionalItems = selectedGroups.length > 0 || selectedMaterials.length > 0;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b">
          <h3 className="text-lg font-semibold text-gray-900">Adicionar Novo Poste</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={isSubmitting}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Coordinates Info */}
        {coordinates && (
          <div className="px-6 pt-4">
            <div className="p-3 bg-gray-50 rounded-md">
              <p className="text-sm text-gray-600">
                Posição: X: {coordinates.x.toFixed(2)}, Y: {coordinates.y.toFixed(2)}
              </p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="px-6 pt-4">
          <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('post')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'post'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Package className="h-4 w-4" />
              <span>Dados do Poste</span>
            </button>
            <button
              onClick={() => setActiveTab('duplicate')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'duplicate'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Copy className="h-4 w-4" />
              <span>Duplicar de Existente</span>
            </button>
            <button
              onClick={() => setActiveTab('groups')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'groups'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Folder className="h-4 w-4" />
              <span>Grupos de Itens</span>
              {selectedGroups.length > 0 && (
                <span className="bg-blue-100 text-blue-600 px-2 py-1 rounded-full text-xs">
                  {selectedGroups.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('materials')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'materials'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Package className="h-4 w-4" />
              <span>Materiais Avulsos</span>
              {selectedMaterials.length > 0 && (
                <span className="bg-blue-100 text-blue-600 px-2 py-1 rounded-full text-xs">
                  {selectedMaterials.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          <form onSubmit={handleSubmit} className="h-full flex flex-col">
            <div className="flex-1 overflow-y-auto p-6">
              {/* Aba Dados do Poste */}
              {activeTab === 'post' && (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="postName" className="block text-sm font-medium text-gray-700 mb-1">
                      Nome Personalizável *
                    </label>
                    <input
                      type="text"
                      id="postName"
                      value={postName}
                      onChange={(e) => setPostName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Ex: P, Poste, Entrada, etc."
                      required
                      disabled={isSubmitting}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Um contador automático será adicionado ao nome (ex: P 01, P 02, etc.)
                    </p>
                  </div>

                  <div>
                    <label htmlFor="postType" className="block text-sm font-medium text-gray-700 mb-1">
                      Tipo de Poste *
                    </label>
                    {loadingPostTypes ? (
                      <div className="flex items-center space-x-2 p-3 border border-gray-300 rounded-md">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-gray-500">Carregando tipos...</span>
                      </div>
                    ) : (
                      <>
                        <Select
                          value={selectedPostType || EMPTY_POST_TYPE_VALUE}
                          onValueChange={(value) =>
                            setSelectedPostType(value === EMPTY_POST_TYPE_VALUE ? '' : value)
                          }
                          disabled={isSubmitting}
                        >
                          <SelectTrigger id="postType" className="w-full">
                            <SelectValue placeholder="Selecione um tipo de poste" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={EMPTY_POST_TYPE_VALUE}>Selecione um tipo de poste</SelectItem>
                            {postTypes.map((postType) => (
                              <SelectItem key={postType.id} value={postType.id}>
                                {postType.name} {postType.code && `(${postType.code})`} - R$ {postType.price.toFixed(2)}
                                {postType.height_m && ` - ${postType.height_m}m`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {selectedPostType && selectedSourcePostId && (
                          <p className="mt-2 text-sm text-green-600 flex items-center">
                            <Copy className="h-4 w-4 mr-1" />
                            Tipo de poste copiado do poste selecionado
                          </p>
                        )}
                      </>
                    )}
                  </div>
                  
                  {(selectedGroups.length > 0 || selectedMaterials.length > 0) && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <h4 className="font-semibold text-green-900 mb-2">Itens Copiados</h4>
                      <div className="text-sm text-green-700 space-y-1">
                        {selectedGroups.length > 0 && (
                          <p>✓ {selectedGroups.length} grupo(s) de itens</p>
                        )}
                        {selectedMaterials.length > 0 && (
                          <p>✓ {selectedMaterials.length} material(is) avulso(s)</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Aba Duplicar de Existente */}
              {activeTab === 'duplicate' && (
                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-semibold text-blue-900 mb-2 flex items-center">
                      <Copy className="h-5 w-5 mr-2" />
                      Copiar Configurações de Outro Poste
                    </h4>
                    <p className="text-sm text-blue-700 mb-4">
                      Selecione um poste existente para copiar todos os grupos de itens e materiais avulsos para o novo poste.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="sourcePost" className="block text-sm font-medium text-gray-700 mb-2">
                      Selecionar Poste Origem
                    </label>
                    {!budgetDetails || budgetDetails.posts.length === 0 ? (
                      <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200">
                        <p className="text-gray-500">Nenhum poste disponível para copiar</p>
                        <p className="text-sm text-gray-400 mt-1">Adicione postes primeiro ou configure manualmente</p>
                      </div>
                    ) : (
                      <>
                        <Select
                          value={selectedSourcePostId || EMPTY_SOURCE_POST_VALUE}
                          onValueChange={(value) =>
                            setSelectedSourcePostId(value === EMPTY_SOURCE_POST_VALUE ? '' : value)
                          }
                        >
                          <SelectTrigger id="sourcePost" className="w-full mb-3">
                            <SelectValue placeholder="Selecione um poste..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={EMPTY_SOURCE_POST_VALUE}>Selecione um poste...</SelectItem>
                            {budgetDetails.posts.map((post) => (
                              <SelectItem key={post.id} value={post.id}>
                                {post.name} - {post.post_types?.name || 'Sem tipo'}
                                {' '}({post.post_item_groups.length} grupos, {post.post_materials.length} materiais)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {selectedSourcePostId && (
                          <button
                            type="button"
                            onClick={() => handleDuplicateFromPost(selectedSourcePostId)}
                            className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                          >
                            <Copy className="h-4 w-4" />
                            <span>Copiar Configurações</span>
                          </button>
                        )}

                        {/* Preview do poste selecionado */}
                        {selectedSourcePostId && (() => {
                          const sourcePost = budgetDetails.posts.find(p => p.id === selectedSourcePostId);
                          if (!sourcePost) return null;
                          
                          return (
                            <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                              <h5 className="font-medium text-gray-900 mb-3">Configurações que serão copiadas:</h5>
                              
                              <div className="space-y-3">
                                <div>
                                  <p className="text-sm font-medium text-gray-700">Poste de Origem: {sourcePost.name}</p>
                                  <p className="text-sm text-green-600 font-medium flex items-center mt-1">
                                    <Copy className="h-3 w-3 mr-1" />
                                    Tipo: {sourcePost.post_types?.name || 'Não definido'}
                                    {sourcePost.post_types?.code && ` (${sourcePost.post_types.code})`}
                                  </p>
                                </div>

                                {sourcePost.post_item_groups.length > 0 && (
                                  <div>
                                    <p className="text-sm font-medium text-gray-700 mb-1 flex items-center">
                                      <Copy className="h-3 w-3 mr-1 text-green-600" />
                                      Grupos ({sourcePost.post_item_groups.length}):
                                    </p>
                                    <ul className="list-disc list-inside text-sm text-gray-600 space-y-1 ml-4">
                                      {sourcePost.post_item_groups.map(group => (
                                        <li key={group.id}>
                                          {group.name} - {group.post_item_group_materials?.length || 0} materiais
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                                {sourcePost.post_materials.length > 0 && (
                                  <div>
                                    <p className="text-sm font-medium text-gray-700 mb-1 flex items-center">
                                      <Copy className="h-3 w-3 mr-1 text-green-600" />
                                      Materiais Avulsos ({sourcePost.post_materials.length}):
                                    </p>
                                    <ul className="list-disc list-inside text-sm text-gray-600 space-y-1 ml-4">
                                      {sourcePost.post_materials.map(material => (
                                        <li key={material.id}>
                                          {material.materials?.name || 'Material'} - Qtd: {material.quantity}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                                {sourcePost.post_item_groups.length === 0 && sourcePost.post_materials.length === 0 && (
                                  <p className="text-sm text-gray-500 italic">
                                    Este poste possui apenas o tipo configurado (sem grupos ou materiais adicionais).
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Aba Grupos de Itens */}
              {activeTab === 'groups' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Selecionar Grupos de Itens
                    </label>
                    <div className="relative mb-4">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                      <input
                        type="text"
                        placeholder="Buscar grupos..."
                        value={groupSearchTerm}
                        onChange={(e) => setGroupSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  {loadingGroups ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                      <span className="ml-2 text-gray-600">Carregando grupos...</span>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {filteredGroups.map((group, index) => (
                        <div
                          key={`filtered-group-${group.id}-${index}`}
                          className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                            selectedGroups.includes(group.id)
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                          onClick={() => toggleGroup(group.id)}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-medium text-gray-900">{group.nome}</h4>
                              {group.descricao && (
                                <p className="text-sm text-gray-600 mt-1">{group.descricao}</p>
                              )}
                              <p className="text-xs text-gray-500 mt-1">
                                {group.materiais?.length || 0} materiais
                              </p>
                            </div>
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                              selectedGroups.includes(group.id)
                                ? 'border-blue-500 bg-blue-500'
                                : 'border-gray-300'
                            }`}>
                              {selectedGroups.includes(group.id) && (
                                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      {filteredGroups.length === 0 && (
                        <div className="text-center py-8 text-gray-500">
                          {groupSearchTerm ? 'Nenhum grupo encontrado' : 'Nenhum grupo disponível'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Aba Materiais Avulsos */}
              {activeTab === 'materials' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Materiais Selecionados
                    </label>
                      {selectedMaterials.length > 0 ? (
                      <div className="space-y-2 mb-4">
                        {selectedMaterials.map((selectedMaterial, index) => {
                          const material = materiais.find(m => m.id === selectedMaterial.materialId);
                          if (!material) {
                            return null;
                          }
                          
                          return (
                            <div key={`selected-material-${selectedMaterial.materialId}-${index}`} className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                              <div className="flex-1">
                                <p className="font-medium text-gray-900">{material.descricao}</p>
                                <p className="text-sm text-gray-600">
                                  {material.codigo} - R$ {material.precoUnit.toFixed(2)}/{material.unidade}
                                </p>
                              </div>
                              <div className="flex items-center space-x-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newQty = Math.max(1, selectedMaterial.quantity - 1);
                                    updateMaterialQuantity(selectedMaterial.materialId, newQty);
                                    setInputStates(prev => {
                                      const newState = { ...prev };
                                      delete newState[selectedMaterial.materialId];
                                      return newState;
                                    });
                                  }}
                                  className="p-1 text-red-600 hover:bg-red-50 rounded-full transition-colors"
                                  title="Diminuir 1"
                                >
                                  <Minus className="h-4 w-4" />
                                </button>
                                <input
                                  type="text"
                                  value={inputStates[selectedMaterial.materialId] ?? selectedMaterial.quantity.toString().replace('.', ',')}
                                  onChange={(e) => handleQuantityInputChange(selectedMaterial.materialId, e.target.value)}
                                  onBlur={(e) => handleQuantityBlur(selectedMaterial.materialId, e.target.value)}
                                  className="w-20 px-2 py-1 text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  placeholder="1"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    updateMaterialQuantity(selectedMaterial.materialId, selectedMaterial.quantity + 1);
                                    setInputStates(prev => {
                                      const newState = { ...prev };
                                      delete newState[selectedMaterial.materialId];
                                      return newState;
                                    });
                                  }}
                                  className="p-1 text-green-600 hover:bg-green-50 rounded-full transition-colors"
                                  title="Aumentar 1"
                                >
                                  <Plus className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeMaterial(selectedMaterial.materialId)}
                                  className="p-1 text-red-400 hover:text-red-600"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-sm mb-4">Nenhum material selecionado</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Adicionar Materiais
                    </label>
                    <div className="mb-4">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                        <input
                          type="text"
                          placeholder="Buscar materiais..."
                          value={materialSearchTerm}
                          onChange={(e) => setMaterialSearchTerm(e.target.value)}
                          className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                        {materialSearchTerm && (
                          <button
                            type="button"
                            onClick={() => setMaterialSearchTerm('')}
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                            title="Limpar busca"
                          >
                            <X className="h-5 w-5" />
                          </button>
                        )}
                      </div>
                      
                      {/* Feedback de busca */}
                      {materialSearchTerm && (
                        <div className="mt-2 mb-2 px-2 py-1.5 bg-blue-50 border border-blue-200 rounded text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-blue-700 font-medium">
                              🔍 Buscando: "{materialSearchTerm}"
                            </span>
                            <span className="text-blue-600">
                              {availableMaterials.length} resultado{availableMaterials.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                      )}
                      
                      {/* Controles de ordenação */}
                      <div className="mt-2 flex items-center space-x-2 text-xs">
                        <span className="text-gray-500">Ordenar:</span>
                        <button
                          type="button"
                          onClick={() => handleSort('descricao')}
                          className={`flex items-center px-2 py-1 rounded transition-colors ${
                            sortField === 'descricao'
                              ? 'bg-blue-100 text-blue-700 font-medium'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          Descrição
                          {getSortIcon('descricao')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSort('codigo')}
                          className={`flex items-center px-2 py-1 rounded transition-colors ${
                            sortField === 'codigo'
                              ? 'bg-blue-100 text-blue-700 font-medium'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          Código
                          {getSortIcon('codigo')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSort('precoUnit')}
                          className={`flex items-center px-2 py-1 rounded transition-colors ${
                            sortField === 'precoUnit'
                              ? 'bg-blue-100 text-blue-700 font-medium'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          Preço
                          {getSortIcon('precoUnit')}
                        </button>
                      </div>
                    </div>
                  </div>

                  {loadingMaterials ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                      <span className="ml-2 text-gray-600">Carregando materiais...</span>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {availableMaterials.map((material, index) => {
                        return (
                          <div
                            key={`available-material-${material.id}-${index}`}
                            className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                          >
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-900">{material.descricao}</h4>
                              <p className="text-sm text-gray-600">
                                {material.codigo} - R$ {material.precoUnit.toFixed(2)}/{material.unidade}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await addMaterial(material.id);
                                } catch {
                                  // Erro será capturado pelo ErrorBoundary
                                }
                              }}
                              disabled={isAddingMaterial}
                              className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isAddingMaterial ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Plus className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        );
                      })}
                      {availableMaterials.length === 0 && (
                        <div className="text-center py-8 text-gray-500">
                          {materialSearchTerm ? 'Nenhum material encontrado' : 'Todos os materiais já foram selecionados'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t p-6">
              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-600">
                  {hasAdditionalItems && (
                    <p>
                      {selectedGroups.length > 0 && `${selectedGroups.length} grupo(s)`}
                      {selectedGroups.length > 0 && selectedMaterials.length > 0 && ' • '}
                      {selectedMaterials.length > 0 && `${selectedMaterials.length} material(is)`}
                      {' selecionado(s)'}
                    </p>
                  )}
                </div>
                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                    disabled={isSubmitting}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isSubmitting || loadingPostTypes || postTypes.length === 0 || !selectedPostType || !postName.trim()}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Adicionando...</span>
                      </>
                    ) : (
                      <span>Adicionar Poste</span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
      
      <AlertDialog {...alertDialog.dialogProps} />
    </div>
  );
}

export function AddPostModal(props: AddPostModalProps) {
  return (  
    <ModalErrorBoundary onError={props.onClose}>
      <AddPostModalContent {...props} />
    </ModalErrorBoundary>
  );
}
