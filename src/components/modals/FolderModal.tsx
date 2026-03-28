"use client";
import { useState, useEffect } from 'react';
import { X, Folder, AlertCircle } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';

interface FolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, color?: string, parentId?: string | null) => Promise<void>;
  initialName?: string;
  initialColor?: string;
  mode: 'create' | 'edit';
}

const FOLDER_COLORS = [
  { name: 'Azul', value: '#3B82F6' },
  { name: 'Verde', value: '#10B981' },
  { name: 'Amarelo', value: '#F59E0B' },
  { name: 'Vermelho', value: '#EF4444' },
  { name: 'Roxo', value: '#8B5CF6' },
  { name: 'Rosa', value: '#EC4899' },
  { name: 'Cinza', value: '#6B7280' },
  { name: 'Laranja', value: '#F97316' },
];

export function FolderModal({ isOpen, onClose, onSave, initialName = '', initialColor = '#3B82F6', mode }: FolderModalProps) {
  const { folders, currentFolderId } = useApp();
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [parentId, setParentId] = useState<string | null>(currentFolderId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setColor(initialColor);
      setParentId(mode === 'create' ? currentFolderId : null);
      setError(null);
    }
  }, [isOpen, initialName, initialColor, currentFolderId, mode]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Por favor, insira um nome para a pasta.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await onSave(name.trim(), color, parentId);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar pasta.');
    } finally {
      setLoading(false);
    }
  };

  // Obter lista de pastas disponíveis (excluindo a pasta atual para evitar ciclos)
  const availableFolders = folders.filter(folder => mode === 'create' || folder.id !== initialName);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full border border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gray-100 rounded-lg">
              <Folder className="h-5 w-5 text-gray-700" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {mode === 'create' ? 'Nova Pasta' : 'Editar Pasta'}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {mode === 'create' ? 'Organize seus orçamentos' : 'Atualize as informações'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            disabled={loading}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Error Message */}
          {error && (
            <div className="flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {/* Nome da Pasta */}
          <div>
            <label htmlFor="folder-name" className="block text-sm font-medium text-gray-700 mb-1.5">
              Nome da Pasta
            </label>
            <input
              id="folder-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Projetos 2024"
              maxLength={50}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-sm"
              disabled={loading}
              autoFocus
            />
            <p className="mt-1 text-xs text-gray-500">
              {name.length}/50 caracteres
            </p>
          </div>

          {/* Pasta Pai (apenas para criação) */}
          {mode === 'create' && (
            <div>
              <label htmlFor="parent-folder" className="block text-sm font-medium text-gray-700 mb-1.5">
                Pasta Pai (Opcional)
              </label>
              <select
                id="parent-folder"
                value={parentId || ''}
                onChange={(e) => setParentId(e.target.value || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-sm"
                disabled={loading}
              >
                <option value="">Raiz (Sem pasta pai)</option>
                {availableFolders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Escolha onde criar a nova pasta
              </p>
            </div>
          )}

          {/* Cor da Pasta */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Cor da Pasta
            </label>
            <div className="grid grid-cols-4 gap-2">
              {FOLDER_COLORS.map((folderColor) => (
                <button
                  key={folderColor.value}
                  type="button"
                  onClick={() => setColor(folderColor.value)}
                  className={`relative flex items-center justify-center p-3 rounded-lg border-2 transition-all ${
                    color === folderColor.value
                      ? 'border-gray-900'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  disabled={loading}
                  title={folderColor.name}
                >
                  <Folder
                    className="h-6 w-6"
                    style={{ color: folderColor.value }}
                  />
                  {color === folderColor.value && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-gray-900 rounded-full border-2 border-white flex items-center justify-center">
                      <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="pt-3 border-t border-gray-200">
            <p className="text-sm font-medium text-gray-700 mb-2">Pré-visualização</p>
            <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="p-2 bg-white rounded-lg">
                <Folder
                  className="h-6 w-6"
                  style={{ color }}
                />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {name.trim() || 'Nome da pasta'}
                </p>
                <p className="text-xs text-gray-500">
                  Assim sua pasta aparecerá
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 p-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm text-gray-700 font-medium bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={loading || !name.trim()}
            className="px-4 py-2 text-sm bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Salvando...' : mode === 'create' ? 'Criar Pasta' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

