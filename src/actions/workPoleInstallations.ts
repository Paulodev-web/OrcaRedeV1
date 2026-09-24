'use server';

import { revalidatePath } from 'next/cache';
import { ensureMember } from '@/lib/auth/ensureMember';
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
  requireAuthUserId,
} from '@/lib/supabaseServer';
import { getPoleInstallationSignedUrls } from '@/services/works/getPoleInstallationSignedUrls';
import { mapRawInstallation } from '@/services/works/getPoleInstallations';
import {
  type ApprovePoleInstallationsInput,
  type ApprovePoleInstallationsResult,
  POLE_INSTALLATION_MEDIA_LIMITS,
  POLE_INSTALLATION_NOTES_MAX,
  POLE_INSTALLATION_NUMBERING_MAX,
  POLE_INSTALLATION_POLE_TYPE_MAX,
  type ActionResult,
  type GetUploadUrlForPoleInstallationMediaInput,
  type PoleInstallationMediaUploadInfo,
  type RecordPoleInstallationInput,
  type RecordPoleInstallationResult,
  type RemovePoleInstallationInput,
  type WorkPoleInstallation,
} from '@/types/works';

const ANDAMENTO_OBRA_BUCKET = 'andamento-obra';
const WORKS_PATH = '/tools/andamento-obra';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function generateUuid(): string {
  return globalThis.crypto.randomUUID();
}

function inferExtension(
  fileName: string,
  mimeType: string | undefined,
  kind: 'image' | 'video',
): string {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot > 0) {
    const ext = fileName
      .slice(lastDot + 1)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
    if (ext.length > 0 && ext.length <= 10) return ext;
  }
  if (mimeType) {
    const subtype = mimeType.split('/')[1]?.toLowerCase().replace(/[^a-z0-9]+/g, '') ?? '';
    if (subtype.length > 0 && subtype.length <= 10) return subtype;
  }
  return kind === 'image' ? 'jpg' : 'mp4';
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function isValidIsoTimestamp(value: string): boolean {
  if (typeof value !== 'string' || value.length === 0) return false;
  const dt = new Date(value);
  return !Number.isNaN(dt.getTime());
}

/**
 * Gera URL assinada de upload para midia de instalacao.
 *
 * Decisao do plano (Bloco 7):
 *  - O `installationId` e gerado pelo APK (UUID v4 client-side) ANTES do
 *    upload. O mesmo UUID e usado no path de storage e no insert da tabela
 *    de instalacao. Isso permite o fluxo offline-first do APK: o gerente tira
 *    foto sem conexao, grava localmente, e sincroniza depois.
 *  - Esta action NAO valida existencia previa da instalacao (pode estar em
 *    fila offline). Apenas valida formato UUID e role do solicitante.
 *
 * Path: {workId}/pole-installations/{installationId}/{uuid}.{ext}
 *
 * Politica do bucket exige role='manager' membro da obra (ver migration 7).
 */
export async function getUploadUrlForPoleInstallationMedia(
  input: GetUploadUrlForPoleInstallationMediaInput,
): Promise<ActionResult<PoleInstallationMediaUploadInfo>> {
  const gate = await ensureMember(input.workId);
  if (!gate.ok) return { success: false, error: gate.error };
  if (gate.role !== 'manager') {
    return {
      success: false,
      error: 'Apenas o gerente pode anexar midia de instalacao.',
    };
  }

  if (input.kind !== 'image' && input.kind !== 'video') {
    return { success: false, error: 'Tipo de midia invalido.' };
  }
  const limits = POLE_INSTALLATION_MEDIA_LIMITS[input.kind];

  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return { success: false, error: 'Tamanho do arquivo invalido.' };
  }
  if (input.sizeBytes > limits.maxBytes) {
    const maxMb = Math.round(limits.maxBytes / (1024 * 1024));
    return { success: false, error: `${capitalize(limits.label)} excede ${maxMb} MB.` };
  }
  if (input.mimeType && !input.mimeType.startsWith(limits.mimePrefix)) {
    return { success: false, error: `Tipo MIME nao compativel com ${limits.label}.` };
  }
  if (!UUID_RE.test(input.installationId)) {
    return { success: false, error: 'ID de instalacao invalido.' };
  }

  const fileName = (input.fileName ?? '').trim();
  if (fileName.length === 0) {
    return { success: false, error: 'Nome do arquivo invalido.' };
  }

  const fileId = generateUuid();
  const ext = inferExtension(fileName, input.mimeType, input.kind);
  const storagePath = `${input.workId}/pole-installations/${input.installationId}/${fileId}.${ext}`;

  const serviceRole = createSupabaseServiceRoleClient();
  const { data, error } = await serviceRole.storage
    .from(ANDAMENTO_OBRA_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    return { success: false, error: error?.message ?? 'Falha ao gerar URL de upload.' };
  }

  return {
    success: true,
    data: {
      uploadUrl: data.signedUrl,
      uploadToken: data.token,
      storagePath,
    },
  };
}

