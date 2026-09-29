'use server';

import { revalidatePath } from 'next/cache';
import { ensureMember } from '@/lib/auth/ensureMember';
import { createSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import type { WorkPortalImage } from '@/services/works/getWorkClientPortal';
import type { ActionResult } from '@/types/works';

const WORKS_PATH = '/tools/andamento-obra';
/** Bucket público: a página do cliente é anônima e precisa abrir estas imagens. */
const PLANS_BUCKET = 'plans';

const TEXTO_CURTO_MAX = 120;
const TEXTO_LONGO_MAX = 2000;
const IMAGEM_MAX_BYTES = 8 * 1024 * 1024;
const GALERIA_MAX = 30;

export interface UpdateWorkClientPortalInput {
  workId: string;
  projectDescription?: string | null;
  currentFocusTitle?: string | null;
  currentFocusDescription?: string | null;
  responsiblePerson?: string | null;
  plannedEquipment?: number | null;
  equipmentInstalled?: number | null;
  plannedPublicLighting?: number | null;
  publicLightingInstalled?: number | null;
}

/**
 * Só o engenheiro da obra mexe no que o cliente lê.
 *
 * O gerente é membro da obra e não entra aqui: ele registra execução, não fala
 * com o cliente. A trava existe em dois lugares, esta action e a policy
 * `work_trackings_update_work_engineer`.
 */
async function portaoDoEngenheiro(workId: string) {
  const gate = await ensureMember(workId);
  if (!gate.ok) return { ok: false as const, error: gate.error };
  if (gate.role !== 'engineer') {
    return {
      ok: false as const,
      error: 'Apenas o engenheiro responsavel edita o portal do cliente.',
    };
  }
  return { ok: true as const, gate };
}

function limpaTexto(v: string | null | undefined, max: number): string | null {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  if (t.length === 0) return null;
  return t.length > max ? t.slice(0, max) : t;
}

function limpaContador(v: number | null | undefined): number | null {
  if (v === undefined || v === null) return null;
  if (!Number.isFinite(v) || v < 0) return null;
  return Math.floor(v);
}

/**
 * Salva o que o engenheiro escreve para o cliente.
 *
 * O que esta action deliberadamente NÃO toca: postes, progresso e timeline.
 * Os três são derivados da obra, e escrever aqui faria o portal mentir até a
 * próxima sincronia desfazer. O banco recusa de qualquer forma, pelo trigger
 * `work_trackings_protect_derived`.
 */
export async function updateWorkClientPortal(
  input: UpdateWorkClientPortalInput,
): Promise<ActionResult> {
  const porta = await portaoDoEngenheiro(input.workId);
  if (!porta.ok) return { success: false, error: porta.error };

  const { error } = await porta.gate.supabase
    .from('work_trackings')
    .update({
      project_description: limpaTexto(input.projectDescription, TEXTO_LONGO_MAX),
      current_focus_title: limpaTexto(input.currentFocusTitle, TEXTO_CURTO_MAX),
      current_focus_description: limpaTexto(
        input.currentFocusDescription,
        TEXTO_LONGO_MAX,
      ),
      responsible_person: limpaTexto(input.responsiblePerson, TEXTO_CURTO_MAX),
      planned_equipment: limpaContador(input.plannedEquipment),
      equipment_installed: limpaContador(input.equipmentInstalled),
      planned_public_lighting: limpaContador(input.plannedPublicLighting),
      public_lighting_installed: limpaContador(input.publicLightingInstalled),
      updated_at: new Date().toISOString(),
    })
    .eq('work_id', input.workId);

  if (error) return { success: false, error: error.message };

  revalidatePath(`${WORKS_PATH}/obras/${input.workId}/portal-cliente`);
  revalidatePath(`${WORKS_PATH}/obras/${input.workId}/visao-geral`);
  return { success: true };
}

interface UploadResult {
  url: string;
}

async function subirImagem(
  trackingId: string,
  pasta: 'logos' | 'galeria',
  file: File,
): Promise<ActionResult<UploadResult>> {
  if (!file.type.startsWith('image/')) {
    return { success: false, error: 'Selecione uma imagem.' };
  }
  if (file.size > IMAGEM_MAX_BYTES) {
    const maxMb = Math.round(IMAGEM_MAX_BYTES / (1024 * 1024));
    return { success: false, error: `A imagem excede ${maxMb} MB.` };
  }

  const ext = (file.name.split('.').pop() ?? 'png')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 8) || 'png';
  const nome = `${Date.now()}_${globalThis.crypto.randomUUID()}.${ext}`;
  const path = `public/${pasta}/${trackingId}/${nome}`;

  const serviceRole = createSupabaseServiceRoleClient();
  const { error } = await serviceRole.storage
    .from(PLANS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) return { success: false, error: error.message };

  const { data } = serviceRole.storage.from(PLANS_BUCKET).getPublicUrl(path);
  return { success: true, data: { url: data.publicUrl } };
}

