import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import { ensureEngineerProfile } from '@/services/people/ensureEngineerProfile';
import { getWorkById } from '@/services/works/getWorkById';
import { getViewerWorkRole } from '@/services/works/getViewerWorkRole';
import { getWorkMessages } from '@/services/works/getWorkMessages';
import { getAttachmentSignedUrls } from '@/services/works/getAttachmentSignedUrls';
import { markMessagesAsRead } from '@/actions/workMessages';
import { ChatRoom } from '@/components/andamento-obra/works/chat/ChatRoom';

interface ChatPageProps {
  params: Promise<{ workId: string }>;
}

export default async function ChatPage({ params }: ChatPageProps) {
  const { workId } = await params;

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

  // Marca mensagens como lidas no carregamento (idempotente).
  // Realiza no servidor para que a contagem ja venha zerada na proxima visita.
  await markMessagesAsRead(workId);

  const { items, hasMore } = await getWorkMessages(supabase, workId);
  const orderedItems = [...items].reverse();

  const paths = orderedItems.flatMap((m) => m.attachments.map((a) => a.storagePath));
  const signedUrls = await getAttachmentSignedUrls(paths);

  return (
    <ChatRoom
      workId={workId}
      workName={work.name}
      managerName={work.managerName}
      workStatus={work.status}
      viewerRole={viewerRole}
      viewerId={userId}
      initialMessages={orderedItems}
      initialHasMore={hasMore}
      initialSignedUrls={signedUrls}
    />
  );
}