/**
 * Registra uma instalacao de poste em campo (chamada pelo APK; no portal
 * usada apenas para simulacao/admin).
 *
 * Idempotencia FORTE:
 *  - clientEventId e UNIQUE NOT NULL no banco.
 *  - Antes do INSERT, busca por clientEventId e retorna existente se houver.
 *  - Em corrida de concorrencia, o INSERT pode falhar com unique violation;
 *    a action captura o erro e retorna a instalacao existente (idempotente).
 *
 * Validacao em profundidade:
 *  - Coordenadas 0..6000 (CHECK do banco tambem valida).
 *  - GPS opcional, faixa de lat/lng quando presente.
 *  - Campos textuais com limites razoaveis.
 *  - Obra cancelada: bloqueia o INSERT.
 */
export async function recordPoleInstallation(
  input: RecordPoleInstallationInput,
): Promise<ActionResult<RecordPoleInstallationResult>> {
  const gate = await ensureMember(input.workId);
  if (!gate.ok) return { success: false, error: gate.error };
  if (gate.role !== 'manager') {
    return { success: false, error: 'Apenas o gerente registra instalacoes.' };
  }

  // Idempotencia forte exige clientEventId.
  if (!input.clientEventId || !UUID_RE.test(input.clientEventId)) {
    return {
      success: false,
      error: 'clientEventId obrigatorio (UUID v4) para idempotencia.',
    };
  }

  // Validar coordenadas no espaco logico do canvas.
  if (
    !Number.isFinite(input.xCoord)
    || !Number.isFinite(input.yCoord)
    || input.xCoord < 0
    || input.xCoord > 6000
    || input.yCoord < 0
    || input.yCoord > 6000
  ) {
    return { success: false, error: 'Coordenadas fora do quadro 0..6000.' };
  }

  // GPS opcional.
  if (input.gpsLat !== undefined && input.gpsLat !== null) {
    if (!Number.isFinite(input.gpsLat) || input.gpsLat < -90 || input.gpsLat > 90) {
      return { success: false, error: 'gpsLat fora da faixa.' };
    }
  }
  if (input.gpsLng !== undefined && input.gpsLng !== null) {
    if (!Number.isFinite(input.gpsLng) || input.gpsLng < -180 || input.gpsLng > 180) {
      return { success: false, error: 'gpsLng fora da faixa.' };
    }
  }
  if (input.gpsAccuracyMeters !== undefined && input.gpsAccuracyMeters !== null) {
    if (!Number.isFinite(input.gpsAccuracyMeters) || input.gpsAccuracyMeters < 0) {
      return { success: false, error: 'gpsAccuracyMeters invalido.' };
    }
  }

  if (!isValidIsoTimestamp(input.installedAt)) {
    return { success: false, error: 'installedAt invalido.' };
  }

  const numbering = input.numbering?.trim() ?? null;
  if (numbering && numbering.length > POLE_INSTALLATION_NUMBERING_MAX) {
    return {
      success: false,
      error: `Numeracao muito longa (max ${POLE_INSTALLATION_NUMBERING_MAX}).`,
    };
  }
  const poleType = input.poleType?.trim() ?? null;
  if (poleType && poleType.length > POLE_INSTALLATION_POLE_TYPE_MAX) {
    return {
      success: false,
      error: `Tipo do poste muito longo (max ${POLE_INSTALLATION_POLE_TYPE_MAX}).`,
    };
  }
  const notes = input.notes?.trim() ?? null;
  if (notes && notes.length > POLE_INSTALLATION_NOTES_MAX) {
    return {
      success: false,
      error: `Observacoes muito longas (max ${POLE_INSTALLATION_NOTES_MAX}).`,
    };
  }

  // O poste do projeto que esta marcacao acende. E por ele que o portal do
  // cliente casa a marcacao de campo com o poste do orcamento; sem ele, o
  // poste entra no portal como "levantado fora do projeto".
  const projectPostId = input.projectPostId ?? null;
  if (projectPostId !== null) {
    if (!UUID_RE.test(projectPostId)) {
      return { success: false, error: 'projectPostId invalido.' };
    }
    const { data: projectPost } = await gate.supabase
      .from('work_project_posts')
      .select('id')
      .eq('id', projectPostId)
      .eq('work_id', input.workId)
      .maybeSingle();
    if (!projectPost) {
      return { success: false, error: 'Poste do projeto nao pertence a esta obra.' };
    }
  }

  // Bloquear se obra cancelada.
  const { data: workRow } = await gate.supabase
    .from('works')
    .select('status')
    .eq('id', input.workId)
    .maybeSingle();
  if (workRow && (workRow.status as string) === 'cancelled') {
    return { success: false, error: 'Obra cancelada nao recebe novas instalacoes.' };
  }

  // Idempotencia: verifica antes do INSERT.
  const { data: existing } = await gate.supabase
    .from('work_pole_installations')
    .select('id')
    .eq('client_event_id', input.clientEventId)
    .maybeSingle();
  if (existing && existing.id) {
    return {
      success: true,
      data: { installationId: existing.id as string, isNew: false },
    };
  }

  const installationId =
    input.installationId && UUID_RE.test(input.installationId)
      ? input.installationId
      : generateUuid();

  // Validar paths de midia (se vierem).
  const media = Array.isArray(input.media) ? input.media : [];
  for (const m of media) {
    if (m.kind !== 'image' && m.kind !== 'video') {
      return { success: false, error: 'Tipo de midia invalido.' };
    }
    if (
      !m.storagePath
      || !m.storagePath.startsWith(`${input.workId}/pole-installations/`)
    ) {
      return { success: false, error: 'Path de midia fora da obra.' };
    }
    const limits = POLE_INSTALLATION_MEDIA_LIMITS[m.kind];
    if (m.mimeType && !m.mimeType.startsWith(limits.mimePrefix)) {
      return { success: false, error: `MIME incompativel com ${limits.label}.` };
    }
    if (typeof m.sizeBytes === 'number' && m.sizeBytes > limits.maxBytes) {
      const maxMb = Math.round(limits.maxBytes / (1024 * 1024));
      return { success: false, error: `${capitalize(limits.label)} excede ${maxMb} MB.` };
    }
  }

  // INSERT da instalacao.
  const { error: insertErr } = await gate.supabase
    .from('work_pole_installations')
    .insert({
      id: installationId,
      work_id: input.workId,
      created_by: gate.userId,
      x_coord: input.xCoord,
      y_coord: input.yCoord,
      gps_lat: input.gpsLat ?? null,
      gps_lng: input.gpsLng ?? null,
      gps_accuracy_meters: input.gpsAccuracyMeters ?? null,
      numbering,
      pole_type: poleType,
      notes,
      installed_at: input.installedAt,
      client_event_id: input.clientEventId,
      project_post_id: projectPostId,
    });

  if (insertErr) {
    // Idempotencia em corrida de concorrencia: unique violation no
    // client_event_id ainda significa sucesso para o caller.
    if (insertErr.code === '23505') {
      const { data: raceRow } = await gate.supabase
        .from('work_pole_installations')
        .select('id')
        .eq('client_event_id', input.clientEventId)
        .maybeSingle();
      if (raceRow && raceRow.id) {
        return {
          success: true,
          data: { installationId: raceRow.id as string, isNew: false },
        };
      }
    }
    return { success: false, error: insertErr.message };
  }

  // INSERT em batch das midias - garantir uma is_primary=true (a primeira).
  if (media.length > 0) {
    let primaryAssigned = media.some((m) => m.isPrimary === true);
    const rows = media.map((m, idx) => {
      let isPrimary = m.isPrimary === true;
      if (!primaryAssigned && idx === 0) {
        isPrimary = true;
        primaryAssigned = true;
      }
      return {
        installation_id: installationId,
        work_id: input.workId,
        kind: m.kind,
        storage_path: m.storagePath,
        mime_type: m.mimeType ?? null,
        size_bytes:
          typeof m.sizeBytes === 'number' && m.sizeBytes > 0 ? m.sizeBytes : null,
        width: typeof m.width === 'number' && m.width > 0 ? m.width : null,
        height: typeof m.height === 'number' && m.height > 0 ? m.height : null,
        duration_seconds:
          typeof m.durationSeconds === 'number' && m.durationSeconds > 0
            ? m.durationSeconds
            : null,
        is_primary: isPrimary,
      };
    });
    const { error: mediaErr } = await gate.supabase
      .from('work_pole_installation_media')
      .insert(rows);
    if (mediaErr) {
      return {
        success: false,
        error: `Instalacao registrada, mas falha ao salvar midias: ${mediaErr.message}`,
      };
    }
  }

  revalidatePath(`${WORKS_PATH}/obras/${input.workId}/visao-geral`);
  revalidatePath(`${WORKS_PATH}/obras/${input.workId}/galeria`);
  revalidatePath(WORKS_PATH);

  return {
    success: true,
    data: { installationId, isNew: true },
  };
}

