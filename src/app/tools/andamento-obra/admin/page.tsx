import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { getCurrentUserProfile } from '@/services/people/getCurrentUserProfile';
import { AdminPanel } from './AdminPanel';

export const metadata: Metadata = {
  title: 'Admin — Andamento de Obra',
  description: 'Ferramentas administrativas do módulo.',
};

export default async function AdminPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/');

  const profile = await getCurrentUserProfile(supabase, user.id);
  if (!profile || profile.role !== 'engineer') redirect('/');

  return (
    <main className="p-6 lg:p-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6">
          <h1 className="text-xl font-bold text-[#1D3140]">Administração</h1>
          <p className="mt-1 text-xs text-gray-500">
            Ferramentas de manutenção do módulo Andamento de Obra.
          </p>
        </header>
        <AdminPanel />
      </div>
    </main>
  );
}
