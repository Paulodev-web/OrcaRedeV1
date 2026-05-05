import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import { getCurrentUserProfile } from '@/services/people/getCurrentUserProfile';
import { getWorkById } from '@/services/works/getWorkById';
import { getWorkMessages } from '@/services/works/getWorkMessages';
import { getAttachmentSignedUrls } from '@/services/works/getAttachmentSignedUrls';
import { markMessagesAsRead } from '@/actions/workMessages';
import { ChatRoom } from '@/components/andamento-obra/works/chat/ChatRoom';
import type { WorkMessageSenderRole } from '@/types/works';

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

  const profile = await getCurrentUserProfile(supabase, userId);
  if (!profile || profile.role !== 'engineer') {
    redirect('/');
  }

  const { data: memberRow } = await supabase
    .from('work_members')
    .select('role')
    .eq('work_id', workId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!memberRow) {
    notFound();
  }
  const viewerRole = memberRow.role as WorkMessageSenderRole;

  const work = await getWorkById(supabase, workId);
  if (!work) {
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