/**
 * Manager corrige uma marcacao errada via soft-delete.
 *
 * Apenas o criador da instalacao pode remover (validado tanto na RLS quanto
 * no trigger protect_fields). Engineer nunca remove.
 *
 * Nao gera notificacao (correcao interna do gerente, nao interessa ao
 * engineer no feed).
 */
export async function removePoleInstallation(
  input: RemovePoleInstallationInput,
): Promise<ActionResult> {
  if (!input.installationId || !UUID_RE.test(input.installationId)) {
    return { success: false, error: 'ID de instalacao invalido.' };
  }

  // Carrega instalacao para descobrir workId e validar criador.
  const supabaseRoot = createSupabaseServiceRoleClient();
  const { data: install, error: fetchErr } = await supabaseRoot
    .from('work_pole_installations')
    .select('id, work_id, created_by, status, notes')
    .eq('id', input.installationId)
    .maybeSingle();

  if (fetchErr) return { success: false, error: fetchErr.message };
  if (!install) return { success: false, error: 'Instalacao nao encontrada.' };

  const workId = install.work_id as string;
  const gate = await ensureMember(workId);
  if (!gate.ok) return { success: false, error: gate.error };
  if (gate.role !== 'manager') {
    return { success: false, error: 'Apenas o gerente remove marcacoes.' };
  }
  if ((install.created_by as string) !== gate.userId) {
    return {
      success: false,
      error: 'Apenas o gerente que criou a marcacao pode remove-la.',
    };
  }
  if ((install.status as string) === 'removed') {
    return { success: false, error: 'Instalacao ja foi removida.' };
  }

  const reason = input.reason?.trim() ?? null;
  let nextNotes = (install.notes as string | null) ?? null;
  if (reason) {
    const tag = `[Removido: ${reason}]`;
    nextNotes = nextNotes ? `${nextNotes} ${tag}` : tag;
    if (nextNotes.length > POLE_INSTALLATION_NOTES_MAX) {
      nextNotes = nextNotes.slice(0, POLE_INSTALLATION_NOTES_MAX);
    }
  }

  const nowIso = new Date().toISOString();
  const { error: updErr } = await gate.supabase
    .from('work_pole_installations')
    .update({
      status: 'removed',
      removed_at: nowIso,
      removed_by: gate.userId,
      notes: nextNotes,
    })
    .eq('id', input.installationId);

  if (updErr) {
    return { success: false, error: updErr.message };
  }

  revalidatePath(`${WORKS_PATH}/obras/${workId}/visao-geral`);
  revalidatePath(`${WORKS_PATH}/obras/${workId}/galeria`);
  revalidatePath(WORKS_PATH);

  return { success: true };
}

