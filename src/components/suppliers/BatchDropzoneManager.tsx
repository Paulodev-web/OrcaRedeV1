'use client';

import { useCallback, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Upload } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

const MAX_FILES = 10;

interface Props {
  sessionId: string;
  disabled: boolean;
  onJobsCreated?: () => void;
}

/**
 * Chave segura para Storage: apenas [a-z0-9.-] e sufixo .pdf (evita "Invalid key").
 * Ex.: "ORÇAMENTO 01.pdf" → "orcamento-01.pdf"
 */
export function sanitizeStorageFileName(originalName: string): string {
  const trimmed = originalName.trim();
  const baseRaw = trimmed.toLowerCase().endsWith('.pdf')
    ? trimmed.slice(0, -4)
    : trimmed.replace(/\.[^.]+$/, '');

  const noCombiningMarks = baseRaw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  let base = noCombiningMarks
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/_/g, '-')
    .replace(/[^a-z0-9.-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^\.+|\.+$/g, '');

  if (!base) base = 'arquivo';

  return `${base}.pdf`;
}

function supplierNameFromSanitizedFileName(sanitizedFileName: string): string | null {
  const base = sanitizedFileName.replace(/\.pdf$/i, '');
  const spaced = base.replace(/-/g, ' ').replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
  return spaced || null;
}

export default function BatchDropzoneManager({
  sessionId,
  disabled,
  onJobsCreated,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
      if (list.length === 0) {
        setError('Selecione apenas arquivos PDF.');
        return;
      }
      if (list.length > MAX_FILES) {
        setError(`Máximo de ${MAX_FILES} arquivos por lote.`);
        return;
      }

      setError(null);
      setUploading(true);

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      if (userErr || !user) {
        setError('Sessão expirada. Faça login novamente.');
        setUploading(false);
        return;
      }

      const base = `${user.id}/${sessionId}`;

      try {
        for (const file of list) {
          const sanitized = sanitizeStorageFileName(file.name);
          const path = `${base}/${Date.now()}_${sanitized}`;
          const { data: up, error: upErr } = await supabase.storage
            .from('fornecedores_pdfs')
            .upload(path, file, { upsert: false });

          if (upErr || !up) {
            throw new Error(upErr?.message ?? 'Falha no upload');
          }

          const supplierName = supplierNameFromSanitizedFileName(sanitized);

          const { data: job, error: jobErr } = await supabase
            .from('extraction_jobs')
            .insert({
              session_id: sessionId,
              file_path: up.path,
              supplier_name: supplierName,
              status: 'pending',
            })
            .select('id')
            .single();

          if (jobErr || !job) {
            throw new Error(jobErr?.message ?? 'Erro ao criar job');
          }

          void fetch('/api/process-pdfs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ job_id: job.id }),
          }).catch((e) => console.warn('[BatchDropzone] enqueue', e));
        }

        onJobsCreated?.();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Erro no upload.');
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [sessionId, onJobsCreated]
  );

  return (
    <div className="rounded-2xl border border-[#64ABDE]/40 bg-white p-6 shadow-md">
      <h2 className="mb-2 text-base font-semibold text-[#1D3140]">Importar PDFs em lote</h2>
      <p className="mb-4 text-sm text-slate-500">
        Até {MAX_FILES} arquivos. O processamento roda em segundo plano; acompanhe o status abaixo.
      </p>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <label
        className={[
          'flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 transition-colors',
          disabled
            ? 'cursor-not-allowed border-gray-200 bg-gray-50 opacity-60'
            : dragOver
              ? 'border-[#64ABDE] bg-[#64ABDE]/10'
              : 'border-gray-300 bg-gray-50 hover:border-gray-400',
        ].join(' ')}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (disabled || uploading) return;
          void processFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          className="hidden"
          disabled={disabled || uploading}
          onChange={(e) => {
            const f = e.target.files;
            if (f?.length) void processFiles(f);
          }}
        />
        {uploading ? (
          <Loader2 className="h-10 w-10 animate-spin text-[#64ABDE]" />
        ) : (
          <Upload className="h-10 w-10 text-gray-400" />
        )}
        <p className="mt-2 text-sm font-medium text-gray-700">
          {disabled ? 'Sessão encerrada' : 'Arraste PDFs ou clique para selecionar'}
        </p>
        <p className="text-xs text-gray-400 mt-1">Somente .pdf · máx. {MAX_FILES}</p>
      </label>
    </div>
  );
}
