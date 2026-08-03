"use client";

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { ArrowDown, ArrowUp, ImagePlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { saveSectionMediaAction } from '@/actions/proposals';
import { supabase } from '@/lib/supabaseClient';
import type { ProposalSectionKey } from '@/types/proposal';

import { EditorCard, Notice, buttonClass, inputClass, primaryButtonClass } from '../shared';
import type { PanelProps } from './types';

/**
 * Seções de imagem: Seu Projeto, Localização e Fotos da Obra.
 *
 * O upload vai direto do navegador para o bucket `proposal-media`, sob o
 * prefixo `{user_id}/`, que é o que a policy de storage exige. Passar arquivo
 * por server action só gastaria o limite de corpo da requisição.
 *
 * `group` agrupa imagens dentro da seção ("ESTRUTURAS CIVIL"); `caption` é a
 * legenda sob cada foto.
 */

interface MediaDraft {
  key: string;
  url: string;
  caption: string;
  groupLabel: string;
}

export function MidiaPanel({
  sectionKey,
  context,
  origin,
}: PanelProps & { sectionKey: ProposalSectionKey }) {
  const { record, locked } = context;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<MediaDraft[]>(() =>
    record.media
      .filter((item) => item.sectionKey === sectionKey)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((item) => ({
        key: item.id,
        url: item.url,
        caption: item.caption ?? '',
        groupLabel: item.groupLabel ?? '',
      })),
  );

  const title = record.sections.find((section) => section.sectionKey === sectionKey)?.title ?? 'Imagens';

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) {
        toast.error('Sessão expirada. Entre novamente.');
        return;
      }

      const uploaded: MediaDraft[] = [];

      for (const file of Array.from(files)) {
        const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const path = `${userId}/propostas/${record.proposal.id}/${sectionKey}-${crypto.randomUUID()}.${extension}`;

        const { error } = await supabase.storage
          .from('proposal-media')
          .upload(path, file, { cacheControl: '3600', upsert: false });

        if (error) {
          toast.error(`Falha ao enviar ${file.name}: ${error.message}`);
          continue;
        }

        const { data } = supabase.storage.from('proposal-media').getPublicUrl(path);
        uploaded.push({ key: path, url: data.publicUrl, caption: '', groupLabel: '' });
      }

      if (uploaded.length > 0) {
        setItems((current) => [...current, ...uploaded]);
        toast.success(
          `${uploaded.length} imagem(ns) enviada(s). Clique em Salvar para vincular à proposta.`,
        );
      }
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    setItems((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const save = () => {
    startTransition(async () => {
      const result = await saveSectionMediaAction(
        record.proposal.id,
        sectionKey,
        items.map((item, index) => ({
          url: item.url,
          caption: item.caption || null,
          groupLabel: item.groupLabel || null,
          order: index + 1,
        })),
      );

      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success('Imagens salvas.');
      router.refresh();
    });
  };

  return (
    <EditorCard
      title={title}
      origin={origin}
      actions={
        <>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(event) => void handleUpload(event.target.files)}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={locked || uploading}
            className={buttonClass}
          >
            <ImagePlus className="h-4 w-4" />
            {uploading ? 'Enviando…' : 'Enviar imagens'}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={locked || pending}
            className={primaryButtonClass}
          >
            {pending ? 'Salvando…' : 'Salvar'}
          </button>
        </>
      }
    >
      {items.length === 0 ? (
        <Notice>
          Nenhuma imagem nesta seção. Sem imagem, a seção some do PDF em vez de deixar página em
          branco.
        </Notice>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((item, index) => (
            <li key={item.key} className="rounded-lg border border-slate-200 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt={item.caption || `Imagem ${index + 1}`}
                className="mb-3 h-40 w-full rounded-md object-cover"
              />

              <input
                value={item.caption}
                onChange={(event) =>
                  setItems((current) =>
                    current.map((row, i) => (i === index ? { ...row, caption: event.target.value } : row)),
                  )
                }
                placeholder="Legenda"
                disabled={locked}
                className={`${inputClass} mb-2`}
              />
              <input
                value={item.groupLabel}
                onChange={(event) =>
                  setItems((current) =>
                    current.map((row, i) =>
                      i === index ? { ...row, groupLabel: event.target.value } : row,
                    ),
                  )
                }
                placeholder="Agrupador (ex.: ESTRUTURAS CIVIL)"
                disabled={locked}
                className={inputClass}
              />

              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-slate-400">Posição {index + 1}</span>
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={locked || index === 0}
                    title="Mover para trás"
                    className="rounded border border-slate-200 p-1 text-slate-400 hover:text-brand-navy disabled:opacity-30"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={locked || index === items.length - 1}
                    title="Mover para frente"
                    className="rounded border border-slate-200 p-1 text-slate-400 hover:text-brand-navy disabled:opacity-30"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
                    disabled={locked}
                    title="Remover"
                    className="rounded border border-slate-200 p-1 text-slate-400 hover:border-red-300 hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </EditorCard>
  );
}
