import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import { ensureEngineerProfile } from '@/services/people/ensureEngineerProfile';
import { getWorkById } from '@/services/works/getWorkById';
import { getViewerWorkRole } from '@/services/works/getViewerWorkRole';
import { getWorkDays } from '@/services/works/getWorkDays';
import { getAttachmentSignedUrls } from '@/services/works/getAttachmentSignedUrls';
import { DiaADiaView } from '@/components/andamento-obra/works/dia-a-dia/DiaADiaView';

interface PageProps {
  params: Promise<{ workId: string }>;
  searchParams: Promise<{ dia?: string }>;
}

/**
 * O diário que ninguém escreve.
 *
 * Assina só as fotos do dia aberto. Uma obra com meses de execução tem centenas
 * de mídias, e assinar todas para mostrar uma grade de nove seria pagar caro por
 * nada.
 */
export default async function DiaADiaPage({ params, searchParams }: PageProps) {
  const [{ workId }, { dia }] = await Promise.all([params, searchParams]);

  const supabase = await createSupabaseServerClient();
  let userId: string;
  try {
    userId = await requireAuthUserId(supabase);
  } catch {
    redirect('/');
  }

  const profile = await ensureEngineerProfile(supabase, userId);
  if (!profile || profile.role !== 'engineer') {
    redirect('/');
  }

  const [viewerRole, work] = await Promise.all([
    getViewerWorkRole(supabase, workId, userId),
    getWorkById(supabase, workId),
  ]);
  if (!viewerRole || !work) {
    notFound();
  }

  const dias = await getWorkDays(supabase, workId);
  const selecionado = dias.find((d) => d.date === dia) ?? dias[0] ?? null;
  const signedUrls = selecionado
    ? await getAttachmentSignedUrls(selecionado.entries.flatMap((e) => e.mediaPaths))
    : {};

  return (
    <DiaADiaView
      workId={workId}
      dias={dias}
      selecionado={selecionado}
      signedUrls={signedUrls}
    />
  );
}
