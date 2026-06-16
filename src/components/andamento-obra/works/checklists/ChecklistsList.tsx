'use client';

import type { WorkChecklist } from '@/types/works';
import { ChecklistCard } from './ChecklistCard';

interface Props {
  checklists: WorkChecklist[];
  workId: string;
  role: string;
}

export function ChecklistsList({ checklists, workId, role }: Props) {
  if (checklists.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
        <p className="text-sm text-gray-500">Nenhum checklist atribuído a esta obra.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {checklists.map((cl) => (
        <ChecklistCard key={cl.id} checklist={cl} workId={workId} role={role} />
      ))}
    </div>
  );
}
