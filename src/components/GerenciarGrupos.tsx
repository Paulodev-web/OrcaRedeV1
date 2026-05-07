"use client";
import React, { useState, useEffect, useTransition } from 'react';
import { Plus, Edit, Trash2, Filter, Loader2, Search } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { useAlertDialog } from '@/hooks/useAlertDialog';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { GrupoItem } from '@/types';
import { deleteItemGroupAction } from '@/actions/itemGroups';

export function GerenciarGrupos() {
  const { 
    utilityCompanies, 
    itemGroups, 
    loadingCompanies, 
    loadingGroups,
    fetchUtilityCompanies, 
    fetchItemGroups,
    setCurrentView,
    setCurrentGroup
  } = useApp();
  const [isPending, startTransition] = useTransition();
  const [selectedConcessionaria, setSelectedConcessionaria] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  const alertDialog = useAlertDialog();

  // Carregar concessionárias na montagem do componente
  useEffect(() => {
    fetchUtilityCompanies();
  }, [fetchUtilityCompanies]); // Função memoizada não causa loop

  // Definir primeira concessionária como selecionada quando carregadas
  useEffect(() => {
    if (utilityCompanies.length > 0 && !selectedConcessionaria) {
      setSelectedConcessionaria(utilityCompanies[0].id);
    }
  }, [utilityCompanies, selectedConcessionaria]);

  // Carregar grupos quando concessionária for selecionada
  useEffect(() => {
    if (selectedConcessionaria) {
      fetchItemGroups(selectedConcessionaria);
    }
  }, [selectedConcessionaria, fetchItemGroups]); // Função memoizada não causa loop

  // Filtrar grupos por termo de busca
  const gruposFiltrados = itemGroups.filter((grupo) => {
    if (!searchTerm) return true;
    
    const searchLower = searchTerm.toLowerCase();
    const nomeMatch = grupo.nome.toLowerCase().includes(searchLower);
    const descricaoMatch = grupo.descricao?.toLowerCase().includes(searchLower);
    
    return nomeMatch || descricaoMatch;
  });

  const handleEdit = (grupo: GrupoItem) => {
    setCurrentGroup(grupo);
    setCurrentView('editor-grupo');
  };

  const handleDelete = (id: string, groupName?: string) => {
    const grupo = itemGroups.find(g => g.id === id);
    const name = groupName || grupo?.nome || 'este grupo de itens';
    
    alertDialog.showConfirm(
      'Excluir Grupo de Itens',
      `Tem certeza que deseja excluir ${name}?`,
      () => {
        startTransition(async () => {
          const result = await deleteItemGroupAction(id);
          if (result.success) {
            alertDialog.showSuccess(
              'Grupo Excluído',
              'O grupo de itens foi removido com sucesso.'
            );
            if (selectedConcessionaria) {
              fetchItemGroups(selectedConcessionaria);
            }
          } else {
            alertDialog.showError(
              'Erro ao Excluir',
              result.error || 'Erro ao excluir grupo. Tente novamente.'
            );
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

  const handleNovoGrupo = () => {
    setCurrentGroup(null); // Limpar grupo atual para modo criação
    setCurrentView('editor-grupo');
  };

  // Early return: Se estiver carregando concessionárias, mostrar apenas spinner
  if (loadingCompanies) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Gerenciar Grupos de Itens</h2>
            <p className="text-gray-600">Crie e gerencie kits de materiais por concessionária</p>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow">
          <div className="p-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-4" />
            <p className="text-gray-500">Carregando concessionárias...</p>
          </div>
        </div>
      </div>
    );
  }

  const concessionariaSelecionada = utilityCompanies.find(c => c.id === selectedConcessionaria);

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="flex justify-between items-center flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Gerenciar Grupos de Itens</h2>
          <p className="text-gray-600">Crie e gerencie kits de materiais por concessionária</p>
        </div>
        <button
          onClick={handleNovoGrupo}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-5 w-5" />
          <span>Novo Grupo de Itens</span>
        </button>
      </div>

      <div className="bg-white rounded-lg shadow flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b flex-shrink-0">
          <div className="space-y-4">
            {/* Filtro de Concessionária */}
            <div className="flex items-center space-x-4">
              <Filter className="h-5 w-5 text-gray-500" />
              <label className="text-sm font-medium text-gray-700">
                Visualizar grupos da concessionária:
              </label>
              <select
                value={selectedConcessionaria}
                onChange={(e) => setSelectedConcessionaria(e.target.value)}
                className="px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={utilityCompanies.length === 0}
              >
                {utilityCompanies.length === 0 ? (
                  <option value="">Nenhuma concessionária encontrada</option>
                ) : (
                  utilityCompanies.map((concessionaria) => (
                    <option key={concessionaria.id} value={concessionaria.id}>
                      {concessionaria.sigla}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Campo de Busca */}
            <div className="flex items-center space-x-4">
              <Search className="h-5 w-5 text-gray-500" />
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar grupos por nome ou descrição..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    title="Limpar busca"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              {searchTerm && (
                <span className="text-sm text-gray-500">
                  {gruposFiltrados.length} resultado{gruposFiltrados.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingGroups ? (
            <div className="flex-1 flex items-center justify-center py-12">
              <div className="flex flex-col items-center space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                <p className="text-gray-500">Carregando grupos de itens...</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {gruposFiltrados.map((grupo) => (
                <div key={grupo.id} className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="text-lg font-medium text-gray-900 mb-2">
                        {grupo.nome}
                      </h3>
                      <p className="text-gray-600 text-sm mb-3">
                        {grupo.descricao}
                      </p>
                      <div className="flex items-center text-sm text-gray-500">
                        <span className="bg-gray-100 px-2 py-1 rounded-full">
                          {grupo.materiais.length} materiais
                        </span>
                        <span className="ml-3">
                          {concessionariaSelecionada?.sigla}
                        </span>
                      </div>
                    </div>
                    <div className="flex space-x-2 ml-4">
                      <button
                        onClick={() => handleEdit(grupo)}
                        disabled={isPending}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(grupo.id, grupo.nome)}
                        disabled={isPending}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loadingGroups && gruposFiltrados.length === 0 && selectedConcessionaria && (
            <div className="flex-1 flex items-center justify-center py-12">
              <div className="text-center">
                {searchTerm ? (
                  <>
                    <p className="text-gray-500 mb-4">
                      Nenhum grupo de itens encontrado com o termo "{searchTerm}".
                    </p>
                    <button
                      onClick={() => setSearchTerm('')}
                      className="text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Limpar busca
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-gray-500 mb-4">
                      Nenhum grupo de itens encontrado para {concessionariaSelecionada?.sigla}.
                    </p>
                    <button
                      onClick={handleNovoGrupo}
                      className="text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Criar primeiro grupo de itens
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      
      <AlertDialog {...alertDialog.dialogProps} />
    </div>
  );
}