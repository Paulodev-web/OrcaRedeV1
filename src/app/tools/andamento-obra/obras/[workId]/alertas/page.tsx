import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import { getWorkAlerts } from '@/services/works/getWorkAlerts';
import { getViewerWorkRole } from '@/services/works/getViewerWorkRole';
import { AlertsList } from '@/components/andamento-obra/works/alertas/AlertsList';

interface Props {
  params: Promise<{ workId: string }>;
}

export async function generateMetadata() {
  return { title: 'Alertas da Obra' };
}

export default async function WorkAlertasPage({ params }: Props) {
  const { workId } = await params;
  const supabase = await createSupabaseServerClient();
  const userId = await requireAuthUserId(supabase);

  const [alertsResult, viewerRole] = await Promise.all([
    getWorkAlerts(supabase, workId),
    getViewerWorkRole(supabase, workId, userId),
  ]);

  const role = viewerRole ?? 'engineer';

  return (
    <div className="mx-auto max-w-4xl px-6 py-6 lg:px-8">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-[#1D3140]">Alertas</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          {alertsResult.items.length} {alertsResult.items.length === 1 ? 'alerta registrado' : 'alertas registrados'}
        </p>
      </div>

      <AlertsList alerts={alertsResult.items} workId={workId} role={role} initialHasMore={alertsResult.hasMore} />
    </div>
  );
}
