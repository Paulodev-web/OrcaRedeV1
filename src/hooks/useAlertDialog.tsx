"use client";

import { useState } from 'react';

export type AlertType = 'success' | 'error' | 'warning' | 'info' | 'confirm' | 'destructive';

interface AlertDialogState {
  isOpen: boolean;
  title: string;
  description: string;
  type: AlertType;
  onConfirm?: () => void | Promise<void>;
  confirmText?: string;
  cancelText?: string;
  loading?: boolean;
  showCancel?: boolean;
}

export function useAlertDialog() {
  const [dialogState, setDialogState] = useState<AlertDialogState>({
    isOpen: false,
    title: '',
    description: '',
    type: 'info',
    loading: false,
    showCancel: true
  });

  const showDialog = (config: Omit<AlertDialogState, 'isOpen' | 'loading'>) => {
    setDialogState({
      ...config,
      isOpen: true,
      loading: false
    });
  };

  const closeDialog = () => {
    setDialogState(prev => ({ ...prev, isOpen: false, loading: false }));
  };

  const handleConfirm = async () => {
    if (dialogState.onConfirm) {
      setDialogState(prev => ({ ...prev, loading: true }));
      try {
        await dialogState.onConfirm();
        closeDialog();
      } catch (error) {
        console.error('Erro ao executar ação:', error);
        setDialogState(prev => ({ ...prev, loading: false }));
      }
    } else {
      closeDialog();
    }
  };

  const showSuccess = (title: string, description: string, onConfirm?: () => void | Promise<void>) => {
    showDialog({ title, description, type: 'success', onConfirm, showCancel: false, confirmText: 'OK' });
  };

  const showError = (title: string, description: string, onConfirm?: () => void | Promise<void>) => {
    showDialog({ title, description, type: 'error', onConfirm, showCancel: false, confirmText: 'OK' });
  };

  const showWarning = (title: string, description: string, onConfirm?: () => void | Promise<void>) => {
    showDialog({ title, description, type: 'warning', onConfirm, showCancel: false, confirmText: 'OK' });
  };

  const showInfo = (title: string, description: string, onConfirm?: () => void | Promise<void>) => {
    showDialog({ title, description, type: 'info', onConfirm, showCancel: false, confirmText: 'OK' });
  };

  const showConfirm = (
    title: string,
    description: string,
    onConfirm: () => void | Promise<void>,
    options?: {
      confirmText?: string;
      cancelText?: string;
      type?: 'confirm' | 'destructive';
    }
  ) => {
    showDialog({
      title,
      description,
      type: options?.type || 'confirm',
      onConfirm,
      showCancel: true,
      confirmText: options?.confirmText || 'Confirmar',
      cancelText: options?.cancelText || 'Cancelar'
    });
  };

  return {
    dialogProps: {
      isOpen: dialogState.isOpen,
      title: dialogState.title,
      description: dialogState.description,
      type: dialogState.type,
      onClose: closeDialog,
      onConfirm: handleConfirm,
      confirmText: dialogState.confirmText,
      cancelText: dialogState.cancelText,
      loading: dialogState.loading,
      showCancel: dialogState.showCancel
    },
    showDialog,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    showConfirm,
    closeDialog
  };
}