interface LoadInstallationResult {
  installation: WorkPoleInstallation;
  signedUrls: Record<string, string>;
  creatorName: string | null;
}

/**
 * Carrega uma instalacao pelo id com URLs assinadas e nome do criador.
 * Usado pelo client de Visao Geral para hidratar pins sob demanda quando
 * Realtime entrega INSERT (gap de midia ate 3 retries, igual DailyLogList).
 *
 * RLS de work_pole_installations limita a membros da obra.
 */
export async function loadPoleInstallation(
  installationId: string,
): Promise<ActionResult<LoadInstallationResult>> {
  if (!installationId || !UUID_RE.test(installationId)) {
    return { success: false, error: 'ID de instalacao invalido.' };
  }

  const supabase = await createSupabaseServerClient();
  try {
    await requireAuthUserId(supabase);
  } catch {
    return { success: false, error: 'Sessao expirada. Faca login novamente.' };
  }

  const { data, error } = await supabase
    .from('work_pole_installations')
    .select(
      `id, work_id, created_by, project_post_id, x_coord, y_coord, gps_lat, gps_lng,
       gps_accuracy_meters, numbering, pole_type, notes, installed_at,
       status, removed_at, removed_by, approved_at, approved_by,
       client_event_id, created_at, updated_at,
       work_pole_installation_media (
         id, installation_id, work_id, kind, storage_path, mime_type,
         size_bytes, width, height, duration_seconds, is_primary, created_at
       )`,
    )
    .eq('id', installationId)
    .maybeSingle();

  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: 'Instalacao nao encontrada.' };

  const installation = mapRawInstallation(
    data as unknown as Parameters<typeof mapRawInstallation>[0],
  );
  const paths = installation.media.map((m) => m.storagePath);
  const signedUrls = await getPoleInstallationSignedUrls(paths);

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', installation.createdBy)
    .maybeSingle();
  const creatorName =
    (profile?.full_name as string | undefined)?.trim() || null;

  return {
    success: true,
    data: { installation, signedUrls, creatorName },
  };
}

