'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { WorkCard } from './WorkCard';
import type { WorksGrouped, WorkWithManager } from '@/types/works';
import type { ManagerRow } from '@/types/people';

/** Impedimentos por obra, já agregados em batch pela page. */
export interface WorkImpedimentCounts {
  /** `critical` ou `high` ainda em aberto. */
  graves: number;
  /** Tudo que não foi encerrado, inclusive o resolvido em campo. */
  ativos: number;
  /** Resolvidos em campo, esperando o engenheiro confirmar. */
  resolvidos: number;
}

interface AcompanhamentoCenterProps {
  grouped: WorksGrouped;
  managers: ManagerRow[];
  unreadCountsByWorkId?: Record<string, number>;
  impedimentCountsByWorkId?: Record<string, WorkImpedimentCounts>;
  /** Último registro de execução por obra, para sinalizar obra em silêncio. */
  lastRecordByWorkId?: Record<string, string | null>;
}

interface GroupConfig {
  key: keyof WorksGrouped;
  label: string;
  emoji: string;
  defaultOpen: boolean;
  emptyHint: string;
}

const GROUPS: GroupConfig[] = [
  {
    key: 'red',
    label: 'Precisa de você agora',
    emoji: '🔴',
    defaultOpen: true,
    emptyHint: 'Nenhuma obra parada.',
  },
  {
    key: 'yellow',
    label: 'Aguardando revisão',
    emoji: '🟡',
    defaultOpen: true,
    emptyHint: 'Nada esperando sua decisão.',
  },
  {
    key: 'green',
    label: 'Em andamento normal',
    emoji: '🟢',
    defaultOpen: true,
    emptyHint: 'Nenhuma obra em andamento.',
  },
  {
    key: 'gray',
    label: 'Pausadas / Concluídas',
    emoji: '⚪',
    defaultOpen: false,
    emptyHint: 'Nenhuma obra pausada ou concluída.',
  },
];

export function AcompanhamentoCenter({
  grouped,
  managers,
  unreadCountsByWorkId,
  impedimentCountsByWorkId,
  lastRecordByWorkId,
}: AcompanhamentoCenterProps) {
  const [openKey, setOpenKey] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(GROUPS.map((g) => [g.key, g.defaultOpen])),
  );

  const toggle = (key: string) =>
    setOpenKey((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="space-y-3">
      {GROUPS.map((group) => {
        const items: WorkWithManager[] = grouped[group.key];
        const open = openKey[group.key];
        return (
          <section
            key={group.key}
            className="rounded-xl border border-gray-200 bg-surface shadow-sm"
          >
            <button
              type="button"
              onClick={() => toggle(group.key)}
              aria-expanded={open}
              className="flex w-full items-center justify-between gap-3 rounded-t-xl px-4 py-3 text-left hover:bg-gray-50"
            >
              <div className="flex items-center gap-2">
                <span className="text-base" aria-hidden>
                  {group.emoji}
                </span>
                <span className="text-sm font-semibold text-neutral-900">
                  {group.label}
                </span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                  {items.length}
                </span>
              </div>
              {open ? (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-400" />
              )}
            </button>
            {open && (
              <div className="border-t border-gray-100 p-4">
                {items.length === 0 ? (
                  <p className="text-xs text-gray-400">{group.emptyHint}</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {items.map((work) => {
                      const impedimentos = impedimentCountsByWorkId?.[work.id];
                      return (
                        <WorkCard
                          key={work.id}
                          work={work}
                          managers={managers}
                          unreadCount={unreadCountsByWorkId?.[work.id] ?? 0}
                          impedimentosGraves={impedimentos?.graves ?? 0}
                          impedimentosAtivos={impedimentos?.ativos ?? 0}
                          impedimentosResolvidos={impedimentos?.resolvidos ?? 0}
                          lastRecordAt={lastRecordByWorkId?.[work.id] ?? null}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
