'use client';

import { supabase } from '@/lib/supabaseClient';
import { registerTaskAttachmentAction } from '@/app/tarefas/_actions/tasks';

export interface UploadedAttachment {
  id: string;
  storagePath: string;
  fileName: string;
  mimeType: string | null;
  fileSize: number;
  width: number | null;
  height: number | null;
}

const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** Nome de arquivo seguro para uma chave de objeto do Storage. */
function sanitize(fileName: string): string {
  return fileName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(-120);
}

/** Dimensões da imagem, para a grade reservar a proporção certa e não pular. */
async function readImageSize(file: File): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith('image/')) return null;
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve(null);
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Sobe os arquivos DIRETO do browser para o bucket `tarefas` e só então
 * registra as linhas por Server Action.
 *
 * O arquivo não passa pela Server Action de propósito: o limite de body na
 * Vercel (~4.5 MB) é menor que uma foto de celular, e é exatamente esse o caso
 * de uso principal — a equipe de campo mandando foto do poste.
 */
export async function uploadTaskFiles(
  orgId: string,
  taskId: string,
  files: File[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ uploaded: UploadedAttachment[]; errors: string[] }> {
  const uploaded: UploadedAttachment[] = [];
  const errors: string[] = [];

  let done = 0;
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      errors.push(`${file.name}: acima de 25 MB.`);
      done += 1;
      onProgress?.(done, files.length);
      continue;
    }

    const storagePath = `${orgId}/${taskId}/${crypto.randomUUID()}-${sanitize(file.name)}`;

    const { error: uploadError } = await supabase.storage
      .from('tarefas')
      .upload(storagePath, file, { contentType: file.type || undefined, upsert: false });

    if (uploadError) {
      errors.push(`${file.name}: ${uploadError.message}`);
      done += 1;
      onProgress?.(done, files.length);
      continue;
    }

    const size = await readImageSize(file);

    const result = await registerTaskAttachmentAction({
      taskId,
      storagePath,
      fileName: file.name,
      mimeType: file.type || null,
      fileSize: file.size,
      width: size?.width ?? null,
      height: size?.height ?? null,
    });

    if (!result.success) {
      // O registro falhou: tira o objeto órfão do bucket em vez de deixar
      // arquivo pago e invisível.
      await supabase.storage.from('tarefas').remove([storagePath]);
      errors.push(`${file.name}: ${result.error}`);
    } else if (result.data) {
      uploaded.push({
        id: result.data.id,
        storagePath,
        fileName: file.name,
        mimeType: file.type || null,
        fileSize: file.size,
        width: size?.width ?? null,
        height: size?.height ?? null,
      });
    }

    done += 1;
    onProgress?.(done, files.length);
  }

  return { uploaded, errors };
}
