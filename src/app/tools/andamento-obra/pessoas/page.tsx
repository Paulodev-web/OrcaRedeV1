import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { getCurrentUserProfile } from '@/services/people/getCurrentUserProfile';
import { getManagers } from '@/services/people/getManagers';
import { getCrewMembers } from '@/services/people/getCrewMembers';
import { PeoplePage } from '@/components/andamento-obra/people/PeoplePage';

export const metadata: Metadata = {
  title: 'Pessoas — Andamento de Obra',
  description: 'Gerencie gerentes de obra e membros de equipe.',
};

export default async function PessoasPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/');
  }

  const profile = await getCurrentUserProfile(supabase, user.id);

  if (!profile || profile.role !== 'engineer') {
    redirect('/');
  }

  const [managers, crew] = await Promise.all([
    getManagers(supabase, user.id),
    getCrewMembers(supabase, user.id),
  ]);

  return (
    <main className="p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <PeoplePage initialManagers={managers} initialCrew={crew} />
      </div>
    </main>
  );
}
