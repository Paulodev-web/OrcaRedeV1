'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { useRealtimeChannel, type RealtimeEventConfig } from '@/lib/hooks/useRealtimeChannel';
import { sendTaskMessageAction } from '@/app/tarefas/_actions/tasks';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import { cn } from '@/lib/utils';
import type { TaskMemberRow, TaskMessageRow } from '@/types/tasks';

interface TaskChatProps {
  taskId: string;
  viewerId: string;
  initialMessages: TaskMessageRow[];
  members: TaskMemberRow[];
}

/**
 * Chat da task — generaliza `ChatRoom` (Andamento de Obra, 1:1 engenheiro↔
 * gerente) para N participantes via `task_members`. Mais simples que o
 * original: sem anexos (v1 é só texto — ver comentário da migration
 * `tarefas_chat`), e sem round-trip de hidratação porque o INSERT do Realtime
 * já traz todas as colunas que a UI precisa; só o nome do remetente vem do
 * `members` já carregado (quem manda mensagem já é, por definição, membro).
 */
export function TaskChat({ taskId, viewerId, initialMessages, members }: TaskChatProps) {
  const [messages, setMessages] = useState<TaskMessageRow[]>(initialMessages);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const nameByUserId = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) if (m.userName) map.set(m.userId, m.userName);
    return map;
  }, [members]);

  const handleInsert = useCallback(
    (payload: unknown) => {
      const row = (payload as { new?: Record<string, unknown> })?.new;
      if (!row?.id) return;

      const incoming: TaskMessageRow = {
        id: row.id as string,
        taskId: row.task_id as string,
        senderId: row.sender_id as string,
        senderName: nameByUserId.get(row.sender_id as string) ?? null,
        body: row.body as string,
        clientEventId: (row.client_event_id as string | null) ?? null,
        createdAt: row.created_at as string,
      };

      setMessages((prev) => {
        if (prev.some((m) => m.id === incoming.id)) return prev;
        // Substitui o placeholder otimista da própria mensagem, se houver.
        const optimisticIdx = prev.findIndex(
          (m) => m.clientEventId && m.clientEventId === incoming.clientEventId && m.id.startsWith('optimistic-'),
        );
        if (optimisticIdx >= 0) {
          const next = [...prev];
          next[optimisticIdx] = incoming;
          return next;
        }
        return [...prev, incoming];
      });
    },
    [nameByUserId],
  );

  const events: RealtimeEventConfig[] = useMemo(
    () => [
      {
        event: 'INSERT',
        table: 'task_messages',
        filter: `task_id=eq.${taskId}`,
        callback: handleInsert,
      },
    ],
    [taskId, handleInsert],
  );

  useRealtimeChannel({ channelName: `task:${taskId}:chat`, events });

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || sending) return;

    const clientEventId = globalThis.crypto.randomUUID();
    const optimistic: TaskMessageRow = {
      id: `optimistic-${clientEventId}`,
      taskId,
      senderId: viewerId,
      senderName: nameByUserId.get(viewerId) ?? 'Você',
      body: trimmed,
      clientEventId,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimistic]);
    setBody('');
    setSending(true);
    try {
      await sendTaskMessageAction(taskId, trimmed, clientEventId);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-[480px] flex-col overflow-hidden rounded-xl border border-gray-200 bg-surface">
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <p className="text-center text-xs text-gray-400">Nenhuma mensagem ainda.</p>
        ) : (
          messages.map((m) => {
            const mine = m.senderId === viewerId;
            return (
              <div key={m.id} className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
                {!mine && (
                  <span className="mb-0.5 px-1 text-[11px] font-medium text-gray-500">
                    {m.senderName ?? 'Alguém'}
                  </span>
                )}
                <div
                  className={cn(
                    'max-w-[80%] rounded-2xl px-3 py-2 text-sm',
                    mine ? 'bg-accent-600 text-white' : 'bg-gray-100 text-neutral-900',
                  )}
                >
                  {m.body}
                </div>
                <span className="mt-0.5 px-1 text-[10px] text-gray-400">
                  {formatRelativeTime(m.createdAt)}
                </span>
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-gray-100 p-3">
        <input
          type="text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Escreva uma mensagem..."
          className="h-10 flex-1 rounded-lg border border-gray-200/80 bg-surface/70 px-3 text-sm text-gray-900 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40"
        />
        <button
          type="submit"
          disabled={sending || body.trim().length === 0}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-600 text-white transition-colors hover:bg-accent-700 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
