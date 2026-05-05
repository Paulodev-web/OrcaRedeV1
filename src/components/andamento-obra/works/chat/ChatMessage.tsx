'use client';

import { Check, CheckCheck, Clock, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkMessage, WorkMessageSenderRole } from '@/types/works';
import { ChatAttachmentBubble } from './ChatAttachmentBubble';

interface ChatMessageProps {
  message: WorkMessage;
  signedUrls: Record<string, string>;
  /** Role do usuario logado para definir alinhamento e estado de leitura. */
  viewerRole: WorkMessageSenderRole;
  /** Se a mensagem e a primeira de um grupo do mesmo sender. */
  showHeader: boolean;
  /** Status de envio (otimista no sender). */
  pendingStatus?: 'pending' | 'error';
  onOpenImage: (storagePath: string) => void;
}

function formatTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function ChatMessage({
  message,
  signedUrls,
  viewerRole,
  showHeader,
  pendingStatus,
  onOpenImage,
}: ChatMessageProps) {
  const isMine = message.senderRole === viewerRole;
  const align = isMine ? 'items-end' : 'items-start';

  const otherReadAt =
    viewerRole === 'engineer' ? message.readByManagerAt : message.readByEngineerAt;
  const otherHasRead = Boolean(otherReadAt);

  return (
    <div className={cn('flex w-full flex-col px-1', align, showHeader ? 'mt-3' : 'mt-1')}>
      {showHeader && (
        <span className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">
          {isMine ? 'Você' : message.senderRole === 'manager' ? 'Gerente' : 'Engenheiro'}
        </span>
      )}

      <div
        className={cn(
          'flex max-w-[85%] flex-col gap-1.5 rounded-2xl px-3 py-2 shadow-sm sm:max-w-[70%]',
          isMine
            ? 'rounded-br-sm bg-[#64ABDE] text-white'
            : 'rounded-bl-sm border border-gray-200 bg-white text-[#1D3140]',
        )}
      >
        {message.attachments.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {message.attachments.map((att) => (
              <ChatAttachmentBubble
                key={att.id}
                attachment={att}
                signedUrl={signedUrls[att.storagePath]}
                onOpenImage={onOpenImage}
              />
            ))}
          </div>
        )}

        {message.body && (
          <p className={cn('whitespace-pre-wrap break-words text-sm leading-snug')}>
            {message.body}
          </p>
        )}

        <div
          className={cn(
            'mt-0.5 flex items-center justify-end gap-1 text-[10px]',
            isMine ? 'text-white/80' : 'text-gray-400',
          )}
        >
          <span>{formatTime(message.createdAt)}</span>
          {isMine && pendingStatus === 'pending' && <Clock className="h-3 w-3" />}
          {isMine && pendingStatus === 'error' && (
            <AlertCircle className="h-3 w-3 text-red-200" />
          )}
          {isMine && !pendingStatus && (
            otherHasRead ? (
              <CheckCheck className={cn('h-3.5 w-3.5', isMine ? 'text-white' : 'text-blue-500')} />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )
          )}
        </div>
      </div>
    </div>
  );
}
