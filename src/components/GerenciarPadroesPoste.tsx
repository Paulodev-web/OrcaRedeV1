"use client";
import React, { useState, useEffect, useTransition } from 'react';
import { Plus, Edit, Trash2, Filter, Loader2, Search, Layers, Package, Boxes, Copy } from 'lucide-react';
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
import { PoleStandard } from '@/types';
import { deletePoleStandardAction } from '@/actions/poleStandards';

const EMPTY_COMPANY_VALUE = '__no_company__';

export function GerenciarPadroesPoste() {
  const {
    utilityCompanies,
    poleStandards,
    postTypes,
    loadingCompanies,
    loadingPoleStandards,
    fetchUtilityCompanies,
    fetchPoleStandards,
    fetchPostTypes,
    setCurrentView,
    setCurrentPoleStandard
  } = useApp();
  const [isPending, startTransition] = useTransition();
  const [selectedConcessionaria, setSelectedConcessionaria] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const alertDialog = useAlertDialog();

  useEffect(() => {
    fetchUtilityCompanies();
    fetchPostTypes();
  }, [fetchUtilityCompanies, fetchPostTypes]);

  useEffect(() => {
    if (utilityCompanies.length > 0 && !selectedConcessionaria) {
      setSelectedConcessionaria(utilityCompanies[0].id);
    }
  }, [utilityCompanies, selectedConcessionaria]);

  useEffect(() => {
    if (selectedConcessionaria) {
      fetchPoleStandards(selectedConcessionaria);
    }
  }, [selectedConcessionaria, fetchPoleStandards]);

  const padroesFiltrados = poleStandards.filter((padrao) => {
    if (!searchTerm) return true;

    const searchLower = searchTerm.toLowerCase();
    const nomeMatch = padrao.nome.toLowerCase().includes(searchLower);
    const descricaoMatch = padrao.descricao?.toLowerCase().includes(searchLower);

    return nomeMatch || descricaoMatch;
  });

  const getPostTypeLabel = (padrao: PoleStandard) => {
    if (!padrao.postTypeId) return null;
    const postType = postTypes.find(pt => pt.id === padrao.postTypeId);
    return postType ? `${postType.name}${postType.code ? ` (${postType.code})` : ''}` : null;
  };

  const handleEdit = (padrao: PoleStandard) => {
    setCurrentPoleStandard(padrao);
    setCurrentView('editor-padrao-poste');
  };

  const handleCreateFrom = (padrao: PoleStandard) => {
    setCurrentPoleStandard({ ...padrao, id: '' });
    setCurrentView('editor-padrao-poste');
  };

  const handleDelete = (id: string, standardName?: string) => {
    const padrao = poleStandards.find(p => p.id === id);
    const name = standardName || padrao?.nome || 'este padrão de poste';

    alertDialog.showConfirm(
      'Excluir Padrão de Poste',
      `Tem certeza que deseja excluir ${name}? Postes que já foram criados a partir deste padrão não serão afetados.`,
      () => {
        startTransition(async () => {
          const result = await deletePoleStandardAction(id);
          if (result.success) {
            alertDialog.showSuccess(
              'Padrão Excluído',
              'O padrão de poste foi removido com sucesso.'
            );
            if (selectedConcessionaria) {
              fetchPoleStandards(selectedConcessionaria);
            }
          } else {
            alertDialog.showError(
              'Erro ao Excluir',
              result.error || 'Erro ao excluir padrão de poste. Tente novamente.'
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

  const handleNovoPadrao = () => {
    setCurrentPoleStandard(null);
    setCurrentView('editor-padrao-poste');
  };

  if (loadingCompanies) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Padrões de Poste</h2>
            <p className="text-gray-600">Combine grupos de itens em um padrão completo reutilizável</p>
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
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Layers className="h-6 w-6 text-blue-600" />
            Padrões de Poste
          </h2>
          <p className="text-gray-600">
            Um &quot;grupo de grupos de itens&quot; — combine vários grupos de itens, um tipo de poste
            e materiais avulsos em um padrão que se aplica de uma só vez.
          </p>
        </div>
        <button
          onClick={handleNovoPadrao}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex-shrink-0"
        >
          <Plus className="h-5 w-5" />
          <span>Novo Padrão de Poste</span>
        </button>
      </div>

      <div className="bg-white rounded-lg shadow flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b flex-shrink-0">
          <div className="space-y-4">
            <div className="flex items-center space-x-4">
              <Filter className="h-5 w-5 text-gray-500" />
              <label className="text-sm font-medium text-gray-700">
                Visualizar padrões da concessionária:
              </label>
              <Select
                value={selectedConcessionaria || EMPTY_COMPANY_VALUE}
                onValueChange={(value) => setSelectedConcessionaria(value === EMPTY_COMPANY_VALUE ? '' : value)}
                disabled={utilityCompanies.length === 0}
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Nenhuma concessionária encontrada" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={EMPTY_COMPANY_VALUE}>
                    {utilityCompanies.length === 0
                      ? 'Nenhuma concessionária encontrada'
                      : 'Selecione uma concessionária'}
                  </SelectItem>
                  {utilityCompanies.map((concessionaria) => (
                    <SelectItem key={concessionaria.id} value={concessionaria.id}>
                      {concessionaria.sigla}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-4">
              <Search className="h-5 w-5 text-gray-500" />
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar padrões por nome ou descrição..."
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
                  {padroesFiltrados.length} resultado{padroesFiltrados.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingPoleStandards ? (
            <div className="flex-1 flex items-center justify-center py-12">
              <div className="flex flex-col items-center space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                <p className="text-gray-500">Carregando padrões de poste...</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {padroesFiltrados.map((padrao) => {
                const postTypeLabel = getPostTypeLabel(padrao);
                const totalMateriaisAvulsos = padrao.materiais.length;
                const totalGrupos = padrao.grupos.reduce((sum, g) => sum + g.quantidade, 0);

                return (
                  <div key={padrao.id} className="p-6 hover:bg-gray-50 transition-colors">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-medium text-gray-900 mb-1">
                          {padrao.nome}
                        </h3>
                        {padrao.descricao && (
                          <p className="text-gray-600 text-sm mb-3">
                            {padrao.descricao}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          {postTypeLabel && (
                            <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-700 px-2 py-1 rounded-full">
                              <Boxes className="h-3.5 w-3.5" />
                              {postTypeLabel}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                            <Layers className="h-3.5 w-3.5" />
                            {padrao.grupos.length} grupo{padrao.grupos.length !== 1 ? 's' : ''}
                            {totalGrupos !== padrao.grupos.length ? ` (${totalGrupos} instâncias)` : ''}
                          </span>
                          {totalMateriaisAvulsos > 0 && (
                            <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
                              <Package className="h-3.5 w-3.5" />
                              {totalMateriaisAvulsos} material{totalMateriaisAvulsos !== 1 ? 'is' : ''} avulso{totalMateriaisAvulsos !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-gray-400">Compartilhado com:</span>
                          {padrao.concessionariaIds.map((companyId) => {
                            const empresa = utilityCompanies.find(c => c.id === companyId);
                            return (
                              <span
                                key={companyId}
                                className="inline-flex items-center bg-green-50 text-green-700 text-xs px-2 py-0.5 rounded-full"
                              >
                                {empresa?.sigla || '?'}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex space-x-2 ml-4 flex-shrink-0">
                        <button
                          onClick={() => handleEdit(padrao)}
                          disabled={isPending}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Editar padrão"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleCreateFrom(padrao)}
                          disabled={isPending}
                          className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Criar a partir de"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(padrao.id, padrao.nome)}
                          disabled={isPending}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Excluir padrão"
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
                );
              })}
            </div>
          )}

          {!loadingPoleStandards && padroesFiltrados.length === 0 && selectedConcessionaria && (
            <div className="flex-1 flex items-center justify-center py-12">
              <div className="text-center max-w-sm mx-auto">
                {searchTerm ? (
                  <>
                    <p className="text-gray-500 mb-4">
                      Nenhum padrão de poste encontrado com o termo &quot;{searchTerm}&quot;.
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
                    <Layers className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 mb-1">
                      Nenhum padrão de poste para {concessionariaSelecionada?.sigla}.
                    </p>
                    <p className="text-gray-400 text-sm mb-4">
                      Crie um padrão combinando grupos de itens já existentes para agilizar a
                      montagem de postes recorrentes.
                    </p>
                    <button
                      onClick={handleNovoPadrao}
                      className="text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Criar primeiro padrão de poste
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
