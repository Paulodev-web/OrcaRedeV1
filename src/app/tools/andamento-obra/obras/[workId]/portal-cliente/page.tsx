import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import { ensureEngineerProfile } from '@/services/people/ensureEngineerProfile';
import { getWorkById } from '@/services/works/getWorkById';
import { getWorkClientPortal } from '@/services/works/getWorkClientPortal';
import { ClientPortalSettings } from '@/components/andamento-obra/works/portal/ClientPortalSettings';

interface PortalClientePageProps {
  params: Promise<{ workId: string }>;
}

export async function generateMetadata() {
  return { title: 'Portal do cliente' };
}

/**
 * A aba que trouxe o Portal do Engenheiro para dentro da obra.
 *
 * O módulo antigo era uma ilha: o engenheiro criava um acompanhamento a partir
 * do orçamento, marcava poste na mão e escrevia o que o cliente ia ler, tudo
 * sem nenhuma relação com a obra que o gerente executava no APK. Depois que o
 * espelho passou a derivar postes, progresso e timeline da obra, sobrou desse
 * módulo exatamente o que a execução não sabe dizer: como descrever a obra, o
 * que destacar agora, e quais fotos mostrar. É isso que mora aqui.
 *
 * Obra sem portal (nasceu sem orçamento de origem, ou o acompanhamento do
 * orçamento é legado e marcado à mão) mostra o estado vazio em vez de um
 * formulário que não teria onde salvar.
 */
export default async function PortalClientePage({ params }: PortalClientePageProps) {
  const { workId } = await params;

  const supabase = await createSupabaseServerClient();
  let userId: string;
  try {
    userId = await requireAuthUserId(supabase);
  } catch {
    redirect('/');
  }

  const profile = await ensureEngineerProfile(supabase, userId);
  if (!profile || profile.role !== 'engineer') redirect('/');

  const work = await getWorkById(supabase, workId);
  if (!work) notFound();

  const portal = await getWorkClientPortal(supabase, workId);

  if (!portal) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center">
        <h2 className="text-sm font-semibold text-neutral-900">
          Esta obra ainda não tem portal do cliente
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-xs text-gray-600">
          O portal nasce junto com a obra quando ela vem de um orçamento: é dele
          que saem a planta e os postes que o cliente enxerga. Obra criada do
          zero, ou cujo orçamento já tem um acompanhamento antigo marcado à mão,
          fica sem.
        </p>
      </div>
    );
  }

  return <ClientPortalSettings workId={workId} portal={portal} />;
}
