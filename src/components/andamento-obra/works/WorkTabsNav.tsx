'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface WorkTabsNavProps {
  workId: string;
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

export function WorkTabsNav({ workId }: WorkTabsNavProps) {
  const pathname = usePathname();
  const base = `/tools/andamento-obra/obras/${workId}`;

  return (
    <nav
      aria-label="Abas da obra"
      className="border-b border-gray-200 bg-white"
    >
      <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-6 py-2 lg:px-8">
        {tabs.map((tab) => {
          const href = `${base}/${tab.slug}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={tab.slug}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-[#64ABDE]/15 text-[#1D3140]'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-[#1D3140]',
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
