'use client';

import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ArrowDown, Loader2, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { dayBucketLabel } from '@/lib/formatRelativeTime';
import type { WorkMessage, WorkMessageSenderRole } from '@/types/works';
import { ChatMessage } from './ChatMessage';
import { ImageLightbox } from './ImageLightbox';

interface ChatMessageListProps {
  messages: WorkMessage[];
  signedUrls: Record<string, string>;
  viewerRole: WorkMessageSenderRole;
  hasMore: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  /** Map de message.id -> status de envio (otimista para mensagens proprias). */
  pendingStatusByMessageId: Record<string, 'pending' | 'error'>;
}

export interface ChatMessageListHandle {
  /** Faz scroll ate o fim da lista (suave). */
  scrollToBottom: (smooth?: boolean) => void;
  /** Verdadeiro se o usuario esta proximo do fim do scroll. */
  isAtBottom: () => boolean;
}

export const ChatMessageList = forwardRef<ChatMessageListHandle, ChatMessageListProps>(
  function ChatMessageListInner(
    {
      messages,
      signedUrls,
      viewerRole,
      hasMore,
      loadingOlder,
      onLoadOlder,
      pendingStatusByMessageId,
    },
    ref,
  ) {
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const [showJumpToEnd, setShowJumpToEnd] = useState(false);

    const [lightboxImages, setLightboxImages] = useState<string[]>([]);
    const [lightboxIndex, setLightboxIndex] = useState(0);
    const [lightboxOpen, setLightboxOpen] = useState(false);

    useImperativeHandle(
      ref,
      (): ChatMessageListHandle => ({
        scrollToBottom: (smooth = true) => {
          const el = scrollRef.current;
          if (!el) return;
          el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
        },
        isAtBottom: () => isNearBottom(scrollRef.current, 80),
      }),
      [],
    );

    useLayoutEffect(() => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    }, []);

    function onScroll() {
      const el = scrollRef.current;
      if (!el) return;
      setShowJumpToEnd(!isNearBottom(el, 200));
    }

    const groups = useMemo(() => groupByDay(messages), [messages]);

    function openLightbox(storagePath: string) {
      const allImages: string[] = [];
      let target = -1;
      for (const m of messages) {
        for (const a of m.attachments) {
          if (a.kind !== 'image') continue;
          const url = signedUrls[a.storagePath];
          if (!url) continue;
          if (a.storagePath === storagePath) target = allImages.length;
          allImages.push(url);
        }
      }
      if (allImages.length === 0) return;
      setLightboxImages(allImages);
      setLightboxIndex(target >= 0 ? target : 0);
      setLightboxOpen(true);
    }

    return (
      <div className="relative flex-1 overflow-hidden">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="absolute inset-0 overflow-y-auto px-3 py-3 sm:px-4"
        >
          <div className="mx-auto flex max-w-3xl flex-col gap-1 pb-2">
            {hasMore && (
              <div className="flex justify-center py-2">
                <button
                  type="button"
                  onClick={onLoadOlder}
                  disabled={loadingOlder}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600 shadow-sm transition-colors',
                    loadingOlder
                      ? 'cursor-wait opacity-70'
                      : 'hover:border-[#64ABDE]/40 hover:text-[#1D3140]',
                  )}
                >
                  {loadingOlder ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" /> Carregando...
                    </>
                  ) : (
                    <>Carregar mensagens anteriores</>
                  )}
                </button>
              </div>
            )}

            {messages.length === 0 ? (
              <EmptyState />
            ) : (
              groups.map((group) => (
                <div key={group.label} className="flex flex-col">
                  <div className="my-3 flex items-center justify-center">
                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[10px] font-medium uppercase text-gray-500">
                      {group.label}
                    </span>
                  </div>
                  {group.items.map((msg, i) => {
                    const prev = group.items[i - 1];
                    const showHeader = !prev || prev.senderRole !== msg.senderRole;
                    return (
                      <ChatMessage
                        key={msg.id}
                        message={msg}
                        signedUrls={signedUrls}
                        viewerRole={viewerRole}
                        showHeader={showHeader}
                        pendingStatus={pendingStatusByMessageId[msg.id]}
                        onOpenImage={openLightbox}
                      />
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>

        {showJumpToEnd && (
          <button
            type="button"
            onClick={() => {
              const el = scrollRef.current;
              if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
            }}
            className="absolute bottom-3 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-md transition-colors hover:bg-gray-50 hover:text-[#1D3140]"
            aria-label="Ir para o final"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        )}

        <ImageLightbox
          open={lightboxOpen}
          onOpenChange={setLightboxOpen}
          images={lightboxImages}
          initialIndex={lightboxIndex}
        />
      </div>
    );
  },
);

function EmptyState() {
  return (
    <div className="mx-auto mt-12 flex max-w-sm flex-col items-center px-4 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#64ABDE]/10 text-[#64ABDE]">
        <MessageCircle className="h-5 w-5" />
      </div>
      <h3 className="text-sm font-semibold text-[#1D3140]">Nenhuma mensagem ainda</h3>
      <p className="mt-1 text-xs text-gray-500">
        Envie a primeira mensagem para iniciar a conversa com o gerente da obra.
      </p>
    </div>
  );
}

function isNearBottom(el: HTMLDivElement | null, tolerance: number): boolean {
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight <= tolerance;
}

interface DayGroup {
  label: string;
  items: WorkMessage[];
}

function groupByDay(messages: WorkMessage[]): DayGroup[] {
  if (messages.length === 0) return [];
  const groups: DayGroup[] = [];
  let current: DayGroup | null = null;
  for (const m of messages) {
    const label = dayBucketLabel(m.createdAt);
    if (!current || current.label !== label) {
      current = { label, items: [m] };
      groups.push(current);
    } else {
      current.items.push(m);
    }
  }
  return groups;
}
