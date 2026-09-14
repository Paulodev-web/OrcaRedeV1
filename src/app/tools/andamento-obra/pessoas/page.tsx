import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient, getCachedAuthUser } from '@/lib/supabaseServer';
import { ensureEngineerProfile } from '@/services/people/ensureEngineerProfile';
import { getCrewMembers } from '@/services/people/getCrewMembers';
import { PeoplePage } from '@/components/andamento-obra/people/PeoplePage';

export const metadata: Metadata = {
  title: 'Equipe de campo — Andamento de Obra',
  description: 'Cadastre os membros de equipe que atuam nas frentes de trabalho.',
};

export default async function PessoasPage() {
  const supabase = await createSupabaseServerClient();
  const user = await getCachedAuthUser(supabase);

  if (!user) {
    redirect('/');
  }

  const profile = await ensureEngineerProfile(supabase, user.id);

  if (!profile || profile.role !== 'engineer') {
    redirect('/');
  }

  const crew = await getCrewMembers(supabase, user.id);

  return (
    <main className="p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <PeoplePage initialCrew={crew} />
      </div>
    </main>
  );
}
