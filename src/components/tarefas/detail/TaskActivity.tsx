'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  CalendarClock,
  CornerUpLeft,
  Flag,
  Link2,
  Loader2,
  Lock,
  Paperclip,
  Plus,
  Send,
  Unlock,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import { useRealtimeChannel, type RealtimeEventConfig } from '@/lib/hooks/useRealtimeChannel';
import { getTaskAttachmentUrlsAction, sendTaskMessageAction } from '@/app/tarefas/_actions/tasks';
import { uploadTaskFiles } from './uploadTaskFiles';
import {
  TASK_STAGE_LABELS,
  type TaskBoardMember,
  type TaskEventRow,
  type TaskMessageRow,
} from '@/types/tasks';

interface TaskActivityProps {
  taskId: string;
  orgId: string;
  viewerId: string;
  events: TaskEventRow[];
  initialMessages: TaskMessageRow[];
  members: TaskBoardMember[];
  onChanged: () => void;
}

type FeedItem =
  | { kind: 'event'; at: string; event: TaskEventRow }
  | { kind: 'message'; at: string; message: TaskMessageRow };

/**
 * Uma linha do tempo só, misturando mensagens e eventos.
 *
 * A versão anterior tinha duas caixas separadas — "Histórico" de um lado,
 * "Conversa" do outro — e era impossível saber que a pergunta "falta a carta da
 * RGE?" veio DEPOIS do handoff. Trello e Linear resolvem isso com um fio único,
 * e é a única forma de a conversa ter contexto.
 */
