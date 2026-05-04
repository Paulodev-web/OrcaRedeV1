import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { getCurrentUserProfile } from '@/services/people/getCurrentUserProfile';
import { getWorkById } from '@/services/works/getWorkById';
import { getWorkMilestones } from '@/services/works/getWorkMilestones';
import { getManagers } from '@/services/people/getManagers';
import { WorkHeader } from '@/components/andamento-obra/works/WorkHeader';
import { WorkTabsNav } from '@/components/andamento-obra/works/WorkTabsNav';

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ workId: string }>;
}

export default async function WorkDetailLayout({ children, params }: LayoutProps) {
  const { workId } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const profile = await getCurrentUserProfile(supabase, user.id);
  if (!profile || profile.role !== 'engineer') redirect('/');

  const work = await getWorkById(supabase, workId);
  if (!work) notFound();

  const [milestones, managers] = await Promise.all([
    getWorkMilestones(supabase, workId),
    getManagers(supabase, user.id),
  ]);

  return (
    <div>
      <WorkHeader work={work} milestones={milestones} managers={managers} />
      <WorkTabsNav workId={workId} />
      <main className="p-6 lg:p-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
