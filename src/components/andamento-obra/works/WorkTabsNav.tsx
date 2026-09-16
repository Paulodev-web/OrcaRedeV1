'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface WorkTabsNavProps {
  workId: string;
  chatUnreadCount?: number;
  marcosPendingCount?: number;
  /** Dono/admin da organização — só quem pode reatribuir a obra vê a aba "Responsável". */
  canManageOrg?: boolean;
}

/**
 * Tres destinos, nao nove.
 *
 * O que saiu daqui nao foi apagado: checklists, equipe, galeria, documentos e o
 * diario com aprovacao continuam no codigo e nas rotas, so nao tem mais porta.
 * O que ficou e o que o engenheiro faz todo dia: olhar a obra crescer, conversar
 * com o gerente e aprovar etapa.
 *
 * Alertas nao esta aqui de proposito: virou faixa no topo (WorkAlertBanner).
 *
 * "Responsavel" e condicional (nao entra no array fixo): so aparece pra quem
 * pode usa-la (dono/admin da org). Pra quem nao pode, a rota continua de pe,
 * sem porta — mesmo tratamento que equipe/checklists ja recebem.
 */
const tabs = [
  { slug: 'visao-geral', label: 'Obra' },
  { slug: 'dia-a-dia', label: 'Dia a dia' },
  { slug: 'chat', label: 'Conversa' },
  { slug: 'progresso', label: 'Marcos' },
];

export function WorkTabsNav({
  workId,
  chatUnreadCount = 0,
  marcosPendingCount = 0,
  canManageOrg = false,
}: WorkTabsNavProps) {
  const pathname = usePathname();
  const base = `/tools/andamento-obra/obras/${workId}`;
  const allTabs = canManageOrg ? [...tabs, { slug: 'responsavel', label: 'Responsável' }] : tabs;

  return (
    <nav aria-label="Abas da obra" className="border-b border-gray-200 bg-surface">
      <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-6 py-2 lg:px-8">
        {allTabs.map((tab) => {
          const href = `${base}/${tab.slug}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          let badgeCount = 0;
          if (tab.slug === 'chat') badgeCount = chatUnreadCount;
          else if (tab.slug === 'progresso') badgeCount = marcosPendingCount;

          return (
            <Link
              key={tab.slug}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-accent-500/15 text-neutral-900'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-neutral-900',
              )}
            >
              <span>{tab.label}</span>
              {badgeCount > 0 && (
                <span
                  aria-label={`${badgeCount} pendente${badgeCount === 1 ? '' : 's'}`}
                  className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-600 px-1 text-[10px] font-bold text-white"
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
