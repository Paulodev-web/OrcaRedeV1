'use client';

import { useState, useTransition } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { rejectDailyLog } from '@/actions/workDailyLogs';
import {
  DAILY_LOG_REJECTION_REASON_MAX,
  DAILY_LOG_REJECTION_REASON_MIN,
} from '@/types/works';

interface RejectDailyLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dailyLogId: string;
  onRejected?: () => void;
}

export function RejectDailyLogDialog({
  open,
  onOpenChange,
  dailyLogId,
  onRejected,
}: RejectDailyLogDialogProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClose(next: boolean) {
    if (!next) {
      setReason('');
      setError(null);
    }
    onOpenChange(next);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length < DAILY_LOG_REJECTION_REASON_MIN) {
      setError(`Informe ao menos ${DAILY_LOG_REJECTION_REASON_MIN} caracteres.`);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await rejectDailyLog({ dailyLogId, reason: trimmed });
      if (!result.success) {
        setError(result.error);
        return;
      }
      onRejected?.();
      handleClose(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Rejeitar diário</DialogTitle>
          <DialogDescription>
            Informe o motivo da rejeição. O gerente verá esta justificativa ao
            republicar.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-3 px-6 py-4">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={isPending}
            rows={5}
            maxLength={DAILY_LOG_REJECTION_REASON_MAX}
            placeholder="Ex.: fotos sem qualidade; faltou descrever o material consumido."
            className="w-full resize-none rounded-md border border-gray-200 px-3 py-2 text-sm text-[#1D3140] focus:border-[#64ABDE] focus:outline-none focus:ring-1 focus:ring-[#64ABDE] disabled:bg-gray-50 disabled:text-gray-500"
          />
          <div className="flex items-center justify-between text-[11px] text-gray-500">
            <span>
              Mínimo {DAILY_LOG_REJECTION_REASON_MIN} caracteres
            </span>
            <span>
              {reason.length}/{DAILY_LOG_REJECTION_REASON_MAX}
            </span>
          </div>
          {error && (
            <p role="alert" className="text-xs text-red-600">
              {error}
            </p>
          )}

          <DialogFooter className="-mx-6 -mb-4 mt-2">
            <button
              type="button"
              onClick={() => handleClose(false)}
              disabled={isPending}
              className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {isPending ? 'Rejeitando...' : 'Rejeitar diário'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
