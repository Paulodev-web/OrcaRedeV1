'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRealtimeChannel, type RealtimeEventConfig } from '@/lib/hooks/useRealtimeChannel';
import { RealtimeStatusBanner } from '../shared/RealtimeStatusBanner';
import {
  type SendWorkMessageAttachmentInput,
  type WorkMessage,
  type WorkMessageSenderRole,
  type WorkStatus,
} from '@/types/works';
import {
  getMessageWithAttachments,
  getOlderWorkMessages,
  markMessagesAsRead,
  sendWorkMessage,
} from '@/actions/workMessages';
import { ChatComposer } from './ChatComposer';
import { ChatMessageList, type ChatMessageListHandle } from './ChatMessageList';

interface ChatRoomProps {
  workId: string;
  workName: string;
  managerName: string | null;
  workStatus: WorkStatus;
  viewerRole: WorkMessageSenderRole;
  viewerId: string;
  initialMessages: WorkMessage[];
  initialHasMore: boolean;
  initialSignedUrls: Record<string, string>;
}

export function ChatRoom({
  workId,
  workName,
  managerName,
  workStatus,
  viewerRole,
  viewerId,
  initialMessages,
  initialHasMore,
  initialSignedUrls,
}: ChatRoomProps) {
  const [messages, setMessages] = useState<WorkMessage[]>(initialMessages);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>(initialSignedUrls);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [pendingByMessageId, setPendingByMessageId] = useState<
    Record<string, 'pending' | 'error'>
  >({});

  const listRef = useRef<ChatMessageListHandle>(null);
  const messagesRef = useRef<WorkMessage[]>(initialMessages);
  messagesRef.current = messages;

  // -------------------------------------------------------------------------
  // Marca mensagens como lidas ao montar (idempotente).
  // -------------------------------------------------------------------------
  useEffect(() => {
    void markMessagesAsRead(workId);
  }, [workId]);

  // -------------------------------------------------------------------------
  // Hidrata uma mensagem nova (recebida via Realtime ou enviada por mim)
  // buscando attachments + signed URLs via Server Action.
  // -------------------------------------------------------------------------
  const hydrateNewMessage = useCallback(
    async (messageId: string) => {
      const result = await getMessageWithAttachments(workId, messageId);
      if (!result.success || !result.data) return;

      const { message, signedUrls: urls } = result.data;
      setSignedUrls((prev) => ({ ...prev, ...urls }));
      setMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) {
          return prev.map((m) => (m.id === message.id ? message : m));
        }
        const next = [...prev, message].sort((a, b) =>
          a.createdAt.localeCompare(b.createdAt),
        );
        return next;
      });

      const wasAtBottom = listRef.current?.isAtBottom() ?? true;
      if (wasAtBottom) {
        requestAnimationFrame(() => listRef.current?.scrollToBottom(true));
      }

      if (message.senderId !== viewerId) {
        void markMessagesAsRead(workId);
      }
    },
    [workId, viewerId],
  );

  // -------------------------------------------------------------------------
  // Realtime via useRealtimeChannel hook
  // -------------------------------------------------------------------------
  const handleRealtimeInsert = useCallback(
    (payload: unknown) => {
      const row = (payload as { new?: { id?: string } })?.new;
      if (!row?.id) return;
      if (messagesRef.current.some((m) => m.id === row.id)) return;
      void hydrateNewMessage(row.id);
    },
    [hydrateNewMessage],
  );

  const realtimeEvents: RealtimeEventConfig[] = useMemo(
    () => [
      {
        event: 'INSERT',
        table: 'work_messages',
        filter: `work_id=eq.${workId}`,
        callback: handleRealtimeInsert,
      },
    ],
    [workId, handleRealtimeInsert],
  );

  const { status: realtimeStatus } = useRealtimeChannel({
    channelName: `work:${workId}:chat`,
    events: realtimeEvents,
  });

  // -------------------------------------------------------------------------
  // Carregar mensagens anteriores (paginacao reversa)
  // -------------------------------------------------------------------------
  async function onLoadOlder() {
    if (loadingOlder || messages.length === 0) return;
    const oldest = messages[0];
    setLoadingOlder(true);
    try {
      const result = await getOlderWorkMessages(workId, oldest.createdAt);
      if (!result.success || !result.data) return;
      const { items, hasMore: more, signedUrls: urls } = result.data;
      if (items.length > 0) {
        setMessages((prev) => {
          const ids = new Set(prev.map((m) => m.id));
          const merged = [...items.filter((i) => !ids.has(i.id)), ...prev].sort((a, b) =>
            a.createdAt.localeCompare(b.createdAt),
          );
          return merged;
        });
        setSignedUrls((prev) => ({ ...prev, ...urls }));
      }
      setHasMore(more);
    } finally {
      setLoadingOlder(false);
    }
  }

  // -------------------------------------------------------------------------
  // Enviar mensagem (otimistic + Server Action)
  // -------------------------------------------------------------------------
  async function onSend(input: {
    body: string;
    attachments: SendWorkMessageAttachmentInput[];
    clientEventId: string;
  }) {
    const optimisticId = globalThis.crypto.randomUUID();
    const now = new Date().toISOString();
    const optimisticMessage: WorkMessage = {
      id: optimisticId,
      workId,
      senderId: viewerId,
      senderRole: viewerRole,
      body: input.body.length > 0 ? input.body : null,
      clientEventId: input.clientEventId,
      readByEngineerAt: null,
      readByManagerAt: null,
      createdAt: now,
      attachments: input.attachments.map((a, idx) => ({
        id: `${optimisticId}-att-${idx}`,
        messageId: optimisticId,
        workId,
        kind: a.kind,
        storagePath: a.storagePath,
        mimeType: a.mimeType ?? null,
        sizeBytes: a.sizeBytes ?? null,
        durationSeconds: null,
        width: null,
        height: null,
        thumbnailPath: null,
        createdAt: now,
      })),
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setPendingByMessageId((prev) => ({ ...prev, [optimisticId]: 'pending' }));
    requestAnimationFrame(() => listRef.current?.scrollToBottom(true));

    const result = await sendWorkMessage({
      workId,
      body: input.body,
      attachments: input.attachments,
      clientEventId: input.clientEventId,
    });

    if (!result.success || !result.data) {
      setPendingByMessageId((prev) => ({ ...prev, [optimisticId]: 'error' }));
      throw new Error(result.success ? 'Resposta inválida do servidor.' : result.error);
    }

    const realId = result.data.messageId;

    // Substitui placeholder otimista pelo id real
    setMessages((prev) =>
      prev.map((m) =>
        m.id === optimisticId
          ? { ...m, id: realId, attachments: m.attachments.map((a) => ({ ...a, messageId: realId })) }
          : m,
      ),
    );
    setPendingByMessageId((prev) => {
      const next = { ...prev };
      delete next[optimisticId];
      return next;
    });

    // Hidrata a mensagem real (vai trazer signed URLs reais para os anexos)
    void hydrateNewMessage(realId);
  }

  const composerDisabled = workStatus === 'cancelled';
  const composerDisabledMessage =
    workStatus === 'cancelled'
      ? 'Obra cancelada — comunicação encerrada.'
      : undefined;

  return (
    <div className="flex h-[calc(100vh-220px)] min-h-[420px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <ChatHeader managerName={managerName} workName={workName} workStatus={workStatus} />

      <RealtimeStatusBanner status={realtimeStatus} />

      <ChatMessageList
        ref={listRef}
        messages={messages}
        signedUrls={signedUrls}
        viewerRole={viewerRole}
        hasMore={hasMore}
        loadingOlder={loadingOlder}
        onLoadOlder={() => void onLoadOlder()}
        pendingStatusByMessageId={pendingByMessageId}
      />

      <ChatComposer
        workId={workId}
        disabled={composerDisabled}
        disabledMessage={composerDisabledMessage}
        onSend={onSend}
      />
    </div>
  );
}

function ChatHeader({
  managerName,
  workName,
  workStatus,
}: {
  managerName: string | null;
  workName: string;
  workStatus: WorkStatus;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#64ABDE]/15 text-[#1D3140]">
        <User className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold text-[#1D3140]">
          {managerName ?? 'Sem gerente atribuído'}
        </h2>
        <p className="truncate text-[11px] text-gray-500">{workName}</p>
      </div>
      {workStatus === 'cancelled' && (
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium uppercase text-red-700 ring-1 ring-red-200',
          )}
        >
          <AlertTriangle className="h-3 w-3" /> Cancelada
        </span>
      )}
    </div>
  );
}
