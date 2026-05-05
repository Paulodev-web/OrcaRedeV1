'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Grid3X3 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ManagersTable } from './ManagersTable';
import { CrewTable } from './CrewTable';
import type { CrewMemberRow, ManagerRow } from '@/types/people';

interface PeoplePageProps {
  initialManagers: ManagerRow[];
  initialCrew: CrewMemberRow[];
}

export function PeoplePage({ initialManagers, initialCrew }: PeoplePageProps) {
  const [managers, setManagers] = useState<ManagerRow[]>(initialManagers);
  const [crew, setCrew] = useState<CrewMemberRow[]>(initialCrew);

  return (
    <div className="space-y-6">
      <div>
        <p className="flex flex-wrap items-center gap-1 text-xs text-gray-400">
          <Link
            href="/"
            className="inline-flex items-center gap-1 transition-colors hover:text-[#64ABDE]"
          >
            <Grid3X3 className="h-3.5 w-3.5 shrink-0" />
            Portal
          </Link>
          <ChevronRight className="h-3 w-3 shrink-0 text-gray-300" aria-hidden />
          <Link
            href="/tools/andamento-obra"
            className="transition-colors hover:text-[#64ABDE]"
          >
            Andamento de obra
          </Link>
          <ChevronRight className="h-3 w-3 shrink-0 text-gray-300" aria-hidden />
          <span className="font-medium text-gray-600">Pessoas</span>
        </p>
        <h1 className="mt-1 text-2xl font-bold text-[#1D3140]">Pessoas</h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-500">
          Cadastre gerentes de obra (com login no sistema) e membros de equipe que vão atuar nas
          frentes de trabalho.
        </p>
      </div>

      <Tabs defaultValue="managers" className="w-full">
        <TabsList>
          <TabsTrigger value="managers">Gerentes de Obra</TabsTrigger>
          <TabsTrigger value="crew">Equipe</TabsTrigger>
        </TabsList>

        <TabsContent value="managers">
          <ManagersTable managers={managers} onChange={setManagers} />
        </TabsContent>

        <TabsContent value="crew">
          <CrewTable crew={crew} onChange={setCrew} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
