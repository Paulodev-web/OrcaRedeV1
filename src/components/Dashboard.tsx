"use client";
import { useState, useEffect, useMemo, useCallback, useTransition } from 'react';
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
import { resolveFolderColor } from '@/lib/folderColors';
import { useAlertDialog } from '@/hooks/useAlertDialog';
import { Orcamento, BudgetFolder } from '@/types';
import { deleteBudgetAction, duplicateBudgetAction, finalizeBudgetAction, updateBudgetAction } from '@/actions/budgets';
import { addFolderAction, updateFolderAction, deleteFolderAction, moveBudgetToFolderAction, moveFolderToFolderAction } from '@/actions/folders';
import { DragDropProvider } from '@dnd-kit/react';
import { BudgetCard } from '@/components/orcamentos/BudgetCard';
import { FolderCard } from '@/components/orcamentos/FolderCard';
import { FolderDropZone } from '@/components/orcamentos/dnd/FolderDropZone';
import { parseDraggableId, parseDropZoneId } from '@/components/orcamentos/dnd/dashboardDnd';
import { cardDragSensors } from '@/lib/dnd/sensors';

const STATUS_FILTER_ALL = 'all';
const CONCESSIONARIA_FILTER_ALL = 'all';

export interface DashboardProps {
  /**
   * Destino do clique no cartão do orçamento. É o que a rota `/orcamentos`
   * passa para abrir a etapa 1 da esteira. Ausente, vale o roteamento por
   * estado do `AppContext` (OrçaRede legado dentro do `AppShell`).
   */
  onOpenBudget?: (budget: Orcamento) => void;
}

