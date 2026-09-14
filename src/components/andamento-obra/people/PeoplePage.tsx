'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Grid3X3, Settings } from 'lucide-react';
import { CrewTable } from './CrewTable';
import type { CrewMemberRow } from '@/types/people';

interface PeoplePageProps {
  initialCrew: CrewMemberRow[];
}

export function PeoplePage({ initialCrew }: PeoplePageProps) {
  const [crew, setCrew] = useState<CrewMemberRow[]>(initialCrew);

  return (
    <div className="space-y-6">
      <div>
        <p className="flex flex-wrap items-center gap-1 text-xs text-gray-400">
          <Link
            href="/"
            className="inline-flex items-center gap-1 transition-colors hover:text-link"
          >
            <Grid3X3 className="h-3.5 w-3.5 shrink-0" />
            Portal
          </Link>
          <ChevronRight className="h-3 w-3 shrink-0 text-gray-300" aria-hidden />
          <Link
            href="/tools/andamento-obra"
            className="transition-colors hover:text-link"
          >
            Andamento de obra
          </Link>
          <ChevronRight className="h-3 w-3 shrink-0 text-gray-300" aria-hidden />
          <span className="font-medium text-gray-600">Equipe de campo</span>
        </p>
        <h1 className="mt-1 text-2xl font-bold text-neutral-900">Equipe de campo</h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-500">
          Quem vai atuar nas frentes de trabalho. São pessoas sem login: entram no diário, nas
          equipes e nos apontamentos, mas não acessam o sistema.
        </p>
      </div>

      <p className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
        <Settings className="h-4 w-4 shrink-0 text-gray-400" />
        Gerente de obra é conta com login, e agora se cadastra em
        <Link
          href="/configuracoes/organizacao"
          className="font-medium text-link underline-offset-2 hover:underline"
        >
          Configurações → Organização e equipe
        </Link>
        .
      </p>

      <CrewTable crew={crew} onChange={setCrew} />
    </div>
  );
}
