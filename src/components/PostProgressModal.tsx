"use client";
import React, { useState, useRef } from 'react';
import {
  X,
  Camera,
  Save,
  Upload,
  Trash2,
  Clock,
  CheckCircle,
  AlertTriangle,
  Play,
  FileText,
  MapPin,
  User,
} from 'lucide-react';
import { TrackedPost } from '@/types';

interface PostProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  post: TrackedPost;
  onSave: (updatedPost: TrackedPost) => void;
  trackingInfo: {
    projectName: string;
    clientName?: string;
    city?: string;
  };
}

export function PostProgressModal({ 
  isOpen, 
  onClose, 
  post, 
  onSave, 
  trackingInfo 
}: PostProgressModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localPost, setLocalPost] = useState<TrackedPost>(post);
  const [newPhotoDescription, setNewPhotoDescription] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  if (!isOpen) return null;

  const getStatusIcon = (status: TrackedPost['status']) => {
    switch (status) {
      case 'Concluído':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'Em Andamento':
        return <Play className="w-5 h-5 text-blue-600" />;
      case 'Problemas':
        return <AlertTriangle className="w-5 h-5 text-red-600" />;
      default:
        return <Clock className="w-5 h-5 text-gray-600" />;
    }
  };

  const getStatusColor = (status: TrackedPost['status']): string => {
    switch (status) {
      case 'Concluído':
        return 'border-green-200 bg-green-50 text-green-700';
      case 'Em Andamento':
        return 'border-blue-200 bg-blue-50 text-blue-700';
      case 'Problemas':
        return 'border-red-200 bg-red-50 text-red-700';
      default:
        return 'border-gray-200 bg-gray-50 text-gray-700';
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    
    // Simular upload - substituir por upload real para storage
    const file = files[0];
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const newPhoto = {
        id: `photo-${Date.now()}`,
        tracked_post_id: localPost.id,
        url: e.target?.result as string, // Em produção seria a URL do storage
        description: newPhotoDescription || `Foto do poste - ${new Date().toLocaleDateString('pt-BR')}`,
        uploaded_at: new Date().toISOString(),
      };

      setLocalPost(prev => ({
        ...prev,
        photos: [...prev.photos, newPhoto]
      }));
      
      setNewPhotoDescription('');
      setIsUploading(false);
    };

    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = (photoId: string) => {
    setLocalPost(prev => ({
      ...prev,
      photos: prev.photos.filter(photo => photo.id !== photoId)
    }));
  };

  const handleSave = () => {
    // Automaticamente definir data de conclusão quando status muda para Concluído
    if (localPost.status === 'Concluído' && post.status !== 'Concluído') {
      setLocalPost(prev => ({
        ...prev,
        completion_date: new Date().toISOString()
      }));
    }
    
    // Se mudou de Concluído para outro status, remover data de conclusão
    if (localPost.status !== 'Concluído' && post.status === 'Concluído') {
      setLocalPost(prev => ({
        ...prev,
        completion_date: undefined
      }));
    }

    onSave(localPost);
    onClose();
  };

  const formatDateTime = (dateString?: string): string => {
    if (!dateString) return 'Não definido';
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR');
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {localPost.custom_name || localPost.name}
              </h2>
              <div className="flex items-center gap-4 text-sm text-gray-600 mt-1">
                <span className="inline-flex items-center gap-1">
                  <User className="w-4 h-4" />
                  {trackingInfo.clientName}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {trackingInfo.city}
                </span>
                <span>
                  Projeto: {trackingInfo.projectName}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Status e Informações */}
            <div className="space-y-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  {getStatusIcon(localPost.status)}
                  Status do Poste
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Status Atual
                    </label>
                    <select
                      value={localPost.status}
                      onChange={(e) => setLocalPost(prev => ({
                        ...prev, 
                        status: e.target.value as TrackedPost['status']
                      }))}
                      className={`w-full px-3 py-2 border rounded-lg font-medium ${getStatusColor(localPost.status)}`}
                    >
                      <option value="Pendente">Pendente</option>
                      <option value="Em Andamento">Em Andamento</option>
                      <option value="Concluído">Concluído</option>
                      <option value="Problemas">Problemas</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Data de Instalação
                    </label>
                    <input
                      type="date"
                      value={localPost.installation_date ? localPost.installation_date.split('T')[0] : ''}
                      onChange={(e) => setLocalPost(prev => ({
                        ...prev,
                        installation_date: e.target.value ? new Date(e.target.value).toISOString() : undefined
                      }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {localPost.status === 'Concluído' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Data de Conclusão
                      </label>
                      <input
                        type="date"
                        value={localPost.completion_date ? localPost.completion_date.split('T')[0] : ''}
                        onChange={(e) => setLocalPost(prev => ({
                          ...prev,
                          completion_date: e.target.value ? new Date(e.target.value).toISOString() : undefined
                        }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Observações
                    </label>
                    <textarea
                      value={localPost.notes || ''}
                      onChange={(e) => setLocalPost(prev => ({...prev, notes: e.target.value}))}
                      placeholder="Adicione observações sobre este poste..."
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="pt-2 border-t border-gray-200 text-xs text-gray-500">
                    <div>Coordenadas: X: {Math.round(localPost.x_coord)} | Y: {Math.round(localPost.y_coord)}</div>
                    <div>ID Original: {localPost.original_post_id}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Fotos */}
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Camera className="w-5 h-5" />
                  Fotos do Progresso
                </h3>

                {/* Upload de Nova Foto */}
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center mb-4">
                  <Camera className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={newPhotoDescription}
                      onChange={(e) => setNewPhotoDescription(e.target.value)}
                      placeholder="Descrição da foto (opcional)"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 font-medium text-sm"
                    >
                      {isUploading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          Enviando...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          Adicionar Foto
                        </>
                      )}
                    </button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>

                {/* Lista de Fotos */}
                <div className="space-y-4 max-h-60 overflow-y-auto">
                  {localPost.photos.length === 0 ? (
                    <div className="text-center py-6 text-gray-500">
                      <FileText className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm">Nenhuma foto adicionada ainda</p>
                    </div>
                  ) : (
                    localPost.photos.map((photo) => (
                      <div key={photo.id} className="border border-gray-200 rounded-lg p-3">
                        <div className="flex items-start gap-3">
                          <img
                            src={photo.url}
                            alt={photo.description}
                            className="w-20 h-20 object-cover rounded-lg"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {photo.description}
                            </p>
                            <p className="text-xs text-gray-500">
                              {formatDateTime(photo.uploaded_at)}
                            </p>
                          </div>
                          <button
                            onClick={() => handleRemovePhoto(photo.id)}
                            className="text-red-500 hover:text-red-700 p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <div className="text-xs text-gray-500">
            Última atualização: {formatDateTime(localPost.updated_at)}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              <Save className="w-4 h-4" />
              Salvar Alterações
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}