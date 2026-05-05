'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface WorkTabsNavProps {
  workId: string;
  chatUnreadCount?: number;
  diarioPendingCount?: number;
  progressoPendingCount?: number;
}

const tabs = [
  { slug: 'visao-geral', label: 'Visão Geral' },
  { slug: 'chat', label: 'Chat' },
  { slug: 'diario', label: 'Diário' },
  { slug: 'progresso', label: 'Progresso' },
  { slug: 'equipe', label: 'Equipe' },
  { slug: 'checklists', label: 'Checklists' },
  { slug: 'alertas', label: 'Alertas' },
  { slug: 'galeria', label: 'Galeria' },
  { slug: 'documentos', label: 'Documentos' },
];

export function WorkTabsNav({
  workId,
  chatUnreadCount = 0,
  diarioPendingCount = 0,
  progressoPendingCount = 0,
}: WorkTabsNavProps) {
  const pathname = usePathname();
  const base = `/tools/andamento-obra/obras/${workId}`;

  return (
    <nav aria-label="Abas da obra" className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-6 py-2 lg:px-8">
        {tabs.map((tab) => {
          const href = `${base}/${tab.slug}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          let badgeCount = 0;
          if (tab.slug === 'chat') badgeCount = chatUnreadCount;
          else if (tab.slug === 'diario') badgeCount = diarioPendingCount;
          else if (tab.slug === 'progresso') badgeCount = progressoPendingCount;

          return (
            <Link
              key={tab.slug}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-[#64ABDE]/15 text-[#1D3140]'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-[#1D3140]',
              )}
            >
              <span>{tab.label}</span>
              {badgeCount > 0 && (
                <span
                  aria-label={`${badgeCount} pendente${badgeCount === 1 ? '' : 's'}`}
                  className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#64ABDE] px-1 text-[10px] font-bold text-white"
                >
                  {badgeCount > 9 ? '9+' : badgeCount}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
