"use client";

import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/** Formatação e miudezas de UI compartilhadas pelas telas de proposta. */

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const dateOnly = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });

export function brl(value: number): string {
  return currency.format(Number.isFinite(value) ? value : 0);
}

export function pct(value: number): string {
  return `${decimal.format(Number.isFinite(value) ? value : 0)}%`;
}

export function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : dateTime.format(parsed);
}

export function formatDate(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value.length <= 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(parsed.getTime()) ? '—' : dateOnly.format(parsed);
}

/** Trecho de data para `<input type="date">`. */
export function toDateInput(value: string | null): string {
  return value ? value.slice(0, 10) : '';
}

export function publicProposalUrl(token: string): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}/proposta/${token}`;
}

export function StatusBadge({
  status,
  revokedAt,
}: {
  status: 'draft' | 'published' | 'archived';
  revokedAt?: string | null;
}) {
  const label = revokedAt
    ? 'Link revogado'
    : status === 'published'
      ? 'Publicada'
      : status === 'archived'
        ? 'Arquivada'
        : 'Rascunho';

  const tone = revokedAt
    ? 'border-red-200 bg-red-50 text-red-600'
    : status === 'published'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : status === 'archived'
        ? 'border-slate-200 bg-slate-100 text-slate-500'
        : 'border-amber-200 bg-amber-50 text-amber-700';

  return (
    <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', tone)}>{label}</span>
  );
}

export function FieldLabel({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <span className="mb-1 flex items-baseline gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</span>
      {hint ? <span className="text-xs font-normal text-slate-400">{hint}</span> : null}
    </span>
  );
}

export const inputClass =
  'w-full rounded-lg border border-slate-200 bg-surface px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-brand-blue disabled:bg-slate-50 disabled:text-slate-400';

export const textareaClass = `${inputClass} min-h-[96px] leading-relaxed`;

export const buttonClass =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-surface px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-brand-blue hover:text-brand-navy disabled:cursor-not-allowed disabled:opacity-50';

export const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50';

/** Cartão de seção do editor: título, origem do conteúdo e corpo. */
export function EditorCard({
  title,
  origin,
  actions,
  children,
}: {
  title: ReactNode;
  origin?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-surface shadow-sm">
      <header className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-brand-navy">{title}</h2>
          {origin ? <p className="mt-0.5 text-xs text-slate-400">{origin}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

/** Aviso in-loco — usado para explicar por que uma seção está vazia. */
export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warning' | 'danger';
  children: ReactNode;
}) {
  const toneClass =
    tone === 'danger'
      ? 'border-red-200 bg-red-50 text-red-700'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-slate-200 bg-slate-50 text-slate-600';

  return <div className={cn('rounded-lg border px-3 py-2 text-sm', toneClass)}>{children}</div>;
}
