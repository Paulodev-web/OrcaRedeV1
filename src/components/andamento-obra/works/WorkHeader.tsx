'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { NewWorkDialog } from './NewWorkDialog';
import { StatusDropdown } from './StatusDropdown';
import { WorkKPIs } from './WorkKPIs';
import { ImportedBudgetBadge } from './ImportedBudgetBadge';
import type { ManagerRow } from '@/types/people';
import type { WorkMilestone, WorkWithManager } from '@/types/works';

interface WorkHeaderProps {
  work: WorkWithManager;
  milestones: WorkMilestone[];
  managers: ManagerRow[];
  postsPlanned?: number;
  postsInstalled?: number;
}

export function WorkHeader({
  work,
  milestones,
  managers,
  postsPlanned,
  postsInstalled,
}: WorkHeaderProps) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-6 py-4 lg:px-8">
        <p className="text-xs text-gray-400">
          <Link href="/tools/andamento-obra" className="hover:text-[#64ABDE]">
            Obras
          </Link>
          <span className="mx-1">/</span>
          <span className="text-gray-600">{work.name}</span>
        </p>

        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-[#1D3140]">{work.name}</h1>
              {work.budgetId && <ImportedBudgetBadge />}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
              {work.clientName && <span><strong className="font-medium text-gray-700">Cliente:</strong> {work.clientName}</span>}
              {work.utilityCompany && <span><strong className="font-medium text-gray-700">Concessionária:</strong> {work.utilityCompany}</span>}
              {work.address && <span><strong className="font-medium text-gray-700">Local:</strong> {work.address}</span>}
              <span>
                <strong className="font-medium text-gray-700">Gerente:</strong>{' '}
                {work.managerName ?? 'Não atribuído'}
              </span>
              {work.budgetId && (
                <Link
                  href={`/?budgetId=${work.budgetId}`}
                  className="text-[#64ABDE] hover:underline"
                  title="Abrir o orçamento original no OrçaRede"
                >
                  Ver orçamento original
                </Link>
              )}
            </div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <StatusDropdown workId={work.id} current={work.status} />
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-[#1D3140] hover:bg-gray-50"
            >
              <Pencil className="h-3.5 w-3.5" />
              Editar obra
            </button>
          </div>
        </div>

        <div className="mt-4">
          <WorkKPIs
            work={work}
            milestones={milestones}
            postsPlanned={postsPlanned ?? 0}
            postsInstalled={postsInstalled ?? 0}
          />
        </div>
      </div>

      <NewWorkDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        managers={managers}
        work={work}
      />
    </header>
  );
}
