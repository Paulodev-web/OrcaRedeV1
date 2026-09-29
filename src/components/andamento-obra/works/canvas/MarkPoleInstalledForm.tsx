'use client';

import { useRef, useState } from 'react';
import { Camera, Loader2, X, Zap } from 'lucide-react';
import { supabase as supabaseBrowser } from '@/lib/supabaseClient';
import {
  getUploadUrlForPoleInstallationMedia,
  recordPoleInstallationFromPortal,
} from '@/actions/workPoleInstallations';
import {
  POLE_INSTALLATION_MEDIA_LIMITS,
  POLE_INSTALLATION_NOTES_MAX,
  type WorkProjectPost,
} from '@/types/works';

const ANDAMENTO_OBRA_BUCKET = 'andamento-obra';

interface MarkPoleInstalledFormProps {
  workId: string;
  post: WorkProjectPost;
  /** Chamado depois que o poste acende, com o id da instalacao criada. */
  onRegistered: (installationId: string) => void;
}

/**
 * O engenheiro acende, pelo portal, um poste que o projeto previa.
 *
 * Existe porque ate aqui a execucao tinha uma porta so, o APK do gerente, e
 * isso deixava de fora a obra que o proprio engenheiro toca e o poste que subiu
 * antes de existir gerente alocado.
 *
 * Tres escolhas de tela que valem explicacao:
 *
 *  - **Data, nao data e hora.** O dia a dia agrupa por dia (regra 5.2 da doc),
 *    entao minuto aqui seria precisao inventada: quem digita de escritorio nao
 *    sabe se o poste subiu 14h10 ou 14h40. O horario e fixado ao meio-dia local
 *    justamente para nenhum fuso empurrar o registro para o dia vizinho.
 *  - **Foto opcional.** No APK ela e obrigatoria, e com razao: la a foto e a
 *    prova de que alguem esteve no pe do poste. Aqui nao ha essa pretensao, e
 *    exigir foto so faria o engenheiro anexar qualquer coisa.
 *  - **Publicar vem marcado.** O portao de aprovacao existe para revisar o que
 *    o campo mandou. Quando quem digita e o proprio dono do portao, a revisao
 *    ja aconteceu.
 */
