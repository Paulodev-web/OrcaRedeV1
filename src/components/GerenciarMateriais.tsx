"use client";
import React, { useState, useEffect, useRef, useTransition } from 'react';
import { Plus, Search, Edit, Trash2, Upload, Loader2, ArrowUpDown, ArrowUp, ArrowDown, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
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
import { addMaterialAction, updateMaterialAction, deleteMaterialAction } from '@/actions/materials';

const EMPTY_UNIDADE_VALUE = '__no_unidade__';

type SortField = 'descricao' | 'codigo' | 'precoUnit';
type SortOrder = 'asc' | 'desc';

export function GerenciarMateriais() {
  const { materiais, loadingMaterials, fetchMaterials, deleteAllMaterials, importMaterialsFromCSV } = useApp();
  const [isPending, startTransition] = useTransition();
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [sortField, setSortField] = useState<SortField>('descricao');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  
  // Estados de paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  
  // Adicione os seguintes estados e a ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  
  const alertDialog = useAlertDialog();

  // Buscar materiais quando o componente for montado
  useEffect(() => {
    fetchMaterials();
  }, []);

  // Auto-hide messages after 5 seconds
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        setMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
  };

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportMessage(null);
    try {
      const result = await importMaterialsFromCSV(file);
      setImportMessage({ type: result.success ? 'success' : 'error', text: result.message });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Ocorreu um erro desconhecido.';
      setImportMessage({ type: 'error', text: msg });
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  // Função para calcular relevância da busca
  const getSearchRelevance = (material: Material, term: string): number => {
    if (!term) return 0;
    
    const searchLower = term.toLowerCase();
    const codigoLower = material.codigo.toLowerCase();
    const descricaoLower = material.descricao.toLowerCase();
    
    let score = 0;
    
    // Pontuação para código
    if (codigoLower === searchLower) {
      score += 1000; // Match exato no código
    } else if (codigoLower.startsWith(searchLower)) {
      score += 500; // Código começa com o termo
    } else if (codigoLower.includes(searchLower)) {
      score += 100; // Código contém o termo
    }
    
    // Pontuação para descrição
    const palavras = descricaoLower.split(/\s+/);
    
    // Match exato de palavra completa
    if (palavras.some(palavra => palavra === searchLower)) {
      score += 800;
    }
    
    // Palavra começa com o termo
    const palavrasComeçam = palavras.filter(palavra => palavra.startsWith(searchLower));
    if (palavrasComeçam.length > 0) {
      score += 400 * palavrasComeçam.length;
    }
    
    // Primeira palavra da descrição
    if (palavras[0]?.startsWith(searchLower)) {
      score += 300; // Bonus se for a primeira palavra
    }
    
    // Descrição começa com o termo (mesmo que não seja palavra completa)
    if (descricaoLower.startsWith(searchLower)) {
      score += 200;
    }
    
    // Apenas contém o termo (menor prioridade)
    if (descricaoLower.includes(searchLower)) {
      score += 50;
    }
    
    return score;
  };

  // Resetar para primeira página quando mudar busca ou ordenação
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortField, sortOrder, itemsPerPage]);

  // Filtrar e ordenar materiais
  const filteredMateriais = materiais
    .filter(material => {
      const searchLower = searchTerm.toLowerCase();
      return material.codigo.toLowerCase().includes(searchLower) ||
             material.descricao.toLowerCase().includes(searchLower);
    })
    .map(material => ({
      material,
      relevance: searchTerm ? getSearchRelevance(material, searchTerm) : 0
    }))
    .sort((a, b) => {
      // Se há busca ativa, ordenar por relevância primeiro
      if (searchTerm) {
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

  // Cálculos de paginação
  const totalItems = filteredMateriais.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedMateriais = filteredMateriais.slice(startIndex, endIndex);

  // Funções de navegação de página
  const goToFirstPage = () => setCurrentPage(1);
  const goToLastPage = () => setCurrentPage(totalPages);
  const goToNextPage = () => setCurrentPage(prev => Math.min(prev + 1, totalPages));
  const goToPrevPage = () => setCurrentPage(prev => Math.max(prev - 1, 1));
  const handleItemsPerPageChange = (value: number) => {
    setItemsPerPage(value);
    setCurrentPage(1);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Se clicar no mesmo campo, inverte a ordem
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Se clicar em um campo diferente, define esse campo e ordem crescente
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4 ml-1 opacity-30" />;
    }
    return sortOrder === 'asc' 
      ? <ArrowUp className="h-4 w-4 ml-1 text-blue-600" />
      : <ArrowDown className="h-4 w-4 ml-1 text-blue-600" />;
  };

  const handleEdit = (material: Material) => {
    if (isPending) return;
    setEditingMaterial(material);
    setShowModal(true);
  };

  const handleDelete = (id: string, materialName?: string) => {
    if (isPending) return;
    
    const material = materiais.find(m => m.id === id);
    const name = materialName || material?.descricao || 'este material';
    
    alertDialog.showConfirm(
      'Excluir Material',
      `Tem certeza que deseja excluir ${name}?`,
      () => {
        startTransition(async () => {
          const result = await deleteMaterialAction(id);
          if (result.success) {
            showMessage('success', 'Material excluído com sucesso!');
            fetchMaterials(true);
          } else {
            showMessage('error', result.error || 'Erro ao excluir material. Tente novamente.');
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

  const handleDeleteAll = () => {
    if (isPending) return;
    
    alertDialog.showConfirm(
      'ATENÇÃO: Excluir TODOS os Materiais',
      `Esta ação irá EXCLUIR PERMANENTEMENTE todos os ${materiais.length} materiais cadastrados. Esta ação NÃO PODE SER DESFEITA. Tem certeza absoluta que deseja continuar?`,
      async () => {
        try {
          await deleteAllMaterials();
          showMessage('success', 'Todos os materiais foram excluídos com sucesso!');
        } catch (error) {
          console.error('Erro ao excluir todos os materiais:', error);
          showMessage('error', 'Erro ao excluir materiais. Tente novamente.');
        }
      },
      {
        type: 'destructive',
        confirmText: 'SIM, EXCLUIR TUDO',
        cancelText: 'Cancelar'
      }
    );
  };

  const handleCloseModal = () => {
    if (isPending) return;
    setShowModal(false);
    setEditingMaterial(null);
  };

  const handleRefresh = async () => {
    if (isPending) return;
    try {
      await fetchMaterials();
      showMessage('success', 'Lista de materiais atualizada!');
    } catch {
      showMessage('error', 'Erro ao atualizar lista de materiais.');
    }
  };

  const handleSaveMaterial = (materialData: Omit<Material, 'id'>) => {
    startTransition(async () => {
      let result;
      if (editingMaterial) {
        result = await updateMaterialAction(editingMaterial.id, materialData);
      } else {
        result = await addMaterialAction(materialData);
      }

      if (result.success) {
        showMessage('success', editingMaterial ? 'Material atualizado com sucesso!' : 'Material adicionado com sucesso!');
        handleCloseModal();
        fetchMaterials(true);
      } else {
        showMessage('error', result.error || 'Erro ao salvar material. Tente novamente.');
      }
    });
  };

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="flex justify-between items-center flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Gerenciar Materiais</h2>
          <p className="text-gray-600">
            Cadastre e gerencie o catálogo completo de materiais
            {materiais.length > 0 && (
              <span className="ml-2 text-blue-600 font-semibold">
                ({materiais.length} {materiais.length === 1 ? 'material' : 'materiais'} carregados)
              </span>
            )}
          </p>
        </div>
        <div className="flex space-x-3">
          <button 
            onClick={handleRefresh}
            disabled={loadingMaterials || isPending}
            className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loadingMaterials ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Search className="h-5 w-5" />
            )}
            <span>Atualizar</span>
          </button>
          {/* Input de arquivo oculto */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileImport}
            accept=".xlsx,.xls"
            className="hidden"
          />
          {/* Botão que aciona o input */}
          <button 
            onClick={triggerFileInput}
            disabled={isPending}
            className="flex items-center space-x-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload className="h-5 w-5" />
            <span>Importar Planilha</span>
          </button>
          <button
            onClick={() => setShowModal(true)}
            disabled={isPending}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="h-5 w-5" />
            <span>Novo Material</span>
          </button>
          <button 
            onClick={handleDeleteAll}
            disabled={isPending || materiais.length === 0}
            className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="h-5 w-5" />
            <span>Excluir Todos</span>
          </button>
        </div>
      </div>

      {/* Message feedback */}
      {message && (
        <div className={`p-4 rounded-lg flex-shrink-0 ${
          message.type === 'success' 
            ? 'bg-green-50 text-green-700 border border-green-200' 
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          <div className="flex items-center justify-between">
            <p>{message.text}</p>
            <button
              onClick={() => setMessage(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Área para feedback de importação */}
      {importMessage && (
        <div className={`p-4 rounded-lg flex-shrink-0 ${
          importMessage.type === 'success' 
            ? 'bg-green-50 text-green-700 border border-green-200' 
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          <div className="flex items-center justify-between">
            <p>{importMessage.text}</p>
            <button
              onClick={() => setImportMessage(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por código ou descrição..."
              className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                title="Limpar busca"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <div>
              {searchTerm ? (
                <div className="flex items-center space-x-2">
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded font-medium">
                    🔍 Buscando: "{searchTerm}"
                  </span>
                  <span className="text-gray-600">
                    {filteredMateriais.length} {filteredMateriais.length === 1 ? 'resultado' : 'resultados'} encontrado{filteredMateriais.length === 1 ? '' : 's'}
                  </span>
                </div>
              ) : (
                <span className="text-gray-500">
                  {materiais.length} materiais disponíveis
                </span>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-gray-500">
                Ordenado por: 
              </span>
              <span className="font-medium text-gray-700">
                {sortField === 'descricao' && 'Descrição'}
                {sortField === 'codigo' && 'Código'}
                {sortField === 'precoUnit' && 'Preço'}
              </span>
              <span className="text-gray-500">
                ({sortOrder === 'asc' ? 'A-Z' : 'Z-A'})
              </span>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loadingMaterials ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <p className="text-gray-500">Carregando materiais...</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors select-none"
                      onClick={() => handleSort('codigo')}
                    >
                      <div className="flex items-center">
                        Código
                        {getSortIcon('codigo')}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors select-none"
                      onClick={() => handleSort('descricao')}
                    >
                      <div className="flex items-center">
                        Descrição
                        {getSortIcon('descricao')}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors select-none"
                      onClick={() => handleSort('precoUnit')}
                    >
                      <div className="flex items-center">
                        Preço Unit.
                        {getSortIcon('precoUnit')}
                      </div>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Unidade
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedMateriais.map((material) => (
                    <tr key={material.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {material.codigo}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {material.descricao}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        R$ {material.precoUnit.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {material.unidade}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                        <button
                          onClick={() => handleEdit(material)}
                          disabled={isPending}
                          className="text-blue-600 hover:text-blue-900 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(material.id, material.descricao)}
                          disabled={isPending}
                          className="text-red-600 hover:text-red-900 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            {totalItems > 0 && (
              <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-700">Itens por página:</span>
                    <Select
                      value={String(itemsPerPage)}
                      onValueChange={(value) => handleItemsPerPageChange(Number(value))}
                    >
                      <SelectTrigger className="w-[96px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                        <SelectItem value="200">200</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="text-sm text-gray-700">
                    Mostrando <span className="font-medium">{startIndex + 1}</span> a{' '}
                    <span className="font-medium">{Math.min(endIndex, totalItems)}</span> de{' '}
                    <span className="font-medium">{totalItems}</span> {totalItems === 1 ? 'item' : 'itens'}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={goToFirstPage}
                    disabled={currentPage === 1}
                    className="p-2 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Primeira página"
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={goToPrevPage}
                    disabled={currentPage === 1}
                    className="p-2 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Página anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-700">
                      Página <span className="font-medium">{currentPage}</span> de{' '}
                      <span className="font-medium">{totalPages}</span>
                    </span>
                  </div>
                  <button
                    onClick={goToNextPage}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Próxima página"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <button
                    onClick={goToLastPage}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Última página"
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Empty State */}
            {filteredMateriais.length === 0 && !loadingMaterials && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-gray-500">
                    {searchTerm ? 'Nenhum material encontrado.' : 'Nenhum material cadastrado.'}
                  </p>
                  {!searchTerm && (
                    <button
                      onClick={() => setShowModal(true)}
                      className="mt-4 text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Cadastrar primeiro material
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showModal && (
        <MaterialModal
          material={editingMaterial}
          onClose={handleCloseModal}
          onSave={handleSaveMaterial}
          loading={isPending}
        />
      )}
      
      <AlertDialog {...alertDialog.dialogProps} />
    </div>
  );
}

interface MaterialModalProps {
  material: Material | null;
  onClose: () => void;
  onSave: (material: Omit<Material, 'id'>) => void;
  loading?: boolean;
}

function MaterialModal({ material, onClose, onSave, loading = false }: MaterialModalProps) {
  const [formData, setFormData] = useState({
    codigo: material?.codigo || '',
    descricao: material?.descricao || '',
    precoUnit: material?.precoUnit?.toString() || '',
    unidade: material?.unidade || '',
  });
  
  const alertDialog = useAlertDialog();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const precoUnit = parseFloat(formData.precoUnit) || 0;
    
    if (!formData.codigo.trim() || !formData.descricao.trim() || !formData.unidade.trim()) {
      alertDialog.showError(
        'Campos Obrigatórios',
        'Por favor, preencha todos os campos obrigatórios.'
      );
      return;
    }

    if (precoUnit <= 0) {
      alertDialog.showError(
        'Preço Inválido',
        'Por favor, informe um preço válido maior que zero.'
      );
      return;
    }

    onSave({
      ...formData,
      precoUnit
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          {material ? 'Editar Material' : 'Novo Material'}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Código *
            </label>
            <input
              type="text"
              value={formData.codigo}
              onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Descrição *
            </label>
            <input
              type="text"
              value={formData.descricao}
              onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Preço Unitário *
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={formData.precoUnit}
              onChange={(e) => setFormData({ ...formData, precoUnit: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="0.00"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Unidade *
            </label>
            <Select
              value={formData.unidade || EMPTY_UNIDADE_VALUE}
              onValueChange={(value) =>
                setFormData({ ...formData, unidade: value === EMPTY_UNIDADE_VALUE ? '' : value })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione uma unidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={EMPTY_UNIDADE_VALUE}>Selecione uma unidade</SelectItem>
                <SelectItem value="UN">UN - Unidade</SelectItem>
                <SelectItem value="M">M - Metro</SelectItem>
                <SelectItem value="KG">KG - Quilograma</SelectItem>
                <SelectItem value="L">L - Litro</SelectItem>
                <SelectItem value="M²">M² - Metro Quadrado</SelectItem>
                <SelectItem value="M³">M³ - Metro Cúbico</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end space-x-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>{loading ? 'Salvando...' : 'Salvar'}</span>
            </button>
          </div>
        </form>
      </div>
      
      <AlertDialog {...alertDialog.dialogProps} />
    </div>
  );
}