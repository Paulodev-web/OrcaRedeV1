"use client";
import React, { useState, useEffect, useTransition } from 'react';
import { Plus, Edit, Trash2, Loader2, X, TowerControl } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { useAlertDialog } from '@/hooks/useAlertDialog';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { PostType } from '@/types';
import { addPostTypeAction, updatePostTypeAction, deletePostTypeAction } from '@/actions/postTypes';

export function GerenciarTiposPostes() {
  const { 
    postTypes, 
    loadingPostTypes, 
    fetchPostTypes,
    fetchMaterials,
  } = useApp();
  
  const [isPending, startTransition] = useTransition();
  const [showModal, setShowModal] = useState(false);
  const [editingPostType, setEditingPostType] = useState<PostType | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  const alertDialog = useAlertDialog();

  useEffect(() => {
    fetchPostTypes();
  }, [fetchPostTypes]);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
  };

  const handleEdit = (postType: PostType) => {
    if (isPending) return;
    setEditingPostType(postType);
    setShowModal(true);
  };

  const handleDelete = (id: string, name: string) => {
    if (isPending) return;
    
    alertDialog.showConfirm(
      'Excluir Tipo de Poste',
      `Tem certeza que deseja excluir o tipo de poste "${name}"?`,
      () => {
        startTransition(async () => {
          const result = await deletePostTypeAction(id);
          if (result.success) {
            showMessage('success', 'Tipo de poste excluído com sucesso!');
            fetchPostTypes();
            fetchMaterials();
          } else {
            showMessage('error', result.error || 'Erro ao excluir tipo de poste. Tente novamente.');
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

  const handleCloseModal = () => {
    if (isPending) return;
    setShowModal(false);
    setEditingPostType(null);
  };

  const handleRefresh = async () => {
    if (isPending) return;
    try {
      await fetchPostTypes();
      showMessage('success', 'Lista de tipos de poste atualizada!');
    } catch {
      showMessage('error', 'Erro ao atualizar lista de tipos de poste.');
    }
  };

  const handleSavePostType = (postTypeData: { name: string; code?: string; description?: string; shape?: string; height_m?: number; price: number }) => {
    startTransition(async () => {
      let result;
      if (editingPostType) {
        result = await updatePostTypeAction(editingPostType.id, postTypeData);
      } else {
        result = await addPostTypeAction(postTypeData);
      }

      if (result.success) {
        showMessage('success', editingPostType ? 'Tipo de poste atualizado com sucesso!' : 'Tipo de poste adicionado com sucesso!');
        handleCloseModal();
        fetchPostTypes();
        fetchMaterials();
      } else {
        showMessage('error', result.error || 'Erro ao salvar tipo de poste. Tente novamente.');
      }
    });
  };

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="flex justify-between items-center flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Gerenciar Tipos de Poste</h2>
          <p className="text-gray-600">Cadastre e gerencie o catálogo de tipos de postes</p>
        </div>
        <div className="flex space-x-3">
          <button 
            onClick={handleRefresh}
            disabled={loadingPostTypes || isPending}
            className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loadingPostTypes ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <TowerControl className="h-5 w-5" />
            )}
            <span>Atualizar</span>
          </button>
          <button
            onClick={() => setShowModal(true)}
            disabled={isPending}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="h-5 w-5" />
            <span>Novo Tipo de Poste</span>
          </button>
        </div>
      </div>

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

      <div className="bg-white rounded-lg shadow flex-1 flex flex-col overflow-hidden">
        {loadingPostTypes ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <p className="text-gray-500">Carregando tipos de poste...</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Nome
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Código
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Altura (m)
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Preço
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {postTypes.map((postType) => (
                    <tr key={postType.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <TowerControl className="h-5 w-5 text-gray-400 mr-3" />
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {postType.name}
                            </div>
                            {postType.description && (
                              <div className="text-sm text-gray-500">
                                {postType.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {postType.code || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {postType.height_m ? `${postType.height_m}m` : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        R$ {postType.price.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                        <button
                          onClick={() => handleEdit(postType)}
                          disabled={isPending}
                          className="text-blue-600 hover:text-blue-900 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Editar tipo de poste"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(postType.id, postType.name)}
                          disabled={isPending}
                          className="text-red-600 hover:text-red-900 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Excluir tipo de poste"
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

            {postTypes.length === 0 && !loadingPostTypes && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <TowerControl className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 mb-4">Nenhum tipo de poste cadastrado.</p>
                  <button
                    onClick={() => setShowModal(true)}
                    className="text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Cadastrar primeiro tipo de poste
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showModal && (
        <PostTypeModal
          postType={editingPostType}
          postTypes={postTypes}
          onClose={handleCloseModal}
          onSave={handleSavePostType}
          loading={isPending}
        />
      )}
      
      <AlertDialog {...alertDialog.dialogProps} />
    </div>
  );
}

interface PostTypeModalProps {
  postType: PostType | null;
  postTypes: PostType[];
  onClose: () => void;
  onSave: (postType: { name: string; code?: string; description?: string; shape?: string; height_m?: number; price: number }) => void;
  loading?: boolean;
}

function PostTypeModal({ postType, postTypes, onClose, onSave, loading = false }: PostTypeModalProps) {
  const [formData, setFormData] = useState({
    name: postType?.name || '',
    code: postType?.code || '',
    description: postType?.description || '',
    shape: postType?.shape || '',
    height_m: postType?.height_m?.toString() || '',
    price: postType?.price?.toString() || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const price = parseFloat(formData.price) || 0;
    const height_m = parseFloat(formData.height_m) || 0;
    
    if (!formData.name.trim()) {
      alert('Por favor, preencha o nome do tipo de poste.');
      return;
    }

    if (price <= 0) {
      alert('Por favor, informe um preço válido maior que zero.');
      return;
    }

    if (formData.code.trim()) {
      const codeExists = postTypes.some(pt => 
        pt.code?.toLowerCase() === formData.code.trim().toLowerCase() && 
        pt.id !== postType?.id
      );
      
      if (codeExists) {
        alert(`O código "${formData.code.trim()}" já está sendo usado por outro tipo de poste. Por favor, escolha um código diferente.`);
        return;
      }
    }

    const submitData = {
      name: formData.name.trim(),
      ...(formData.code.trim() && { code: formData.code.trim() }),
      ...(formData.description.trim() && { description: formData.description.trim() }),
      ...(formData.shape.trim() && { shape: formData.shape.trim() }),
      ...(height_m > 0 && { height_m }),
      price,
    };

    onSave(submitData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            {postType ? 'Editar Tipo de Poste' : 'Novo Tipo de Poste'}
          </h3>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Nome *
            </label>
            <input
              type="text"
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Ex: Poste de Concreto Duplo T"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-1">
              Código
            </label>
            <input
              type="text"
              id="code"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Ex: PDT-11"
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Descrição
            </label>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Descrição detalhada do tipo de poste"
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="shape" className="block text-sm font-medium text-gray-700 mb-1">
              Formato
            </label>
            <input
              type="text"
              id="shape"
              value={formData.shape}
              onChange={(e) => setFormData({ ...formData, shape: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Ex: Duplo T, Circular, Retangular"
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="height_m" className="block text-sm font-medium text-gray-700 mb-1">
              Altura (metros)
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              id="height_m"
              value={formData.height_m}
              onChange={(e) => setFormData({ ...formData, height_m: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Ex: 11.0"
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="price" className="block text-sm font-medium text-gray-700 mb-1">
              Preço *
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              id="price"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Ex: 1250.00"
              required
              disabled={loading}
            />
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
    </div>
  );
}
