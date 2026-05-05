'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { returnChecklist } from '@/actions/workChecklists';
import { CHECKLIST_RETURN_REASON_MIN } from '@/types/works';

interface Props {
  checklistId: string;
  onClose: () => void;
}

export function ReturnChecklistDialog({ checklistId, onClose }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    setError(null);
    if (reason.trim().length < CHECKLIST_RETURN_REASON_MIN) {
      setError(`Motivo deve ter no mínimo ${CHECKLIST_RETURN_REASON_MIN} caracteres.`);
      return;
    }

    startTransition(async () => {
      const result = await returnChecklist({ checklistId, reason: reason.trim() });
      if (!result.success) {
        setError(result.error ?? 'Erro.');
        return;
      }
      onClose();
      router.refresh();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-[#1D3140]">Devolver checklist</h3>

        <div className="space-y-3">
          <div>
            <label htmlFor="return-reason" className="block text-sm font-medium text-gray-700">
              Motivo da devolução *
            </label>
            <textarea
              id="return-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              placeholder="Descreva o motivo..."
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={pending}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {pending ? 'Devolvendo...' : 'Devolver'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
