'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { validateChecklist } from '@/actions/workChecklists';
import type { WorkChecklist } from '@/types/works';
import { ChecklistStatusBadge } from './ChecklistStatusBadge';
import { ChecklistDetailsView } from './ChecklistDetailsView';
import { ReturnChecklistDialog } from './ReturnChecklistDialog';

interface Props {
  checklist: WorkChecklist;
  workId: string;
  role: string;
}

export function ChecklistCard({ checklist, workId, role }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showDetails, setShowDetails] = useState(false);
  const [showReturn, setShowReturn] = useState(false);

  const completedCount = checklist.items.filter((i) => i.isCompleted).length;
  const totalCount = checklist.items.length;

  const handleValidate = () => {
    if (!confirm('Validar este checklist?')) return;
    startTransition(async () => {
      const result = await validateChecklist({ checklistId: checklist.id });
      if (result.success) router.refresh();
    });
  };

  return (
    <>
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <button
          type="button"
          onClick={() => setShowDetails(true)}
          className="w-full text-left"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-medium text-[#1D3140]">{checklist.name}</span>
              <ChecklistStatusBadge status={checklist.status} />
            </div>
            <span className="text-xs text-gray-500">
              {completedCount}/{totalCount} itens
            </span>
          </div>
          {checklist.dueDate && (
            <p className="mt-1 text-xs text-gray-500">
              Prazo: {new Date(checklist.dueDate).toLocaleDateString('pt-BR')}
            </p>
          )}
          {checklist.status === 'returned' && checklist.returnReason && (
            <p className="mt-1 rounded bg-red-50 px-2 py-1 text-xs text-red-700">
              Devolvido: {checklist.returnReason}
            </p>
          )}
        </button>

        {role === 'engineer' && checklist.status === 'awaiting_validation' && (
          <div className="mt-3 flex gap-2 border-t border-gray-100 pt-3">
            <button
              type="button"
              onClick={handleValidate}
              disabled={pending}
              className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              Validar
            </button>
            <button
              type="button"
              onClick={() => setShowReturn(true)}
              disabled={pending}
              className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Devolver
            </button>
          </div>
        )}
      </div>

      {showDetails && (
        <ChecklistDetailsView
          checklist={checklist}
          workId={workId}
          role={role}
          onClose={() => setShowDetails(false)}
        />
      )}

      {showReturn && (
        <ReturnChecklistDialog
          checklistId={checklist.id}
          onClose={() => setShowReturn(false)}
        />
      )}
    </>
  );
}
