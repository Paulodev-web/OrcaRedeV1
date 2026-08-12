import Link from 'next/link';
import { cn } from '@/lib/utils';
import { TASK_SECTORS, TASK_SECTOR_LABELS, type TaskSector } from '@/types/tasks';

interface SectorTabsProps {
  activeSector: TaskSector;
}

/**
 * Alterna o board entre os 4 setores via `?setor=`. Navegação simples (Link),
 * não estado client — a página já é Server Component e recarrega os dados do
 * setor escolhido a cada troca.
 */
export function SectorTabs({ activeSector }: SectorTabsProps) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg bg-gray-100 p-1">
      {TASK_SECTORS.map((sector) => {
        const isActive = sector === activeSector;
        return (
          <Link
            key={sector}
            href={`/tarefas?setor=${sector}`}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-surface text-neutral-900 shadow-sm'
                : 'text-gray-500 hover:text-neutral-900',
            )}
          >
            {TASK_SECTOR_LABELS[sector]}
          </Link>
        );
      })}
    </div>
  );
}