export function MarkPoleInstalledForm({
  workId,
  post,
  onRegistered,
}: MarkPoleInstalledFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [date, setDate] = useState(() => hojeLocalISO());
  const [notes, setNotes] = useState('');
  const [publish, setPublish] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'uploading' | 'saving'>(null);
  const [error, setError] = useState<string | null>(null);

  function pickFile(selected: File | null) {
    setError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);

    if (!selected) {
      setFile(null);
      setPreviewUrl(null);
      return;
    }
    const limits = POLE_INSTALLATION_MEDIA_LIMITS.image;
    if (!selected.type.startsWith(limits.mimePrefix)) {
      setError('Selecione uma imagem.');
      setFile(null);
      setPreviewUrl(null);
      return;
    }
    if (selected.size > limits.maxBytes) {
      const maxMb = Math.round(limits.maxBytes / (1024 * 1024));
      setError(`A imagem excede ${maxMb} MB.`);
      setFile(null);
      setPreviewUrl(null);
      return;
    }
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);

    if (!date) {
      setError('Informe a data do levantamento.');
      return;
    }

    // Meio-dia local: o dia a dia corta a meia-noite em America/Sao_Paulo, e
    // gravar 00:00 deixaria o registro na fronteira, sujeito a cair no dia
    // anterior por uma hora de fuso.
    const installedAt = new Date(`${date}T12:00:00`);
    if (Number.isNaN(installedAt.getTime())) {
      setError('Data do levantamento invalida.');
      return;
    }

    // O id nasce aqui porque o path da foto no storage o carrega, e ele
    // precisa ser o mesmo que vai para a tabela.
    const installationId = crypto.randomUUID();
    const media: Array<{ kind: 'image'; storagePath: string; mimeType?: string; sizeBytes?: number; isPrimary: boolean }> = [];

    if (file) {
      setBusy('uploading');
      const urlResult = await getUploadUrlForPoleInstallationMedia({
        workId,
        installationId,
        kind: 'image',
        fileName: file.name,
        sizeBytes: file.size,
        mimeType: file.type || undefined,
      });
      if (!urlResult.success || !urlResult.data) {
        setBusy(null);
        setError(
          urlResult.success ? 'Resposta invalida do servidor.' : urlResult.error,
        );
        return;
      }
      const { storagePath, uploadToken } = urlResult.data;
      const { error: uploadError } = await supabaseBrowser.storage
        .from(ANDAMENTO_OBRA_BUCKET)
        .uploadToSignedUrl(storagePath, uploadToken, file, {
          contentType: file.type || undefined,
          upsert: false,
        });
      if (uploadError) {
        setBusy(null);
        setError(`Falha ao enviar a foto: ${uploadError.message}`);
        return;
      }
      media.push({
        kind: 'image',
        storagePath,
        mimeType: file.type || undefined,
        sizeBytes: file.size,
        isPrimary: true,
      });
    }

    setBusy('saving');
    const result = await recordPoleInstallationFromPortal({
      workId,
      projectPostId: post.id,
      installationId,
      installedAt: installedAt.toISOString(),
      notes: notes.trim() || null,
      media,
      publishToClient: publish,
    });
    setBusy(null);

    if (!result.success) {
      setError(result.error);
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    onRegistered(result.data?.installationId ?? installationId);
  }

  const notesLeft = POLE_INSTALLATION_NOTES_MAX - notes.length;

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label
          htmlFor="levantado-em"
          className="mb-1 block text-[11px] font-medium text-gray-600"
        >
          Levantado em
        </label>
        <input
          id="levantado-em"
          type="date"
          required
          value={date}
          max={hojeLocalISO()}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
        />
      </div>

      <div>
        <label
          htmlFor="observacao-poste"
          className="mb-1 block text-[11px] font-medium text-gray-600"
        >
          Observação <span className="text-gray-400">(opcional)</span>
        </label>
        <textarea
          id="observacao-poste"
          rows={2}
          value={notes}
          maxLength={POLE_INSTALLATION_NOTES_MAX}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="O que vale registrar sobre este poste."
          className="w-full resize-y rounded-md border border-gray-300 px-2.5 py-1.5 text-xs text-neutral-900 placeholder:text-gray-400 focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
        />
        {notes.length > 0 && (
          <p className="mt-0.5 text-right text-[10px] text-gray-400">
            {notesLeft} restantes
          </p>
        )}
      </div>

      <div>
        <span className="mb-1 block text-[11px] font-medium text-gray-600">
          Foto <span className="text-gray-400">(opcional)</span>
        </span>
        {previewUrl ? (
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Pré-visualização da foto do poste"
              className="h-20 w-20 rounded-md border border-gray-200 object-cover"
            />
            <button
              type="button"
              onClick={() => {
                pickFile(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              aria-label="Remover foto selecionada"
              className="absolute -right-1.5 -top-1.5 rounded-full bg-neutral-900 p-0.5 text-white shadow hover:bg-neutral-700"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-gray-300 px-3 py-1.5 text-[11px] text-gray-600 transition-colors hover:border-gray-400 hover:bg-gray-50"
          >
            <Camera className="h-3.5 w-3.5" />
            Anexar foto
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <label className="flex cursor-pointer items-start gap-2 rounded-md bg-gray-50 px-2.5 py-2">
        <input
          type="checkbox"
          checked={publish}
          onChange={(e) => setPublish(e.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
        />
        <span className="text-[11px] text-gray-700">
          Publicar no portal do cliente
          <span className="mt-0.5 block text-[10px] text-gray-500">
            Desmarque se quiser conferir antes de o cliente ver.
          </span>
        </span>
      </label>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy !== null}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {busy === 'uploading' ? 'Enviando foto…' : 'Registrando…'}
          </>
        ) : (
          <>
            <Zap className="h-3.5 w-3.5" />
            Registrar poste levantado
          </>
        )}
      </button>
    </form>
  );
}

/** Hoje em `YYYY-MM-DD`, no fuso do navegador (nao em UTC). */
function hojeLocalISO(): string {
  const agora = new Date();
  const mm = String(agora.getMonth() + 1).padStart(2, '0');
  const dd = String(agora.getDate()).padStart(2, '0');
  return `${agora.getFullYear()}-${mm}-${dd}`;
}