/**
 * O engenheiro libera para o portal do cliente o que o campo levantou.
 *
 * Por que existe: o canvas interno acende o poste na hora em que o gerente
 * salva, e isso continua valendo (ver `docs/andamento-obra.md`, 5.1). O portal
 * do cliente, porem, e superficie externa. Nada atravessa para la sem o
 * engenheiro olhar. `approved_at` e esse portao.
 *
 * Quem pode: so o engenheiro da obra, e a trava e tripla:
 *  - esta action confere `gate.role`;
 *  - a policy `work_pole_installations_update_approval` exige membro engineer;
 *  - o trigger `protect_fields` recusa aprovacao que venha junto de qualquer
 *    outra alteracao, e exige `approved_by = auth.uid()`.
 *
 * O espelhamento em si NAO acontece aqui. Quem propaga para `tracked_posts` e
 * o trigger `trg_pole_installation_sync_tracking`, por statement: aprovar 24
 * postes de uma vez e um UPDATE so e um espelhamento so. Mantido no banco
 * porque a aprovacao tambem pode chegar por outro caminho, e a regra nao pode
 * morar em quem chama.
 *
 * `installationIds` vazio aprova tudo que esta pendente na obra.
 */
export async function approvePoleInstallations(
  input: ApprovePoleInstallationsInput,
): Promise<ActionResult<ApprovePoleInstallationsResult>> {
  const gate = await ensureMember(input.workId);
  if (!gate.ok) return { success: false, error: gate.error };
  if (gate.role !== 'engineer') {
    return {
      success: false,
      error: 'Apenas o engenheiro responsavel publica postes no portal do cliente.',
    };
  }

  const ids = (input.installationIds ?? []).filter((id) => UUID_RE.test(id));
  if ((input.installationIds?.length ?? 0) > 0 && ids.length === 0) {
    return { success: false, error: 'Nenhuma marcacao valida para aprovar.' };
  }

  let query = gate.supabase
    .from('work_pole_installations')
    .update({
      approved_at: new Date().toISOString(),
      approved_by: gate.userId,
    })
    .eq('work_id', input.workId)
    .eq('status', 'installed')
    .is('approved_at', null);

  if (ids.length > 0) {
    query = query.in('id', ids);
  }

  const { data, error } = await query.select('id');
  if (error) return { success: false, error: error.message };

  const pending = await countPendingApprovals(gate.supabase, input.workId);

  revalidatePath(`${WORKS_PATH}/obras/${input.workId}/visao-geral`);
  revalidatePath(`${WORKS_PATH}/obras/${input.workId}/dia-a-dia`);
  revalidatePath(WORKS_PATH);

  return { success: true, data: { affected: (data ?? []).length, pending } };
}

