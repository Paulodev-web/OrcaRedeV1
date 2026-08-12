import type { Metadata } from 'next';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { TarefasChrome } from '@/components/tarefas/TarefasChrome';
import { TarefasModuleHeaderBell } from '@/components/tarefas/TarefasModuleHeaderBell';
import { SectorTabs } from '@/components/tarefas/SectorTabs';
import { Board } from '@/components/tarefas/Board';
import { CreateTaskDialog } from '@/components/tarefas/CreateTaskDialog';
import { getBoardData, getBudgetsForTaskPicker, getDefaultSector } from './_data/tasks';
import { TASK_SECTORS, type TaskSector } from '@/types/tasks';

export const metadata: Metadata = {
  title: 'Tarefas — OrcaRede',
  description: 'Quadro de trabalho entre Comercial, Engenharia, Compras e Execução.',
};

function resolveSector(param: string | undefined, fallback: TaskSector | null): TaskSector {
  if (param && (TASK_SECTORS as readonly string[]).includes(param)) return param as TaskSector;
  return fallback ?? 'comercial';
}

export default async function TarefasPage({
  searchParams,
}: {
  searchParams: Promise<{ setor?: string }>;
}) {
  const { setor } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const [defaultSector, budgets] = await Promise.all([
    getDefaultSector(supabase),
    getBudgetsForTaskPicker(supabase),
  ]);

  const sector = resolveSector(setor, defaultSector);
  const columns = await getBoardData(supabase, sector);

  return (
    <TarefasChrome
      title="Tarefas"
      description="Handoff de trabalho entre setores, vinculado ao orçamento."
      breadcrumb={[{ label: 'Tarefas' }]}
      actions={
        <div className="flex items-center gap-2">
          <TarefasModuleHeaderBell />
          <CreateTaskDialog budgets={budgets} defaultSector={sector} />
        </div>
      }
      tabs={<SectorTabs activeSector={sector} />}
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Board columns={columns} />
      </div>
    </TarefasChrome>
  );
}
