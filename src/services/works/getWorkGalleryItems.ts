import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  GALLERY_ITEMS_LIMIT,
  type GalleryItem,
  type GalleryItemKind,
  type GalleryItemSource,
} from '@/types/works';
import { getDailyLogSignedUrls } from './getDailyLogSignedUrls';

const WORKS_BASE = '/tools/andamento-obra/obras';

interface ChatRow {
  id: string;
  message_id: string;
  kind: 'image' | 'video' | 'audio';
  storage_path: string;
  created_at: string;
}

interface DailyLogRow {
  id: string;
  daily_log_id: string;
  kind: 'image' | 'video';
  storage_path: string;
  created_at: string;
  log_date: string | null;
}

interface MilestoneRow {
  id: string;
  milestone_id: string;
  kind: 'image' | 'video';
  storage_path: string;
  created_at: string;
  milestone_name: string | null;
}

interface InstallationRow {
  id: string;
  installation_id: string;
  kind: 'image' | 'video';
  storage_path: string;
  created_at: string;
  numbering: string | null;
  status: string;
}

function formatDateBR(iso: string | null): string {
  if (!iso) return '';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

function buildItem(args: {
  id: string;
  source: GalleryItemSource;
  sourceId: string;
  kind: GalleryItemKind;
  storagePath: string;
  createdAt: string;
  contextLabel: string;
  linkPath: string;
  signedUrls: Record<string, string>;
}): GalleryItem {
  return {
    id: args.id,
    source: args.source,
    sourceId: args.sourceId,
    kind: args.kind,
    storagePath: args.storagePath,
    signedUrl: args.signedUrls[args.storagePath] ?? null,
    createdAt: args.createdAt,
    contextLabel: args.contextLabel,
    linkPath: args.linkPath,
  };
}

/**
 * Carrega itens da galeria unificada de uma obra. Agrega midias de quatro
 * origens (chat, diario, marco, instalacao) em uma unica lista ordenada por
 * created_at DESC e limitada a GALLERY_ITEMS_LIMIT (200) nesta fase.
 *
 * Filtra instalacoes com status='removed' (fotos persistem no banco/storage
 * para auditoria, mas nao aparecem na galeria).
 *
 * Paginacao real fica como divida explicita; ver plano da Fase 7.
 */
export async function getWorkGalleryItems(
  supabase: SupabaseClient,
  workId: string,
): Promise<GalleryItem[]> {
  // 6 queries em paralelo. Cada uma traz no maximo GALLERY_ITEMS_LIMIT pra
  // garantir que o merge final nao perca dados recentes de uma origem por
  // estouro de outra.
  const [chatRes, diaryRes, milestoneRes, installRes, checklistMediaRes, alertMediaRes] = await Promise.all([
    supabase
      .from('work_message_attachments')
      .select('id, message_id, kind, storage_path, created_at')
      .eq('work_id', workId)
      .order('created_at', { ascending: false })
      .limit(GALLERY_ITEMS_LIMIT),
    supabase
      .from('work_daily_log_media')
      .select(
        `id, daily_log_id, kind, storage_path, created_at,
         work_daily_logs:daily_log_id (log_date)`,
      )
      .eq('work_id', workId)
      .order('created_at', { ascending: false })
      .limit(GALLERY_ITEMS_LIMIT),
    supabase
      .from('work_milestone_event_media')
      .select(
        `id, milestone_id, kind, storage_path, created_at,
         work_milestones:milestone_id (name)`,
      )
      .eq('work_id', workId)
      .order('created_at', { ascending: false })
      .limit(GALLERY_ITEMS_LIMIT),
    supabase
      .from('work_pole_installation_media')
      .select(
        `id, installation_id, kind, storage_path, created_at,
         work_pole_installations:installation_id (numbering, status)`,
      )
      .eq('work_id', workId)
      .order('created_at', { ascending: false })
      .limit(GALLERY_ITEMS_LIMIT),
    supabase
      .from('work_checklist_item_media')
      .select('id, item_id, kind, storage_path, created_at')
      .eq('work_id', workId)
      .order('created_at', { ascending: false })
      .limit(GALLERY_ITEMS_LIMIT),
    supabase
      .from('work_alert_media')
      .select('id, alert_id, kind, storage_path, created_at')
      .eq('work_id', workId)
      .order('created_at', { ascending: false })
      .limit(GALLERY_ITEMS_LIMIT),
  ]);

  const allPaths: string[] = [];
  const collect = (rows: { storage_path: string }[] | null | undefined) => {
    if (!rows) return;
    for (const r of rows) allPaths.push(r.storage_path);
  };
  collect(chatRes.data as { storage_path: string }[] | null);
  collect(diaryRes.data as { storage_path: string }[] | null);
  collect(milestoneRes.data as { storage_path: string }[] | null);
  collect(installRes.data as { storage_path: string }[] | null);
  collect(checklistMediaRes.data as { storage_path: string }[] | null);
  collect(alertMediaRes.data as { storage_path: string }[] | null);

  const signedUrls = await getDailyLogSignedUrls(allPaths);

  const items: GalleryItem[] = [];

  // Chat
  for (const raw of (chatRes.data ?? []) as unknown as ChatRow[]) {
    items.push(
      buildItem({
        id: `chat:${raw.id}`,
        source: 'chat',
        sourceId: raw.message_id,
        kind: raw.kind,
        storagePath: raw.storage_path,
        createdAt: raw.created_at,
        contextLabel: `Chat - ${formatDateBR(raw.created_at)}`,
        linkPath: `${WORKS_BASE}/${workId}/chat`,
        signedUrls,
      }),
    );
  }

  // Diario
  type DiaryRaw = DailyLogRow & {
    work_daily_logs: { log_date: string | null } | null;
  };
  for (const raw of (diaryRes.data ?? []) as unknown as DiaryRaw[]) {
    const date = raw.work_daily_logs?.log_date ?? raw.created_at.slice(0, 10);
    items.push(
      buildItem({
        id: `daily_log:${raw.id}`,
        source: 'daily_log',
        sourceId: raw.daily_log_id,
        kind: raw.kind,
        storagePath: raw.storage_path,
        createdAt: raw.created_at,
        contextLabel: `Diario ${formatDateBR(date)}`,
        linkPath: `${WORKS_BASE}/${workId}/diario`,
        signedUrls,
      }),
    );
  }

  // Marcos
  type MilestoneRaw = MilestoneRow & {
    work_milestones: { name: string | null } | null;
  };
  for (const raw of (milestoneRes.data ?? []) as unknown as MilestoneRaw[]) {
    const name = raw.work_milestones?.name ?? 'Marco';
    items.push(
      buildItem({
        id: `milestone:${raw.id}`,
        source: 'milestone',
        sourceId: raw.milestone_id,
        kind: raw.kind,
        storagePath: raw.storage_path,
        createdAt: raw.created_at,
        contextLabel: `Marco ${name}`,
        linkPath: `${WORKS_BASE}/${workId}/progresso`,
        signedUrls,
      }),
    );
  }

  // Instalacoes - filtrar status='removed'
  type InstallRaw = InstallationRow & {
    work_pole_installations: { numbering: string | null; status: string } | null;
  };
  for (const raw of (installRes.data ?? []) as unknown as InstallRaw[]) {
    const parent = raw.work_pole_installations;
    if (parent?.status === 'removed') continue;
    const numbering = parent?.numbering?.trim();
    items.push(
      buildItem({
        id: `installation:${raw.id}`,
        source: 'installation',
        sourceId: raw.installation_id,
        kind: raw.kind,
        storagePath: raw.storage_path,
        createdAt: raw.created_at,
        contextLabel: numbering
          ? `Instalacao ${numbering}`
          : 'Instalacao sem numeracao',
        linkPath: `${WORKS_BASE}/${workId}/visao-geral`,
        signedUrls,
      }),
    );
  }

  // Checklists
  for (const raw of (checklistMediaRes.data ?? []) as unknown as { id: string; item_id: string; kind: 'image' | 'video'; storage_path: string; created_at: string }[]) {
    items.push(
      buildItem({
        id: `checklist_item:${raw.id}`,
        source: 'checklist_item',
        sourceId: raw.item_id,
        kind: raw.kind,
        storagePath: raw.storage_path,
        createdAt: raw.created_at,
        contextLabel: `Checklist - ${formatDateBR(raw.created_at)}`,
        linkPath: `${WORKS_BASE}/${workId}/checklists`,
        signedUrls,
      }),
    );
  }

  // Alertas
  for (const raw of (alertMediaRes.data ?? []) as unknown as { id: string; alert_id: string; kind: 'image' | 'video'; storage_path: string; created_at: string }[]) {
    items.push(
      buildItem({
        id: `alert:${raw.id}`,
        source: 'alert',
        sourceId: raw.alert_id,
        kind: raw.kind,
        storagePath: raw.storage_path,
        createdAt: raw.created_at,
        contextLabel: `Alerta - ${formatDateBR(raw.created_at)}`,
        linkPath: `${WORKS_BASE}/${workId}/alertas`,
        signedUrls,
      }),
    );
  }

  // Sort cronologico decrescente e cap em GALLERY_ITEMS_LIMIT.
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return items.slice(0, GALLERY_ITEMS_LIMIT);
}
