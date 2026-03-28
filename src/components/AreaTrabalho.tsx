"use client";
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { CanvasVisual } from './CanvasVisual';
import { PainelConsolidado } from './PainelConsolidado';
import { Poste, TipoPoste, BudgetDetails, BudgetPostDetail, Material, PostMaterial, GrupoItem, PostItemGroupDetail, PostItemGroupMaterial } from '@/types';
import { Trash2, Loader2, X, Check, Folder, TowerControl, Package, ArrowLeft, Eye, Search, FileSpreadsheet } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { AddPostModal } from '@/components/modals/AddPostModal';
import { EditPostModal } from '@/components/modals/EditPostModal';
import { useAlertDialog } from '@/hooks/useAlertDialog';
import { useDebounce } from '@/hooks/useDebounce';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { getPostDisplayName } from '@/lib/utils';
import { exportByPostAndGroupToExcel, PostWithMaterials } from '@/services/exportService';

export function AreaTrabalho() {
  // --- INÍCIO DO BLOCO DE CÓDIGO PARA SUBSTITUIR ---
  const {
    currentOrcamento,
    budgetDetails,
    loadingBudgetDetails,
    fetchBudgetDetails,

    fetchPostTypes,
    addPostToBudget,
    deletePostFromBudget,
    updatePostCoordinates,
    uploadPlanImage,
    deletePlanImage,
    loadingUpload,
    itemGroups,
    addGroupToPost,
    fetchItemGroups,
    removeGroupFromPost,
    updateMaterialQuantityInPostGroup,
    updateOrcamento,
    
    // Funções de materiais avulsos
    addLooseMaterialToPost,
    updateLooseMaterialQuantity,
    removeLooseMaterialFromPost,
    
    // Catálogo de materiais
    materiais,
    fetchMaterials
    // Adicione aqui quaisquer outras funções/estados do context que a UI usa
  } = useApp();
  
  const alertDialog = useAlertDialog();
  
  // Estado de visualização local
  const [activeView, setActiveView] = useState<'main' | 'consolidation'>('main');
  const [selectedPoste, setSelectedPoste] = useState<Poste | null>(null);
  const [selectedPostDetail, setSelectedPostDetail] = useState<BudgetPostDetail | null>(null);
  const [deletingPost, setDeletingPost] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [addingGroup, setAddingGroup] = useState(false);
  const [removingGroup, setRemovingGroup] = useState<string | null>(null);
  const [copiedPostDetail, setCopiedPostDetail] = useState<BudgetPostDetail | null>(null);
  const [capturedPastePoints, setCapturedPastePoints] = useState<Array<{ x: number; y: number }>>([]);
  const [isPastingPost, setIsPastingPost] = useState(false);
  const pasteSequenceRef = useRef(1);
  
  // ⚠️ NOTA: Estado de desktop comentado pois não está sendo usado atualmente
  // Descomente se necessário para recursos específicos de desktop
  // const [isDesktop, setIsDesktop] = useState(false);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [clickCoordinates, setClickCoordinates] = useState<{ x: number, y: number } | null>(null);
  
  // Estados para o modal de edição
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [postToEdit, setPostToEdit] = useState<BudgetPostDetail | null>(null);
  
  // ⚠️ NOTA: Detecção de desktop comentada - descomente se necessário
  /*
  useEffect(() => {
    const checkIsDesktop = () => {
      // Detecta se é desktop baseado na largura da tela e user agent
      const isDesktopScreen = window.innerWidth >= 1024;
      const isDesktopUserAgent = !/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      setIsDesktop(isDesktopScreen && isDesktopUserAgent);
    };

    checkIsDesktop();
    window.addEventListener('resize', checkIsDesktop);
    
    return () => window.removeEventListener('resize', checkIsDesktop);
  }, []);
  */


  const buildIncrementedPostName = useCallback((baseName: string, offset: number) => {
    const match = baseName.match(/(\d+)(?!.*\d)/);
    if (!match || match.index === undefined) {
      return `${baseName.trim()} ${offset}`;
    }

    const currentNumber = parseInt(match[1], 10);
    if (Number.isNaN(currentNumber)) {
      return `${baseName.trim()} ${offset}`;
    }

    const nextNumber = String(currentNumber + offset).padStart(match[1].length, '0');
    return `${baseName.slice(0, match.index)}${nextNumber}${baseName.slice(match.index + match[1].length)}`;
  }, []);

  const createCopiedPostAt = useCallback(async (coords: { x: number; y: number }) => {
    if (!copiedPostDetail || !currentOrcamento?.id) {
      return;
    }

    const postTypeId = copiedPostDetail.post_types?.id;
    if (!postTypeId) {
      alertDialog.showError(
        'Tipo de Poste não encontrado',
        'Não foi possível copiar este poste porque ele não possui um tipo associado.'
      );
      return;
    }

    const sequence = pasteSequenceRef.current;
    pasteSequenceRef.current += 1;
    // Usar o custom_name ou name como base para incrementar
    const baseName = copiedPostDetail.custom_name || copiedPostDetail.name;
    const postName = buildIncrementedPostName(baseName, sequence);

    const newPostId = await addPostToBudget({
      budget_id: currentOrcamento.id,
      post_type_id: postTypeId,
      name: postName,
      x_coord: coords.x,
      y_coord: coords.y,
      skipPostTypeMaterial: true,
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    const groupTemplateIds = copiedPostDetail.post_item_groups
      .map(group => group.template_id)
      .filter((id): id is string => Boolean(id));

    for (const groupId of groupTemplateIds) {
      try {
        await addGroupToPost(groupId, newPostId);
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        console.error(`Erro ao copiar grupo ${groupId}:`, error);
      }
    }

    for (const material of copiedPostDetail.post_materials) {
      try {
        await addLooseMaterialToPost(
          newPostId,
          material.material_id,
          material.quantity,
          material.price_at_addition
        );
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        console.error(`Erro ao copiar material ${material.material_id}:`, error);
      }
    }
  }, [
    addGroupToPost,
    addLooseMaterialToPost,
    addPostToBudget,
    alertDialog,
    buildIncrementedPostName,
    copiedPostDetail,
    currentOrcamento?.id
  ]);

  const handleCapturePastePoint = useCallback((coords: { x: number; y: number }) => {
    if (!copiedPostDetail) {
      return;
    }

    setCapturedPastePoints(prev => [...prev, coords]);
  }, [copiedPostDetail]);

  const handlePasteCapturedPoints = useCallback(async () => {
    if (!copiedPostDetail || !currentOrcamento?.id || isPastingPost) {
      return;
    }

    if (capturedPastePoints.length === 0) {
      return;
    }

    setIsPastingPost(true);
    try {
      const pointsToPaste = [...capturedPastePoints];
      setCapturedPastePoints([]);
      await Promise.all(pointsToPaste.map(coords => createCopiedPostAt(coords)));
    } catch (error) {
      console.error('Falha ao colar postes:', error);
      alertDialog.showError(
        'Erro ao Colar Poste',
        'Ocorreu um erro ao copiar o poste. Tente novamente.'
      );
    } finally {
      setIsPastingPost(false);
    }
  }, [
    alertDialog,
    capturedPastePoints,
    copiedPostDetail,
    createCopiedPostAt,
    currentOrcamento?.id,
    isPastingPost
  ]);

  // Atalhos de teclado para copiar/colar postes
  useEffect(() => {
    const isEditableElement = (element: HTMLElement | null) => {
      if (!element) return false;
      const tagName = element.tagName.toLowerCase();
      return (
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select' ||
        element.isContentEditable
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableElement(event.target as HTMLElement | null)) {
        return;
      }

      const key = event.key.toLowerCase();
      if (event.ctrlKey && key === 'c') {
        if (selectedPostDetail) {
          setCopiedPostDetail(selectedPostDetail);
          setCapturedPastePoints([]);
          pasteSequenceRef.current = 1;
          event.preventDefault();
        }
      }

      if (event.ctrlKey && key === 'v') {
        if (copiedPostDetail && capturedPastePoints.length > 0) {
          event.preventDefault();
          handlePasteCapturedPoints();
        }
      }

      if (key === 'escape' && capturedPastePoints.length > 0) {
        setCapturedPastePoints([]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [capturedPastePoints.length, copiedPostDetail, handlePasteCapturedPoints, selectedPostDetail]);

  // ⚡ OTIMIZADO: Efeito principal para carregar dados da AreaTrabalho
  useEffect(() => {
    const budgetId = currentOrcamento?.id;
    const companyId = currentOrcamento?.company_id;
    
    // Só executa se tivermos um ID de orçamento
    if (budgetId) {
      // Sempre busca detalhes do orçamento (necessário)
      fetchBudgetDetails(budgetId);
      
      // ⚡ OTIMIZAÇÃO: fetchPostTypes e fetchMaterials agora usam cache interno
      // Só carregam se ainda não foram carregados (lazy loading)
      fetchPostTypes(); // Cache interno evita reload
      fetchMaterials(); // Cache interno evita reload
      
      // Se tivermos um ID de empresa, busca os grupos de itens
      if (companyId) {
        fetchItemGroups(companyId);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrcamento?.id, currentOrcamento?.company_id]); // Funções useCallback são estáveis
  
  // Função para ser chamada pelo clique direito no canvas
  const handleRightClick = useCallback((coords: { x: number, y: number }) => {
    setClickCoordinates(coords);
    setIsModalOpen(true);
  }, []);
  
  // Função para abrir o modal de edição
  const handleEditPost = useCallback((post: BudgetPostDetail) => {
    setPostToEdit(post);
    setIsEditModalOpen(true);
  }, []);
  
  // Função para ser chamada pelo modal para adicionar o poste
  const handleAddPost = useCallback(async (postTypeId: string, postName: string) => {
    if (!clickCoordinates || !currentOrcamento?.id) {
      alertDialog.showError(
        "Erro ao Adicionar Poste",
        "Não foi possível adicionar o poste. Dados do orçamento ou coordenadas não encontrados."
      );
      return;
    }
    
    try {
      await addPostToBudget({
        budget_id: currentOrcamento.id,
        post_type_id: postTypeId,
        name: postName,
        x_coord: clickCoordinates.x,
        y_coord: clickCoordinates.y,
      });
      
      setIsModalOpen(false);
      setClickCoordinates(null);
      alertDialog.showSuccess(
        "Poste Adicionado",
        "O poste foi adicionado com sucesso ao orçamento."
      );
    } catch (error) {
      console.error("Falha ao adicionar poste:", error);
      alertDialog.showError(
        "Erro ao Salvar",
        "Ocorreu um erro ao salvar o poste. Tente novamente."
      );
    }
  }, [clickCoordinates, currentOrcamento, addPostToBudget, alertDialog]);

  // Função para adicionar poste com grupos e materiais
  const handleAddPostWithItems = useCallback(async (
    postTypeId: string, 
    postName: string, 
    selectedGroups: string[], 
    selectedMaterials: {materialId: string, quantity: number}[]
  ) => {
    if (!clickCoordinates || !currentOrcamento?.id) {
      alertDialog.showError(
        "Erro ao Adicionar Poste",
        "Não foi possível adicionar o poste. Dados do orçamento ou coordenadas não encontrados."
      );
      return;
    }
    
    try {
      // Primeiro adicionar o poste e obter seu ID
      // IMPORTANTE: skipPostTypeMaterial=true para não adicionar o material do tipo de poste automaticamente
      // pois ele será adicionado manualmente junto com os outros materiais avulsos selecionados
      const newPostId = await addPostToBudget({
        budget_id: currentOrcamento.id,
        post_type_id: postTypeId,
        name: postName,
        x_coord: clickCoordinates.x,
        y_coord: clickCoordinates.y,
        skipPostTypeMaterial: true, // Não adicionar automaticamente quando há itens pré-selecionados
      });
      
      // Aguardar um pouco para garantir que o estado foi atualizado
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Adicionar grupos selecionados
      for (const groupId of selectedGroups) {
        try {
          await addGroupToPost(groupId, newPostId);
          // Pequena pausa entre operações
          await new Promise(resolve => setTimeout(resolve, 50));
        } catch (error) {
          console.error(`Erro ao adicionar grupo ${groupId}:`, error);
          // Continue com outros grupos mesmo se um falhar
        }
      }
      
      // Adicionar materiais avulsos selecionados
      for (const selectedMaterial of selectedMaterials) {
        try {
          const material = materiais.find(m => m.id === selectedMaterial.materialId);
          if (material) {
            await addLooseMaterialToPost(
              newPostId, 
              selectedMaterial.materialId, 
              selectedMaterial.quantity, 
              material.precoUnit
            );
            // Pequena pausa entre operações
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        } catch (error) {
          console.error(`Erro ao adicionar material ${selectedMaterial.materialId}:`, error);
          // Continue com outros materiais mesmo se um falhar
        }
      }
      
      // Aguardar um pouco antes de fechar o modal para garantir que todas as atualizações foram processadas
      await new Promise(resolve => setTimeout(resolve, 200));
      
      setIsModalOpen(false);
      setClickCoordinates(null);
    } catch (error) {
      console.error("Falha ao adicionar poste com itens:", error);
      alertDialog.showError(
        "Erro ao Salvar",
        "Ocorreu um erro ao salvar o poste e seus itens. Tente novamente."
      );
    }
  }, [clickCoordinates, currentOrcamento, addPostToBudget, addGroupToPost, addLooseMaterialToPost, materiais, alertDialog]);
  
  // Função para exportar materiais organizados por poste/grupo
  const handleExportByPostAndGroup = useCallback(() => {
    if (!budgetDetails || budgetDetails.posts.length === 0) {
      alertDialog.showError(
        'Nenhum Poste',
        'Não há postes para exportar.'
      );
      return;
    }
    
    // Organizar dados no formato necessário
    const postsData: PostWithMaterials[] = budgetDetails.posts.map((post: BudgetPostDetail) => {
      const postName = getPostDisplayName(post);
      const postType = post.post_types?.name || 'Tipo não definido';
      
      // Organizar grupos
      const groups = post.post_item_groups.map((group: PostItemGroupDetail) => ({
        groupName: group.name,
        materials: group.post_item_group_materials.map((material: PostItemGroupMaterial) => ({
          codigo: material.materials.code || '-',
          nome: material.materials.name,
          unidade: material.materials.unit,
          quantidade: material.quantity,
          precoUnit: material.price_at_addition,
          subtotal: material.quantity * material.price_at_addition
        }))
      }));
      
      // Organizar materiais avulsos
      const looseMaterials = (post.post_materials || []).map((material: PostMaterial) => ({
        codigo: material.materials.code || '-',
        nome: material.materials.name,
        unidade: material.materials.unit,
        quantidade: material.quantity,
        precoUnit: material.price_at_addition,
        subtotal: material.quantity * material.price_at_addition
      }));
      
      return {
        postName,
        postType,
        coords: { x: post.x_coord, y: post.y_coord },
        groups,
        looseMaterials
      };
    });
    
    // Exportar para Excel
    exportByPostAndGroupToExcel(postsData, budgetDetails.name || 'Orçamento');
    
    alertDialog.showSuccess(
      'Exportação Concluída',
      'A planilha foi exportada com sucesso!'
    );
  }, [budgetDetails, alertDialog]);
  // --- FIM DO BLOCO DE CÓDIGO ---

  if (!currentOrcamento) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center bg-white rounded-lg border border-gray-200 p-8 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-700">Orçamento não encontrado</h2>
          <p className="text-gray-500 mt-2">Selecione um orçamento no Dashboard</p>
        </div>
      </div>
    );
  }

  // Exibir loading state
  if (loadingBudgetDetails) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center space-y-4 bg-white rounded-lg border border-gray-200 p-8 shadow-sm">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-700">Carregando orçamento</h2>
            <p className="text-gray-500 mt-2">Buscando dados do projeto "{currentOrcamento.nome}"</p>
          </div>
        </div>
      </div>
    );
  }

  // Funções de manipulação de imagem
  const handleUploadImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && currentOrcamento) {
      try {
        await uploadPlanImage(currentOrcamento.id, file);
        alertDialog.showSuccess(
          "Upload Concluído",
          "A imagem da planta foi enviada com sucesso."
        );
      } catch {
        alertDialog.showError(
          "Erro no Upload",
          "Erro ao fazer upload da imagem. Tente novamente."
        );
      }
    }
    // Limpar o input para permitir upload do mesmo arquivo novamente
    event.target.value = '';
  };

  const handleDeleteImage = async () => {
    alertDialog.showConfirm(
      "Excluir Planta",
      "Tem certeza que deseja excluir a planta? Esta ação não pode ser desfeita.",
      async () => {
        try {
          await deletePlanImage(currentOrcamento.id);
          setSelectedPoste(null);
          setSelectedPostDetail(null);
          alertDialog.showSuccess(
            "Planta Excluída",
            "A planta foi removida com sucesso."
          );
        } catch {
          alertDialog.showError(
            "Erro ao Excluir",
            "Erro ao deletar a imagem. Tente novamente."
          );
        }
      },
      {
        type: 'destructive',
        confirmText: 'Excluir',
        cancelText: 'Cancelar'
      }
    );
  };

  // Funções legacy (manter para compatibilidade)
  const handleDeletePoste = (posteId: string) => {
    alertDialog.showConfirm(
      "Excluir Poste",
      "Tem certeza que deseja excluir este poste?",
      () => {
        const newPostes = currentOrcamento.postes.filter(p => p.id !== posteId);
        updateOrcamento(currentOrcamento.id, { postes: newPostes });
        if (selectedPoste?.id === posteId) {
          setSelectedPoste(null);
        }
        alertDialog.showSuccess(
          "Poste Excluído",
          "O poste foi removido com sucesso."
        );
      },
      {
        type: 'destructive',
        confirmText: 'Excluir',
        cancelText: 'Cancelar'
      }
    );
  };

  const addPoste = (x: number, y: number, tipo: TipoPoste) => {
    const novoPoste: Poste = {
      id: Date.now().toString(),
      nome: `P-${String(currentOrcamento.postes.length + 1).padStart(2, '0')}`,
      tipo,
      x,
      y,
      gruposItens: [],
      concluido: false,
    };

    const newPostes = [...currentOrcamento.postes, novoPoste];
    updateOrcamento(currentOrcamento.id, { postes: newPostes });
  };

  const updatePoste = (posteId: string, updates: Partial<Poste>) => {
    const newPostes = currentOrcamento.postes.map(p => 
      p.id === posteId ? { ...p, ...updates } : p
    );
    updateOrcamento(currentOrcamento.id, { postes: newPostes });
    
    if (selectedPoste && selectedPoste.id === posteId) {
      setSelectedPoste({ ...selectedPoste, ...updates });
    }
  };

  const handleDeletePostFromDatabase = async (postId: string, postName: string) => {
    alertDialog.showConfirm(
      "Excluir Poste",
      `Tem certeza que deseja excluir o poste "${postName}"? Todos os grupos e materiais associados também serão removidos.`,
      async () => {
        setDeletingPost(postId);
        
        try {
          await deletePostFromBudget(postId);
          
          // Se o poste excluído estava selecionado, limpar seleção
          if (selectedPostDetail?.id === postId) {
            setSelectedPostDetail(null);
          }
          alertDialog.showSuccess(
            "Poste Excluído",
            `O poste "${postName}" foi removido com sucesso.`
          );
        } catch {
          alertDialog.showError(
            "Erro ao Excluir",
            "Erro ao excluir poste. Tente novamente."
          );
        } finally {
          setDeletingPost(null);
        }
      },
      {
        type: 'destructive',
        confirmText: 'Excluir',
        cancelText: 'Cancelar'
      }
    );
  };

  // Função para adicionar grupo ao poste
  const handleAddGrupo = async (grupoId: string, postId: string, isSupabasePost: boolean) => {
    if (isSupabasePost) {
      setAddingGroup(true);
      try {
        await addGroupToPost(grupoId, postId);
        setSearchTerm('');
      } catch {
        alertDialog.showError(
          "Erro ao Adicionar Grupo",
          "Erro ao adicionar grupo. Tente novamente."
        );
      } finally {
        setAddingGroup(false);
      }
    } else {
      // Fallback para dados locais
      const poste = currentOrcamento.postes.find(p => p.id === postId);
      if (poste && !poste.gruposItens.includes(grupoId)) {
        const novosGrupos = [...poste.gruposItens, grupoId];
        updatePoste(postId, { gruposItens: novosGrupos });
      }
      setSearchTerm('');
    }
  };

  // Função para remover grupo do poste
  const handleRemoveGrupo = async (grupoId: string, isSupabaseGroup: boolean = false) => {
    if (isSupabaseGroup) {
      alertDialog.showConfirm(
        "Remover Grupo",
        "Tem certeza que deseja remover este grupo? Todos os materiais associados também serão removidos.",
        async () => {
          setRemovingGroup(grupoId);
          
          try {
            await removeGroupFromPost(grupoId);
            alertDialog.showSuccess(
              "Grupo Removido",
              "O grupo foi removido com sucesso."
            );
          } catch {
            alertDialog.showError(
              "Erro ao Remover",
              "Erro ao remover grupo. Tente novamente."
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
      const novosGrupos = selectedPoste.gruposItens.filter(id => id !== grupoId);
      updatePoste(selectedPoste.id, { gruposItens: novosGrupos });
    }
  };

  // Renderização condicional baseada no activeView
  if (activeView === 'consolidation') {
    return (
      <div className="flex flex-col gap-6">
        {/* Cabeçalho da Consolidação */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setActiveView('main')}
                className="flex items-center space-x-2 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Voltar para Área de Trabalho</span>
              </button>
            </div>
          </div>
        </div>

        {/* Conteúdo Principal - PainelConsolidado */}
        <div>
          <PainelConsolidado
            budgetDetails={budgetDetails}
            orcamentoNome={currentOrcamento.nome}
          />
        </div>
      </div>
    );
  }

  // Visualização Principal ('main')
  return (
    <div className="flex flex-col">
      {/* Cabeçalho da Visualização Principal */}
      <div className="bg-white border-b border-gray-200 p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{currentOrcamento.nome}</h2>
            <p className="text-sm text-gray-600 mt-1">Cliente: {currentOrcamento.clientName || 'Não definido'} • Cidade: {currentOrcamento.city || 'Não definida'}</p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveView('consolidation')}
              className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors font-medium"
            >
              <Eye className="h-4 w-4" />
              <span>Ver Materiais Consolidados</span>
            </button>
          </div>
        </div>
      </div>

      {/* Grid de 2 Colunas: Lista (esquerda) e Mapa (direita) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start px-4">
        {/* Coluna Esquerda - Lista de Postes (cresce dinamicamente) */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <PostListAccordion
            budgetDetails={budgetDetails}
            selectedPostDetail={selectedPostDetail}
            onPostSelect={setSelectedPostDetail}
            deletingPost={deletingPost}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            addingGroup={addingGroup}
            removingGroup={removingGroup}
            handleAddGrupo={handleAddGrupo}
            handleRemoveGrupo={handleRemoveGrupo}
            handleDeletePostFromDatabase={handleDeletePostFromDatabase}
            itemGroups={itemGroups}
            updateMaterialQuantityInPostGroup={updateMaterialQuantityInPostGroup}
            materiais={materiais}
            addLooseMaterialToPost={addLooseMaterialToPost}
            updateLooseMaterialQuantity={updateLooseMaterialQuantity}
            removeLooseMaterialFromPost={removeLooseMaterialFromPost}
            onExportByPostAndGroup={handleExportByPostAndGroup}
          />
        </div>

        {/* Coluna Direita - Canvas/Mapa com Sticky */}
        <div className="sticky top-0 bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden h-[calc(100vh-8rem)] max-h-[800px]">
          <CanvasVisual
            orcamento={currentOrcamento}
            budgetDetails={budgetDetails}
            selectedPoste={selectedPoste}
            selectedPostDetail={selectedPostDetail}
            onPosteClick={setSelectedPoste}
            onPostDetailClick={(post) => {
              setSelectedPostDetail(post);
              handleEditPost(post);
            }}
            onEditPost={handleEditPost}
            onAddPoste={addPoste}
            onUpdatePoste={updatePoste}
            onUpdatePostCoordinates={updatePostCoordinates}
            onUploadImage={() => fileInputRef.current?.click()}
            onDeleteImage={handleDeleteImage}
            onDeletePoste={handleDeletePoste}
            onRightClick={handleRightClick}
            onCanvasCtrlClick={handleCapturePastePoint}
            capturedPastePoints={capturedPastePoints}
            loadingUpload={loadingUpload}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            onChange={handleUploadImage}
            className="hidden"
            disabled={loadingUpload}
          />
        </div>
      </div>

      {/* Modal para Adicionar Poste */}
      <AddPostModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        coordinates={clickCoordinates}
        onSubmit={handleAddPost}
        onSubmitWithItems={handleAddPostWithItems}
      />

      {/* Modal para Editar Poste */}
      <EditPostModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setPostToEdit(null);
        }}
        post={postToEdit}
      />

      {/* Alert Dialog */}
      <AlertDialog {...alertDialog.dialogProps} />
    </div>
  );
}

// Componente QuantityEditor para edição inline de quantidade
interface QuantityEditorProps {
  postGroupId: string;
  materialId: string;
  currentQuantity: number;
  unit: string;
  onUpdateQuantity: (postGroupId: string, materialId: string, newQuantity: number) => Promise<void>;
}

function QuantityEditor({ postGroupId, materialId, currentQuantity, unit, onUpdateQuantity }: QuantityEditorProps) {
  const [localQuantity, setLocalQuantity] = useState<string | number>(currentQuantity);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  // Atualizar valor local quando prop mudar (apenas se não estiver editando)
  useEffect(() => {
    // Só atualizar se não estiver editando (campo não está vazio)
    // Se o campo estiver vazio, significa que o usuário está editando
    if (localQuantity !== '') {
      setLocalQuantity(currentQuantity);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- localQuantity intencionalmente omitido para evitar loop
  }, [currentQuantity]);

  // Debounce function
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  const handleQuantityChange = useCallback((newValue: number) => {
    // Validar valor antes de atualizar
    if (isNaN(newValue) || newValue < 0) {
      setLocalQuantity(currentQuantity);
      return;
    }

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
          // Note: Para QuantityEditor, manteremos o alert simples por ser um componente inline
          alert('Erro ao salvar quantidade. Tente novamente.');
        } finally {
          setIsSaving(false);
        }
      }, 800); // Debounce de 800ms
    }
  }, [currentQuantity, onUpdateQuantity, postGroupId, materialId]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    // Permitir campo vazio durante edição
    if (value === '') {
      setLocalQuantity('');
      // Limpar timer se houver
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      return;
    }
    
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= 0) {
      setLocalQuantity(numValue);
      // Limpar timer anterior
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      
      // Se a quantidade for diferente da atual, salvar após delay
      if (numValue !== currentQuantity) {
        debounceTimer.current = setTimeout(async () => {
          setIsSaving(true);
          try {
            await onUpdateQuantity(postGroupId, materialId, numValue);
            setShowSaved(true);
            setTimeout(() => setShowSaved(false), 1500);
          } catch (error) {
            console.error('Erro ao salvar quantidade:', error);
            setLocalQuantity(currentQuantity); // Reverter para valor original
            alert('Erro ao salvar quantidade. Tente novamente.');
          } finally {
            setIsSaving(false);
          }
        }, 800); // Debounce de 800ms
      }
    }
  };

  const handleBlur = () => {
    // Se o campo estiver vazio, restaurar valor original
    if (localQuantity === '') {
      setLocalQuantity(currentQuantity);
      return;
    }
    
    // Garantir que o valor seja válido no blur
    const numValue = typeof localQuantity === 'number' ? localQuantity : parseFloat(String(localQuantity));
    if (isNaN(numValue) || numValue < 0) {
      setLocalQuantity(currentQuantity);
    } else if (numValue !== currentQuantity) {
      // Se mudou, garantir que foi salvo
      handleQuantityChange(numValue);
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
        value={localQuantity === '' ? '' : localQuantity}
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

// Componente PostListAccordion para a nova estrutura hierárquica
interface PostListAccordionProps {
  budgetDetails: BudgetDetails | null;
  selectedPostDetail: BudgetPostDetail | null;
  onPostSelect: (post: BudgetPostDetail | null) => void;
  deletingPost: string | null;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  addingGroup: boolean;
  removingGroup: string | null;
  handleAddGrupo: (grupoId: string, postId: string, isSupabasePost: boolean) => Promise<void>;
  handleRemoveGrupo: (grupoId: string, isSupabaseGroup?: boolean) => Promise<void>;
  handleDeletePostFromDatabase: (postId: string, postName: string) => Promise<void>;
  itemGroups: GrupoItem[];
  updateMaterialQuantityInPostGroup: (postGroupId: string, materialId: string, newQuantity: number) => Promise<void>;
  materiais: Material[];
  addLooseMaterialToPost: (postId: string, materialId: string, quantity: number, price: number) => Promise<void>;
  updateLooseMaterialQuantity: (postMaterialId: string, newQuantity: number) => Promise<void>;
  removeLooseMaterialFromPost: (postMaterialId: string) => Promise<void>;
  onExportByPostAndGroup: () => void;
}

function PostListAccordion({ 
  budgetDetails, 
  selectedPostDetail,
  onPostSelect,
  deletingPost,
  searchTerm,
  setSearchTerm,
  addingGroup,
  removingGroup,
  handleAddGrupo,
  handleRemoveGrupo,
  handleDeletePostFromDatabase,
  itemGroups,
  updateMaterialQuantityInPostGroup,
  materiais,
  addLooseMaterialToPost,
  updateLooseMaterialQuantity,
  removeLooseMaterialFromPost,
  onExportByPostAndGroup
}: PostListAccordionProps) {
  const [isRendering, setIsRendering] = useState(false);
  const [postSearchTerm, setPostSearchTerm] = useState('');
  
  // ⚡ OTIMIZAÇÃO: Debounce na busca de postes para evitar renderizações excessivas
  const debouncedPostSearchTerm = useDebounce(postSearchTerm, 300);
  
  const postsToDisplay = useMemo(() => budgetDetails?.posts || [], [budgetDetails?.posts]);

  // Debounce para evitar renderizações conflitantes
  useEffect(() => {
    setIsRendering(true);
    const timer = setTimeout(() => {
      setIsRendering(false);
    }, 50);
    
    return () => clearTimeout(timer);
  }, [budgetDetails?.posts?.length]);
  
  // Estados locais para materiais avulsos
  const [materialSearchTerm, setMaterialSearchTerm] = useState('');
  const [addingLooseMaterial, setAddingLooseMaterial] = useState(false);
  const [removingLooseMaterial, setRemovingLooseMaterial] = useState<string | null>(null);
  
  // ⚡ OTIMIZAÇÃO: Filtrar e ordenar postes com useMemo e debounce
  const filteredPosts = useMemo(() => {
    let posts = postsToDisplay;
    
    // Filtrar pela busca
    if (debouncedPostSearchTerm) {
      const searchLower = debouncedPostSearchTerm.toLowerCase();
      posts = posts.filter((post: BudgetPostDetail) => {
        const postDisplayName = getPostDisplayName(post);
        return postDisplayName.toLowerCase().includes(searchLower) ||
          post.custom_name?.toLowerCase().includes(searchLower) ||
          post.name?.toLowerCase().includes(searchLower) ||
          post.post_types?.name?.toLowerCase().includes(searchLower);
      });
    }
    
    // Ordenar por contador
    return [...posts].sort((a: BudgetPostDetail, b: BudgetPostDetail) => {
      const counterA = a.counter || 0;
      const counterB = b.counter || 0;
      return counterA - counterB;
    });
  }, [postsToDisplay, debouncedPostSearchTerm]);

  // Garantir que o poste selecionado esteja sempre na lista para o Accordion expandir
  const postsToRender = useMemo(() => {
    if (!selectedPostDetail) return filteredPosts;
    const alreadyInList = filteredPosts.some((p: BudgetPostDetail) => p.id === selectedPostDetail.id);
    if (alreadyInList) return filteredPosts;
    return [...filteredPosts, selectedPostDetail];
  }, [filteredPosts, selectedPostDetail]);

  const selectedItemRef = useRef<HTMLDivElement>(null);

  // Rolar até o item selecionado quando expandir a partir do clique no mapa
  useEffect(() => {
    if (selectedPostDetail && selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedPostDetail?.id]);
  

  
  // ⚡ OTIMIZAÇÃO: Debounce nas buscas para evitar renderizações excessivas
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const debouncedMaterialSearchTerm = useDebounce(materialSearchTerm, 300);
  
  // Usar APENAS grupos do Supabase (itemGroups) filtrados por company_id
  // Remover fallback para dados locais (gruposItens) para garantir consistência
  const availableGroups = itemGroups; // Sempre usar apenas itemGroups do banco
  
  // ⚡ OTIMIZAÇÃO: Filtrar grupos com useMemo e debounce
  const gruposFiltrados = useMemo(() => 
    availableGroups.filter((g: GrupoItem) => {
      // itemGroups já vem filtrados pela empresa na função fetchItemGroups
      return g.nome.toLowerCase().includes(debouncedSearchTerm.toLowerCase());
    }),
    [availableGroups, debouncedSearchTerm]
  );
  
  // ⚡ OTIMIZAÇÃO: Filtrar materiais com useMemo e debounce
  const materiaisFiltrados = useMemo(() => 
    materiais.filter(material =>
      material.descricao.toLowerCase().includes(debouncedMaterialSearchTerm.toLowerCase()) ||
      material.codigo.toLowerCase().includes(debouncedMaterialSearchTerm.toLowerCase())
    ),
    [materiais, debouncedMaterialSearchTerm]
  );
  
  // Função para adicionar material avulso
  const handleAddLooseMaterial = async (postId: string, materialId: string) => {
    const material = materiais.find(m => m.id === materialId);
    if (!material) return;
    
    setAddingLooseMaterial(true);
    try {
      await addLooseMaterialToPost(postId, materialId, 1, material.precoUnit);
      setMaterialSearchTerm('');
    } catch {
      // Para funções dentro de sub-componentes, podemos manter alerts simples ou
      // passar um callback de erro para o componente pai
      alert('Erro ao adicionar material avulso. Tente novamente.');
    } finally {
      setAddingLooseMaterial(false);
    }
  };
  
  // Função para remover material avulso - como esta função está dentro do sub-componente,
  // vamos manter o alert simples por ora
  const handleRemoveLooseMaterial = async (postMaterialId: string) => {
    if (!window.confirm('Tem certeza que deseja remover este material avulso?')) {
      return;
    }
    
    setRemovingLooseMaterial(postMaterialId);
    try {
      await removeLooseMaterialFromPost(postMaterialId);
    } catch {
      alert('Erro ao remover material avulso. Tente novamente.');
    } finally {
      setRemovingLooseMaterial(null);
    }
  };

  return (
    <div>
      <div className="p-6 pb-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <Folder className="h-5 w-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">Lista de Postes</h3>
          </div>
          <div className="flex items-center space-x-2">
            {postsToDisplay.length > 0 && (
              <button
                onClick={onExportByPostAndGroup}
                className="flex items-center space-x-2 px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm"
                title="Exportar para Excel organizado por poste e grupo"
              >
                <FileSpreadsheet className="h-4 w-4" />
                <span>Exportar Excel</span>
              </button>
            )}
            <span className="text-sm font-medium text-gray-600 bg-blue-100 px-3 py-1 rounded-full">
              {filteredPosts.length} de {postsToDisplay.length} {postsToDisplay.length === 1 ? 'poste' : 'postes'}
            </span>
          </div>
        </div>
        
        {/* Campo de busca de postes */}
        {postsToDisplay.length > 0 && (
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Buscar postes por nome ou tipo..."
              value={postSearchTerm}
              onChange={(e) => setPostSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
            {postSearchTerm && (
              <button
                onClick={() => setPostSearchTerm('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {isRendering ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center space-x-2">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            <span className="text-sm text-gray-600">Atualizando lista...</span>
          </div>
        </div>
      ) : postsToDisplay.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-gray-500">
            <div className="text-center">
              <p>Nenhum poste foi adicionado ainda</p>
              <p className="text-sm mt-1">Adicione uma imagem de planta e clique com o botão direito nela para criar postes</p>
            </div>
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-gray-500">
            <div className="text-center">
              <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="font-medium">Nenhum poste encontrado</p>
              <p className="text-sm mt-1">Tente ajustar os termos de busca</p>
              <button
                onClick={() => setPostSearchTerm('')}
                className="mt-4 text-blue-600 hover:text-blue-700 font-medium text-sm"
              >
                Limpar busca
              </button>
            </div>
          </div>
        ) : (
          <div className="px-3 py-2 max-h-[calc(100vh-12rem)] overflow-y-auto">
            <Accordion
              type="single"
              collapsible={true}
              className="w-full space-y-2"
              value={selectedPostDetail?.id ?? ''}
              onValueChange={(value) => {
                if (!value) {
                  onPostSelect(null);
                  return;
                }
                const post = postsToDisplay.find((p: BudgetPostDetail) => p.id === value);
                if (post) onPostSelect(post);
              }}
            >
              {postsToRender.map((post: BudgetPostDetail) => {
                const postName = getPostDisplayName(post);
                const postType = post.post_types?.name;
                const postGroups = post.post_item_groups;
                const isSelected = selectedPostDetail?.id === post.id;
            
            return (
              <div key={post.id} ref={isSelected ? selectedItemRef : undefined}>
              <AccordionItem value={post.id} className="border-b-0">
                <AccordionTrigger className="hover:no-underline py-2 px-1">
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-2 pr-1">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <TowerControl className="h-5 w-5 shrink-0 text-blue-600" />
                      <div className="min-w-0 text-left">
                        <div className="font-medium leading-tight">{postName} - {postType || 'Tipo não definido'}</div>
                        <div className="text-sm text-gray-500">{postGroups.length} grupos de itens</div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-gray-400 whitespace-nowrap tabular-nums">
                        x:{post.x_coord}, y:{post.y_coord}
                      </span>
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePostFromDatabase(post.id, getPostDisplayName(post));
                        }}
                        className="text-red-600 hover:text-red-900 cursor-pointer shrink-0"
                        title="Excluir poste"
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDeletePostFromDatabase(post.id, getPostDisplayName(post));
                          }
                        }}
                      >
                        {deletingPost === post.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </div>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4 px-4">
                    {/* Seção para Adicionar Grupos */}
                    <div className="border-b pb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Adicionar Grupos de Itens
                        <span className="ml-2 text-xs text-blue-600">
                          (Dados do banco)
                        </span>
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
                        {debouncedSearchTerm && gruposFiltrados.length > 0 && !addingGroup && (
                          <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-md mt-1 max-h-40 overflow-y-auto z-10 shadow-lg">
                            {gruposFiltrados.map((grupo: GrupoItem) => (
                              <button
                                key={grupo.id}
                                onClick={() => handleAddGrupo(grupo.id, post.id, true)}
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

                    {/* Accordion aninhado para grupos */}
                    {postGroups.length > 0 ? (
                      <Accordion type="multiple" className="w-full">
                        {postGroups.map((group: PostItemGroupDetail) => (
                          <AccordionItem key={group.id} value={group.id}>
                            <AccordionTrigger className="hover:no-underline py-2">
                              <div className="flex items-center justify-between w-full pr-4">
                                <div className="flex items-center space-x-2">
                                  <Package className="h-4 w-4 text-green-600" />
                                  <span className="text-sm font-medium">{group.name} ({group.post_item_group_materials?.length || 0} itens)</span>
                                </div>
                                <div
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveGrupo(group.id, true);
                                  }}
                                  className="text-red-500 hover:text-red-700 transition-colors cursor-pointer disabled:opacity-50"
                                  title="Remover grupo"
                                  role="button"
                                  tabIndex={0}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      handleRemoveGrupo(group.id, true);
                                    }
                                  }}
                                >
                                  {removingGroup === group.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <X className="h-3 w-3" />
                                  )}
                                </div>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="pl-6 space-y-3 py-2">
                                {// Materiais do Supabase
                                  group.post_item_group_materials?.length > 0 ? (
                                    group.post_item_group_materials.map((material: PostItemGroupMaterial) => (
                                      <div key={material.material_id} className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                                        <div className="flex justify-between items-center">
                                          <div className="flex-1">
                                            <div className="text-sm font-medium text-gray-900">{material.materials.name}</div>
                                            <div className="text-xs text-gray-500">{material.materials.code}</div>
                                          </div>
                                          <QuantityEditor
                                            postGroupId={group.id}
                                            materialId={material.material_id}
                                            currentQuantity={material.quantity}
                                            unit={material.materials.unit}
                                            onUpdateQuantity={updateMaterialQuantityInPostGroup}
                                          />
                                        </div>
                                        <div className="text-xs text-gray-600 mt-2 font-medium">
                                          R$ {material.price_at_addition.toFixed(2)} x {material.quantity} = R$ {(material.price_at_addition * material.quantity).toFixed(2)}
                                        </div>
                                      </div>
                                    ))
                                  ) : (
                                    <p className="text-sm text-gray-500">Nenhum material neste grupo</p>
                                  )
                                }
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    ) : (
                      <div className="text-sm text-gray-500 text-center py-4">
                        Nenhum grupo adicionado a este poste
                      </div>
                    )}
                    
                    {/* Seção de Materiais Avulsos */}
                    <div className="mt-6 border-t pt-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
                        <Package className="h-4 w-4 mr-2 text-orange-600" />
                        Materiais Avulsos ({post.post_materials?.length || 0} itens)
                      </h4>
                      
                      {/* Seção para Adicionar Material Avulso */}
                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Adicionar Material Avulso
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            value={materialSearchTerm}
                            onChange={(e) => setMaterialSearchTerm(e.target.value)}
                            placeholder="Buscar materiais por nome ou código..."
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            disabled={addingLooseMaterial}
                          />
                          {addingLooseMaterial && (
                            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                            </div>
                          )}
                          {debouncedMaterialSearchTerm && materiaisFiltrados.length > 0 && !addingLooseMaterial && (
                            <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-md mt-1 max-h-40 overflow-y-auto z-20 shadow-lg">
                              {materiaisFiltrados.slice(0, 10).map((material) => (
                                <button
                                  key={material.id}
                                  onClick={() => handleAddLooseMaterial(post.id, material.id)}
                                  className="w-full text-left px-3 py-2 hover:bg-gray-100 transition-colors border-b last:border-b-0"
                                  disabled={addingLooseMaterial}
                                >
                                  <div className="font-medium text-sm">{material.descricao}</div>
                                  <div className="text-xs text-gray-500">
                                    {material.codigo} • R$ {material.precoUnit.toFixed(2)} / {material.unidade}
                                  </div>
                                </button>
                              ))}
                              {materiaisFiltrados.length > 10 && (
                                <div className="px-3 py-2 text-xs text-gray-500 text-center bg-gray-50">
                                  ... e mais {materiaisFiltrados.length - 10} materiais
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Lista de Materiais Avulsos */}
                      {post.post_materials && post.post_materials.length > 0 ? (
                        <div className="space-y-3">
                          {post.post_materials.map((material: PostMaterial) => (
                            <div key={material.id} className="bg-orange-50 p-3 rounded-lg border border-orange-200">
                              <div className="flex justify-between items-center">
                                <div className="flex-1">
                                  <div className="text-sm font-medium text-gray-900">{material.materials.name}</div>
                                  <div className="text-xs text-gray-500">{material.materials.code}</div>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <QuantityEditor
                                    postGroupId={material.id}
                                    materialId={material.material_id}
                                    currentQuantity={material.quantity}
                                    unit={material.materials.unit}
                                    onUpdateQuantity={async (postMaterialId, _, newQuantity) => {
                                      await updateLooseMaterialQuantity(postMaterialId, newQuantity);
                                    }}
                                  />
                                  <button
                                    onClick={() => handleRemoveLooseMaterial(material.id)}
                                    className="text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
                                    disabled={removingLooseMaterial === material.id}
                                    title="Remover material avulso"
                                  >
                                    {removingLooseMaterial === material.id ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <X className="h-3 w-3" />
                                    )}
                                  </button>
                                </div>
                              </div>
                              <div className="text-xs text-gray-600 mt-2 font-medium">
                                R$ {material.price_at_addition.toFixed(2)} x {material.quantity} = R$ {(material.price_at_addition * material.quantity).toFixed(2)}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-500 text-center py-4">
                          Nenhum material avulso adicionado a este poste
                        </div>
                      )}
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
              </div>
              );
              })}
            </Accordion>
          </div>
        )
      }
      
      {/* Rodapé da lista com informações úteis */}
      {postsToDisplay.length > 0 && (
        <div className="border-t border-gray-200 bg-gray-50 p-3">
          <div className="text-xs text-gray-500 text-center">
            Total: {postsToDisplay.length} {postsToDisplay.length === 1 ? 'poste cadastrado' : 'postes cadastrados'}
          </div>
        </div>
      )}
    </div>
  );
}