export function TaskActivity({
  taskId,
  orgId,
  viewerId,
  events,
  initialMessages,
  members,
  onChanged,
}: TaskActivityProps) {
  const [messages, setMessages] = useState<TaskMessageRow[]>(initialMessages);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const shouldScrollRef = useRef(true);

  useEffect(() => setMessages(initialMessages), [initialMessages]);

  const nameByUserId = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) map.set(m.userId, m.name);
    return map;
  }, [members]);

  // URLs assinadas dos anexos que aparecem dentro das bolhas.
  useEffect(() => {
    const paths = messages.flatMap((m) => m.attachments.map((a) => a.storagePath));
    if (paths.length === 0) return;
    let cancelled = false;
    void getTaskAttachmentUrlsAction(paths).then((result) => {
      if (!cancelled && result.success) setUrls((prev) => ({ ...prev, ...(result.data ?? {}) }));
    });
    return () => {
      cancelled = true;
    };
  }, [messages]);

  const handleInsert = useCallback(
    (payload: unknown) => {
      const row = (payload as { new?: Record<string, unknown> })?.new;
      if (!row?.id) return;

      const incoming: TaskMessageRow = {
        id: row.id as string,
        taskId: row.task_id as string,
        senderId: row.sender_id as string,
        senderName: nameByUserId.get(row.sender_id as string) ?? null,
        body: (row.body as string | null) ?? null,
        clientEventId: (row.client_event_id as string | null) ?? null,
        createdAt: row.created_at as string,
        attachments: [],
      };

      setMessages((prev) => {
        if (prev.some((m) => m.id === incoming.id)) return prev;
        // Troca a bolha otimista pela linha real, casando pelo client_event_id.
        const optimisticIdx = prev.findIndex(
          (m) =>
            m.clientEventId &&
            m.clientEventId === incoming.clientEventId &&
            m.id.startsWith('optimistic-'),
        );
        if (optimisticIdx >= 0) {
          const next = [...prev];
          next[optimisticIdx] = { ...incoming, attachments: prev[optimisticIdx].attachments };
          return next;
        }
        return [...prev, incoming];
      });
    },
    [nameByUserId],
  );

  const realtimeEvents: RealtimeEventConfig[] = useMemo(
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

  useRealtimeChannel({ channelName: `task:${taskId}:chat`, events: realtimeEvents });

  // Rola só se você já estava no fim — puxar a tela de quem está lendo o
  // histórico é a forma mais rápida de tornar um chat irritante.
  useEffect(() => {
    if (shouldScrollRef.current) endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages, events]);

  const feed: FeedItem[] = useMemo(() => {
    const items: FeedItem[] = [
      ...events.map((event) => ({ kind: 'event' as const, at: event.createdAt, event })),
      ...messages.map((message) => ({ kind: 'message' as const, at: message.createdAt, message })),
    ];
    return items.sort((a, b) => a.at.localeCompare(b.at));
  }, [events, messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = body.trim();
    if ((!trimmed && pendingFiles.length === 0) || sending) return;

    setSending(true);
    const clientEventId = globalThis.crypto.randomUUID();

    const optimistic: TaskMessageRow = {
      id: `optimistic-${clientEventId}`,
      taskId,
      senderId: viewerId,
      senderName: nameByUserId.get(viewerId) ?? 'Você',
      body: trimmed || null,
      clientEventId,
      createdAt: new Date().toISOString(),
      attachments: [],
    };
    setMessages((prev) => [...prev, optimistic]);
    setBody('');
    const files = pendingFiles;
    setPendingFiles([]);

    try {
      let attachmentIds: string[] = [];
      if (files.length > 0) {
        const { uploaded, errors } = await uploadTaskFiles(orgId, taskId, files);
        attachmentIds = uploaded.map((a) => a.id);
        for (const message of errors) toast.error(message);
      }

      const result = await sendTaskMessageAction(taskId, trimmed, clientEventId, attachmentIds);
      if (!result.success) {
        toast.error(result.error);
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        return;
      }
      if (attachmentIds.length > 0) onChanged();
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="flex flex-col rounded-xl border border-neutral-200 bg-surface">
      <h2 className="border-b border-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-900">
        Atividade
      </h2>

      <div
        className="max-h-[520px] flex-1 space-y-3 overflow-y-auto px-4 py-4"
        onScroll={(e) => {
          const el = e.currentTarget;
          shouldScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {feed.map((item) =>
          item.kind === 'event' ? (
            <EventLine key={`e-${item.event.id}`} event={item.event} nameByUserId={nameByUserId} />
          ) : (
            <MessageBubble
              key={`m-${item.message.id}`}
              message={item.message}
              mine={item.message.senderId === viewerId}
              urls={urls}
            />
          ),
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={handleSend} className="border-t border-neutral-100 p-3">
        {pendingFiles.length > 0 && (
          <ul className="mb-2 flex flex-wrap gap-1.5">
            {pendingFiles.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="inline-flex items-center gap-1 rounded-md bg-neutral-100 px-2 py-1 text-[11px] text-neutral-700"
              >
                <Paperclip className="h-3 w-3" aria-hidden />
                {file.name}
                <button
                  type="button"
                  aria-label={`Remover ${file.name}`}
                  onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== index))}
                  className="text-neutral-400 hover:text-red-600"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Anexar arquivo"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-300 bg-surface text-neutral-500 transition-colors hover:text-neutral-900"
          >
            <Plus className="h-4 w-4" aria-hidden />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              setPendingFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])]);
              e.target.value = '';
            }}
          />
          <input
            type="text"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Escreva uma observação…"
            aria-label="Mensagem"
            className="h-9 flex-1 rounded-lg border border-neutral-200/80 bg-surface/70 px-3 text-sm text-neutral-900 shadow-2xs focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40"
          />
          <button
            type="submit"
            disabled={sending || (!body.trim() && pendingFiles.length === 0)}
            aria-label="Enviar"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-600 text-white transition-colors hover:bg-accent-700 disabled:opacity-50"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Send className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>
      </form>
    </section>
  );
}

// -----------------------------------------------------------------------------

const EVENT_ICON = {
  criada: Flag,
  movida: ArrowRight,
  atribuida: UserPlus,
  desatribuida: UserMinus,
  bloqueada: Lock,
  desbloqueada: Unlock,
  prazo: CalendarClock,
  vinculada: Link2,
} as const;

