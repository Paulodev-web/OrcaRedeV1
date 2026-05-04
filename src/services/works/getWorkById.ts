import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkStatus, WorkWithManager } from '@/types/works';

interface RawRow {
  id: string;
  engineer_id: string;
  manager_id: string | null;
  budget_id: string | null;
  name: string;
  client_name: string | null;
  utility_company: string | null;
  address: string | null;
  status: WorkStatus;
  started_at: string | null;
  expected_end_at: string | null;
  completed_at: string | null;
  last_activity_at: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export async function getWorkById(
  supabase: SupabaseClient,
  workId: string,
): Promise<WorkWithManager | null> {
  const { data, error } = await supabase
    .from('works')
    .select(
      `id, engineer_id, manager_id, budget_id, name, client_name, utility_company,
       address, status, started_at, expected_end_at, completed_at, last_activity_at,
       notes, created_at, updated_at`,
    )
    .eq('id', workId)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as unknown as RawRow;

  let managerName: string | null = null;
  if (row.manager_id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', row.manager_id)
      .maybeSingle();
    managerName = (profile?.full_name as string | null) ?? null;
  }

  return {
    id: row.id,
    engineerId: row.engineer_id,
    managerId: row.manager_id,
    budgetId: row.budget_id,
    name: row.name,
    clientName: row.client_name,
    utilityCompany: row.utility_company,
    address: row.address,
    status: row.status,
    startedAt: row.started_at,
    expectedEndAt: row.expected_end_at,
    completedAt: row.completed_at,
    lastActivityAt: row.last_activity_at,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    managerName,
  };
}