export function Dashboard({ onOpenBudget }: DashboardProps = {}) {
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
  // Id do item em arrasto, no formato `budget:<id>` / `folder:<id>`. Substitui
  // os quatro estados que o drag do HTML5 exigia (item, alvo, hover, validade).
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
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

  // ---------------------------------------------------------------------------
  // Arrasto — dnd-kit (vocabulário em src/components/orcamentos/dnd/dashboardDnd.ts)
  //
  // Substitui o drag-and-drop nativo do HTML5 que havia aqui. Além de não
  // funcionar em toque, ele obrigava a manter quatro estados em paralelo
  // (item arrastado, alvo, "está por cima" e validade) e um `setTimeout` de
  // 50 ms para contornar o flicker do `dragleave` ao passar por cima de um
  // elemento filho. O dnd-kit resolve tudo isso com um id de origem e um de
  // destino.
  // ---------------------------------------------------------------------------
  const activeItem = useMemo(() => {
    if (!activeDragId) return null;
    const parsed = parseDraggableId(activeDragId);
    if (!parsed) return null;

    if (parsed.kind === 'budget') {
      const budget = budgets.find((b) => b.id === parsed.id);
      return budget
        ? { kind: 'budget' as const, id: budget.id, name: budget.nome, parentId: budget.folderId ?? null }
        : null;
    }

    const folder = folders.find((f) => f.id === parsed.id);
    return folder
      ? { kind: 'folder' as const, id: folder.id, name: folder.name, parentId: folder.parentId ?? null }
      : null;
  }, [activeDragId, budgets, folders]);

  const isValidDropTarget = useCallback(
    (targetFolderId: string | null): boolean => {
      if (!activeItem) return false;
      // Já está nesse destino.
      if (activeItem.parentId === targetFolderId) return false;
      if (activeItem.kind === 'folder') {
        // Pasta dentro dela mesma, ou dentro de uma descendente sua.
        if (activeItem.id === targetFolderId) return false;
        if (targetFolderId && isFolderDescendant(targetFolderId, activeItem.id)) return false;
      }
      return true;
    },
    [activeItem, isFolderDescendant],
  );

  const runMove = useCallback(
    (item: NonNullable<typeof activeItem>, targetFolderId: string | null) => {
      startTransition(async () => {
        const result =
          item.kind === 'budget'
            ? await moveBudgetToFolderAction(item.id, targetFolderId)
            : await moveFolderToFolderAction(item.id, targetFolderId);

        if (!result.success) {
          alertDialog.showError('Erro ao Mover', result.error || 'Não foi possível mover o item.');
          return;
        }

        if (item.kind === 'budget') fetchBudgets();
        else fetchFolders();

        const destino = targetFolderId
          ? folders.find((f) => f.id === targetFolderId)?.name || 'pasta'
          : 'raiz';
        alertDialog.showSuccess('Item Movido', `"${item.name}" foi movido para ${destino}.`);
      });
    },
    [alertDialog, fetchBudgets, fetchFolders, folders],
  );

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

  return (
    <DragDropProvider
      sensors={cardDragSensors}
      onDragStart={(event) => setActiveDragId(String(event.operation.source?.id ?? ''))}
      onDragEnd={(event) => {
        const sourceId = String(event.operation.source?.id ?? '');
        const targetId = String(event.operation.target?.id ?? '');
        setActiveDragId(null);
        if (event.canceled) return;

        const source = parseDraggableId(sourceId);
        const targetFolderId = parseDropZoneId(targetId);
        // `undefined` = soltou fora de qualquer zona; `null` = soltou na raiz,
        // que é um destino legítimo. Os dois casos precisam ser distinguíveis.
        if (!source || targetFolderId === undefined) return;

        const item =
          source.kind === 'budget'
            ? (() => {
                const budget = budgets.find((b) => b.id === source.id);
                return budget
                  ? {
                      kind: 'budget' as const,
                      id: budget.id,
                      name: budget.nome,
                      parentId: budget.folderId ?? null,
                    }
                  : null;
              })()
            : (() => {
                const folder = folders.find((f) => f.id === source.id);
                return folder
                  ? {
                      kind: 'folder' as const,
                      id: folder.id,
                      name: folder.name,
                      parentId: folder.parentId ?? null,
                    }
                  : null;
              })();

        if (!item) return;
        // Mesma validação do realce visual — a UI já sinalizou "operação
        // inválida", mas o teclado e o toque podem soltar sem passar por ela.
        if (item.parentId === targetFolderId) return;
        if (item.kind === 'folder') {
          if (item.id === targetFolderId) return;
          if (targetFolderId && isFolderDescendant(targetFolderId, item.id)) return;
        }

        runMove(item, targetFolderId);
      }}
    >
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
            <div className="p-2.5 rounded-lg" style={{ backgroundColor: '#5f8dd11A' }}>
              <BarChart3 className="h-5 w-5" style={{ color: '#262623' }} />
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
      <div className="bg-surface border border-gray-200 rounded-xl p-4">
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
              className="block w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500/40 focus:border-accent-500 text-sm transition-shadow"
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
            className={`flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
              hasActiveFilters
                ? 'bg-gray-900 text-white hover:bg-gray-800'
                : 'bg-surface text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            <Filter className="h-4 w-4" />
            <span>Filtros</span>
            {hasActiveFilters && (
              <span className="bg-surface text-gray-900 text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
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
                      : 'bg-surface border-gray-300 text-gray-700 hover:bg-gray-50'
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
                className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium bg-accent-500/10 text-neutral-900 hover:bg-accent-500/20 transition-colors"
              >
                “{searchTerm}” <X className="h-3 w-3" />
              </button>
            )}
            {statusFilter !== 'all' && (
              <button
                onClick={() => setStatusFilter('all')}
                className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium bg-accent-500/10 text-neutral-900 hover:bg-accent-500/20 transition-colors"
              >
                {statusFilter} <X className="h-3 w-3" />
              </button>
            )}
            {concessionariaFilter !== 'all' && (
              <button
                onClick={() => setConcessionariaFilter('all')}
                className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium bg-accent-500/10 text-neutral-900 hover:bg-accent-500/20 transition-colors"
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
        <div className="bg-surface border border-gray-200 rounded-xl p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1 flex-1 min-w-0">
              {/* Botão Voltar */}
              <button
                onClick={handleGoBack}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 shrink-0"
                title="Voltar"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>

              {/* Breadcrumbs com Drop Zones */}
              <div className="flex items-center space-x-1 text-sm flex-1 min-w-0 overflow-x-auto">
                {/* Início - Drop Zone para Raiz */}
                <FolderDropZone
                  zone="breadcrumb"
                  folderId={null}
                  valid={isValidDropTarget(null)}
                  className="shrink-0 rounded-lg"
                  activeClassName="bg-accent-50 ring-2 ring-accent-500"
                  invalidClassName="bg-red-50 ring-2 ring-red-300"
                >
                  {({ isOver, valid }) => (
                    <button
                      onClick={() => navigateToFolder(null)}
                      className={`flex items-center space-x-1.5 rounded-lg px-3 py-1.5 transition-colors ${
                        isOver && valid
                          ? 'font-semibold text-accent-800'
                          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                    >
                      <Home className="h-4 w-4" />
                      <span>Início</span>
                    </button>
                  )}
                </FolderDropZone>

                {/* Pastas no Caminho - Cada uma é um Drop Zone */}
                {folderPath.map((folder: BudgetFolder, index: number) => (
                  <div key={folder.id} className="flex items-center space-x-1 shrink-0">
                    <ChevronRight className="h-3.5 w-3.5 text-gray-300 shrink-0" />
                    <FolderDropZone
                      zone="breadcrumb"
                      folderId={folder.id}
                      valid={isValidDropTarget(folder.id)}
                      className="rounded-lg"
                      activeClassName="bg-accent-50 ring-2 ring-accent-500"
                      invalidClassName="bg-red-50 ring-2 ring-red-300"
                    >
                      {({ isOver, valid }) => (
                        <button
                          onClick={() => navigateToFolder(folder.id)}
                          className={`flex items-center space-x-1.5 rounded-lg px-3 py-1.5 transition-colors ${
                            isOver && valid
                              ? 'font-semibold text-accent-800'
                              : index === folderPath.length - 1
                                ? 'bg-gray-100 font-semibold text-gray-900'
                                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                          }`}
                        >
                          <Folder className="h-3.5 w-3.5" style={{ color: folder.color || '#6B7280' }} />
                          <span className="max-w-[10rem] truncate">{folder.name}</span>
                        </button>
                      )}
                    </FolderDropZone>
                  </div>
                ))}
              </div>

              {/* Indicador de Drag Ativo */}
              {activeItem && (
                <div className="hidden sm:flex items-center space-x-2 px-3 py-1.5 bg-accent-500/10 border border-accent-500/30 rounded-lg text-xs text-neutral-900 font-medium shrink-0 ml-2">
                  <span>💡 Arraste para os breadcrumbs para mover</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Subir um nível — só aparece durante o arrasto dentro de uma pasta */}
      {currentFolderId && activeItem && (
        <FolderDropZone
          zone="up"
          folderId={folderPath.length > 1 ? folderPath[folderPath.length - 2].id : null}
          valid={isValidDropTarget(
            folderPath.length > 1 ? folderPath[folderPath.length - 2].id : null,
          )}
          className="rounded-xl border-2 border-dashed border-accent-200 bg-accent-50/60 p-5"
          activeClassName="border-accent-500 bg-accent-50"
          invalidClassName="border-red-300 bg-red-50"
        >
          {({ isOver, valid }) => (
            <div className="flex items-center justify-center gap-3">
              <div
                className={`rounded-full p-2.5 transition-colors ${
                  isOver && valid ? 'bg-accent-600 text-white' : 'bg-accent-100 text-accent-700'
                }`}
              >
                <ArrowLeft className="h-5 w-5" />
              </div>
              <div className="text-center">
                <h3 className="text-sm font-semibold text-accent-800">
                  {isOver && valid ? 'Solte para mover' : 'Subir um nível'}
                </h3>
                <p className="text-xs text-accent-700">
                  {folderPath.length > 1
                    ? `Voltar para "${folderPath[folderPath.length - 2].name}"`
                    : 'Voltar para a raiz'}
                </p>
              </div>
            </div>
          )}
        </FolderDropZone>
      )}

      {/* Conteúdo Principal */}
      {loadingBudgets || loadingFolders ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-surface border border-gray-200 rounded-xl p-4 animate-pulse">
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
                {currentLevelFolders.map((folder) => (
                  <FolderCard
                    key={folder.id}
                    folderId={folder.id}
                    folderName={folder.name}
                    folderColor={folder.color}
                    parentId={folder.parentId ?? null}
                    itemCount={
                      folders.filter((f) => f.parentId === folder.id).length +
                      (budgetsByFolder[folder.id]?.length ?? 0)
                    }
                    subfolderCount={folders.filter((f) => f.parentId === folder.id).length}
                    draggingKind={activeItem?.kind ?? null}
                    validTarget={isValidDropTarget(folder.id)}
                    menuOpen={openFolderMenu === folder.id}
                    moveMenuOpen={moveMenuFor?.type === 'folder' && moveMenuFor.id === folder.id}
                    moveTargets={
                      moveMenuFor?.type === 'folder' && moveMenuFor.id === folder.id
                        ? getValidFolderTargets('folder', folder.id, folder.parentId ?? null)
                        : []
                    }
                    onOpen={() => handleOpenFolder(folder.id)}
                    onToggleMenu={() => {
                      setMoveMenuFor(null);
                      setOpenFolderMenu(openFolderMenu === folder.id ? null : folder.id);
                    }}
                    onCloseMenu={() => {
                      setOpenFolderMenu(null);
                      setMoveMenuFor(null);
                    }}
                    onToggleMoveMenu={() =>
                      setMoveMenuFor(
                        moveMenuFor?.type === 'folder' && moveMenuFor.id === folder.id
                          ? null
                          : { type: 'folder', id: folder.id },
                      )
                    }
                    onRename={() => handleEditFolder(folder.id, folder.name, folder.color)}
                    onMoveTo={(targetId) =>
                      handleMoveViaMenu('folder', folder.id, folder.name, targetId)
                    }
                    onRemoveFromFolder={() =>
                      handleRemoveFromFolder(folder.id, 'folder', folder.name)
                    }
                    onDelete={() => handleDeleteFolder(folder.id, folder.name)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Orçamentos do Nível Atual */}
          {currentLevelBudgets.length > 0 && (
            <FolderDropZone
              zone="level"
              folderId={currentFolderId}
              valid={isValidDropTarget(currentFolderId)}
              className="relative rounded-lg"
              activeClassName="bg-accent-50 p-4 ring-2 ring-accent-400"
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
                  {currentLevelBudgets.map((budget) => (
                    <BudgetCard
                      key={budget.id}
                      budget={budget}
                      concessionariaNome={getConcessionariaNome(budget.concessionariaId)}
                      formattedDate={formatDate(budget.dataModificacao)}
                      isFinalizing={isFinalizing === budget.id}
                      isDuplicating={isDuplicating === budget.id}
                      menuOpen={openBudgetMenu === budget.id}
                      moveMenuOpen={moveMenuFor?.type === 'budget' && moveMenuFor.id === budget.id}
                      moveTargets={
                        moveMenuFor?.type === 'budget' && moveMenuFor.id === budget.id
                          ? getValidFolderTargets('budget', budget.id, budget.folderId ?? null)
                          : []
                      }
                      onOpen={() => {
                        if (onOpenBudget) {
                          onOpenBudget(budget);
                        } else {
                          setCurrentOrcamento(budget);
                          setCurrentView('orcamento');
                        }
                      }}
                      onToggleMenu={() => {
                        setMoveMenuFor(null);
                        setOpenBudgetMenu(openBudgetMenu === budget.id ? null : budget.id);
                      }}
                      onCloseMenu={() => {
                        setOpenBudgetMenu(null);
                        setMoveMenuFor(null);
                      }}
                      onToggleMoveMenu={() =>
                        setMoveMenuFor(
                          moveMenuFor?.type === 'budget' && moveMenuFor.id === budget.id
                            ? null
                            : { type: 'budget', id: budget.id },
                        )
                      }
                      onEdit={() => handleEditBudget(budget)}
                      onDuplicate={() => handleDuplicateBudget(budget)}
                      onFinalize={() => {
                        handleFinalize(budget);
                        setOpenBudgetMenu(null);
                      }}
                      onToggleTemplate={() => handleToggleTemplate(budget)}
                      onMoveTo={(targetId) =>
                        handleMoveViaMenu('budget', budget.id, budget.nome, targetId)
                      }
                      onRemoveFromFolder={() =>
                        handleRemoveFromFolder(budget.id, 'budget', budget.nome)
                      }
                      onDelete={() => {
                        handleDeleteBudget(budget);
                        setOpenBudgetMenu(null);
                      }}
                    />
                  ))}
                </div>
              </div>

            </FolderDropZone>
          )}

          {/* Mensagem quando não há conteúdo no nível atual */}
          {currentLevelFolders.length === 0 && currentLevelBudgets.length === 0 && (
            <FolderDropZone
              zone="empty"
              folderId={currentFolderId}
              valid={isValidDropTarget(currentFolderId)}
              className="rounded-xl border-2 border-dashed border-gray-200 bg-surface py-14 text-center"
              activeClassName="border-accent-500 bg-accent-50"
            >
              {({ isOver, valid }) =>
                isOver && valid ? (
                  <>
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-100">
                      {activeItem?.kind === 'folder' ? (
                        <Folder className="h-8 w-8 text-accent-700" />
                      ) : (
                        <FileText className="h-8 w-8 text-accent-700" />
                      )}
                    </div>
                    <h3 className="mb-1.5 text-lg font-semibold text-accent-800">Solte aqui</h3>
                    <p className="text-sm text-accent-700">
                      {activeItem?.kind === 'folder'
                        ? 'Mover a pasta para este local'
                        : 'Mover o orçamento para esta pasta'}
                    </p>
                  </>
                ) : (
                  <>
                    <div
                      className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
                      style={{ backgroundColor: '#5f8dd11A' }}
                    >
                      <Folder className="h-8 w-8" style={{ color: '#5f8dd1' }} />
                    </div>
                    <h3 className="mb-1.5 text-lg font-semibold text-gray-900">
                      {currentFolderId ? 'Pasta vazia' : 'Nenhum orçamento por aqui ainda'}
                    </h3>
                    <p className="mx-auto mb-5 max-w-sm text-sm text-gray-500">
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
                )
              }
            </FolderDropZone>
          )}

          {/* Mensagem quando não há resultados com filtros */}
          {budgets.length > 0 && filteredBudgets.length === 0 && (
            <div className="text-center py-14 bg-surface rounded-xl border-2 border-dashed border-gray-200">
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
    </DragDropProvider>
  );
}
