'use client';

import { Plus, HardHat } from 'lucide-react';
import { onPortalPrimaryButtonSmClass } from '@/lib/branding';

interface EmptyWorksStateProps {
  onNewWork: () => void;
}

export function EmptyWorksState({ onNewWork }: EmptyWorksStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white px-6 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#64ABDE]/10 text-[#64ABDE]">
        <HardHat className="h-8 w-8" />
      </div>
      <h2 className="text-lg font-semibold text-[#1D3140]">
        Você ainda não tem obras
      </h2>
      <p className="mt-1 max-w-sm text-sm text-gray-500">
        Crie a primeira obra para começar a acompanhar cronograma, marcos e equipe.
      </p>
      <button
        type="button"
        onClick={onNewWork}
        className={`${onPortalPrimaryButtonSmClass} mt-6 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm`}
      >
        <Plus className="h-4 w-4" />
        Nova Obra
      </button>
    </div>
  );
}
