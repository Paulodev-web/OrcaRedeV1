"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Images, Loader2, Search, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import type { MediaLibraryItem } from "../_data/media";
import {
  deleteMediaAction,
  setMediaTagsAction,
  updateMediaAction,
  uploadMediaAction,
} from "../_actions/mediaLibrary";

interface MediaLibraryManagerProps {
  items: MediaLibraryItem[];
  allTags: string[];
}

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20";

/**
 * Biblioteca de fotos reutilizáveis nas propostas.
 *
 * As tags são o que liga a biblioteca à IA: a sugestão de mídia por seção
 * trabalha sobre elas, e não sobre o conteúdo da imagem.
 */
export function MediaLibraryManager({ items, allTags }: MediaLibraryManagerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [editing, setEditing] = useState<MediaLibraryItem | null>(null);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return items.filter((item) => {
      if (activeTag && !item.tags.includes(activeTag)) return false;
      if (!term) return true;
      return (
        (item.title ?? "").toLowerCase().includes(term) ||
        (item.caption ?? "").toLowerCase().includes(term) ||
        item.tags.some((tag) => tag.includes(term))
      );
    });
  }, [items, query, activeTag]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    let failures = 0;

    // Sequencial de propósito: o limite de corpo das server actions é por
    // requisição, e várias imagens grandes em paralelo estouram com mais
    // facilidade do que uma de cada vez.
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);
      const result = await uploadMediaAction(formData);
      if (!result.success) {
        failures += 1;
        toast.error(`${file.name}: ${result.error}`);
      }
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (failures < files.length) {
      toast.success(
        files.length - failures === 1 ? "Imagem enviada." : `${files.length - failures} imagens enviadas.`,
      );
    }
  };

  const handleDelete = (item: MediaLibraryItem) => {
    if (!window.confirm(`Excluir "${item.title ?? "imagem"}" da biblioteca?`)) return;

    startTransition(async () => {
      const result = await deleteMediaAction(item.id);
      if (result.success) {
        toast.success("Imagem excluída.");
        setEditing(null);
      } else {
        toast.error(result.error ?? "Falha ao excluir.");
      }
    });
  };

  const handleSave = (item: MediaLibraryItem, title: string, caption: string, tags: string) => {
    startTransition(async () => {
      const saved = await updateMediaAction({ id: item.id, title, caption });
      if (!saved.success) {
        toast.error(saved.error ?? "Falha ao salvar.");
        return;
      }

      const tagged = await setMediaTagsAction({
        mediaId: item.id,
        tags: tags.split(",").map((tag) => tag.trim()),
      });
      if (!tagged.success) {
        toast.error(tagged.error ?? "Falha ao salvar as tags.");
        return;
      }

      toast.success("Imagem atualizada.");
      setEditing(null);
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-700 disabled:opacity-60"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? "Enviando…" : "Enviar imagens"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => void handleUpload(event.target.files)}
        />

        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por título, legenda ou tag"
            className={`${inputClass} pl-9`}
          />
        </div>
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTag(null)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              activeTag === null
                ? "border-accent-600 bg-accent-600 text-white"
                : "border-slate-300 text-slate-600 hover:bg-slate-100"
            }`}
          >
            Todas
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setActiveTag(tag === activeTag ? null : tag)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                activeTag === tag
                  ? "border-accent-600 bg-accent-600 text-white"
                  : "border-slate-300 text-slate-600 hover:bg-slate-100"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <Images className="h-8 w-8 text-slate-300" />
          <p className="max-w-md text-sm text-slate-600">
            {items.length === 0
              ? "Nenhuma imagem ainda. Envie fotos de obras executadas, equipe e estruturas — elas ficam disponíveis em qualquer proposta."
              : "Nenhuma imagem corresponde ao filtro."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setEditing(item)}
              className="group overflow-hidden rounded-xl border border-slate-200 bg-white text-left transition hover:border-brand-blue hover:shadow-sm"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- URL externa do Storage, sem loader configurado */}
              <img src={item.url} alt={item.title ?? ""} className="h-40 w-full object-cover" loading="lazy" />
              <div className="space-y-1.5 p-3">
                <p className="truncate text-sm font-medium text-brand-navy">
                  {item.title ?? "Sem título"}
                </p>
                {item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {item.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600"
                      >
                        {tag}
                      </span>
                    ))}
                    {item.tags.length > 3 && (
                      <span className="text-[11px] text-slate-400">+{item.tags.length - 3}</span>
                    )}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {editing && (
        <MediaDetail
          item={editing}
          pending={pending}
          onClose={() => setEditing(null)}
          onDelete={() => handleDelete(editing)}
          onSave={(title, caption, tags) => handleSave(editing, title, caption, tags)}
        />
      )}
    </div>
  );
}

function MediaDetail({
  item,
  pending,
  onClose,
  onDelete,
  onSave,
}: {
  item: MediaLibraryItem;
  pending: boolean;
  onClose: () => void;
  onDelete: () => void;
  onSave: (title: string, caption: string, tags: string) => void;
}) {
  const [title, setTitle] = useState(item.title ?? "");
  const [caption, setCaption] = useState(item.caption ?? "");
  const [tags, setTags] = useState(item.tags.join(", "));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-brand-navy">Detalhes da imagem</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element -- URL externa do Storage */}
        <img src={item.url} alt={title} className="max-h-72 w-full bg-slate-100 object-contain" />

        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Título</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Legenda exibida na proposta
            </label>
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className={inputClass}
              placeholder="Ex.: Detalhe das caixas de passagem elétricas"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Tags, separadas por vírgula
            </label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className={inputClass}
              placeholder="equipe, obra concluída, estrutura civil"
            />
            <p className="mt-1 text-xs text-slate-400">
              As tags são o que a IA usa para sugerir imagens por seção da proposta.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-3">
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" />
            Excluir
          </button>
          <button
            type="button"
            onClick={() => onSave(title, caption, tags)}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-700 disabled:opacity-60"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
