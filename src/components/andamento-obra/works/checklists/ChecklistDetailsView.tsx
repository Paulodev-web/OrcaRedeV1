'use client';

import type { WorkChecklist } from '@/types/works';
import { ChecklistStatusBadge } from './ChecklistStatusBadge';
import { ChecklistItemRow } from './ChecklistItemRow';

interface Props {
  checklist: WorkChecklist;
  workId: string;
  role: string;
  onClose: () => void;
}

export function ChecklistDetailsView({ checklist, workId, role, onClose }: Props) {
  const completedCount = checklist.items.filter((i) => i.isCompleted).length;
  const totalCount = checklist.items.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative h-full w-full max-w-lg overflow-y-auto bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-[#1D3140]">{checklist.name}</h2>
              <ChecklistStatusBadge status={checklist.status} />
            </div>
            <p className="mt-0.5 text-xs text-gray-500">
              {completedCount}/{totalCount} itens ({progressPct}%)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-4">
          {checklist.description && (
            <p className="mb-4 text-sm text-gray-600">{checklist.description}</p>
          )}

          {checklist.dueDate && (
            <p className="mb-4 text-xs text-gray-500">
              Prazo: {new Date(checklist.dueDate).toLocaleDateString('pt-BR')}
            </p>
          )}

          {checklist.status === 'returned' && checklist.returnReason && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <span className="font-medium">Motivo da devolução: </span>
              {checklist.returnReason}
            </div>
          )}

          <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-[#64ABDE] transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <div className="mt-4 space-y-2">
            {checklist.items.map((item) => (
              <ChecklistItemRow key={item.id} item={item} role={role} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