/** A logo que aparece no topo da página do cliente. */
export async function uploadWorkClientPortalLogo(
  formData: FormData,
): Promise<ActionResult<UploadResult>> {
  const workId = String(formData.get('workId') ?? '');
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return { success: false, error: 'Arquivo invalido.' };
  }

  const porta = await portaoDoEngenheiro(workId);
  if (!porta.ok) return { success: false, error: porta.error };

  const { data: tracking } = await porta.gate.supabase
    .from('work_trackings')
    .select('id')
    .eq('work_id', workId)
    .maybeSingle();
  if (!tracking?.id) {
    return { success: false, error: 'Esta obra ainda nao tem portal do cliente.' };
  }

  const up = await subirImagem(tracking.id as string, 'logos', file);
  if (!up.success || !up.data) return up;

  const { error } = await porta.gate.supabase
    .from('work_trackings')
    .update({ client_logo_url: up.data.url, updated_at: new Date().toISOString() })
    .eq('work_id', workId);
  if (error) return { success: false, error: error.message };

  revalidatePath(`${WORKS_PATH}/obras/${workId}/portal-cliente`);
  return { success: true, data: up.data };
}

export async function removeWorkClientPortalLogo(
  workId: string,
): Promise<ActionResult> {
  const porta = await portaoDoEngenheiro(workId);
  if (!porta.ok) return { success: false, error: porta.error };

  const { error } = await porta.gate.supabase
    .from('work_trackings')
    .update({ client_logo_url: null, updated_at: new Date().toISOString() })
    .eq('work_id', workId);
  if (error) return { success: false, error: error.message };

  revalidatePath(`${WORKS_PATH}/obras/${workId}/portal-cliente`);
  return { success: true };
}

/**
 * Acrescenta uma foto à galeria do cliente.
 *
 * A lista inteira é reescrita a cada foto, que é o que o formato JSONB permite.
 * Ela é lida antes para não perder o que já está lá, e tem teto: galeria de
 * cliente com trinta fotos já é mais rolagem do que informação.
 */
export async function addWorkClientPortalImage(
  formData: FormData,
): Promise<ActionResult<{ images: WorkPortalImage[] }>> {
  const workId = String(formData.get('workId') ?? '');
  const descricao = String(formData.get('description') ?? '').trim();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return { success: false, error: 'Arquivo invalido.' };
  }

  const porta = await portaoDoEngenheiro(workId);
  if (!porta.ok) return { success: false, error: porta.error };

  const { data: tracking } = await porta.gate.supabase
    .from('work_trackings')
    .select('id, work_images')
    .eq('work_id', workId)
    .maybeSingle();
  if (!tracking?.id) {
    return { success: false, error: 'Esta obra ainda nao tem portal do cliente.' };
  }

  const atuais = Array.isArray(tracking.work_images)
    ? (tracking.work_images as WorkPortalImage[])
    : [];
  if (atuais.length >= GALERIA_MAX) {
    return {
      success: false,
      error: `A galeria ja tem ${GALERIA_MAX} fotos. Remova alguma antes de somar outra.`,
    };
  }

  const up = await subirImagem(tracking.id as string, 'galeria', file);
  if (!up.success) return { success: false, error: up.error };
  if (!up.data) return { success: false, error: 'Falha ao enviar a foto.' };

  const nova: WorkPortalImage = {
    id: `img-${globalThis.crypto.randomUUID()}`,
    name: file.name.slice(0, 120),
    url: up.data.url,
    uploadDate: new Date().toISOString(),
    description: descricao.slice(0, 280),
  };
  const proximas = [...atuais, nova];

  const { error } = await porta.gate.supabase
    .from('work_trackings')
    .update({ work_images: proximas, updated_at: new Date().toISOString() })
    .eq('work_id', workId);
  if (error) return { success: false, error: error.message };

  revalidatePath(`${WORKS_PATH}/obras/${workId}/portal-cliente`);
  return { success: true, data: { images: proximas } };
}

export async function removeWorkClientPortalImage(
  workId: string,
  imageId: string,
): Promise<ActionResult<{ images: WorkPortalImage[] }>> {
  const porta = await portaoDoEngenheiro(workId);
  if (!porta.ok) return { success: false, error: porta.error };

  const { data: tracking } = await porta.gate.supabase
    .from('work_trackings')
    .select('work_images')
    .eq('work_id', workId)
    .maybeSingle();
  if (!tracking) {
    return { success: false, error: 'Esta obra ainda nao tem portal do cliente.' };
  }

  const atuais = Array.isArray(tracking.work_images)
    ? (tracking.work_images as WorkPortalImage[])
    : [];
  const proximas = atuais.filter((i) => i?.id !== imageId);

  // O arquivo no bucket fica. Ele é público e barato, e apagar exigiria
  // distinguir foto subida por aqui de data URI legado, que não tem arquivo
  // nenhum para apagar.
  const { error } = await porta.gate.supabase
    .from('work_trackings')
    .update({ work_images: proximas, updated_at: new Date().toISOString() })
    .eq('work_id', workId);
  if (error) return { success: false, error: error.message };

  revalidatePath(`${WORKS_PATH}/obras/${workId}/portal-cliente`);
  return { success: true, data: { images: proximas } };
}
