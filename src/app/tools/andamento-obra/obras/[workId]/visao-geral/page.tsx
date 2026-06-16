import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CalendarRange, ClipboardCheck, Images } from 'lucide-react';
import {
  createSupabaseServerClient,
  requireAuthUserId,
} from '@/lib/supabaseServer';
import { getWorkProjectSnapshot } from '@/services/works/getWorkProjectSnapshot';
import { getWorkPdfSignedUrl } from '@/services/works/getWorkPdfSignedUrl';
import { getWorkById } from '@/services/works/getWorkById';
import { getPoleInstallations } from '@/services/works/getPoleInstallations';
import { getPoleInstallationSignedUrls } from '@/services/works/getPoleInstallationSignedUrls';
import { ProjectOverviewSummary } from '@/components/andamento-obra/works/ProjectOverviewSummary';
import { WorkCanvas } from '@/components/andamento-obra/works/canvas/WorkCanvas';
import { CanvasEmptyState } from '@/components/andamento-obra/works/canvas/CanvasEmptyState';

interface VisaoGeralPageProps {
  params: Promise<{ workId: string }>;
}

/**
 * Aba "Visao Geral" da obra.
 *
 * Layout em duas colunas (>=lg):
 *   - Principal (~70%): WorkCanvas com PDF + camada de projeto + camada de
 *     execucao (Bloco 7) com pins de instalacoes em campo.
 *   - Lateral (~30%): ProjectOverviewSummary compacto + atalhos
 *
 * Mobile (<lg): pilha vertical, canvas com altura controlada.
 *
 * Carregamento (Server Component):
 *   - Snapshot completo via getWorkProjectSnapshot (RLS via cookies)
 *   - URL assinada do PDF via getWorkPdfSignedUrl (service role, TTL 30min)
 *   - Instalacoes ativas + URLs assinadas (Bloco 7)
 *   - Nomes dos gerentes que marcaram pra exibir tooltip/painel
 *
 * O `[workId]/layout.tsx` ja carrega `getWorkProjectPostsCount` e
 * `getInstallationsCountByWork` para os KPIs do header.
 */
export default async function VisaoGeralPage({ params }: VisaoGeralPageProps) {
  const { workId } = await params;
  const supabase = await createSupabaseServerClient();

  let viewerUserId: string;
  try {
    viewerUserId = await requireAuthUserId(supabase);
  } catch {
    redirect('/');
  }

  const [bundle, work, installations] = await Promise.all([
    getWorkProjectSnapshot(supabase, workId),
    getWorkById(supabase, workId),
    getPoleInstallations(supabase, workId),
  ]);

  if (!bundle) {
    return (
      <CanvasEmptyState
        variant={
          work?.budgetId === null
            ? 'no-snapshot-from-zero'
            : 'no-snapshot-with-budget'
        }
      />
    );
  }

  const planKind = derivePlanKind(bundle.snapshot.pdfStoragePath);

  const [planSignedUrl, installationSignedUrls, creatorNames] = await Promise.all([
    bundle.snapshot.pdfStoragePath
      ? getWorkPdfSignedUrl(bundle.snapshot.pdfStoragePath)
      : Promise.resolve(null),
    getPoleInstallationSignedUrls(
      installations.flatMap((i) => i.media.map((m) => m.storagePath)),
    ),
    loadCreatorNames(supabase, installations.map((i) => i.createdBy)),
  ]);

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1 lg:basis-[68%]">
        <div className="h-[70vh] min-h-[420px] lg:h-[78vh]">
          <WorkCanvas
            workId={workId}
            viewerUserId={viewerUserId}
            snapshot={bundle.snapshot}
            posts={bundle.posts}
            connections={bundle.connections}
            pdfSignedUrl={planSignedUrl}
            planKind={planKind}
            initialInstallations={installations}
            initialInstallationSignedUrls={installationSignedUrls}
            initialCreatorNames={creatorNames}
          />
        </div>
      </div>

      <aside className="flex w-full flex-col gap-3 lg:basis-[32%]">
        <ProjectOverviewSummary bundle={bundle} compact />
        <QuickLinks workId={workId} />
      </aside>
    </div>
  );
}

async function loadCreatorNames(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userIds: string[],
): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  const unique = Array.from(new Set(userIds.filter((id) => !!id)));
  if (unique.length === 0) return map;

  const { data } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', unique);

  if (!data) return map;
  for (const row of data as { id: string; full_name: string | null }[]) {
    const name = (row.full_name ?? '').trim();
    if (name.length > 0) map[row.id] = name;
  }
  return map;
}

function derivePlanKind(
  storagePath: string | null,
): 'pdf' | 'raster' | null {
  if (!storagePath) return null;
  return storagePath.toLowerCase().endsWith('.pdf') ? 'pdf' : 'raster';
}

function QuickLinks({ workId }: { workId: string }) {
  const base = `/tools/andamento-obra/obras/${workId}`;
  const items = [
    { href: `${base}/galeria`, label: 'Ver galeria', icon: Images },
    { href: `${base}/progresso`, label: 'Ver progresso', icon: CalendarRange },
    {
      href: `${base}/checklists`,
      label: 'Ver checklists',
      icon: ClipboardCheck,
    },
  ];
  return (
    <nav
      aria-label="Atalhos para outras abas da obra"
      className="rounded-2xl border border-gray-200 bg-white p-4"
    >
      <h2 className="text-sm font-semibold text-[#1D3140]">Atalhos</h2>
      <ul className="mt-3 space-y-1.5">
        {items.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-xs font-medium text-[#1D3140] transition-colors hover:border-[#1D3140] hover:bg-gray-50"
            >
              <Icon className="h-3.5 w-3.5 text-gray-500" aria-hidden="true" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
