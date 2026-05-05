import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { getWorkById } from '@/services/works/getWorkById';
import { getWorkGalleryItems } from '@/services/works/getWorkGalleryItems';
import { GalleryView } from '@/components/andamento-obra/works/galeria/GalleryView';
import { GALLERY_ITEMS_LIMIT } from '@/types/works';

interface GaleriaPageProps {
  params: Promise<{ workId: string }>;
}

/**
 * Aba "Galeria" da obra (primeira versao funcional - Bloco 7).
 *
 * Agrega midias de quatro origens em uma unica lista cronologica:
 *  - chat (work_message_attachments)
 *  - diario (work_daily_log_media)
 *  - marcos (work_milestone_event_media)
 *  - instalacoes em campo (work_pole_installation_media)
 *
 * Limite desta fase: GALLERY_ITEMS_LIMIT itens mais recentes (sem paginacao
 * real - documentado como divida tecnica).
 */
export default async function GaleriaPage({ params }: GaleriaPageProps) {
  const { workId } = await params;
  const supabase = await createSupabaseServerClient();

  const work = await getWorkById(supabase, workId);
  if (!work) notFound();

  const items = await getWorkGalleryItems(supabase, workId);
  const truncated = items.length >= GALLERY_ITEMS_LIMIT;

  return <GalleryView items={items} truncated={truncated} />;
}
