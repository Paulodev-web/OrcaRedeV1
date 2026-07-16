'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import {
  createSessionNoteAction,
  listSessionNotesAction,
  type SessionNote,
  type SessionNoteAuthor,
} from '@/actions/sessionNotes';

const AUTHOR_STORAGE_KEY = 'orca-rede:session-note-author';

const AUTHOR_LABEL: Record<SessionNoteAuthor, string> = {
  maninho: 'Maninho',
  luan: 'Luan',
};

function formatTime(iso: string) {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

interface SessionNotesBoxProps {
  sessionId: string;
}

export default function SessionNotesBox({ sessionId }: SessionNotesBoxProps) {
  const [notes, setNotes] = useState<SessionNote[]>([]);
  const [author, setAuthor] = useState<SessionNoteAuthor>('maninho');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(AUTHOR_STORAGE_KEY);
      if (saved === 'maninho' || saved === 'luan') {
        setAuthor(saved);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    listSessionNotesAction(sessionId).then((res) => {
      if (cancelled) return;
      if (!res.success) {
        setError(res.error);
        setNotes([]);
      } else {
        setNotes(res.data.notes);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [notes]);

  function handleAuthorChange(next: SessionNoteAuthor) {
    setAuthor(next);
    try {
      localStorage.setItem(AUTHOR_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || isPending) return;

    setError(null);
    startTransition(async () => {
      const res = await createSessionNoteAction({
        sessionId,
        author,
        body: trimmed,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setNotes((prev) => [...prev, res.data.note]);
      setBody('');
    });
  }

  return (
    <div className="flex w-full shrink-0 flex-col rounded-xl border border-[#64ABDE]/30 bg-[#F7FBFE] lg:w-[min(100%,20rem)]">
      <div className="flex items-center gap-1.5 border-b border-[#64ABDE]/20 px-3 py-2">
        <MessageSquare className="h-3.5 w-3.5 text-[#1D3140]" />
        <span className="text-xs font-semibold text-[#1D3140]">Recados</span>
        <span className="text-[10px] text-slate-400">(provisório)</span>
      </div>

      <div
        ref={listRef}
        className="max-h-28 min-h-[4.5rem] space-y-1.5 overflow-y-auto px-3 py-2"
      >
        {loading ? (
          <p className="text-[11px] text-slate-400">Carregando…</p>
        ) : notes.length === 0 ? (
          <p className="text-[11px] text-slate-400">
            Nenhum recado ainda. Deixe um aviso para o outro.
          </p>
        ) : (
          notes.map((note) => (
            <div key={note.id} className="rounded-lg bg-white px-2 py-1.5 shadow-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className={
                    note.author === 'maninho'
                      ? 'text-[11px] font-semibold text-[#1D3140]'
                      : 'text-[11px] font-semibold text-[#2B6B9A]'
                  }
                >
                  {AUTHOR_LABEL[note.author]}
                </span>
                <span className="shrink-0 text-[10px] text-slate-400">
                  {formatTime(note.created_at)}
                </span>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-[11px] leading-snug text-slate-700">
                {note.body}
              </p>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-[#64ABDE]/20 px-2 py-2">
        <div className="mb-1.5 flex gap-1">
          {(['maninho', 'luan'] as const).map((option) => {
            const active = author === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => handleAuthorChange(option)}
                className={
                  active
                    ? 'rounded-full bg-[#1D3140] px-2.5 py-0.5 text-[11px] font-semibold text-white'
                    : 'rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-500 hover:border-[#64ABDE]/40'
                }
              >
                {AUTHOR_LABEL[option]}
              </button>
            );
          })}
        </div>
        <div className="flex items-end gap-1.5">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={2}
            maxLength={2000}
            placeholder={`Escreva como ${AUTHOR_LABEL[author]}…`}
            className="min-h-[2.5rem] flex-1 resize-none rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[11px] text-slate-700 outline-none placeholder:text-slate-400 focus:border-[#64ABDE]/60"
            disabled={isPending}
          />
          <button
            type="submit"
            disabled={isPending || !body.trim()}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1D3140] text-white transition-opacity disabled:opacity-40"
            aria-label="Enviar recado"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
        {error && <p className="mt-1 text-[10px] text-red-600">{error}</p>}
      </form>
    </div>
  );
}