/**
 * Desfaz a publicacao de uma marcacao. O poste some do portal do cliente e
 * volta para a fila do engenheiro; no canvas interno ele continua aceso,
 * porque continua levantado em campo.
 */
export async function unapprovePoleInstallation(
  installationId: string,
): Promise<ActionResult<ApprovePoleInstallationsResult>> {
  if (!installationId || !UUID_RE.test(installationId)) {
    return { success: false, error: 'ID de instalacao invalido.' };
  }

  const supabaseRoot = createSupabaseServiceRoleClient();
  const { data: install, error: fetchErr } = await supabaseRoot
    .from('work_pole_installations')
    .select('id, work_id, approved_at')
    .eq('id', installationId)
    .maybeSingle();

  if (fetchErr) return { success: false, error: fetchErr.message };
  if (!install) return { success: false, error: 'Instalacao nao encontrada.' };

  const workId = install.work_id as string;
  const gate = await ensureMember(workId);
  if (!gate.ok) return { success: false, error: gate.error };
  if (gate.role !== 'engineer') {
    return {
      success: false,
      error: 'Apenas o engenheiro responsavel despublica postes.',
    };
  }
  if (install.approved_at === null) {
    return { success: false, error: 'Esta marcacao ainda nao foi publicada.' };
  }

  const { error: updErr } = await gate.supabase
    .from('work_pole_installations')
    .update({ approved_at: null, approved_by: null })
    .eq('id', installationId);

  if (updErr) return { success: false, error: updErr.message };

  const pending = await countPendingApprovals(gate.supabase, workId);

  revalidatePath(`${WORKS_PATH}/obras/${workId}/visao-geral`);
  revalidatePath(WORKS_PATH);

  return { success: true, data: { affected: 1, pending } };
}

/**
 * Reconstroi o portal do cliente a partir da obra, do zero.
 *
 * Caminho de conserto, nao de rotina: o espelhamento normal roda no trigger a
 * cada aprovacao. Serve para a primeira vez (obra importada antes desta
 * versao) e para quando o orcamento mudou de poste e o portal ficou para tras.
 */
export async function resyncWorkTracking(
  workId: string,
): Promise<ActionResult<{ trackingId: string | null }>> {
  const gate = await ensureMember(workId);
  if (!gate.ok) return { success: false, error: gate.error };
  if (gate.role !== 'engineer') {
    return { success: false, error: 'Apenas o engenheiro ressincroniza o portal.' };
  }

  const { data, error } = await gate.supabase.rpc('sync_work_tracking_from_work', {
    p_work_id: workId,
  });
  if (error) return { success: false, error: error.message };

  const result = (data ?? {}) as { trackingId?: string };

  revalidatePath(`${WORKS_PATH}/obras/${workId}/visao-geral`);

  return { success: true, data: { trackingId: result.trackingId ?? null } };
}

async function countPendingApprovals(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  workId: string,
): Promise<number> {
  const { count } = await supabase
    .from('work_pole_installations')
    .select('id', { count: 'exact', head: true })
    .eq('work_id', workId)
    .eq('status', 'installed')
    .is('approved_at', null);
  return count ?? 0;
}
