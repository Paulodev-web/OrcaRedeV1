import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from '@/lib/supabaseServer';
import { getWorkProjectSnapshot } from '@/services/works/getWorkProjectSnapshot';
import {
  DocumentsList,
  type DocumentRow,
} from '@/components/andamento-obra/works/DocumentsList';

const SIGNED_URL_TTL_SECONDS = 60 * 10; // 10 min

interface DocumentosPageProps {
  params: Promise<{ workId: string }>;
}

export default async function DocumentosPage({ params }: DocumentosPageProps) {
  const { workId } = await params;
  const supabase = await createSupabaseServerClient();
  const bundle = await getWorkProjectSnapshot(supabase, workId);

  const documents: DocumentRow[] = [];

  if (bundle?.snapshot.pdfStoragePath) {
    const serviceRole = createSupabaseServiceRoleClient();
    const { data: signed, error } = await serviceRole.storage
      .from('andamento-obra')
      .createSignedUrl(bundle.snapshot.pdfStoragePath, SIGNED_URL_TTL_SECONDS);

    documents.push({
      id: 'project-pdf',
      name: 'Projeto importado',
      uploadedAt: bundle.snapshot.importedAt,
      signedUrl: signed?.signedUrl ?? null,
      unavailableReason: error ? 'Não foi possível gerar link temporário.' : undefined,
    });
  }

  const emptyHint = bundle
    ? 'Este orçamento foi importado sem PDF/planta. Upload manual de outros documentos entra em fase futura.'
    : 'Nenhum documento ainda. Upload manual entra em fase futura.';

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-base font-semibold text-[#1D3140]">Documentos</h2>
        <p className="text-xs text-gray-500">
          Documentos da obra. Nesta fase, apenas o projeto importado (quando existir).
        </p>
      </header>
      <DocumentsList documents={documents} emptyHint={emptyHint} />
    </section>
  );
}