function EventLine({
  event,
  nameByUserId,
}: {
  event: TaskEventRow;
  nameByUserId: Map<string, string>;
}) {
  const actor = event.actorName ?? (event.actorId ? nameByUserId.get(event.actorId) : null) ?? 'Alguém';
  const retorno = event.direction === 'retorno';
  const Icon = retorno ? CornerUpLeft : EVENT_ICON[event.kind];

  let text: string;
  switch (event.kind) {
    case 'criada':
      text = `${actor} abriu a demanda em ${event.toStage ? TASK_STAGE_LABELS[event.toStage] : 'Avulsas'}`;
      break;
    case 'movida':
      text =
        event.fromStage || event.toStage
          ? `${actor} ${retorno ? 'devolveu' : 'passou'} de ${
              event.fromStage ? TASK_STAGE_LABELS[event.fromStage] : 'Avulsas'
            } para ${event.toStage ? TASK_STAGE_LABELS[event.toStage] : 'Avulsas'}`
          : `${actor} trocou o setor responsável`;
      break;
    case 'atribuida':
      text = `${actor} definiu ${
        event.note ? nameByUserId.get(event.note) ?? 'alguém' : 'alguém'
      } como responsável`;
      break;
    case 'desatribuida':
      text = `${actor} deixou o card sem responsável`;
      break;
    case 'bloqueada':
      text = `${actor} travou o card`;
      break;
    case 'desbloqueada':
      text = `${actor} destravou o card`;
      break;
    case 'prazo':
      text = event.note
        ? `${actor} definiu o prazo para ${new Date(`${event.note}T00:00:00`).toLocaleDateString('pt-BR')}`
        : `${actor} removeu o prazo`;
      break;
    case 'vinculada':
      text = `${actor} vinculou ${event.note?.startsWith('work:') ? 'a obra' : 'o orçamento'}`;
      break;
    default:
      text = `${actor} atualizou o card`;
  }

  const showNote = event.note && (event.kind === 'movida' || event.kind === 'bloqueada');

  return (
    <div className="flex items-start gap-2.5 text-xs">
      <span
        className={cn(
          'mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
          retorno
            ? 'bg-amber-50 text-amber-700'
            : event.kind === 'bloqueada'
              ? 'bg-red-50 text-red-700'
              : 'bg-neutral-100 text-neutral-500',
        )}
        aria-hidden
      >
        <Icon className="h-3 w-3" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-neutral-600">
          {text}
          <span className="ml-1.5 text-[11px] text-neutral-400">
            {formatRelativeTime(event.createdAt)}
          </span>
        </p>
        {showNote && (
          <p
            className={cn(
              'mt-1 rounded-md px-2 py-1 text-[11px] italic',
              retorno ? 'bg-amber-50 text-amber-800' : 'bg-neutral-100 text-neutral-600',
            )}
          >
            “{event.note}”
          </p>
        )}
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  mine,
  urls,
}: {
  message: TaskMessageRow;
  mine: boolean;
  urls: Record<string, string>;
}) {
  return (
    <div className={cn('flex flex-col animate-task-bubble-in', mine ? 'items-end' : 'items-start')}>
      {!mine && (
        <span className="mb-0.5 px-1 text-[11px] font-medium text-neutral-500">
          {message.senderName ?? 'Alguém'}
        </span>
      )}

      <div
        className={cn(
          'max-w-[85%] space-y-1.5 rounded-2xl px-3 py-2 text-sm',
          mine ? 'bg-accent-600 text-white' : 'bg-neutral-100 text-neutral-900',
        )}
      >
        {message.body && <p className="whitespace-pre-wrap">{message.body}</p>}

        {message.attachments.map((attachment) => {
          const url = urls[attachment.storagePath];
          const image = attachment.mimeType?.startsWith('image/');
          if (image && url) {
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={attachment.id}
                src={url}
                alt={attachment.fileName}
                className="max-h-56 rounded-lg object-cover"
                loading="lazy"
              />
            );
          }
          return (
            <a
              key={attachment.id}
              href={url}
              target="_blank"
              rel="noreferrer"
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs underline-offset-2 hover:underline',
                mine ? 'bg-accent-700/50' : 'bg-neutral-200',
              )}
            >
              <Paperclip className="h-3 w-3" aria-hidden />
              {attachment.fileName}
            </a>
          );
        })}
      </div>

      <span className="mt-0.5 px-1 text-[10px] text-neutral-400">
        {formatRelativeTime(message.createdAt)}
      </span>
    </div>
  );
}
