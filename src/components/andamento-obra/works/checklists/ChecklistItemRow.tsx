import type { WorkChecklistItem } from '@/types/works';

interface Props {
  item: WorkChecklistItem;
  role: string;
}

export function ChecklistItemRow({ item }: Props) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-gray-100 bg-gray-50/50 p-3">
      <div className="mt-0.5">
        {item.isCompleted ? (
          <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-green-500 text-xs text-white">✓</span>
        ) : (
          <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-gray-300 bg-white text-xs text-gray-400">
            {item.orderIndex + 1}
          </span>
        )}
      </div>
      <div className="flex-1">
        <p className={`text-sm ${item.isCompleted ? 'text-gray-500 line-through' : 'text-[#1D3140]'}`}>
          {item.label}
        </p>
        {item.description && (
          <p className="mt-0.5 text-xs text-gray-400">{item.description}</p>
        )}
        {item.requiresPhoto && !item.isCompleted && (
          <span className="mt-1 inline-block rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
            Exige foto
          </span>
        )}
        {item.notes && (
          <p className="mt-1 text-xs italic text-gray-500">{item.notes}</p>
        )}
        {item.media && item.media.length > 0 && (
          <p className="mt-1 text-[10px] text-gray-400">
            {item.media.length} {item.media.length === 1 ? 'foto' : 'fotos'}
          </p>
        )}
      </div>
    </div>
  );
}
