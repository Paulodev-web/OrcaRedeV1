"use client";
import { X, AlertTriangle, CheckCircle, Info, AlertCircle } from 'lucide-react';

type AlertType = 'success' | 'error' | 'warning' | 'info' | 'confirm' | 'destructive';

interface AlertDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  type?: AlertType;
  loading?: boolean;
  showCancel?: boolean;
}

export function AlertDialog({
  isOpen,
  onClose,
  title,
  description,
  confirmText = 'OK',
  cancelText = 'Cancelar',
  onConfirm,
  type = 'info',
  loading = false,
  showCancel = true
}: AlertDialogProps) {
  if (!isOpen) return null;

  const getIconAndColors = () => {
    switch (type) {
      case 'success':
        return {
          icon: <CheckCircle className="h-6 w-6 text-green-600" />,
          confirmClasses: 'bg-green-600 hover:bg-green-700 text-white',
          defaultConfirmText: 'OK'
        };
      case 'error':
        return {
          icon: <AlertCircle className="h-6 w-6 text-red-600" />,
          confirmClasses: 'bg-red-600 hover:bg-red-700 text-white',
          defaultConfirmText: 'OK'
        };
      case 'warning':
        return {
          icon: <AlertTriangle className="h-6 w-6 text-yellow-600" />,
          confirmClasses: 'bg-yellow-600 hover:bg-yellow-700 text-white',
          defaultConfirmText: 'OK'
        };
      case 'destructive':
        return {
          icon: <AlertTriangle className="h-6 w-6 text-red-600" />,
          confirmClasses: 'bg-red-600 hover:bg-red-700 text-white',
          defaultConfirmText: 'Confirmar'
        };
      case 'confirm':
        return {
          icon: null,
          confirmClasses: 'bg-blue-600 hover:bg-blue-700 text-white',
          defaultConfirmText: 'Confirmar'
        };
      default: // info
        return {
          icon: <Info className="h-6 w-6 text-blue-600" />,
          confirmClasses: 'bg-blue-600 hover:bg-blue-700 text-white',
          defaultConfirmText: 'OK'
        };
    }
  };

  const { icon, confirmClasses, defaultConfirmText } = getIconAndColors();
  const finalConfirmText = confirmText === 'OK' ? defaultConfirmText : confirmText;
  const isConfirmType = type === 'confirm' || type === 'destructive';
  const finalShowCancel = isConfirmType ? showCancel : false;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            {icon}
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-6">{description}</p>

        <div className="flex justify-end space-x-3">
          {finalShowCancel && (
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cancelText}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm || onClose}
            disabled={loading}
            className={`px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${confirmClasses}`}
          >
            {loading ? (
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Processando...</span>
              </div>
            ) : (
              finalConfirmText
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
                                                        