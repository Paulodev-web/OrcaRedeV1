"use client";
import { useState, useEffect, useMemo, useTransition } from 'react';
import { Plus, Calendar, Building2, Edit, Trash2, Copy, CheckCircle, Clock, BarChart3, TrendingUp, Search, Filter, X, Folder, FolderOpen, MoreVertical, FolderEdit, FileText, ArrowLeft, Home, ChevronRight, Move, Star } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { CriarOrcamentoModal } from '@/components/modals/CriarOrcamentoModal';
import { FolderModal } from '@/components/modals/FolderModal';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAlertDialog } from '@/hooks/useAlertDialog';
import { Orcamento, BudgetFolder } from '@/types';
import { deleteBudgetAction, duplicateBudgetAction, finalizeBudgetAction, updateBudgetAction } from '@/actions/budgets';
import { addFolderAction, updateFolderAction, deleteFolderAction, moveBudgetToFolderAction, moveFolderToFolderAction } from '@/actions/folders';

const STATUS_FILTER_ALL = 'all';
const CONCESSIONARIA_FILTER_ALL = 'all';

export function Dashboard() {
  const { 
    budgets, 
    folders,
    loadingBudgets, 
    loadingFolders,
    concessionarias, 
    currentFolderId,  
    setCurrentView, 
    setCurrentOrcamento, 
    fetchBudgets,
    fetchFolders,
    navigateToFolder,
    getFolderPath,
    isFolderDescendant,
  } = useApp();

  const [isPending, startTransition] = useTransition();
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folderModalMode, setFolderModalMode] = useState<'create' | 'edit'>('create');
  const [editingBudget, setEditingBudget] = useState<Orcamento | null>(null);
  const [editingFolder, setEditingFolder] = useState<{ id: string; name: string; color?: string } | null>(null);
  const [isFinalizing, setIsFinalizing] = useState<string | null>(null);
  const [isDuplicating, setIsDuplicating] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Em Andamento' | 'Finalizado'>('all');
  const [concessionariaFilter, setConcessionariaFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [draggedBudget, setDraggedBudget] = useState<Orcamento | null>(null);
  const [draggedFolder, setDraggedFolder] = useState<string | null>(null);
  const [dropTargetFolder, setDropTargetFolder] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [openFolderMenu, setOpenFolderMenu] = useState<string | null>(null);
  const [openBudgetMenu, setOpenBudgetMenu] = useState<string | null>(null);
  const [moveMenuFor, setMoveMenuFor] = useState<{ type: 'budget' | 'folder'; id: string } | null>(null);
  const [templatesOnly, setTemplatesOnly] = useState(false);
  const alertDialog = useAlertDialog();

  // Buscar orçamentos e pastas na montagem do componente
  useEffect(() => {
    fetchBudgets();
    fetchFolders();
  }, [fetchBudgets, fetchFolders]);


  const getConcessionariaNome = (concessionariaId: string) => {
    const concessionaria = concessionarias.find(c => c.id === concessionariaId);
    return concessionaria?.sigla || 'N/A';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const handleEditBudget = (budget: Orcamento) => {
    setEditingBudget(budget);
    setShowBudgetModal(true);
  };

  const handleDeleteBudget = (budget: Orcamento) => {
    alertDialog.showConfirm(
      'Excluir Orçamento',
      `Tem certeza que deseja excluir o orçamento "${budget.nome}"? Esta ação não pode ser desfeita.`,
      () => {
        startTransition(async () => {
          const result = await deleteBudgetAction(budget.id);
          if (result.success) {
            fetchBudgets();
            alertDialog.showSuccess('Orçamento Excluído', 'O orçamento foi excluído com sucesso.');
          } else {
            alertDialog.showError('Erro ao Excluir', result.error || 'Não foi possível excluir o orçamento. Tente novamente.');
          }
        });
      },
      {
        type: 'destructive',
        confirmText: 'Excluir',
        cancelText: 'Cancelar'
      }
    );
  };

  const handleFinalize = (budget: Orcamento) => {
    alertDialog.showConfirm(
      'Finalizar Orçamento',
      `Tem certeza que deseja finalizar o orçamento "${budget.nome}"? Esta ação não pode ser desfeita.`,
      () => {
        setIsFinalizing(budget.id);
        startTransition(async () => {
          const result = await finalizeBudgetAction(budget.id);
          if (result.success) {
            fetchBudgets();
            alertDialog.showSuccess('Orçamento Finalizado', `O orçamento "${budget.nome}" foi finalizado com sucesso.`);
          } else {
            alertDialog.showError('Erro ao Finalizar', result.error || 'Não foi possível finalizar o orçamento. Tente novamente.');
          }
          setIsFinalizing(null);
        });
      },
      {
        confirmText: 'Finalizar',
        cancelText: 'Cancelar'
      }
    );
  };

  const handleDuplicateBudget = (budget: Orcamento) => {
    alertDialog.showConfirm(
      'Duplicar Orçamento',
      `Deseja duplicar o orçamento "${budget.nome}"? Uma cópia completa será criada incluindo todos os postes, grupos e materiais.`,
      () => {
        setIsDuplicating(budget.id);
        startTransition(async () => {
          const result = await duplicateBudgetAction(budget.id);
          if (result.success) {
            fetchBudgets();
            alertDialog.showSuccess('Orçamento Duplicado', `O orçamento "${budget.nome}" foi duplicado com sucesso.`);
          } else {
            alertDialog.showError('Erro ao Duplicar', result.error || 'Não foi possível duplicar o orçamento. Tente novamente.');
          }
          setIsDuplicating(null);
        });
      },
      {
        confirmText: 'Duplicar',
        cancelText: 'Cancelar'
      }
    );
  };

  const handleCloseBudgetModal = () => {
    setShowBudgetModal(false);
    setEditingBudget(null);
  };

  const handleToggleTemplate = (budget: Orcamento) => {
    setOpenBudgetMenu(null);
    startTransition(async () => {
      const result = await updateBudgetAction(budget.id, { is_template: !budget.isTemplate });
      if (result.success) {
        fetchBudgets();
        alertDialog.showSuccess(
          budget.isTemplate ? 'Modelo Removido' : 'Marcado como Modelo',
          budget.isTemplate
            ? `"${budget.nome}" não é mais um modelo.`
            : `"${budget.nome}" agora pode ser usado como modelo ao criar novos orçamentos.`
        );
      } else {
        alertDialog.showError('Erro', result.error || 'Não foi possível atualizar o orçamento.');
      }
    });
  };

  // Lista de destinos válidos para mover um item pelo menu (alternativa ao drag-and-drop)
  const getValidFolderTargets = (itemType: 'budget' | 'folder', itemId: string, currentParentId: string | null) => {
    const targets: { id: string | null; name: string; color?: string }[] = [{ id: null, name: 'Raiz' }];
    folders.forEach((folder) => {
      if (itemType === 'folder' && (folder.id === itemId || isFolderDescendant(folder.id, itemId))) {
        return;
      }
      targets.push({ id: folder.id, name: folder.name, color: folder.color });
    });
    return targets.filter((target) => target.id !== currentParentId);
  };

  const handleMoveViaMenu = (itemType: 'budget' | 'folder', itemId: string, itemName: string, targetFolderId: string | null) => {
    setOpenBudgetMenu(null);
    setOpenFolderMenu(null);
    setMoveMenuFor(null);
    startTransition(async () => {
      const result = itemType === 'budget'
        ? await moveBudgetToFolderAction(itemId, targetFolderId)
        : await moveFolderToFolderAction(itemId, targetFolderId);

      if (result.success) {
        if (itemType === 'budget') fetchBudgets();
        else fetchFolders();
        const destino = targetFolderId ? folders.find((f) => f.id === targetFolderId)?.name || 'pasta' : 'raiz';
        alertDialog.showSuccess('Item Movido', `"${itemName}" foi movido para ${destino}.`);
      } else {
        alertDialog.showError('Erro ao Mover', result.error || 'Não foi possível mover o item.');
      }
    });
  };

  // Preview leve de drag (substitui o snapshot padrão feio do navegador)
  const setCustomDragPreview = (e: React.DragEvent, label: string) => {
    const preview = document.createElement('div');
    preview.textContent = label;
    preview.style.cssText =
      'position:absolute; top:-1000px; left:-1000px; padding:6px 12px; background:#111827; color:#fff; border-radius:8px; font-size:12px; font-weight:600; box-shadow:0 4px 12px rgba(0,0,0,0.25); white-space:nowrap; pointer-events:none;';
    document.body.appendChild(preview);
    e.dataTransfer.setDragImage(preview, 12, 16);
    requestAnimationFrame(() => {
      if (preview.parentNode) preview.parentNode.removeChild(preview);
    });
  };

  // Funções para pastas
  const handleCreateFolder = () => {
    setFolderModalMode('create');
    setEditingFolder(null);
    setShowFolderModal(true);
  };

  const handleOpenFolder = (folderId: string) => {
    navigateToFolder(folderId);
  };

  const handleGoBack = () => {
    const path = getFolderPath(currentFolderId);
    if (path.length > 1) {
      // Voltar para a pasta pai
      navigateToFolder(path[path.length - 2].id);
    } else {
      // Voltar para a raiz
      navigateToFolder(null);
    }
  };

  const handleEditFolder = (folderId: string, folderName: string, folderColor?: string) => {
    setFolderModalMode('edit');
    setEditingFolder({ id: folderId, name: folderName, color: folderColor });
    setShowFolderModal(true);
    setOpenFolderMenu(null);
  };

  const handleDeleteFolder = (folderId: string, folderName: string) => {
    setOpenFolderMenu(null);
    alertDialog.showConfirm(
      'Excluir Pasta',
      `Tem certeza que deseja excluir a pasta "${folderName}"? Os orçamentos dentro dela serão movidos para "Sem pasta".`,
      () => {
        startTransition(async () => {
          const result = await deleteFolderAction(folderId);
          if (result.success) {
            fetchBudgets();
            fetchFolders();
            alertDialog.showSuccess('Pasta Excluída', 'A pasta foi excluída com sucesso.');
          } else {
            alertDialog.showError('Erro ao Excluir', result.error || 'Não foi possível excluir a pasta. Tente novamente.');
          }
        });
      },
      {
        type: 'destructive',
        confirmText: 'Excluir',
        cancelText: 'Cancelar'
      }
    );
  };

  const handleSaveFolder = async (name: string, color?: string, parentId?: string | null) => {
    let result;
    if (folderModalMode === 'create') {
      result = await addFolderAction(name, color, parentId);
    } else if (editingFolder) {
      result = await updateFolderAction(editingFolder.id, name, color);
    } else {
      return;
    }
    if (result.success) {
      fetchFolders();
    } else {
      alertDialog.showError('Erro ao Salvar Pasta', result.error || 'Não foi possível salvar a pasta.');
    }
  };

  // Limpar todos os filtros
  const handleClearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setConcessionariaFilter('all');
    setTemplatesOnly(false);
  };

  // Filtrar orçamentos baseado nos critérios de busca
  const filteredBudgets = useMemo(() => {
    return budgets.filter((budget) => {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = searchTerm === '' || 
        budget.nome.toLowerCase().includes(searchLower) ||
        budget.clientName?.toLowerCase().includes(searchLower) ||
        budget.city?.toLowerCase().includes(searchLower);

      const matchesStatus = statusFilter === 'all' || budget.status === statusFilter;
      const matchesConcessionaria = concessionariaFilter === 'all' ||
        budget.concessionariaId === concessionariaFilter ||
        budget.company_id === concessionariaFilter;
      const matchesTemplate = !templatesOnly || budget.isTemplate === true;

      return matchesSearch && matchesStatus && matchesConcessionaria && matchesTemplate;
    });
  }, [budgets, searchTerm, statusFilter, concessionariaFilter, templatesOnly]);

  // Filtrar pastas e orçamentos do nível atual
  const currentLevelFolders = useMemo(() => {
    return folders.filter(folder => folder.parentId === currentFolderId);
  }, [folders, currentFolderId]);

  const currentLevelBudgets = useMemo(() => {
    return filteredBudgets.filter(budget => budget.folderId === currentFolderId);
  }, [filteredBudgets, currentFolderId]);

  // Organizar orçamentos por pasta (mantido para drag & drop)
  const budgetsByFolder = useMemo(() => {
    const organized: Record<string, Orcamento[]> = {
      'no-folder': [],
    };

    folders.forEach(folder => {
      organized[folder.id] = [];
    });

    filteredBudgets.forEach(budget => {
      if (budget.folderId && organized[budget.folderId]) {
        organized[budget.folderId].push(budget);
      } else {
        organized['no-folder'].push(budget);
      }
    });

    return organized;
  }, [filteredBudgets, folders]);

  // Obter caminho de navegação (breadcrumb)
  const folderPath = useMemo(() => {
    return getFolderPath(currentFolderId);
  }, [currentFolderId, getFolderPath]);

  // Calcular estatísticas dos orçamentos filtrados
  const getBudgetStats = () => {
    const total = filteredBudgets.length;
    const finalizados = filteredBudgets.filter(b => b.status === 'Finalizado').length;
    const emAndamento = filteredBudgets.filter(b => b.status === 'Em Andamento').length;
    const percentualFinalizacao = total > 0 ? Math.round((finalizados / total) * 100) : 0;

    return {
      total,
      finalizados,
      emAndamento,
      percentualFinalizacao
    };
  };

  const stats = getBudgetStats();
  const hasActiveFilters = searchTerm !== '' || statusFilter !== 'all' || concessionariaFilter !== 'all' || templatesOnly;

  // Drag and Drop handlers - SIMPLIFICADO
  const handleBudgetDragStart = (e: React.DragEvent, budget: Orcamento) => {
    e.stopPropagation();
    setDraggedBudget(budget);
    setCustomDragPreview(e, budget.nome);
  };

  const handleBudgetDragEnd = () => {
    setDraggedBudget(null);
    setDropTargetFolder(null);
    setIsDraggingOver(false);
  };

  const handleFolderDragStart = (e: React.DragEvent, folderId: string) => {
    e.stopPropagation();
    setDraggedFolder(folderId);
    const folder = folders.find((f) => f.id === folderId);
    setCustomDragPreview(e, folder?.name || 'Pasta');
  };

  const handleFolderDragEnd = () => {
    setDraggedFolder(null);
    setDropTargetFolder(null);
    setIsDraggingOver(false);
  };

  // Verificar se o drop é válido
  const isValidDropTarget = (targetFolderId: string | null): boolean => {
    if (draggedFolder) {
      // Não pode soltar pasta nela mesma
      if (draggedFolder === targetFolderId) return false;
      
      // Não pode soltar pasta dentro de suas subpastas
      if (targetFolderId && isFolderDescendant(targetFolderId, draggedFolder)) return false;
      
      // Verificar se já está na mesma pasta
      const currentFolder = folders.find(f => f.id === draggedFolder);
      if (currentFolder?.parentId === targetFolderId) return false;
    }
    
    if (draggedBudget) {
      // Verificar se orçamento já está na pasta
      if (draggedBudget.folderId === targetFolderId) return false;
    }
    
    return true;
  };

  const handleDragOver = (e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!isValidDropTarget(targetFolderId)) {
      setDropTargetFolder(null);
      setIsDraggingOver(false);
      return;
    }
    
    setDropTargetFolder(targetFolderId);
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Só limpar se realmente saiu do elemento (não foi para um filho)
    const relatedTarget = e.relatedTarget as Node;
    if (relatedTarget && e.currentTarget instanceof Node && e.currentTarget.contains(relatedTarget)) {
      return;
    }
    
    setIsDraggingOver(false);
    // Pequeno delay para evitar flickering
    setTimeout(() => {
      if (!isDraggingOver) {
        setDropTargetFolder(null);
      }
    }, 50);
  };

  const handleDrop = (e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!isValidDropTarget(targetFolderId)) {
      setDraggedBudget(null);
      setDraggedFolder(null);
      setDropTargetFolder(null);
      setIsDraggingOver(false);
      return;
    }

    const capturedBudget = draggedBudget;
    const capturedFolder = draggedFolder;
    setDraggedBudget(null);
    setDraggedFolder(null);
    setDropTargetFolder(null);
    setIsDraggingOver(false);

    startTransition(async () => {
      if (capturedBudget) {
        const result = await moveBudgetToFolderAction(capturedBudget.id, targetFolderId);
        if (result.success) {
          fetchBudgets();
          const destino = targetFolderId
            ? folders.find(f => f.id === targetFolderId)?.name || 'pasta'
            : 'raiz';
          alertDialog.showSuccess('Orçamento Movido', `"${capturedBudget.nome}" foi movido para ${destino}.`);
        } else {
          alertDialog.showError('Erro ao Mover', result.error || 'Não foi possível mover o orçamento.');
        }
      }

      if (capturedFolder) {
        const result = await moveFolderToFolderAction(capturedFolder, targetFolderId);
        if (result.success) {
          fetchFolders();
          const folderName = folders.find(f => f.id === capturedFolder)?.name || 'pasta';
          const destino = targetFolderId
            ? folders.find(f => f.id === targetFolderId)?.name || 'pasta'
            : 'raiz';
          alertDialog.showSuccess('Pasta Movida', `"${folderName}" foi movida para ${destino}.`);
        } else {
          alertDialog.showError('Erro ao Mover', result.error || 'Não foi possível mover a pasta.');
        }
      }
    });
  };

  const handleRemoveFromFolder = (itemId: string, itemType: 'budget' | 'folder', itemName: string) => {
    setOpenBudgetMenu(null);
    setOpenFolderMenu(null);
    
    alertDialog.showConfirm(
      'Remover da Pasta',
      `Deseja mover "${itemName}" para a raiz (remover da pasta atual)?`,
      () => {
        startTransition(async () => {
          let result;
          if (itemType === 'budget') {
            result = await moveBudgetToFolderAction(itemId, null);
            if (result.success) fetchBudgets();
          } else {
            result = await moveFolderToFolderAction(itemId, null);
            if (result.success) fetchFolders();
          }
          if (result.success) {
            alertDialog.showSuccess('Item Movido', `"${itemName}" foi movido para a raiz.`);
          } else {
            alertDialog.showError('Erro ao Mover', result.error || 'Não foi possível mover o item.');
          }
        });
      },
      {
        confirmText: 'Mover para Raiz',
        cancelText: 'Cancelar'
      }
    );
  };

  // Componente de Card de Orçamento - Design Melhorado
  const BudgetCard = ({ budget }: { budget: Orcamento }) => {
    const isDragging = draggedBudget?.id === budget.id;
    const [isClick, setIsClick] = useState(true);
    const isMoveMenuOpen = moveMenuFor?.type === 'budget' && moveMenuFor.id === budget.id;
    const moveTargets = isMoveMenuOpen ? getValidFolderTargets('budget', budget.id, budget.folderId ?? null) : [];

    return (
      <Card
        state={isDragging ? 'dragging' : 'default'}
        className={`group cursor-grab hover:cursor-grab active:cursor-grabbing rounded-xl hover:-translate-y-0.5 hover:shadow-lg ${openBudgetMenu === budget.id ? 'z-40' : ''}`}
        draggable={true}
        onMouseDown={(e) => {
          // Prevenir seleção de texto
          if (e.button === 0) { // Botão esquerdo
            setIsClick(true);
          }
        }}
        onDragStart={(e) => {
          setIsClick(false);
          handleBudgetDragStart(e, budget);
        }}
        onDragEnd={handleBudgetDragEnd}
        onClick={() => {
          // Só abre se for click (não foi drag)
          if (isClick && !isDragging) {
            setCurrentOrcamento(budget);
            setCurrentView('orcamento');
          }
          setIsClick(true);
        }}
        style={{ userSelect: 'none' }}
      >
      {/* Indicador de status */}
      <div
        className={`absolute left-0 top-4 bottom-4 w-1 rounded-full ${
          budget.status === 'Finalizado' ? 'bg-green-400' : 'bg-teal-400'
        }`}
      />
      <div className="p-4 pl-5">
        {/* Cabeçalho com Status */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0 pr-3">
            <div className="flex items-center gap-1.5 mb-1">
              <h3 className="text-base font-semibold text-gray-900 truncate group-hover:text-[#1D3140] transition-colors">
                {budget.nome}
              </h3>
              {budget.isTemplate && (
                <Star className="h-3.5 w-3.5 text-purple-500 shrink-0" fill="currentColor" />
              )}
            </div>
            {budget.clientName && (
              <p className="text-sm text-gray-600 truncate">
                {budget.clientName}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {budget.status === 'Finalizado' ? (
              <Badge tone="green">
                <CheckCircle className="h-3 w-3 mr-1" />
                Finalizado
              </Badge>
            ) : (
              <Badge tone="teal">
                <Clock className="h-3 w-3 mr-1" />
                Em Andamento
              </Badge>
            )}
            {budget.isTemplate && <Badge tone="purple">Modelo</Badge>}
          </div>
        </div>

        {/* Informações */}
        <div className="flex items-center justify-between text-sm text-gray-600 mb-3 pb-3 border-b border-gray-100">
          <div className="flex items-center min-w-0">
            <Building2 className="h-3.5 w-3.5 mr-1.5 shrink-0 text-gray-400" />
            <span className="truncate">{getConcessionariaNome(budget.concessionariaId)}</span>
          </div>
          <div className="flex items-center shrink-0 pl-2">
            <Calendar className="h-3.5 w-3.5 mr-1.5 text-gray-400" />
            <span>{formatDate(budget.dataModificacao)}</span>
          </div>
        </div>

        {/* Ações */}
        <div className="flex items-center justify-end space-x-0.5 relative opacity-80 group-hover:opacity-100 transition-opacity">
          {budget.status !== 'Finalizado' && (
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                handleEditBudget(budget);
              }}
              title="Editar"
            >
              <Edit className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              handleDuplicateBudget(budget);
            }}
            disabled={isDuplicating === budget.id}
            title="Duplicar"
          >
            <Copy className="h-4 w-4" />
          </Button>

          {/* Botão de menu com mais opções */}
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              setMoveMenuFor(null);
              setOpenBudgetMenu(openBudgetMenu === budget.id ? null : budget.id);
            }}
            title="Mais opções"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>

          {/* Dropdown Menu */}
          {openBudgetMenu === budget.id && (
            <>
              <div
                className="fixed inset-0 z-20"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenBudgetMenu(null);
                  setMoveMenuFor(null);
                }}
              ></div>

              <div className="absolute right-0 top-10 w-60 bg-white rounded-xl shadow-xl ring-1 ring-black/5 border border-gray-100 z-30 overflow-hidden py-1.5 animate-in fade-in-0 zoom-in-95 duration-100">
                {budget.status !== 'Finalizado' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleFinalize(budget);
                      setOpenBudgetMenu(null);
                    }}
                    disabled={isFinalizing === budget.id}
                    className="w-[calc(100%-8px)] mx-1 flex items-center space-x-2.5 px-3 py-2 text-left text-sm text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  >
                    <CheckCircle className="h-4 w-4 text-gray-400" />
                    <span>{isFinalizing === budget.id ? 'Finalizando...' : 'Finalizar Orçamento'}</span>
                  </button>
                )}

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleTemplate(budget);
                  }}
                  className="w-[calc(100%-8px)] mx-1 flex items-center space-x-2.5 px-3 py-2 text-left text-sm text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  <Star className="h-4 w-4 text-gray-400" />
                  <span>{budget.isTemplate ? 'Desmarcar Modelo' : 'Marcar como Modelo'}</span>
                </button>

                <div className="my-1 border-t border-gray-100"></div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMoveMenuFor(isMoveMenuOpen ? null : { type: 'budget', id: budget.id });
                  }}
                  className="w-[calc(100%-8px)] mx-1 flex items-center space-x-2.5 px-3 py-2 text-left text-sm text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  <Move className="h-4 w-4 text-gray-400" />
                  <span>Mover para pasta...</span>
                </button>
                {isMoveMenuOpen && (
                  <div className="max-h-40 overflow-y-auto mx-1 mb-1 rounded-lg bg-gray-50">
                    {moveTargets.map((target) => (
                      <button
                        key={String(target.id)}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveViaMenu('budget', budget.id, budget.nome, target.id);
                        }}
                        className="w-full flex items-center space-x-2 px-3 py-1.5 text-left text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                      >
                        {target.id === null ? (
                          <Home className="h-3.5 w-3.5" />
                        ) : (
                          <Folder className="h-3.5 w-3.5" style={{ color: target.color || '#6B7280' }} />
                        )}
                        <span className="truncate">{target.name}</span>
                      </button>
                    ))}
                  </div>
                )}

                {budget.folderId && (
                  <>
                    <div className="my-1 border-t border-gray-100"></div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveFromFolder(budget.id, 'budget', budget.nome);
                      }}
                      className="w-[calc(100%-8px)] mx-1 flex items-center space-x-2.5 px-3 py-2 text-left text-sm text-[#1D3140] rounded-lg hover:bg-[#64ABDE]/10"
                    >
                      <FolderOpen className="h-4 w-4" />
                      <span>Mover para Raiz</span>
                    </button>
                  </>
                )}

                <div className="my-1 border-t border-gray-100"></div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteBudget(budget);
                    setOpenBudgetMenu(null);
                  }}
                  className="w-[calc(100%-8px)] mx-1 flex items-center space-x-2.5 px-3 py-2 text-left text-sm text-red-600 rounded-lg hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Excluir</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Indicador visual de drag */}
      {isDragging && (
        <div className="absolute inset-0 bg-gray-900/10 rounded-xl pointer-events-none flex items-center justify-center">
          <div className="bg-gray-900 text-white px-3 py-1.5 rounded-md text-xs font-medium shadow-lg">
            Arrastando...
          </div>
        </div>
      )}
    </Card>
    );
  };

  // Componente de Pasta - Design Melhorado
  const FolderCard = ({ folderId, folderName, folderColor }: { folderId: string; folderName: string; folderColor?: string }) => {
    const folder = folders.find(f => f.id === folderId);
    const subfolders = folders.filter(f => f.parentId === folderId);
    const budgetsInFolder = budgetsByFolder[folderId] || [];
    const totalItems = subfolders.length + budgetsInFolder.length;
    const isDropTarget = dropTargetFolder === folderId && isDraggingOver;
    const isDragging = draggedFolder === folderId;
    const isValidTarget = isValidDropTarget(folderId);
    const [isClick, setIsClick] = useState(true);
    const isMoveMenuOpen = moveMenuFor?.type === 'folder' && moveMenuFor.id === folderId;
    const moveTargets = isMoveMenuOpen ? getValidFolderTargets('folder', folderId, folder?.parentId ?? null) : [];

    const cardState = isDragging
      ? 'dragging'
      : isDropTarget && isValidTarget
      ? 'drop-valid'
      : isDropTarget && !isValidTarget
      ? 'drop-invalid'
      : 'default';

    return (
      <Card
        state={cardState}
        className={`rounded-xl ${cardState === 'drop-invalid' ? 'cursor-not-allowed' : 'cursor-grab hover:cursor-grab hover:-translate-y-0.5 hover:shadow-lg'} ${openFolderMenu === folderId ? 'z-40' : ''}`}
        draggable={true}
        onMouseDown={(e) => {
          // Prevenir seleção de texto
          if (e.button === 0) { // Botão esquerdo
            setIsClick(true);
          }
        }}
        onDragStart={(e) => {
          setIsClick(false);
          handleFolderDragStart(e, folderId);
        }}
        onDragEnd={handleFolderDragEnd}
        onDragOver={(e) => handleDragOver(e, folderId)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, folderId)}
        onClick={() => {
          // Só abre se for click (não foi drag)
          if (isClick && !isDragging) {
            handleOpenFolder(folderId);
          }
          setIsClick(true);
        }}
        style={{ userSelect: 'none' }}
      >
        {/* Cabeçalho da Pasta */}
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center space-x-3 flex-1 min-w-0 pointer-events-none">
            <div
              className="p-2.5 rounded-lg shrink-0"
              style={{ backgroundColor: `${folderColor || '#6B7280'}1A` }}
            >
              <Folder
                className="h-5 w-5"
                style={{ color: folderColor || '#6B7280' }}
              />
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-gray-900 truncate">
                {folderName}
              </h3>
              <p className="text-sm text-gray-500">
                {totalItems} {totalItems === 1 ? 'item' : 'itens'}
                {subfolders.length > 0 && ` (${subfolders.length} ${subfolders.length === 1 ? 'pasta' : 'pastas'})`}
              </p>
            </div>
          </div>

          {/* Menu de Ações - Atualizado com opção de mover */}
          <div className="flex items-center space-x-2 relative pointer-events-auto shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMoveMenuFor(null);
                setOpenFolderMenu(openFolderMenu === folderId ? null : folderId);
              }}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#64ABDE]"
            >
              <MoreVertical className="h-4 w-4" />
            </button>

            {/* Dropdown Menu */}
            {openFolderMenu === folderId && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenFolderMenu(null);
                    setMoveMenuFor(null);
                  }}
                ></div>

                <div className="absolute right-0 top-10 w-60 bg-white rounded-xl shadow-xl ring-1 ring-black/5 border border-gray-100 z-30 overflow-hidden py-1.5 animate-in fade-in-0 zoom-in-95 duration-100">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenFolder(folderId);
                      setOpenFolderMenu(null);
                    }}
                    className="w-[calc(100%-8px)] mx-1 flex items-center space-x-2.5 px-3 py-2 text-left text-sm text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    <FolderOpen className="h-4 w-4 text-gray-400" />
                    <span>Abrir Pasta</span>
                  </button>
                  <div className="my-1 border-t border-gray-100"></div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditFolder(folderId, folderName, folderColor);
                    }}
                    className="w-[calc(100%-8px)] mx-1 flex items-center space-x-2.5 px-3 py-2 text-left text-sm text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    <FolderEdit className="h-4 w-4 text-gray-400" />
                    <span>Renomear</span>
                  </button>

                  <div className="my-1 border-t border-gray-100"></div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMoveMenuFor(isMoveMenuOpen ? null : { type: 'folder', id: folderId });
                    }}
                    className="w-[calc(100%-8px)] mx-1 flex items-center space-x-2.5 px-3 py-2 text-left text-sm text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    <Move className="h-4 w-4 text-gray-400" />
                    <span>Mover para pasta...</span>
                  </button>
                  {isMoveMenuOpen && (
                    <div className="max-h-40 overflow-y-auto mx-1 mb-1 rounded-lg bg-gray-50">
                      {moveTargets.map((target) => (
                        <button
                          key={String(target.id)}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveViaMenu('folder', folderId, folderName, target.id);
                          }}
                          className="w-full flex items-center space-x-2 px-3 py-1.5 text-left text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                        >
                          {target.id === null ? (
                            <Home className="h-3.5 w-3.5" />
                          ) : (
                            <Folder className="h-3.5 w-3.5" style={{ color: target.color || '#6B7280' }} />
                          )}
                          <span className="truncate">{target.name}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {folder?.parentId && (
                    <>
                      <div className="my-1 border-t border-gray-100"></div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveFromFolder(folderId, 'folder', folderName);
                        }}
                        className="w-[calc(100%-8px)] mx-1 flex items-center space-x-2.5 px-3 py-2 text-left text-sm text-[#1D3140] rounded-lg hover:bg-[#64ABDE]/10"
                      >
                        <Home className="h-4 w-4" />
                        <span>Mover para Raiz</span>
                      </button>
                    </>
                  )}

                  <div className="my-1 border-t border-gray-100"></div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteFolder(folderId, folderName);
                    }}
                    className="w-[calc(100%-8px)] mx-1 flex items-center space-x-2.5 px-3 py-2 text-left text-sm text-red-600 rounded-lg hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>Excluir</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Indicador de Arrasto */}
        {isDragging && (
          <div className="absolute inset-0 bg-gray-900/10 rounded-xl pointer-events-none flex items-center justify-center">
            <div className="bg-gray-900 text-white px-3 py-1.5 rounded-md text-xs font-medium shadow-lg">
              Arrastando pasta...
            </div>
          </div>
        )}

        {/* Indicador de Drop Válido */}
        {isDropTarget && isValidTarget && !isDragging && (
          <div className="absolute inset-0 bg-blue-500/10 pointer-events-none flex items-center justify-center rounded-xl animate-pulse">
            <div className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg flex items-center space-x-2">
              {draggedFolder ? (
                <>
                  <Folder className="h-4 w-4" />
                  <span>Soltar pasta aqui</span>
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4" />
                  <span>Soltar orçamento aqui</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Indicador de Drop Inválido */}
        {isDropTarget && !isValidTarget && !isDragging && (
          <div className="absolute inset-0 bg-red-500/10 pointer-events-none flex items-center justify-center rounded-xl">
            <div className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg flex items-center space-x-2">
              <X className="h-4 w-4" />
              <span>Operação inválida</span>
            </div>
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Meus Orçamentos</h2>
          <p className="text-sm text-gray-500 mt-1">Gerencie seus projetos e organize por pastas</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={handleCreateFolder}>
            <Folder className="h-4 w-4" />
            <span>Nova Pasta</span>
          </Button>
          <Button variant="primary" onClick={() => setShowBudgetModal(true)}>
            <Plus className="h-4 w-4" />
            <span>Novo Orçamento</span>
          </Button>
        </div>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Total de Projetos</p>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{stats.total}</p>
            </div>
            <div className="p-2.5 rounded-lg" style={{ backgroundColor: '#64ABDE1A' }}>
              <BarChart3 className="h-5 w-5" style={{ color: '#1D3140' }} />
            </div>
          </div>
        </Card>

        <Card className="p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Em Andamento</p>
              <p className="text-2xl font-bold text-teal-600 tabular-nums">{stats.emAndamento}</p>
            </div>
            <div className="p-2.5 bg-teal-50 rounded-lg">
              <Clock className="h-5 w-5 text-teal-600" />
            </div>
          </div>
        </Card>

        <Card className="p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Finalizados</p>
              <p className="text-2xl font-bold text-green-600 tabular-nums">{stats.finalizados}</p>
            </div>
            <div className="p-2.5 bg-green-50 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
          </div>
        </Card>

        <Card className="p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2.5">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Taxa de Conclusão</p>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{stats.percentualFinalizacao}%</p>
            </div>
            <div className="p-2.5 bg-gray-50 rounded-lg">
              <TrendingUp className="h-5 w-5 text-gray-600" />
            </div>
          </div>
          <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-500"
              style={{ width: `${stats.percentualFinalizacao}%` }}
            />
          </div>
        </Card>
      </div>

      {/* Barra de Busca e Filtros */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Barra de Busca */}
          <div className="flex-1 relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Buscar por nome do projeto, cliente ou cidade..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#64ABDE]/40 focus:border-[#64ABDE] text-sm transition-shadow"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Botão de Filtros */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#64ABDE] ${
              hasActiveFilters
                ? 'bg-gray-900 text-white hover:bg-gray-800'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            <Filter className="h-4 w-4" />
            <span>Filtros</span>
            {hasActiveFilters && (
              <span className="bg-white text-gray-900 text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                {(statusFilter !== 'all' ? 1 : 0) + (concessionariaFilter !== 'all' ? 1 : 0) + (templatesOnly ? 1 : 0)}
              </span>
            )}
          </button>
        </div>

        {/* Painel de Filtros Expandido */}
        {showFilters && (
          <div className="pt-4 mt-4 border-t border-gray-100 animate-in fade-in-0 slide-in-from-top-1 duration-150">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {/* Status */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Status do Projeto
                </label>
                <Select
                  value={statusFilter}
                  onValueChange={(value: 'all' | 'Em Andamento' | 'Finalizado') => setStatusFilter(value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Todos os Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={STATUS_FILTER_ALL}>Todos os Status</SelectItem>
                    <SelectItem value="Em Andamento">Em Andamento</SelectItem>
                    <SelectItem value="Finalizado">Finalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Concessionária */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Concessionária
                </label>
                <Select value={concessionariaFilter} onValueChange={setConcessionariaFilter}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Todas as Concessionárias" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CONCESSIONARIA_FILTER_ALL}>Todas as Concessionárias</SelectItem>
                    {concessionarias.map((conc) => (
                      <SelectItem key={conc.id} value={conc.id}>
                        {conc.sigla} - {conc.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Apenas Modelos */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Modelos
                </label>
                <button
                  type="button"
                  onClick={() => setTemplatesOnly((prev) => !prev)}
                  className={`w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    templatesOnly
                      ? 'bg-purple-50 border-purple-300 text-purple-700'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Star className="h-4 w-4" fill={templatesOnly ? 'currentColor' : 'none'} />
                  <span>Apenas modelos</span>
                </button>
              </div>

              {/* Botão Limpar */}
              <div className="flex items-end">
                <Button
                  variant="secondary"
                  onClick={handleClearFilters}
                  disabled={!hasActiveFilters}
                  className="w-full"
                >
                  Limpar Filtros
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Chips de Filtros Ativos + Contador de Resultados */}
        {hasActiveFilters && (
          <div className="pt-3 mt-3 border-t border-gray-100 flex flex-wrap items-center gap-2">
            <p className="text-sm text-gray-600 mr-1">
              <span className="font-semibold text-gray-900">{filteredBudgets.length}</span> de{' '}
              <span className="font-semibold text-gray-900">{budgets.length}</span> orçamentos
            </p>
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium bg-[#64ABDE]/10 text-[#1D3140] hover:bg-[#64ABDE]/20 transition-colors"
              >
                “{searchTerm}” <X className="h-3 w-3" />
              </button>
            )}
            {statusFilter !== 'all' && (
              <button
                onClick={() => setStatusFilter('all')}
                className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium bg-[#64ABDE]/10 text-[#1D3140] hover:bg-[#64ABDE]/20 transition-colors"
              >
                {statusFilter} <X className="h-3 w-3" />
              </button>
            )}
            {concessionariaFilter !== 'all' && (
              <button
                onClick={() => setConcessionariaFilter('all')}
                className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium bg-[#64ABDE]/10 text-[#1D3140] hover:bg-[#64ABDE]/20 transition-colors"
              >
                {getConcessionariaNome(concessionariaFilter)} <X className="h-3 w-3" />
              </button>
            )}
            {templatesOnly && (
              <button
                onClick={() => setTemplatesOnly(false)}
                className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors"
              >
                Modelos <X className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Breadcrumbs e Navegação - COM DROP ZONES */}
      {(currentFolderId || folderPath.length > 0) && (
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1 flex-1 min-w-0">
              {/* Botão Voltar */}
              <button
                onClick={handleGoBack}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#64ABDE] shrink-0"
                title="Voltar"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>

              {/* Breadcrumbs com Drop Zones */}
              <div className="flex items-center space-x-1 text-sm flex-1 min-w-0 overflow-x-auto">
                {/* Início - Drop Zone para Raiz */}
                <div
                  onDragOver={(e) => handleDragOver(e, null)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, null)}
                  className={`rounded-lg transition-all duration-200 shrink-0 ${
                    dropTargetFolder === null && isDraggingOver && isValidDropTarget(null)
                      ? 'bg-blue-100 ring-2 ring-blue-500 scale-105'
                      : ''
                  }`}
                >
                  <button
                    onClick={() => navigateToFolder(null)}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-colors ${
                      dropTargetFolder === null && isDraggingOver && isValidDropTarget(null)
                        ? 'text-blue-700 font-bold'
                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <Home className="h-4 w-4" />
                    <span>Início</span>
                  </button>
                </div>

                {/* Pastas no Caminho - Cada uma é um Drop Zone */}
                {folderPath.map((folder: BudgetFolder, index: number) => (
                  <div key={folder.id} className="flex items-center space-x-1 shrink-0">
                    <ChevronRight className="h-3.5 w-3.5 text-gray-300 shrink-0" />
                    <div
                      onDragOver={(e) => handleDragOver(e, folder.id)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, folder.id)}
                      className={`rounded-lg transition-all duration-200 ${
                        dropTargetFolder === folder.id && isDraggingOver && isValidDropTarget(folder.id)
                          ? 'bg-blue-100 ring-2 ring-blue-500 scale-105'
                          : ''
                      }`}
                    >
                      <button
                        onClick={() => navigateToFolder(folder.id)}
                        className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-colors ${
                          dropTargetFolder === folder.id && isDraggingOver && isValidDropTarget(folder.id)
                            ? 'text-blue-700 font-bold'
                            : index === folderPath.length - 1
                            ? 'text-gray-900 font-semibold bg-gray-100'
                            : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                        }`}
                      >
                        <Folder className="h-3.5 w-3.5" style={{ color: folder.color || '#6B7280' }} />
                        <span className="truncate max-w-[10rem]">{folder.name}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Indicador de Drag Ativo */}
              {(draggedBudget || draggedFolder) && (
                <div className="hidden sm:flex items-center space-x-2 px-3 py-1.5 bg-[#64ABDE]/10 border border-[#64ABDE]/30 rounded-lg text-xs text-[#1D3140] font-medium shrink-0 ml-2">
                  <span>💡 Arraste para os breadcrumbs para mover</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Drop Zone "Mover para Nível Superior" - Visível quando está arrastando dentro de pasta */}
      {currentFolderId && (draggedBudget || draggedFolder) && (
        <div
          onDragOver={(e) => {
            const parentId = folderPath.length > 1 
              ? folderPath[folderPath.length - 2].id 
              : null;
            handleDragOver(e, parentId);
          }}
          onDragLeave={handleDragLeave}
          onDrop={(e) => {
            const parentId = folderPath.length > 1 
              ? folderPath[folderPath.length - 2].id 
              : null;
            handleDrop(e, parentId);
          }}
          className={`relative bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-dashed rounded-xl p-6 transition-all duration-200 ${
            dropTargetFolder === (folderPath.length > 1 ? folderPath[folderPath.length - 2].id : null) && isDraggingOver
              ? 'border-blue-500 bg-blue-100 scale-105 shadow-lg'
              : 'border-blue-300 hover:border-blue-400 hover:bg-blue-100'
          }`}
        >
          <div className="flex items-center justify-center space-x-3">
            <div className={`p-3 rounded-full transition-all duration-200 ${
              dropTargetFolder === (folderPath.length > 1 ? folderPath[folderPath.length - 2].id : null) && isDraggingOver
                ? 'bg-blue-500 animate-bounce'
                : 'bg-blue-200'
            }`}>
              <ArrowLeft className={`h-6 w-6 ${
                dropTargetFolder === (folderPath.length > 1 ? folderPath[folderPath.length - 2].id : null) && isDraggingOver
                  ? 'text-white'
                  : 'text-blue-600'
              }`} />
            </div>
            <div className="text-center">
              <h3 className={`text-lg font-bold mb-1 transition-colors ${
                dropTargetFolder === (folderPath.length > 1 ? folderPath[folderPath.length - 2].id : null) && isDraggingOver
                  ? 'text-blue-700'
                  : 'text-blue-600'
              }`}>
                {dropTargetFolder === (folderPath.length > 1 ? folderPath[folderPath.length - 2].id : null) && isDraggingOver
                  ? '🎯 Solte aqui!'
                  : '⬆️ Mover para Nível Superior'}
              </h3>
              <p className="text-sm text-blue-600">
                {folderPath.length > 1 
                  ? `Voltar para "${folderPath[folderPath.length - 2].name}"`
                  : 'Voltar para a raiz'}
              </p>
            </div>
            <div className={`p-3 rounded-full transition-all duration-200 ${
              dropTargetFolder === (folderPath.length > 1 ? folderPath[folderPath.length - 2].id : null) && isDraggingOver
                ? 'bg-blue-500 animate-bounce'
                : 'bg-blue-200'
            }`}>
              {folderPath.length > 1 ? (
                <Folder className={`h-6 w-6 ${
                  dropTargetFolder === folderPath[folderPath.length - 2].id && isDraggingOver
                    ? 'text-white'
                    : 'text-blue-600'
                }`} />
              ) : (
                <Home className={`h-6 w-6 ${
                  dropTargetFolder === null && isDraggingOver
                    ? 'text-white'
                    : 'text-blue-600'
                }`} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Conteúdo Principal */}
      {loadingBudgets || loadingFolders ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 animate-pulse">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
                <div className="h-5 w-16 bg-gray-100 rounded-full" />
              </div>
              <div className="h-px bg-gray-100 my-3" />
              <div className="flex justify-between">
                <div className="h-3 bg-gray-100 rounded w-1/3" />
                <div className="h-3 bg-gray-100 rounded w-1/4" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Pastas do Nível Atual */}
          {currentLevelFolders.length > 0 && (
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <Folder className="h-4 w-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                  Pastas <span className="text-gray-400 normal-case font-normal">({currentLevelFolders.length})</span>
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {currentLevelFolders.map(folder => (
                  <FolderCard
                    key={folder.id}
                    folderId={folder.id}
                    folderName={folder.name}
                    folderColor={folder.color}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Orçamentos do Nível Atual */}
          {currentLevelBudgets.length > 0 && (
            <div
              onDragOver={(e) => handleDragOver(e, currentFolderId)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, currentFolderId)}
              className={`relative transition-all duration-200 rounded-lg ${
                dropTargetFolder === currentFolderId && isDraggingOver && isValidDropTarget(currentFolderId)
                  ? 'bg-blue-50 border-2 border-blue-500 p-4 shadow-lg' 
                  : ''
              }`}
            >
              <div className={currentLevelFolders.length > 0 ? "mt-6" : ""}>
                {currentLevelFolders.length > 0 && (
                  <div className="flex items-center space-x-2 mb-4">
                    <FileText className="h-4 w-4 text-gray-400" />
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                      Orçamentos <span className="text-gray-400 normal-case font-normal">({currentLevelBudgets.length})</span>
                    </h3>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {currentLevelBudgets.map(budget => (
                    <BudgetCard key={budget.id} budget={budget} />
                  ))}
                </div>
              </div>

              {dropTargetFolder === currentFolderId && isDraggingOver && isValidDropTarget(currentFolderId) && (
                <div className="absolute inset-0 bg-blue-500 bg-opacity-10 pointer-events-none flex items-center justify-center rounded-lg animate-pulse">
                  <div className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg flex items-center space-x-2">
                    {draggedFolder ? (
                      <>
                        <Folder className="h-4 w-4" />
                        <span>Soltar pasta aqui</span>
                      </>
                    ) : (
                      <>
                        <FileText className="h-4 w-4" />
                        <span>Soltar orçamento aqui</span>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Mensagem quando não há conteúdo no nível atual */}
          {currentLevelFolders.length === 0 && currentLevelBudgets.length === 0 && (
            <div
              onDragOver={(e) => handleDragOver(e, currentFolderId)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, currentFolderId)}
              className={`relative text-center py-14 bg-white rounded-xl transition-all duration-200 ${
                dropTargetFolder === currentFolderId && isDraggingOver && isValidDropTarget(currentFolderId)
                  ? 'border-2 border-blue-500 bg-blue-50 shadow-lg transform scale-[1.02]'
                  : 'border-2 border-dashed border-gray-200'
              }`}
            >
              {dropTargetFolder === currentFolderId && isDraggingOver && isValidDropTarget(currentFolderId) ? (
                <>
                  <div className="animate-bounce">
                    {draggedFolder ? (
                      <Folder className="h-16 w-16 text-blue-500 mx-auto mb-4" />
                    ) : (
                      <FileText className="h-16 w-16 text-blue-500 mx-auto mb-4" />
                    )}
                  </div>
                  <h3 className="text-xl font-bold text-blue-600 mb-2">
                    Solte aqui!
                  </h3>
                  <p className="text-sm text-blue-700 font-medium">
                    {draggedFolder ? 'Mover pasta para este local' : 'Adicionar orçamento nesta pasta'}
                  </p>
                </>
              ) : (
                <>
                  <div
                    className="h-16 w-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                    style={{ backgroundColor: '#64ABDE1A' }}
                  >
                    <Folder className="h-8 w-8" style={{ color: '#64ABDE' }} />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-1.5">
                    {currentFolderId ? 'Pasta vazia' : 'Nenhum orçamento por aqui ainda'}
                  </h3>
                  <p className="text-sm text-gray-500 mb-5 max-w-sm mx-auto">
                    {currentFolderId
                      ? 'Crie subpastas, adicione orçamentos ou arraste itens para cá'
                      : 'Comece criando uma pasta para organizar ou um novo orçamento'}
                  </p>
                  <div className="flex items-center justify-center space-x-3">
                    <Button variant="secondary" onClick={handleCreateFolder}>
                      <Folder className="h-4 w-4" />
                      <span>Nova Pasta</span>
                    </Button>
                    <Button variant="primary" onClick={() => setShowBudgetModal(true)}>
                      <Plus className="h-4 w-4" />
                      <span>Novo Orçamento</span>
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Mensagem quando não há resultados com filtros */}
          {budgets.length > 0 && filteredBudgets.length === 0 && (
            <div className="text-center py-14 bg-white rounded-xl border-2 border-dashed border-gray-200">
              <div className="h-16 w-16 rounded-2xl mx-auto mb-4 flex items-center justify-center bg-gray-100">
                <Search className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1.5">Nenhum resultado encontrado</h3>
              <p className="text-sm text-gray-500 mb-5">Tente ajustar sua busca ou os filtros aplicados</p>
              <Button variant="primary" onClick={handleClearFilters}>
                <X className="h-4 w-4" />
                <span>Limpar Filtros</span>
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Modais */}
      {showBudgetModal && (
        <CriarOrcamentoModal
          isOpen={showBudgetModal}
          onClose={handleCloseBudgetModal}
          editingBudget={editingBudget}
        />
      )}

      {showFolderModal && (
        <FolderModal
          isOpen={showFolderModal}
          onClose={() => {
            setShowFolderModal(false);
            setEditingFolder(null);
          }}
          onSave={handleSaveFolder}
          initialName={editingFolder?.name || ''}
          initialColor={editingFolder?.color}
          mode={folderModalMode}
        />
      )}

      <AlertDialog {...alertDialog.dialogProps} />
    </div>
  );
}
