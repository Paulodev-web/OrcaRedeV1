"use client";
import { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft,
  Plus,
  Search,
  Calendar,
  MapPin,
  User,
  Activity,
  CheckCircle,
  Play,
  Save,
  Edit3,
  Target,
  TrendingUp,
  Eye,
  Image,
  Upload,
  Clock,
  Building,
  Trash2,
  Flag,
  CheckCircle2,
  Circle,
  Clock3,
  ExternalLink,
  Copy,
  Link2,
} from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabaseClient';
import { WorkTracking, TrackedPost, Orcamento, BudgetPostDetail } from '@/types';
import { PostProgressModal } from './PostProgressModal';
import { CanvasVisual } from './CanvasVisual';
import { useAlertDialog } from '@/hooks/useAlertDialog';
import { AlertDialog } from '@/components/ui/alert-dialog';

type ViewMode = 'dashboard' | 'select-budget' | 'tracking-detail';

const DEMO_TRACKING_ID = 'tracking-demo-1';

/** Converte string para UUID válido (determinístico) para sync com Supabase */
function toValidUuid(str: string): string {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(str)) return str;
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  const h2 = Math.imul(h, 31);
  const h3 = Math.imul(h2, 31);
  const hex = [
    (h >>> 0).toString(16).padStart(8, '0'),
    (h2 >>> 0).toString(16).padStart(8, '0').slice(-8),
    (h3 >>> 0).toString(16).padStart(8, '0').slice(-8),
    ((h ^ h2 ^ h3) >>> 0).toString(16).padStart(8, '0').slice(-8),
  ].join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(12, 15)}-8${hex.slice(15, 18)}-${hex.slice(18, 30)}`;
}

function calculateWeightedProgress(tracking: Partial<WorkTracking>): number {
  const ratio = (installed: number, planned?: number) => {
    if (!planned || planned <= 0) return 0;
    return Math.min(installed / planned, 1);
  };

  const plannedMt = tracking.planned_mt_meters ?? 0;
  const plannedBt = tracking.planned_bt_meters ?? 0;
  const plannedPoles = tracking.planned_poles ?? 0;
  const plannedEquip = tracking.planned_equipment ?? 0;
  const plannedLighting = tracking.planned_public_lighting ?? 0;

  const hasAnyGoal = [plannedMt, plannedBt, plannedPoles, plannedEquip, plannedLighting].some((v) => v > 0);
  if (!hasAnyGoal) return tracking.progress_percentage ?? 0;

  const mtInstalledMeters = (tracking.mt_extension_km ?? 0) * 1000;
  const btInstalledMeters = (tracking.bt_extension_km ?? 0) * 1000;
  const polesInstalled = tracking.poles_installed ?? 0;
  const equipInstalled = tracking.equipment_installed ?? 0;
  const lightingInstalled = tracking.public_lighting_installed ?? 0;

  const progress =
    ratio(polesInstalled, plannedPoles) * 40 +
    ratio(mtInstalledMeters, plannedMt) * 15 +
    ratio(btInstalledMeters, plannedBt) * 25 +
    ratio(equipInstalled, plannedEquip) * 10 +
    ratio(lightingInstalled, plannedLighting) * 10;

  return Math.max(0, Math.min(100, Math.round(progress)));
}

// Carregar dados do Supabase
const loadWorkTrackings = async (): Promise<WorkTracking[]> => {
  try {
    const { data: rows, error } = await supabase
      .from('work_trackings')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Erro ao carregar work_trackings:', error);
      return [];
    }

    if (!rows || rows.length === 0) {
      return [];
    }

    const workTrackings: WorkTracking[] = await Promise.all(
      rows
        .filter(row => row.public_id !== DEMO_TRACKING_ID) // Filtra demos
        .map(async (row) => {
          // Carregar postes e conexões em paralelo
          const [postsResult, connectionsResult] = await Promise.all([
            supabase.from('tracked_posts').select('*').eq('tracking_id', row.id).order('name'),
            supabase.from('post_connections').select('*').eq('tracking_id', row.id),
          ]);

          return {
            id: row.public_id ?? row.id,
            budget_id: row.budget_id ?? '',
            name: row.name ?? '',
            status: row.status ?? 'Planejado',
            network_extension_km: row.network_extension_km ?? 0,
            planned_network_meters: row.planned_network_meters ?? undefined,
            planned_mt_meters: row.planned_mt_meters ?? undefined,
            mt_extension_km: row.mt_extension_km ?? 0,
            planned_bt_meters: row.planned_bt_meters ?? undefined,
            bt_extension_km: row.bt_extension_km ?? 0,
            planned_poles: row.planned_poles ?? undefined,
            poles_installed: row.poles_installed ?? 0,
            planned_equipment: row.planned_equipment ?? undefined,
            equipment_installed: row.equipment_installed ?? 0,
            planned_public_lighting: row.planned_public_lighting ?? undefined,
            public_lighting_installed: row.public_lighting_installed ?? 0,
            start_date: row.start_date ?? undefined,
            estimated_completion: row.estimated_completion ?? undefined,
            actual_completion: row.actual_completion ?? undefined,
            progress_percentage: row.progress_percentage ?? 0,
            render_version: (row.render_version ?? 2) as 1 | 2,
            current_focus_title: row.current_focus_title ?? undefined,
            current_focus_description: row.current_focus_description ?? undefined,
            project_description: row.project_description ?? undefined,
            responsible_person: row.responsible_person ?? undefined,
            created_at: row.created_at ?? new Date().toISOString(),
            updated_at: row.updated_at ?? new Date().toISOString(),
            budget_data: {
              project_name: row.name ?? '',
              plan_image_url: row.plan_image_url ?? undefined,
              client_name: row.client_name ?? undefined,
              city: row.city ?? undefined,
              client_logo_url: row.client_logo_url ?? undefined,
            },
            tracked_posts: (postsResult.data || []).map((p) => ({
              id: p.id,
              tracking_id: p.tracking_id,
              original_post_id: p.original_post_id || p.id,
              name: p.name,
              custom_name: p.custom_name || undefined,
              x_coord: Number(p.x_coord),
              y_coord: Number(p.y_coord),
              status: p.status as any,
              installation_date: p.installation_date || undefined,
              completion_date: p.completion_date || undefined,
              notes: p.notes || undefined,
              photos: [],
              materials: [],
            })),
            post_connections: (connectionsResult.data || []).map((c: any) => {
              const et = c.connection_type === 'green' ? 'green' : c.connection_type === 'blue' ? 'blue' : null;
              const enc = typeof c.client_id === 'string' ? c.client_id : '';
              return {
                id: c.id,
                from_post_id: c.from_post_id,
                to_post_id: c.to_post_id,
                connection_type: (et ?? (enc.startsWith('green:') ? 'green' : 'blue')) as 'blue' | 'green'
              };
            }),
          };
        })
    );

    return workTrackings;
  } catch (error) {
    console.error('Erro ao carregar dados do Supabase:', error);
    return [];
  }
};

export function EngineerPortal() {
  const ON_COLORS = {
    navy: '#1D3140',
    blue: '#64ABDE',
  };
  const { setActiveModule, budgets, fetchBudgets, fetchBudgetDetails } = useApp();
  const alertDialog = useAlertDialog();
  const [currentView, setCurrentView] = useState<ViewMode>('dashboard');
  const [workTrackings, setWorkTrackings] = useState<WorkTracking[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTrackingId, setActiveTrackingId] = useState<string | null>(null);
  const [isCreatingTracking, setIsCreatingTracking] = useState(false);
  
  // Estados para entrada rápida (extensão de rede e postes)
  const [_networkExtensionInput, _setNetworkExtensionInput] = useState('');
  
  // Estados para abas
  const [activeTab, setActiveTab] = useState<'obra' | 'imagens' | 'timeline'>('obra');
  
  // Estados para imagens
  const [workImages, setWorkImages] = useState<Array<{
    id: string;
    name: string;
    url: string;
    uploadDate: string;
    description?: string;
  }>>([]);
  
  // Estados para timeline
  const [timelineMilestones, setTimelineMilestones] = useState<Array<{
    id: string;
    title: string;
    description: string;
    date: string;
    status: 'completed' | 'in-progress' | 'pending';
    createdAt: string;
  }>>([]);
  
  // Estados para formulários
  const [newMilestone, setNewMilestone] = useState({
    title: '',
    description: '',
    date: '',
  });
  
  // Estados para modos de interação
  const [interactionMode, setInteractionMode] = useState<'view' | 'select-posts' | 'connect-network'>('view');
  const [networkConnectionType, setNetworkConnectionType] = useState<'blue' | 'green' | null>(null);
  const [networkConnectionPending, setNetworkConnectionPending] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    networkExtension: 0,
    plannedNetworkMeters: 0,
    plannedMtMeters: 0,
    plannedBtMeters: 0,
    plannedPoles: 0,
    plannedEquipment: 0,
    plannedPublicLighting: 0,
    startDate: '',
    estimatedCompletion: '',
    notes: '',
  });
  const [selectedPostForModal, setSelectedPostForModal] = useState<TrackedPost | null>(null);
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [_selectedPostDetail, _setSelectedPostDetail] = useState<BudgetPostDetail | null>(null);
  const [pdfRenderVersion, setPdfRenderVersion] = useState<1 | 2>(2);
  const [isSavingChanges, setIsSavingChanges] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasLoadedFromBudgetsRef = useRef(false);

  useEffect(() => {
    fetchBudgets();
    console.log('🎯 Portal do Engenheiro: Carregado com', workTrackings.length, 'obras');
  }, [fetchBudgets]);

  // Carregar todos os work_trackings do Supabase na inicialização
  useEffect(() => {
    const loadInitialData = async () => {
      const trackings = await loadWorkTrackings();
      setWorkTrackings(trackings);
    };
    
    loadInitialData();
  }, []);

  // Carregar do Supabase apenas na carga inicial (quando budgets chega). Não reexecutar para evitar sobrescrever postes recém-adicionados antes do sync.
  useEffect(() => {
    if (!budgets?.length || hasLoadedFromBudgetsRef.current) return;
    hasLoadedFromBudgetsRef.current = true;
    const budgetIds = budgets.map((b) => b.id);
    const loadFromSupabase = async () => {
      const { data: rows, error } = await supabase
        .from('work_trackings')
        .select('*')
        .in('budget_id', budgetIds);

      if (error) {
        console.warn('Erro ao carregar acompanhamentos do Supabase:', error);
        return;
      }
      if (!rows?.length) return;

      const trackingIds = rows.map((r) => r.id);

      // Buscar postes e conexões de rede para cada tracking
      const [postsResult, connectionsResult] = await Promise.all([
        supabase.from('tracked_posts').select('*').in('tracking_id', trackingIds).order('name'),
        supabase.from('post_connections').select('*').in('tracking_id', trackingIds),
      ]);

      const postsByTracking = new Map<string, typeof postsResult.data>();
      (postsResult.data || []).forEach((p) => {
        const list = postsByTracking.get(p.tracking_id) || [];
        list.push(p);
        postsByTracking.set(p.tracking_id, list);
      });
      const connectionsByTracking = new Map<string, typeof connectionsResult.data>();
      (connectionsResult.data || []).forEach((c) => {
        const list = connectionsByTracking.get(c.tracking_id) || [];
        list.push(c);
        connectionsByTracking.set(c.tracking_id, list);
      });

      setWorkTrackings((prev) => {
        const list = [...prev];
        for (const row of rows) {
          const budget = budgets.find((b) => b.id === row.budget_id);
          const postsData = postsByTracking.get(row.id) || [];
          const connectionsData = connectionsByTracking.get(row.id) || [];

          const trackedPosts = postsData.map((post) => ({
            id: post.id,
            tracking_id: row.public_id ?? row.id,
            original_post_id: post.original_post_id || post.id,
            name: post.name,
            custom_name: post.custom_name || undefined,
            x_coord: Number(post.x_coord),
            y_coord: Number(post.y_coord),
            status: post.status as TrackedPost['status'],
            installation_date: post.installation_date || undefined,
            completion_date: post.completion_date || undefined,
            notes: post.notes || undefined,
            photos: [],
            materials: [],
          }));
          const postConnections = connectionsData.map((conn: any) => {
            const explicitType = conn.connection_type === 'green' ? 'green' : conn.connection_type === 'blue' ? 'blue' : null;
            const encoded = typeof conn.client_id === 'string' ? conn.client_id : '';
            const parsedFromClientId = encoded.startsWith('green:') ? 'green' : 'blue';
            const parsedType = explicitType ?? parsedFromClientId;
            return {
              id: conn.id,
              from_post_id: conn.from_post_id,
              to_post_id: conn.to_post_id,
              connection_type: parsedType as 'blue' | 'green',
            };
          });

          const work: WorkTracking = {
            id: row.public_id ?? row.id,
            budget_id: row.budget_id ?? '',
            name: row.name ?? '',
            status: (row.status as WorkTracking['status']) ?? 'Planejado',
            network_extension_km: row.network_extension_km ?? 0,
            planned_network_meters: row.planned_network_meters ?? undefined,
            planned_mt_meters: row.planned_mt_meters ?? undefined,
            mt_extension_km: row.mt_extension_km ?? 0,
            planned_bt_meters: row.planned_bt_meters ?? undefined,
            bt_extension_km: row.bt_extension_km ?? 0,
            planned_poles: row.planned_poles ?? undefined,
            poles_installed: row.poles_installed ?? 0,
            planned_equipment: row.planned_equipment ?? undefined,
            equipment_installed: row.equipment_installed ?? 0,
            planned_public_lighting: row.planned_public_lighting ?? undefined,
            public_lighting_installed: row.public_lighting_installed ?? 0,
            start_date: row.start_date ?? undefined,
            estimated_completion: row.estimated_completion ?? undefined,
            actual_completion: row.actual_completion ?? undefined,
            progress_percentage: row.progress_percentage ?? 0,
            current_focus_title: row.current_focus_title ?? undefined,
            current_focus_description: row.current_focus_description ?? undefined,
            project_description: row.project_description ?? undefined,
            responsible_person: row.responsible_person ?? undefined,
            created_at: row.created_at ?? new Date().toISOString(),
            updated_at: row.updated_at ?? new Date().toISOString(),
            budget_data: {
              project_name: budget?.nome ?? row.name ?? '',
              client_name: budget?.clientName ?? row.client_name,
              city: budget?.city ?? row.city,
              plan_image_url: budget?.imagemPlanta ?? row.plan_image_url,
              client_logo_url: row.client_logo_url ?? undefined,
            },
            tracked_posts: trackedPosts,
            post_connections: postConnections,
          };
          const idx = list.findIndex((w) => w.id === work.id);
          if (idx === -1) list.push(work);
          else {
            // Supabase é a fonte da verdade para postes/conexões (inclusive listas vazias após exclusão)
            const existing = list[idx];
            list[idx] = {
              ...existing,
              ...work,
              tracked_posts: trackedPosts,
              post_connections: postConnections,
              budget_data: existing.budget_data ?? work.budget_data,
            };
          }

          // Timeline e imagens já estão carregados do Supabase no objeto work
        }
        return list;
      });
    };
    loadFromSupabase();
  }, [budgets]);

  // Sincronizar obras, postes e conexões com Supabase (único ponto de persistência)
  // Debounce evita race: múltiplas alterações rápidas não disparam syncs paralelos que apagariam postes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
    const syncToSupabase = async () => {
      for (const t of workTrackings) {
        if (!t.budget_id) continue; // budget_id obrigatório no banco
        try {
          // 1. Upsert da obra (timeline e imagens são gerenciados diretamente no Supabase)

          // Progresso real ponderado: Poste 40%, MT 15%, BT 25%, Equip 10%, Ilum 10%
          const syncProgress = calculateWeightedProgress(t);

          // Nome da obra e cliente vêm do orçamento
          const workName = t.budget_data?.project_name ?? t.name;
          const clientName = t.budget_data?.client_name ?? null;

          const { data: workData, error: workError } = await supabase.from('work_trackings').upsert(
            {
              public_id: t.id,
              budget_id: t.budget_id,
              name: workName,
              status: t.status,
              network_extension_km: t.network_extension_km ?? 0,
              progress_percentage: syncProgress,
              start_date: t.start_date || null,
              estimated_completion: t.estimated_completion || null,
              actual_completion: t.actual_completion || null,
              planned_network_meters: t.planned_network_meters ?? null,
              planned_mt_meters: t.planned_mt_meters ?? null,
              mt_extension_km: t.mt_extension_km ?? 0,
              planned_bt_meters: t.planned_bt_meters ?? null,
              bt_extension_km: t.bt_extension_km ?? 0,
              planned_poles: t.planned_poles ?? null,
              poles_installed: t.poles_installed ?? 0,
              planned_equipment: t.planned_equipment ?? null,
              equipment_installed: t.equipment_installed ?? 0,
              planned_public_lighting: t.planned_public_lighting ?? null,
              public_lighting_installed: t.public_lighting_installed ?? 0,
              plan_image_url: t.budget_data?.plan_image_url ?? null,
              client_logo_url: t.budget_data?.client_logo_url ?? null,
              client_name: clientName,
              city: t.budget_data?.city ?? null,
              current_focus_title: t.current_focus_title ?? null,
              current_focus_description: t.current_focus_description ?? null,
              project_description: t.project_description ?? null,
              responsible_person: t.responsible_person ?? null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'public_id' }
          ).select('id').single();

          if (workError) throw workError;
          const trackingId = workData?.id;
          if (!trackingId) continue;

          const postIdMap = new Map<string, string>();
          (t.tracked_posts || []).forEach(p => postIdMap.set(p.id, toValidUuid(p.id)));

          // 2. Inserir/atualizar postes (upsert - nunca delete em massa)
          if (t.tracked_posts?.length > 0) {
            const postsToUpsert = t.tracked_posts.map(post => ({
              id: postIdMap.get(post.id)!,
              client_id: post.id,
              tracking_id: trackingId,
              original_post_id: toValidUuid(post.original_post_id || post.id),
              name: post.name,
              custom_name: post.custom_name || null,
              x_coord: post.x_coord,
              y_coord: post.y_coord,
              status: post.status,
              installation_date: post.installation_date || null,
              completion_date: post.completion_date || null,
              notes: post.notes || null,
              updated_at: new Date().toISOString(),
            }));
            await supabase.from('tracked_posts').upsert(postsToUpsert, { onConflict: 'id' });
          }

          // 3. Inserir/atualizar conexões (só upsert - nunca delete em massa; exclusão só no clique direito na linha)
          if (t.post_connections?.length > 0) {
            const pairKey = (a: string, b: string) => [a, b].sort().join('|');
            const seenPairs = new Set<string>();
            const deduped = t.post_connections.filter(conn => {
              const key = pairKey(conn.from_post_id, conn.to_post_id);
              if (seenPairs.has(key)) return false;
              seenPairs.add(key);
              return true;
            });
            const connectionsToUpsert = deduped.map(conn => {
              const fromId = postIdMap.get(conn.from_post_id) ?? toValidUuid(conn.from_post_id);
              const toId = postIdMap.get(conn.to_post_id) ?? toValidUuid(conn.to_post_id);
              return {
                id: toValidUuid(conn.id),
                client_id: `${conn.connection_type ?? 'blue'}:${conn.id}`,
                tracking_id: trackingId,
                from_post_id: fromId,
                to_post_id: toId,
                connection_type: (conn.connection_type ?? 'blue') as 'blue' | 'green',
                status: 'Pendente',
              };
            });
            // Garantir IDs únicos: se houver colisão, usar índice
            const seen = new Set<string>();
            connectionsToUpsert.forEach((c) => {
              if (seen.has(c.id)) {
                (c as any).id = crypto.randomUUID();
              }
              seen.add(c.id);
            });
            const { error: connError } = await supabase.from('post_connections').upsert(connectionsToUpsert, { onConflict: 'id' });
            if (connError) {
              console.error('Erro ao salvar conexões de rede:', connError);
              alertDialog.showError('Erro ao salvar linhas de rede', connError.message);
            }
          }
        } catch (e) {
          console.warn('Sync obra/postes para Supabase:', e);
        }
      }
    };
    syncToSupabase();
    }, 1500);
    return () => clearTimeout(timeoutId);
  }, [workTrackings, timelineMilestones, workImages]);

  const activeTracking = useMemo(
    () => workTrackings.find((tracking) => tracking.id === activeTrackingId) || null,
    [workTrackings, activeTrackingId]
  );

  /** Postes no formato do CanvasVisual; exibe todos os postes do banco. */
  const trackingPostsForCanvas = useMemo((): (BudgetPostDetail & { status?: string })[] => {
    if (!activeTracking?.tracked_posts?.length) return [];
    return activeTracking.tracked_posts.map((p) => ({
      id: p.id,
      name: p.name || 'Poste',
      custom_name: p.custom_name,
      counter: 0,
      x_coord: p.x_coord,
      y_coord: p.y_coord,
      post_types: null,
      post_item_groups: [],
      post_materials: [],
      status: p.status,
    }));
  }, [activeTracking?.tracked_posts]);

  /** Adicionar poste no mapa: clique direito no canvas. */
  const handleCanvasRightClickAddPoste = (coords: { x: number; y: number }) => {
    if (!activeTracking) return;
    const currentOnMap = activeTracking.tracked_posts?.length ?? 0;
    const newId = `tracked-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const newPost: TrackedPost = {
      id: newId,
      tracking_id: activeTracking.id,
      original_post_id: newId,
      name: `Poste ${currentOnMap + 1}`,
      x_coord: coords.x,
      y_coord: coords.y,
      status: 'Pendente',
      photos: [],
      materials: [],
    };
    updateTracking(activeTracking.id, (t) => {
      const newPosts = [...(t.tracked_posts || []), newPost];
      return {
        ...t,
        tracked_posts: newPosts,
        poles_installed: Math.max(t.poles_installed ?? 0, newPosts.length),
        updated_at: new Date().toISOString(),
      };
    });
  };

  /** Excluir poste do mapa: clique direito no ícone. Único lugar que apaga poste do banco. */
  const handleDeletePosteFromMap = async (posteId: string) => {
    if (!activeTracking) return;
    const dbPostId = toValidUuid(posteId);
    await supabase.from('tracked_posts').delete().eq('id', dbPostId);
    await supabase.from('post_connections').delete().eq('from_post_id', dbPostId);
    await supabase.from('post_connections').delete().eq('to_post_id', dbPostId);
    updateTracking(activeTracking.id, (t) => {
      const newPosts = (t.tracked_posts || []).filter((p) => p.id !== posteId);
      const newConnections = (t.post_connections || []).filter(
        (c) => c.from_post_id !== posteId && c.to_post_id !== posteId
      );
      return {
        ...t,
        tracked_posts: newPosts,
        post_connections: newConnections,
        updated_at: new Date().toISOString(),
      };
    });
  };

  /** Excluir conexão de rede: clique direito na linha/arco. Único lugar que apaga conexão do banco. */
  const handleDeleteConnectionFromMap = async (connectionId: string) => {
    if (!activeTracking) return;
    const dbConnId = toValidUuid(connectionId);
    await supabase.from('post_connections').delete().eq('id', dbConnId);
    updateTracking(activeTracking.id, (t) => ({
      ...t,
      post_connections: (t.post_connections || []).filter((c) => c.id !== connectionId),
      updated_at: new Date().toISOString(),
    }));
  };

  /** Adicionar conexão de rede: criada no modo de conexão do canvas */
  const handleAddConnectionFromMap = (fromPostId: string, toPostId: string, connectionType: 'blue' | 'green' = 'blue') => {
    if (!activeTracking) return;
    
    updateTracking(activeTracking.id, (tracking) => {
      // Verificar se a conexão já existe
      const exists = tracking.post_connections.some(
        (connection) =>
          (connection.from_post_id === fromPostId && connection.to_post_id === toPostId) ||
          (connection.from_post_id === toPostId && connection.to_post_id === fromPostId)
      );

      if (exists) {
        return tracking;
      }

      const newConnection = {
        id: crypto.randomUUID(),
        from_post_id: fromPostId,
        to_post_id: toPostId,
        connection_type: connectionType,
      };

      console.log(`🔗 Conexão adicionada via canvas: ${fromPostId} -> ${toPostId} (${connectionType})`);

      return {
        ...tracking,
        post_connections: [...tracking.post_connections, newConnection],
        updated_at: new Date().toISOString(),
      };
    });
  };

  useEffect(() => {
    if (activeTracking?.render_version) {
      setPdfRenderVersion(activeTracking.render_version);
    }
  }, [activeTracking?.render_version]);

  const formatDate = (date?: string): string => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('pt-BR');
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'Concluído':
        return 'text-green-700 bg-green-50 border-green-200';
      case 'Em Andamento':
        return 'text-[#1D3140] bg-[#64ABDE]/20 border-[#64ABDE]/50';
      case 'Pausado':
        return 'text-amber-700 bg-amber-50 border-amber-200';
      case 'Planejado':
        return 'text-gray-700 bg-gray-50 border-gray-200';
      default:
        return 'text-gray-700 bg-gray-50 border-gray-200';
    }
  };

  const updateTracking = (trackingId: string, updater: (tracking: WorkTracking) => WorkTracking): void => {
    setWorkTrackings((prev) => prev.map((tracking) => (tracking.id === trackingId ? updater(tracking) : tracking)));
  };

  // Carregar dados específicos da obra quando mudar de tracking
  useEffect(() => {
    if (activeTracking) {
      // Carregar dados específicos desta obra do Supabase
      const loadActiveTrackingData = async () => {
        try {
          const { data: row, error } = await supabase
            .from('work_trackings')
            .select('work_images, timeline_milestones')
            .eq('public_id', activeTracking.id)
            .single();

          if (!error && row) {
            // Carregar imagens
            if (row.work_images && Array.isArray(row.work_images)) {
              setWorkImages(row.work_images);
            } else {
              setWorkImages([]);
            }

            // Carregar timeline
            if (row.timeline_milestones && Array.isArray(row.timeline_milestones)) {
              const orderedTimeline = row.timeline_milestones.sort((a: any, b: any) => {
                if (a.id.includes('milestone-start')) return -1;
                if (b.id.includes('milestone-start')) return 1;
                if (a.id.includes('milestone-completion')) return 1;
                if (b.id.includes('milestone-completion')) return -1;
                return new Date(a.date).getTime() - new Date(b.date).getTime();
              });
              setTimelineMilestones(orderedTimeline);
            } else {
              // Criar marcos iniciais obrigatórios (início e conclusão)
              const initialMilestones = [
                {
                  id: `milestone-start-${Date.now()}`,
                  title: 'Início da Obra',
                  description: 'Início oficial dos trabalhos de instalação',
                  date: activeTracking.start_date || new Date().toISOString().split('T')[0],
                  status: 'completed' as const,
                  createdAt: new Date().toISOString(),
                },
                {
                  id: `milestone-completion-${Date.now()}`,
                  title: 'Conclusão da Obra',
                  description: 'Finalização completa da obra',
                  date: activeTracking.estimated_completion || new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                  status: activeTracking.status === 'Concluído' ? 'completed' as const : 'pending' as const,
                  createdAt: new Date().toISOString(),
                }
              ];
              setTimelineMilestones(initialMilestones);
            }
          }
        } catch (error) {
          console.error('Erro ao carregar dados específicos da obra:', error);
          setWorkImages([]);
          setTimelineMilestones([]);
        }
      };

      loadActiveTrackingData();
    }
  }, [activeTracking?.id]);

  // Função para salvar imagens no Supabase
  const saveWorkImages = async (trackingId: string, images: typeof workImages) => {
    try {
      const { error } = await supabase
        .from('work_trackings')
        .update({
          work_images: images,
          updated_at: new Date().toISOString(),
        })
        .eq('public_id', trackingId);
        
      if (error) {
        console.error('Erro ao salvar imagens:', error);
      }
    } catch (error) {
      console.error('Erro ao salvar imagens no Supabase:', error);
    }
  };

  // Função para salvar timeline no Supabase
  const saveTimeline = async (trackingId: string, timeline: typeof timelineMilestones) => {
    const orderedTimeline = timeline.sort((a, b) => {
      // Início sempre primeiro
      if (a.id.includes('milestone-start')) return -1;
      if (b.id.includes('milestone-start')) return 1;
      
      // Conclusão sempre último
      if (a.id.includes('milestone-completion')) return 1;
      if (b.id.includes('milestone-completion')) return -1;
      
      // Outros por data
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
    
    try {
      const { error } = await supabase
        .from('work_trackings')
        .update({
          timeline_milestones: orderedTimeline,
          updated_at: new Date().toISOString(),
        })
        .eq('public_id', trackingId);
        
      if (error) {
        console.error('Erro ao salvar timeline:', error);
      }
    } catch (error) {
      console.error('Erro ao salvar timeline no Supabase:', error);
    }
  };

  // Função para upload de imagens
  const handleImageUpload = (files: FileList | null) => {
    if (!files || !activeTracking) return;

    Array.from(files).forEach(file => {
      // Criar URL temporária para preview (em produção usaria upload para servidor/storage)
      const reader = new FileReader();
      reader.onload = async (e) => {
        const newImage = {
          id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: file.name,
          url: e.target?.result as string,
          uploadDate: new Date().toISOString(),
          description: '',
        };

        const updatedImages = [...workImages, newImage];
        setWorkImages(updatedImages);
        await saveWorkImages(activeTracking.id, updatedImages);
        
        alertDialog.showSuccess(
          'Imagem Adicionada', 
          `${file.name} foi adicionada à galeria da obra.`
        );
      };
      reader.readAsDataURL(file);
    });
  };

  // Upload de logo do engenheiro (aparece na página do cliente)
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeTracking) return;
    if (!file.type.startsWith('image/')) {
      alertDialog.showError('Arquivo inválido', 'Selecione uma imagem (PNG, JPG, etc.).');
      return;
    }
    setIsUploadingLogo(true);
    try {
      const timestamp = Date.now();
      const ext = file.name.split('.').pop() || 'png';
      const filePath = `public/logos/${activeTracking.id}/${timestamp}_logo.${ext}`;
      const { error: uploadError } = await supabase.storage.from('plans').upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('plans').getPublicUrl(filePath);
      const publicUrl = data.publicUrl;
      updateTracking(activeTracking.id, (t) => ({
        ...t,
        budget_data: { ...t.budget_data, client_logo_url: publicUrl },
        updated_at: new Date().toISOString(),
      }));
      alertDialog.showSuccess('Logo atualizada', 'A logo será exibida na página do cliente.');
    } catch (err) {
      console.error('Erro ao fazer upload da logo:', err);
      alertDialog.showError('Erro no upload', 'Não foi possível enviar a logo. Tente novamente.');
    } finally {
      setIsUploadingLogo(false);
      e.target.value = '';
    }
  };

  const handleRemoveLogo = () => {
    if (!activeTracking) return;
    updateTracking(activeTracking.id, (t) => ({
      ...t,
      budget_data: { ...t.budget_data, client_logo_url: undefined },
      updated_at: new Date().toISOString(),
    }));
    alertDialog.showSuccess('Logo removida', 'A logo foi removida da página do cliente.');
  };

  // Função para deletar imagem
  const handleDeleteImage = async (imageId: string) => {
    if (!activeTracking) return;
    
    const updatedImages = workImages.filter(img => img.id !== imageId);
    setWorkImages(updatedImages);
    await saveWorkImages(activeTracking.id, updatedImages);
    
    alertDialog.showSuccess('Imagem Removida', 'A imagem foi removida da galeria.');
  };

  // Função para adicionar marco no timeline
  const handleAddMilestone = async () => {
    if (!activeTracking || !newMilestone.title.trim() || !newMilestone.date) return;

    // Verificar se a data está entre início e conclusão
    const startDate = timelineMilestones.find(m => m.id.includes('milestone-start'))?.date;
    const endDate = timelineMilestones.find(m => m.id.includes('milestone-completion'))?.date;
    
    if (startDate && newMilestone.date < startDate) {
      alertDialog.showError('Data Inválida', 'A data do marco deve ser posterior ao início da obra.');
      return;
    }
    
    if (endDate && newMilestone.date > endDate) {
      alertDialog.showError('Data Inválida', 'A data do marco deve ser anterior à conclusão da obra.');
      return;
    }

    const milestone = {
      id: `milestone-custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: newMilestone.title.trim(),
      description: newMilestone.description.trim(),
      date: newMilestone.date,
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
    };

    // Ordenar mantendo início primeiro e conclusão por último
    const updatedTimeline = [...timelineMilestones, milestone].sort((a, b) => {
      // Início sempre primeiro
      if (a.id.includes('milestone-start')) return -1;
      if (b.id.includes('milestone-start')) return 1;
      
      // Conclusão sempre último
      if (a.id.includes('milestone-completion')) return 1;
      if (b.id.includes('milestone-completion')) return -1;
      
      // Outros por data
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
    
    setTimelineMilestones(updatedTimeline);
    await saveTimeline(activeTracking.id, updatedTimeline);
    
    // Limpar formulário
    setNewMilestone({ title: '', description: '', date: '' });
    
    alertDialog.showSuccess(
      'Marco Adicionado', 
      `Marco "${milestone.title}" foi adicionado ao timeline.`
    );
  };

  // Função para atualizar status do marco
  const handleUpdateMilestoneStatus = async (milestoneId: string, status: 'completed' | 'in-progress' | 'pending') => {
    if (!activeTracking) return;
    
    const updatedTimeline = timelineMilestones.map(milestone =>
      milestone.id === milestoneId ? { ...milestone, status } : milestone
    );
    
    setTimelineMilestones(updatedTimeline);
    await saveTimeline(activeTracking.id, updatedTimeline);
    
    alertDialog.showSuccess('Marco Atualizado', 'Status do marco foi atualizado.');
  };


  // Função para cliques em postes baseado no modo
  const handleCanvasPostClick = (post: TrackedPost) => {
    switch (interactionMode) {
      case 'select-posts': {
        // Alternar status do poste
        const newStatus = post.status === 'Concluído' ? 'Pendente' : 'Concluído';
        const updatedPost: TrackedPost = {
          ...post,
          status: newStatus,
          completion_date: newStatus === 'Concluído' ? new Date().toISOString() : undefined,
          installation_date: newStatus === 'Concluído' ? (post.installation_date || new Date().toISOString()) : post.installation_date,
        };
        handleSavePostProgress(updatedPost);
        break;
      }
      case 'connect-network':
        // Sistema de conexão de rede
        if (!networkConnectionType) {
          alertDialog.showError('Tipo de rede', 'Selecione primeiro Rede Azul ou Rede Verde.');
          return;
        }
        if (!networkConnectionPending) {
          setNetworkConnectionPending(post.id);
        } else {
          if (networkConnectionPending === post.id) {
            setNetworkConnectionPending(null);
            return;
          }

          updateTracking(activeTracking!.id, (tracking) => {
            const exists = tracking.post_connections.some(
              (connection) =>
                (connection.connection_type ?? 'blue') === networkConnectionType &&
                (
                  (connection.from_post_id === networkConnectionPending && connection.to_post_id === post.id) ||
                  connection.from_post_id === post.id &&
                  connection.to_post_id === networkConnectionPending
                )
            );

            if (exists) {
              return tracking;
            }

            const newConnection = {
              id: `conn-${Date.now()}`,
              from_post_id: networkConnectionPending,
              to_post_id: post.id,
              connection_type: networkConnectionType,
            };

            return {
              ...tracking,
              post_connections: [...tracking.post_connections, newConnection],
              updated_at: new Date().toISOString(),
            };
          });

          setNetworkConnectionPending(null);
        }
        break;
        
      case 'view':
      default:
        // Modo visualização - abrir modal
        handleOpenPostModal(post);
        break;
    }
  };

  const handleCanvasBudgetPostClick = (post: BudgetPostDetail) => {
    if (!activeTracking) return;
    const tracked = activeTracking.tracked_posts.find((p) => p.id === post.id);
    if (!tracked) return;
    handleCanvasPostClick(tracked);
  };

  const handleSavePostProgress = (updatedPost: TrackedPost) => {
    if (!activeTracking) return;
    
    updateTracking(activeTracking.id, (tracking) => {
      const trackedPosts = tracking.tracked_posts.map((post) =>
        post.id === updatedPost.id ? updatedPost : post
      );

      const progress = calculateWeightedProgress({
        ...tracking,
        tracked_posts: trackedPosts,
      });

      let newStatus = tracking.status;
      if (progress === 100) newStatus = 'Concluído';
      else if (progress > 0 && tracking.status === 'Planejado') newStatus = 'Em Andamento';

      // Remover lógica automática de conclusão - agora é manual

      return {
        ...tracking,
        tracked_posts: trackedPosts,
        progress_percentage: progress,
        status: newStatus,
        updated_at: new Date().toISOString(),
      };
    });
  };

  const handleOpenPostModal = (post: TrackedPost) => {
    setSelectedPostForModal(post);
    setIsPostModalOpen(true);
  };

  /** Persiste a obra atual no Supabase (inclui totais planejados MT/BT/postes e extensões). */
  const persistTrackingToSupabase = async (t: WorkTracking): Promise<boolean> => {
    if (!t.budget_id) return false;
    try {
      // Timeline e imagens são persistidos diretamente nas funções saveTimeline() e saveWorkImages()
      const syncProgress = calculateWeightedProgress(t);
      const workName = t.budget_data?.project_name ?? t.name;
      const clientName = t.budget_data?.client_name ?? null;

      const { data: workData, error: workError } = await supabase.from('work_trackings').upsert(
        {
          public_id: t.id,
          budget_id: t.budget_id,
          name: workName,
          status: t.status,
          network_extension_km: t.network_extension_km ?? 0,
          progress_percentage: syncProgress,
          start_date: t.start_date || null,
          estimated_completion: t.estimated_completion || null,
          actual_completion: t.actual_completion || null,
          planned_network_meters: t.planned_network_meters ?? null,
          planned_mt_meters: t.planned_mt_meters ?? null,
          mt_extension_km: t.mt_extension_km ?? 0,
          planned_bt_meters: t.planned_bt_meters ?? null,
          bt_extension_km: t.bt_extension_km ?? 0,
          planned_poles: t.planned_poles ?? null,
          poles_installed: t.poles_installed ?? 0,
          planned_equipment: t.planned_equipment ?? null,
          equipment_installed: t.equipment_installed ?? 0,
          planned_public_lighting: t.planned_public_lighting ?? null,
          public_lighting_installed: t.public_lighting_installed ?? 0,
          plan_image_url: t.budget_data?.plan_image_url ?? null,
          client_logo_url: t.budget_data?.client_logo_url ?? null,
          client_name: clientName,
          city: t.budget_data?.city ?? null,
          current_focus_title: t.current_focus_title ?? null,
          current_focus_description: t.current_focus_description ?? null,
          project_description: t.project_description ?? null,
          responsible_person: t.responsible_person ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'public_id' }
      ).select('id').single();

      if (workError) throw workError;
      const trackingId = workData?.id;
      if (!trackingId) return false;

      const postIdMap = new Map<string, string>();
      (t.tracked_posts || []).forEach((p) => postIdMap.set(p.id, toValidUuid(p.id)));

      // Nunca apagar postes/conexões em massa - só upsert. Exclusão só no clique direito.
      if (t.tracked_posts?.length > 0) {
        const postsToUpsert = t.tracked_posts.map((post) => ({
          id: postIdMap.get(post.id)!,
          client_id: post.id,
          tracking_id: trackingId,
          original_post_id: toValidUuid(post.original_post_id || post.id),
          name: post.name,
          custom_name: post.custom_name || null,
          x_coord: post.x_coord,
          y_coord: post.y_coord,
          status: post.status,
          installation_date: post.installation_date || null,
          completion_date: post.completion_date || null,
          notes: post.notes || null,
          updated_at: new Date().toISOString(),
        }));
        await supabase.from('tracked_posts').upsert(postsToUpsert, { onConflict: 'id' });
      }

      if (t.post_connections?.length > 0) {
        const pairKey = (a: string, b: string) => [a, b].sort().join('|');
        const seenPairs = new Set<string>();
        const deduped = t.post_connections.filter((conn: any) => {
          const key = pairKey(conn.from_post_id, conn.to_post_id);
          if (seenPairs.has(key)) return false;
          seenPairs.add(key);
          return true;
        });
        const connectionsToUpsert = deduped.map((conn: any) => ({
          id: toValidUuid(conn.id),
          client_id: `${(conn.connection_type ?? 'blue') as 'blue' | 'green'}:${conn.id}`,
          tracking_id: trackingId,
          from_post_id: postIdMap.get(conn.from_post_id) ?? toValidUuid(conn.from_post_id),
          to_post_id: postIdMap.get(conn.to_post_id) ?? toValidUuid(conn.to_post_id),
          connection_type: (conn.connection_type ?? 'blue') as 'blue' | 'green',
          status: 'Pendente',
        }));
        const seen = new Set<string>();
        connectionsToUpsert.forEach((c: any) => {
          if (seen.has(c.id)) c.id = crypto.randomUUID();
          seen.add(c.id);
        });
        const { error: connErr } = await supabase.from('post_connections').upsert(connectionsToUpsert, { onConflict: 'id' });
        if (connErr) console.error('Erro ao salvar conexões (persistTracking):', connErr);
      }

      return true;
    } catch (e) {
      console.warn('Persistência no Supabase:', e);
      return false;
    }
  };

  const handleSaveChanges = async () => {
    if (!activeTracking) return;
    
    setIsSavingChanges(true);
    
    try {
      // Persistência explícita no Supabase (totais planejados MT/BT/postes, extensões, status, datas, etc.)
      const persisted = await persistTrackingToSupabase(activeTracking);
      if (!persisted) {
        alertDialog.showError('Erro ao Salvar', 'Não foi possível salvar no servidor. Tente novamente.');
        return;
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      
      alertDialog.showSuccess(
        'Alterações salvas',
        'Dados da obra (incluindo totais planejados e extensões) foram gravados no servidor.'
      );
      
    } catch {
      alertDialog.showError('Erro ao Salvar', 'Ocorreu um erro ao salvar as alterações.');
    } finally {
      setIsSavingChanges(false);
    }
  };

  const createNewTracking = async (budget: Orcamento): Promise<void> => {
    setIsCreatingTracking(true);
    try {
      const details = await fetchBudgetDetails(budget.id);
      
      const trackingId = `tracking-${Date.now()}`;
      // Não clonamos mais os postes do orçamento - o engenheiro adiciona manualmente no mapa
      
      const newTracking: WorkTracking = {
        id: trackingId,
        budget_id: budget.id,
        name: `${budget.nome} - Acompanhamento`,
        status: 'Planejado',
        progress_percentage: 0,
        network_extension_km: formData.networkExtension,
        planned_network_meters: formData.plannedNetworkMeters > 0 ? formData.plannedNetworkMeters : undefined,
        planned_mt_meters: formData.plannedMtMeters > 0 ? formData.plannedMtMeters : undefined,
        mt_extension_km: 0,
        planned_bt_meters: formData.plannedBtMeters > 0 ? formData.plannedBtMeters : undefined,
        bt_extension_km: 0,
        planned_poles: formData.plannedPoles > 0 ? formData.plannedPoles : undefined,
        poles_installed: 0,
        planned_equipment: formData.plannedEquipment > 0 ? formData.plannedEquipment : undefined,
        equipment_installed: 0,
        planned_public_lighting: formData.plannedPublicLighting > 0 ? formData.plannedPublicLighting : undefined,
        public_lighting_installed: 0,
        render_version: 2,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        start_date: formData.startDate || undefined,
        estimated_completion: formData.estimatedCompletion || undefined,
        budget_data: {
          project_name: budget.nome,
          client_name: budget.clientName,
          city: budget.city,
          plan_image_url: details?.plan_image_url || budget.imagemPlanta,
        },
        tracked_posts: [], // Inicia vazio - postes adicionados manualmente pelo engenheiro
        post_connections: [],
      };

      setWorkTrackings((prev) => {
        const updatedTrackings = [newTracking, ...prev];
        console.log(`✅ Nova obra criada: "${newTracking.name}" - postes serão adicionados manualmente`);
        return updatedTrackings;
      });
      setActiveTrackingId(newTracking.id);
      setCurrentView('tracking-detail');
      
      // Gerar URL pública para a obra
      const publicUrl = `${window.location.origin}/obra/${newTracking.id}`;
      
      alertDialog.showSuccess(
        'Obra Criada com Sucesso!',
        `A obra "${newTracking.name}" foi criada! Use clique direito no mapa para adicionar postes. URL pública: ${publicUrl}`
      );
      
      // Copiar automaticamente a URL para área de transferência
      navigator.clipboard.writeText(publicUrl).then(() => {
        setTimeout(() => {
          alertDialog.showSuccess(
            '🌐 Link Público Copiado!',
            'URL copiada para compartilhar com o cliente. Cole em qualquer lugar para que o cliente acompanhe a obra.'
          );
        }, 2000);
      }).catch(() => {
        console.log('Não foi possível copiar automaticamente');
      });
      
      setFormData({
        networkExtension: 0,
        plannedNetworkMeters: 0,
        plannedMtMeters: 0,
        plannedBtMeters: 0,
        plannedPoles: 0,
        plannedEquipment: 0,
        plannedPublicLighting: 0,
        startDate: '',
        estimatedCompletion: '',
        notes: '',
      });
    } finally {
      setIsCreatingTracking(false);
    }
  };

  const filteredBudgets = budgets.filter((budget) =>
    budget.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    budget.clientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    budget.city?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderSelectBudget = () => (
    <>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#1D3140]">Criar Nova Obra</h1>
          <p className="text-gray-600 mt-1">Selecione um orçamento para iniciar o acompanhamento.</p>
        </div>
        <button 
          className="text-slate-600 hover:text-[#1D3140] inline-flex items-center gap-2" 
          onClick={() => setCurrentView('dashboard')}
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
      </div>

      <div className="mb-6 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
        <input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Buscar orçamentos por nome, cliente ou cidade..."
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#64ABDE] focus:border-transparent"
        />
      </div>

      <div className="grid gap-5">
        {filteredBudgets.map((budget) => (
          <div key={budget.id} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{budget.nome}</h3>
                <div className="grid md:grid-cols-3 gap-3 text-sm text-gray-600 mb-4">
                  <span className="inline-flex items-center gap-2">
                    <User className="w-4 h-4" />
                    {budget.clientName || 'Cliente não informado'}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    {budget.city || 'Cidade não informada'}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    {budget.postes?.length || 0} postes
                  </span>
                </div>
                
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Data de início
                    </label>
                    <input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#64ABDE]"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Previsão de conclusão
                    </label>
                    <input
                      type="date"
                      value={formData.estimatedCompletion}
                      onChange={(e) => setFormData({...formData, estimatedCompletion: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#64ABDE]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Total rede MT (m)</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={formData.plannedMtMeters || ''}
                      onChange={(e) => setFormData({...formData, plannedMtMeters: e.target.value ? Number(e.target.value) : 0})}
                      placeholder="Ex: 2000"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#64ABDE]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Total rede BT (m)</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={formData.plannedBtMeters || ''}
                      onChange={(e) => setFormData({...formData, plannedBtMeters: e.target.value ? Number(e.target.value) : 0})}
                      placeholder="Ex: 1500"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#64ABDE]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Total de postes</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={formData.plannedPoles || ''}
                      onChange={(e) => setFormData({...formData, plannedPoles: e.target.value ? Math.floor(Number(e.target.value)) : 0})}
                      placeholder="Ex: 50"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#64ABDE]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Total de equipamentos</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={formData.plannedEquipment || ''}
                      onChange={(e) => setFormData({...formData, plannedEquipment: e.target.value ? Math.floor(Number(e.target.value)) : 0})}
                      placeholder="Ex: 20"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#64ABDE]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Total de iluminação pública</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={formData.plannedPublicLighting || ''}
                      onChange={(e) => setFormData({...formData, plannedPublicLighting: e.target.value ? Math.floor(Number(e.target.value)) : 0})}
                      placeholder="Ex: 30"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#64ABDE]"
                    />
                  </div>
                </div>
              </div>
              
              <div className="ml-6">
                <button
                  disabled={isCreatingTracking}
                  onClick={() => createNewTracking(budget)}
                  className="inline-flex items-center gap-2 px-6 py-3 text-white rounded-lg font-medium disabled:bg-slate-300"
                  style={{ background: `linear-gradient(135deg, ${ON_COLORS.navy} 0%, ${ON_COLORS.blue} 100%)` }}
                >
                  {isCreatingTracking ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Criando...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Iniciar Acompanhamento
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );

  const renderDashboard = () => (
    <>
      <div className="rounded-3xl p-10 text-white mb-10 relative overflow-hidden shadow-2xl" style={{ background: `linear-gradient(140deg, ${ON_COLORS.navy} 0%, #223f52 45%, ${ON_COLORS.blue} 100%)` }}>
        <div className="absolute top-0 right-0 w-72 h-72 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/4 blur-2xl" />
        <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-white/10 rounded-full blur-xl"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <span className="text-white/80 text-sm font-semibold tracking-wide uppercase">Portal do Engenheiro</span>
          </div>
          <h1 className="text-4xl font-bold mb-4 tracking-tight">Gestão de Acompanhamento de Obras</h1>
          <p className="text-white/90 text-lg max-w-3xl leading-relaxed">
            Gerencie o progresso das instalações em campo com entrada rápida de dados e controle visual intuitivo.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
        <div className="bg-gradient-to-br from-white to-slate-50 rounded-2xl border border-slate-200 p-8 shadow-lg hover:shadow-xl transition-all duration-300 group">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-600 mb-2">Obras Ativas</p>
              <p className="text-3xl font-bold text-gray-900">{workTrackings.length}</p>
            </div>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300" style={{ background: `linear-gradient(135deg, ${ON_COLORS.navy} 0%, ${ON_COLORS.blue} 100%)` }}>
              <Target className="w-7 h-7 text-white" />
            </div>
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-white to-slate-50 rounded-2xl border border-slate-200 p-8 shadow-lg hover:shadow-xl transition-all duration-300 group">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-600 mb-2">Em Andamento</p>
              <p className="text-3xl font-bold text-[#1D3140]">{workTrackings.filter((t) => t.status === 'Em Andamento').length}</p>
            </div>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300" style={{ background: `linear-gradient(135deg, ${ON_COLORS.navy} 0%, ${ON_COLORS.blue} 100%)` }}>
              <Play className="w-7 h-7 text-white" />
            </div>
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-white to-green-50 rounded-2xl border border-green-100 p-8 shadow-lg hover:shadow-xl transition-all duration-300 group">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-600 mb-2">Concluídas</p>
              <p className="text-3xl font-bold text-green-600">{workTrackings.filter((t) => t.status === 'Concluído').length}</p>
            </div>
            <div className="w-14 h-14 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
              <CheckCircle className="w-7 h-7 text-white" />
            </div>
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-white to-slate-50 rounded-2xl border border-slate-200 p-8 shadow-lg hover:shadow-xl transition-all duration-300 group">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-600 mb-2">Progresso Médio</p>
              <p className="text-3xl font-bold text-[#1D3140]">
                {workTrackings.length > 0 
                  ? Math.round(workTrackings.reduce((acc, cur) => acc + calculateWeightedProgress(cur), 0) / workTrackings.length)
                  : 0
                }%
              </p>
            </div>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300" style={{ background: `linear-gradient(135deg, ${ON_COLORS.navy} 0%, ${ON_COLORS.blue} 100%)` }}>
              <TrendingUp className="w-7 h-7 text-white" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-lg">
        <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
          <div>
            <h3 className="text-xl font-bold text-gray-900 mb-1">Obras em Acompanhamento</h3>
            <p className="text-sm text-gray-500">Gerencie suas obras ativas e planejadas</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentView('select-budget')}
              className="inline-flex items-center gap-3 px-6 py-3 text-white rounded-xl font-semibold text-sm shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
              style={{ background: `linear-gradient(135deg, ${ON_COLORS.navy} 0%, ${ON_COLORS.blue} 100%)` }}
            >
              <Plus className="w-5 h-5" />
              Nova Obra
            </button>
          </div>
        </div>

        <div className="divide-y divide-gray-200">
          {workTrackings.length === 0 ? (
            <div className="p-12 text-center text-gray-600">
              <Activity className="w-16 h-16 text-gray-400 mx-auto mb-6" />
              <h4 className="text-xl font-medium text-gray-900 mb-3">Nenhuma obra em acompanhamento</h4>
              <p className="text-gray-600 mb-6 max-w-md mx-auto">
                Comece criando uma nova obra a partir de um orçamento existente.
              </p>
              <button
                onClick={() => setCurrentView('select-budget')}
                className="inline-flex items-center gap-2 px-6 py-3 text-white rounded-lg font-medium"
                style={{ background: `linear-gradient(135deg, ${ON_COLORS.navy} 0%, ${ON_COLORS.blue} 100%)` }}
              >
                <Plus className="w-4 h-4" />
                Criar Nova Obra
              </button>
            </div>
          ) : (
            workTrackings.map((tracking) => {
              const realProgress = calculateWeightedProgress(tracking);
              return (
              <div key={tracking.id} className="p-6 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <h4 className="text-lg font-semibold text-gray-900">{tracking.name}</h4>
                      <span className={`px-3 py-1 text-xs rounded-full border ${getStatusColor(tracking.status)}`}>
                        {tracking.status}
                      </span>
                      <span className="text-sm font-medium text-gray-600">
                        {realProgress}% concluído
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm text-gray-600 mb-4">
                      <span className="inline-flex items-center gap-2">
                        <User className="w-4 h-4" />
                        {tracking.budget_data.client_name || 'Cliente não informado'}
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        {tracking.budget_data.city || '-'}
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        {tracking.tracked_posts.length} postes
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        Início: {formatDate(tracking.start_date)}
                      </span>
                    </div>

                    <div className="space-y-2 mb-2">
                      {/* Progresso dos postes */}
                      <div>
                        <div className="flex justify-between text-xs text-gray-600 mb-1">
                          <span>Postes: {tracking.tracked_posts.filter(p => p.status === 'Concluído').length}/{tracking.tracked_posts.length}</span>
                          <span>{realProgress}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="h-2 rounded-full transition-all duration-300" 
                            style={{ backgroundColor: ON_COLORS.blue, width: `${realProgress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-xs text-gray-500">
                      Previsão: {formatDate(tracking.estimated_completion)}
                    </div>
                  </div>

                  <div className="ml-6 flex flex-col gap-2">
                    <button
                      onClick={() => {
                        setActiveTrackingId(tracking.id);
                        setCurrentView('tracking-detail');
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-medium"
                      style={{ background: `linear-gradient(135deg, ${ON_COLORS.navy} 0%, ${ON_COLORS.blue} 100%)` }}
                    >
                      <Edit3 className="w-4 h-4" />
                      Gerenciar
                    </button>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          const publicUrl = `${window.location.origin}/obra/${tracking.id}`;
                          window.open(publicUrl, '_blank');
                        }}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-xs font-medium"
                        title="Abrir página pública"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Ver Público
                      </button>
                      
                      <button
                        onClick={() => {
                          const publicUrl = `${window.location.origin}/obra/${tracking.id}`;
                          navigator.clipboard.writeText(publicUrl);
                          alertDialog.showSuccess('Link Copiado!', 'URL pública copiada para compartilhar com o cliente.');
                        }}
                        className="px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-xs"
                        title="Copiar link público"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )})
          )}
        </div>
      </div>
    </>
  );

  const renderTrackingDetail = () => {
    if (!activeTracking) return null;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div>
            <h1 className="text-2xl font-bold text-[#1D3140]">{activeTracking.name}</h1>
            <p className="text-gray-600 mt-1">
              Cliente: {activeTracking.budget_data.client_name} • {activeTracking.budget_data.city}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const publicUrl = `${window.location.origin}/obra/${activeTracking.id}`;
                navigator.clipboard.writeText(publicUrl);
                alertDialog.showSuccess(
                  '🔗 Link Copiado!', 
                  'URL pública copiada. Compartilhe com o cliente para acompanhar a obra.'
                );
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-white rounded-lg font-medium text-sm shadow-md hover:shadow-lg transition-all"
              style={{ background: `linear-gradient(135deg, ${ON_COLORS.navy} 0%, ${ON_COLORS.blue} 100%)` }}
              title="Copiar link público para o cliente"
            >
              <Copy className="w-4 h-4" />
              Copiar Link do Cliente
            </button>
            <button 
              className="text-slate-600 hover:text-[#1D3140] inline-flex items-center gap-2" 
              onClick={() => setCurrentView('dashboard')}
            >
              <ArrowLeft className="w-4 h-4" /> Voltar
            </button>
          </div>
        </div>

        {/* Abas de Navegação */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-lg">
          <div className="border-b border-gray-100">
            <nav className="flex">
              <button
                onClick={() => setActiveTab('obra')}
                className={`px-6 py-4 text-sm font-semibold transition-colors flex items-center gap-2 ${
                  activeTab === 'obra'
                    ? 'text-[#1D3140] border-b-2 border-[#64ABDE] bg-[#64ABDE]/15'
                    : 'text-gray-600 hover:text-[#1D3140] hover:bg-slate-50'
                }`}
              >
                <Building className="w-4 h-4" />
                Obra
              </button>
              <button
                onClick={() => setActiveTab('imagens')}
                className={`px-6 py-4 text-sm font-semibold transition-colors flex items-center gap-2 ${
                  activeTab === 'imagens'
                    ? 'text-[#1D3140] border-b-2 border-[#64ABDE] bg-[#64ABDE]/15'
                    : 'text-gray-600 hover:text-[#1D3140] hover:bg-slate-50'
                }`}
              >
                <Image className="w-4 h-4" />
                Imagens
              </button>
              <button
                onClick={() => setActiveTab('timeline')}
                className={`px-6 py-4 text-sm font-semibold transition-colors flex items-center gap-2 ${
                  activeTab === 'timeline'
                    ? 'text-[#1D3140] border-b-2 border-[#64ABDE] bg-[#64ABDE]/15'
                    : 'text-gray-600 hover:text-[#1D3140] hover:bg-slate-50'
                }`}
              >
                <Clock className="w-4 h-4" />
                Timeline
              </button>
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'obra' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Canvas e Cards */}
          <div className="lg:col-span-2 space-y-6">
            {/* Resumo MT / BT / Postes / Equipamento / Iluminação - ambos instalado e meta editáveis */}
            {activeTracking && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {/* REDE MT */}
                <div className="bg-[#1D3140] text-white rounded-xl px-4 py-3 shadow-md">
                  <p className="text-xs font-medium text-white/80 uppercase tracking-wide">Rede MT</p>
                  <p className="text-[10px] text-white/60 mb-1.5">instalado / meta total (m)</p>
                  <div className="flex items-baseline gap-1 flex-wrap gap-y-1">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={Math.round((activeTracking.mt_extension_km ?? 0) * 1000)}
                      onChange={(e) => {
                        if (e.target.value === '') return;
                        const v = Math.max(0, Math.floor(Number(e.target.value)));
                        const planned = activeTracking.planned_mt_meters ?? 0;
                        if (planned > 0 && v > planned) {
                          alertDialog.showError('Valor inválido', `Instalado não pode ser maior que a meta (${planned} m).`);
                          return;
                        }
                        updateTracking(activeTracking.id, (t) => ({ ...t, mt_extension_km: v / 1000, updated_at: new Date().toISOString() }));
                      }}
                      title="Instalado (m)"
                      className="w-14 bg-white/20 text-white rounded px-1 py-0.5 text-sm font-normal border border-white/30 focus:ring-1 focus:ring-white/50"
                    />
                    <span className="text-white/70 font-normal text-sm">/</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={activeTracking.planned_mt_meters ?? ''}
                      onChange={(e) => {
                        const v = e.target.value ? Math.max(0, Math.floor(Number(e.target.value))) : undefined;
                        const installed = Math.round((activeTracking.mt_extension_km ?? 0) * 1000);
                        if (v != null && v < installed) {
                          alertDialog.showError('Valor inválido', `A meta não pode ser menor que o instalado (${installed} m).`);
                          return;
                        }
                        updateTracking(activeTracking.id, (t) => ({ ...t, planned_mt_meters: v, updated_at: new Date().toISOString() }));
                      }}
                      title="Meta total (m)"
                      placeholder="Meta"
                      className="w-14 bg-white/20 text-white rounded px-1 py-0.5 text-sm font-normal border border-white/30 focus:ring-1 focus:ring-white/50"
                    />
                    <span className="text-white/70 font-normal text-sm">m</span>
                  </div>
                </div>
                {/* REDE BT */}
                <div className="bg-[#1D3140] text-white rounded-xl px-4 py-3 shadow-md">
                  <p className="text-xs font-medium text-white/80 uppercase tracking-wide">Rede BT</p>
                  <p className="text-[10px] text-white/60 mb-1.5">instalado / meta total (m)</p>
                  <div className="flex items-baseline gap-1 flex-wrap gap-y-1">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={Math.round((activeTracking.bt_extension_km ?? 0) * 1000)}
                      onChange={(e) => {
                        if (e.target.value === '') return;
                        const v = Math.max(0, Math.floor(Number(e.target.value)));
                        const planned = activeTracking.planned_bt_meters ?? 0;
                        if (planned > 0 && v > planned) {
                          alertDialog.showError('Valor inválido', `Instalado não pode ser maior que a meta (${planned} m).`);
                          return;
                        }
                        updateTracking(activeTracking.id, (t) => ({ ...t, bt_extension_km: v / 1000, updated_at: new Date().toISOString() }));
                      }}
                      title="Instalado (m)"
                      className="w-14 bg-white/20 text-white rounded px-1 py-0.5 text-sm font-normal border border-white/30 focus:ring-1 focus:ring-white/50"
                    />
                    <span className="text-white/70 font-normal text-sm">/</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={activeTracking.planned_bt_meters ?? ''}
                      onChange={(e) => {
                        const v = e.target.value ? Math.max(0, Math.floor(Number(e.target.value))) : undefined;
                        const installed = Math.round((activeTracking.bt_extension_km ?? 0) * 1000);
                        if (v != null && v < installed) {
                          alertDialog.showError('Valor inválido', `A meta não pode ser menor que o instalado (${installed} m).`);
                          return;
                        }
                        updateTracking(activeTracking.id, (t) => ({ ...t, planned_bt_meters: v, updated_at: new Date().toISOString() }));
                      }}
                      title="Meta total (m)"
                      placeholder="Meta"
                      className="w-14 bg-white/20 text-white rounded px-1 py-0.5 text-sm font-normal border border-white/30 focus:ring-1 focus:ring-white/50"
                    />
                    <span className="text-white/70 font-normal text-sm">m</span>
                  </div>
                </div>
                {/* POSTES */}
                <div className="bg-[#1D3140] text-white rounded-xl px-4 py-3 shadow-md">
                  <p className="text-xs font-medium text-white/80 uppercase tracking-wide">Postes</p>
                  <p className="text-[10px] text-white/60 mb-1.5">instalado / meta total</p>
                  <div className="flex items-baseline gap-1 flex-wrap gap-y-1">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={activeTracking.poles_installed ?? 0}
                      onChange={(e) => {
                        if (e.target.value === '') return;
                        const v = Math.max(0, Math.floor(Number(e.target.value)));
                        const planned = activeTracking.planned_poles ?? 0;
                        if (planned > 0 && v > planned) {
                          alertDialog.showError('Valor inválido', `Instalado não pode ser maior que a meta (${planned}).`);
                          return;
                        }
                        updateTracking(activeTracking.id, (t) => ({ ...t, poles_installed: v, updated_at: new Date().toISOString() }));
                      }}
                      title="Instalado"
                      className="w-12 bg-white/20 text-white rounded px-1 py-0.5 text-sm font-normal border border-white/30 focus:ring-1 focus:ring-white/50"
                    />
                    <span className="text-white/70 font-normal text-sm">/</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={activeTracking.planned_poles ?? ''}
                      onChange={(e) => {
                        const v = e.target.value ? Math.max(0, Math.floor(Number(e.target.value))) : undefined;
                        const installed = activeTracking.poles_installed ?? 0;
                        if (v != null && v < installed) {
                          alertDialog.showError('Valor inválido', `A meta não pode ser menor que o instalado (${installed}).`);
                          return;
                        }
                        updateTracking(activeTracking.id, (t) => ({ ...t, planned_poles: v, updated_at: new Date().toISOString() }));
                      }}
                      title="Meta total"
                      placeholder="Meta"
                      className="w-12 bg-white/20 text-white rounded px-1 py-0.5 text-sm font-normal border border-white/30 focus:ring-1 focus:ring-white/50"
                    />
                  </div>
                </div>
                {/* EQUIPAMENTO */}
                <div className="bg-[#1D3140] text-white rounded-xl px-4 py-3 shadow-md">
                  <p className="text-xs font-medium text-white/80 uppercase tracking-wide">Equipamento</p>
                  <p className="text-[10px] text-white/60 mb-1.5">instalado / meta total</p>
                  <div className="flex items-baseline gap-1 flex-wrap gap-y-1">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={activeTracking.equipment_installed ?? 0}
                      onChange={(e) => {
                        if (e.target.value === '') return;
                        const v = Math.max(0, Math.floor(Number(e.target.value)));
                        const planned = activeTracking.planned_equipment ?? 0;
                        if (planned > 0 && v > planned) {
                          alertDialog.showError('Valor inválido', `Instalado não pode ser maior que a meta (${planned}).`);
                          return;
                        }
                        updateTracking(activeTracking.id, (t) => ({ ...t, equipment_installed: v, updated_at: new Date().toISOString() }));
                      }}
                      title="Instalado"
                      className="w-12 bg-white/20 text-white rounded px-1 py-0.5 text-sm font-normal border border-white/30 focus:ring-1 focus:ring-white/50"
                    />
                    <span className="text-white/70 font-normal text-sm">/</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={activeTracking.planned_equipment ?? ''}
                      onChange={(e) => {
                        const v = e.target.value ? Math.max(0, Math.floor(Number(e.target.value))) : undefined;
                        const installed = activeTracking.equipment_installed ?? 0;
                        if (v != null && v < installed) {
                          alertDialog.showError('Valor inválido', `A meta não pode ser menor que o instalado (${installed}).`);
                          return;
                        }
                        updateTracking(activeTracking.id, (t) => ({ ...t, planned_equipment: v, updated_at: new Date().toISOString() }));
                      }}
                      title="Meta total"
                      placeholder="Meta"
                      className="w-12 bg-white/20 text-white rounded px-1 py-0.5 text-sm font-normal border border-white/30 focus:ring-1 focus:ring-white/50"
                    />
                  </div>
                </div>
                {/* ILUM. PÚBLICA */}
                <div className="bg-[#1D3140] text-white rounded-xl px-4 py-3 shadow-md">
                  <p className="text-xs font-medium text-white/80 uppercase tracking-wide">Ilum. pública</p>
                  <p className="text-[10px] text-white/60 mb-1.5">instalado / meta total</p>
                  <div className="flex items-baseline gap-1 flex-wrap gap-y-1">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={activeTracking.public_lighting_installed ?? 0}
                      onChange={(e) => {
                        if (e.target.value === '') return;
                        const v = Math.max(0, Math.floor(Number(e.target.value)));
                        const planned = activeTracking.planned_public_lighting ?? 0;
                        if (planned > 0 && v > planned) {
                          alertDialog.showError('Valor inválido', `Instalado não pode ser maior que a meta (${planned}).`);
                          return;
                        }
                        updateTracking(activeTracking.id, (t) => ({ ...t, public_lighting_installed: v, updated_at: new Date().toISOString() }));
                      }}
                      title="Instalado"
                      className="w-12 bg-white/20 text-white rounded px-1 py-0.5 text-sm font-normal border border-white/30 focus:ring-1 focus:ring-white/50"
                    />
                    <span className="text-white/70 font-normal text-sm">/</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={activeTracking.planned_public_lighting ?? ''}
                      onChange={(e) => {
                        const v = e.target.value ? Math.max(0, Math.floor(Number(e.target.value))) : undefined;
                        const installed = activeTracking.public_lighting_installed ?? 0;
                        if (v != null && v < installed) {
                          alertDialog.showError('Valor inválido', `A meta não pode ser menor que o instalado (${installed}).`);
                          return;
                        }
                        updateTracking(activeTracking.id, (t) => ({ ...t, planned_public_lighting: v, updated_at: new Date().toISOString() }));
                      }}
                      title="Meta total"
                      placeholder="Meta"
                      className="w-12 bg-white/20 text-white rounded px-1 py-0.5 text-sm font-normal border border-white/30 focus:ring-1 focus:ring-white/50"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Controles de conexão de rede (azul/verde) */}
            <div className="mb-3 flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setInteractionMode('connect-network');
                  setNetworkConnectionType('blue');
                  setNetworkConnectionPending(null);
                }}
                className={`px-3 py-2 rounded-md text-sm font-medium border flex items-center gap-2 ${
                  interactionMode === 'connect-network' && networkConnectionType === 'blue'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-blue-700 border-blue-300 hover:bg-blue-50'
                }`}
              >
                <Link2 className="h-4 w-4" />
                Rede Azul
              </button>
              <button
                type="button"
                onClick={() => {
                  setInteractionMode('connect-network');
                  setNetworkConnectionType('green');
                  setNetworkConnectionPending(null);
                }}
                className={`px-3 py-2 rounded-md text-sm font-medium border flex items-center gap-2 ${
                  interactionMode === 'connect-network' && networkConnectionType === 'green'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50'
                }`}
              >
                <Link2 className="h-4 w-4" />
                Rede Verde
              </button>
              <button
                type="button"
                onClick={() => {
                  setInteractionMode('view');
                  setNetworkConnectionType(null);
                  setNetworkConnectionPending(null);
                }}
                className="px-3 py-2 rounded-md text-sm font-medium border bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              >
                Parar Conexão
              </button>
              {interactionMode === 'connect-network' && (
                <span className="text-xs text-gray-600">
                  {networkConnectionPending
                    ? 'Selecione o segundo poste para concluir o arco de rede.'
                    : 'Selecione o primeiro poste para iniciar a conexão.'}
                </span>
              )}
            </div>

            {/* Canvas Visual Melhorado */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden h-[600px]">

              {/* Canvas */}
              <CanvasVisual
                orcamento={{
                  id: activeTracking.budget_id,
                  nome: activeTracking.name,
                  concessionariaId: '',
                  dataModificacao: activeTracking.updated_at,
                  status: 'Em Andamento',
                  imagemPlanta: activeTracking.budget_data.plan_image_url,
                  postes: [],
                  clientName: activeTracking.budget_data.client_name,
                  city: activeTracking.budget_data.city,
                }}
                budgetDetails={{
                  id: activeTracking.budget_id,
                  name: activeTracking.name,
                  client_name: activeTracking.budget_data.client_name,
                  city: activeTracking.budget_data.city,
                  render_version: pdfRenderVersion,
                  posts: trackingPostsForCanvas,
                }}
                selectedPoste={null}
                selectedPostDetail={null}
                onPosteClick={() => {}}
                onPostDetailClick={handleCanvasBudgetPostClick}
                onEditPost={() => {}}
                onAddPoste={() => {}}
                onUpdatePoste={() => {}}
                onUploadImage={() => fileInputRef.current?.click()}
                onDeleteImage={() => {}}
                onRightClick={handleCanvasRightClickAddPoste}
                onDeletePoste={handleDeletePosteFromMap}
                onDeleteConnection={handleDeleteConnectionFromMap}
                onAddConnection={handleAddConnectionFromMap}
                postConnections={activeTracking.post_connections || []}
                hidePostNames
                postIconAlwaysGreen
              />


              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    console.log('Upload file:', file.name);
                  }
                  e.target.value = '';
                }}
              />
              <p className="text-xs text-gray-500 mt-2 px-1">
                Clique direito no mapa para adicionar poste; clique direito no ícone do poste para excluir. Use os botões Rede Azul/Rede Verde e clique em dois postes para criar arcos de rede.
              </p>
            </div>

            {/* Cards de Status Embaixo do Mapa */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Status dos Postes */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-4 border border-blue-100 shadow-sm">
                <div className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  Status dos Postes
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-gradient-to-br from-green-400 to-green-600 shadow-sm"></div>
                    <span className="font-medium">Concluído</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 shadow-sm"></div>
                    <span className="font-medium">Em Andamento</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-gradient-to-br from-gray-400 to-gray-500 shadow-sm"></div>
                    <span className="font-medium">Pendente</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-gradient-to-br from-red-400 to-red-600 shadow-sm"></div>
                    <span className="font-medium">Problemas</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Painel de Controles */}
          <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-lg">

            {/* Informações Detalhadas */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status da Obra</label>
                <select 
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500"
                  value={activeTracking.status}
                  onChange={(e) => updateTracking(activeTracking.id, (t) => ({...t, status: e.target.value as WorkTracking['status']}))}
                >
                  <option value="Planejado">Planejado</option>
                  <option value="Em Andamento">Em Andamento</option>
                  <option value="Pausado">Pausado</option>
                  <option value="Concluído">Concluído</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data de início</label>
                <input
                  type="date"
                  value={activeTracking.start_date || ''}
                  onChange={(e) => updateTracking(activeTracking.id, (t) => ({...t, start_date: e.target.value || undefined}))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Previsão de conclusão</label>
                <input
                  type="date"
                  value={activeTracking.estimated_completion || ''}
                  onChange={(e) => updateTracking(activeTracking.id, (t) => ({...t, estimated_completion: e.target.value || undefined}))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Qualidade PDF</label>
                <select
                  value={pdfRenderVersion}
                  onChange={(e) => {
                    const newVersion = Number(e.target.value) as 1 | 2;
                    setPdfRenderVersion(newVersion);
                    updateTracking(activeTracking.id, (t) => ({
                      ...t, 
                      render_version: newVersion,
                      updated_at: new Date().toISOString()
                    }));
                  }}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500"
                >
                  <option value={1}>Padrão (Legado)</option>
                  <option value={2}>Alta Resolução</option>
                </select>
              </div>

              {/* Logo da empresa - aparece na página do cliente */}
              <div className="pt-4 border-t border-gray-200">
                <h4 className="text-sm font-medium text-gray-700 mb-3">Logo da Empresa (Página do Cliente)</h4>
                <p className="text-xs text-gray-500 mb-3">
                  Faça upload da sua logo. Ela aparecerá ao lado da logo do sistema na página pública da obra.
                </p>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-3">
                    {activeTracking.budget_data?.client_logo_url ? (
                      <>
                        <img
                          src={activeTracking.budget_data.client_logo_url}
                          alt="Logo da empresa"
                          className="h-12 w-auto max-w-[120px] object-contain bg-gray-50 rounded border border-gray-200 p-1"
                        />
                        <button
                          type="button"
                          onClick={handleRemoveLogo}
                          className="text-xs text-red-600 hover:text-red-700 font-medium"
                        >
                          Remover
                        </button>
                      </>
                    ) : (
                      <div className="h-12 w-24 flex items-center justify-center bg-gray-50 rounded border border-dashed border-gray-300 text-gray-400 text-xs">
                        Sem logo
                      </div>
                    )}
                  </div>
                  <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-sm font-medium text-gray-700 transition-colors">
                    <Upload className="w-4 h-4" />
                    {isUploadingLogo ? 'Enviando...' : 'Enviar logo'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoUpload}
                      disabled={isUploadingLogo}
                    />
                  </label>
                </div>
              </div>

              {/* Foco Atual - aparece na vista pública */}
              <div className="pt-4 border-t border-gray-200">
                <h4 className="text-sm font-medium text-gray-700 mb-3">Foco Atual (Vista Pública)</h4>
                
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Título</label>
                    <input
                      type="text"
                      value={activeTracking.current_focus_title || ''}
                      onChange={(e) => updateTracking(activeTracking.id, (t) => ({
                        ...t, 
                        current_focus_title: e.target.value,
                        updated_at: new Date().toISOString()
                      }))}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                      placeholder="Ex: Foco atual"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Descrição</label>
                    <textarea
                      value={activeTracking.current_focus_description || ''}
                      onChange={(e) => updateTracking(activeTracking.id, (t) => ({
                        ...t, 
                        current_focus_description: e.target.value,
                        updated_at: new Date().toISOString()
                      }))}
                      rows={3}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                      placeholder="Ex: Priorizar finalização dos postes e consolidação da rede..."
                    />
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-gray-100">
                <button 
                  onClick={handleSaveChanges}
                  disabled={isSavingChanges || saveSuccess}
                  className={`w-full inline-flex items-center justify-center gap-3 px-6 py-4 rounded-2xl font-bold text-sm transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 disabled:hover:scale-100 ${
                    saveSuccess 
                      ? 'bg-gradient-to-r from-green-600 to-green-700 text-white' 
                      : 'bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800 disabled:from-blue-300 disabled:to-blue-400'
                  }`}
                >
                  {isSavingChanges ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                      Salvando...
                    </>
                  ) : saveSuccess ? (
                    <>
                      <CheckCircle className="w-5 h-5" />
                      Alterações Salvas!
                    </>
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      Salvar Alterações
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
            )}

            {activeTab === 'imagens' && (
              <div className="space-y-6">
                {/* Cabeçalho e Upload */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Galeria de Imagens da Obra</h3>
                    <p className="text-gray-600">Faça upload e gerencie as fotos do progresso da obra</p>
                  </div>
                  <div className="text-sm text-gray-500">
                    {workImages.length} imagem{workImages.length !== 1 ? 's' : ''}
                  </div>
                </div>

                {/* Área de Upload */}
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 hover:border-blue-400 transition-colors">
                  <div className="text-center">
                    <Upload className="w-8 h-8 text-gray-400 mx-auto mb-3" />
                    <div className="text-sm text-gray-600 mb-4">
                      Arraste imagens aqui ou clique para selecionar
                    </div>
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      className="hidden"
                      id="upload-images"
                      onChange={(e) => handleImageUpload(e.target.files)}
                    />
                    <label 
                      htmlFor="upload-images"
                      className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
                    >
                      <Upload className="w-4 h-4" />
                      Selecionar Imagens
                    </label>
                  </div>
                </div>

                {/* Grid de imagens */}
                {workImages.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {workImages.map((image) => (
                      <div key={image.id} className="group relative aspect-square bg-gray-100 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                        <img 
                          src={image.url} 
                          alt={image.name}
                          className="w-full h-full object-cover"
                        />
                        
                        {/* Overlay com ações */}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <button
                            onClick={() => {
                              // Abrir modal de visualização (implementar se necessário)
                              window.open(image.url, '_blank');
                            }}
                            className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
                            title="Visualizar"
                          >
                            <Eye className="w-4 h-4 text-white" />
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm('Tem certeza que deseja remover esta imagem?')) {
                                handleDeleteImage(image.id);
                              }
                            }}
                            className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
                            title="Remover"
                          >
                            <Trash2 className="w-4 h-4 text-white" />
                          </button>
                        </div>

                        {/* Info da imagem */}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                          <div className="text-white text-xs">
                            <div className="font-medium truncate">{image.name}</div>
                            <div className="text-white/70">
                              {new Date(image.uploadDate).toLocaleDateString('pt-BR')}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <Image className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p>Nenhuma imagem adicionada ainda.</p>
                    <p className="text-sm">Faça upload das primeiras fotos da obra.</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'timeline' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Timeline da Obra</h3>
                    <p className="text-gray-600">Acompanhe e atualize o cronograma de execução</p>
                  </div>
                  <div className="text-sm text-gray-500">
                    {timelineMilestones.length} marco{timelineMilestones.length !== 1 ? 's' : ''}
                  </div>
                </div>

                {/* Timeline */}
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <div className="p-6">
                    <div className="space-y-6">
                      {timelineMilestones.map((milestone, index) => {
                        const getStatusColor = (status: string) => {
                          switch (status) {
                            case 'completed': return 'bg-green-500';
                            case 'in-progress': return 'bg-yellow-500';
                            case 'pending': return 'bg-gray-300';
                            default: return 'bg-gray-300';
                          }
                        };

                        const getStatusIcon = (status: string) => {
                          switch (status) {
                            case 'completed': return <CheckCircle2 className="w-5 h-5 text-green-600" />;
                            case 'in-progress': return <Clock3 className="w-5 h-5 text-yellow-600" />;
                            case 'pending': return <Circle className="w-5 h-5 text-gray-400" />;
                            default: return <Circle className="w-5 h-5 text-gray-400" />;
                          }
                        };

                        const getStatusText = (status: string) => {
                          switch (status) {
                            case 'completed': return 'Concluído';
                            case 'in-progress': return 'Em andamento';
                            case 'pending': return 'Pendente';
                            default: return 'Pendente';
                          }
                        };

                        return (
                          <div key={milestone.id} className="flex gap-4">
                            <div className="flex flex-col items-center">
                              <div className={`flex-shrink-0 w-3 h-3 ${getStatusColor(milestone.status)} rounded-full mt-2`}></div>
                              {index < timelineMilestones.length - 1 && (
                                <div className="w-0.5 h-8 bg-gray-200 mt-2"></div>
                              )}
                            </div>
                            <div className="flex-1 pb-4">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h4 className="font-medium text-gray-900">{milestone.title}</h4>
                                    {getStatusIcon(milestone.status)}
                                  </div>
                                  <p className="text-gray-600 text-sm mb-2">{milestone.description}</p>
                                  <div className="flex items-center gap-4 text-xs text-gray-500">
                                    <span>📅 {formatDate(milestone.date)}</span>
                                    <span>📊 {getStatusText(milestone.status)}</span>
                                  </div>
                                </div>
                                
                                {/* Menu de ações */}
                                <div className="flex gap-1 ml-4">
                                  {/* Botão especial para conclusão */}
                                  {milestone.id.includes('milestone-completion') && (
                                    <button
                                      onClick={async () => {
                                        const newStatus: 'completed' | 'pending' = milestone.status === 'completed' ? 'pending' : 'completed';
                                        const updatedTimeline = timelineMilestones.map(m =>
                                          m.id === milestone.id ? { ...m, status: newStatus } : m
                                        );
                                        setTimelineMilestones(updatedTimeline);
                                        await saveTimeline(activeTracking!.id, updatedTimeline);
                                        
                                        // Atualizar status da obra também
                                        if (newStatus === 'completed') {
                                          updateTracking(activeTracking!.id, (t) => ({...t, status: 'Concluído'}));
                                          alertDialog.showSuccess('Obra Concluída!', 'A obra foi marcada como concluída.');
                                        } else {
                                          updateTracking(activeTracking!.id, (t) => ({...t, status: 'Em Andamento'}));
                                          alertDialog.showSuccess('Status Atualizado', 'A obra voltou para Em Andamento.');
                                        }
                                      }}
                                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                        milestone.status === 'completed'
                                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                          : 'bg-blue-600 text-white hover:bg-blue-700'
                                      }`}
                                      title={milestone.status === 'completed' ? 'Marcar como pendente' : 'Concluir Obra'}
                                    >
                                      {milestone.status === 'completed' ? 'Reabrir' : 'Concluir Obra'}
                                    </button>
                                  )}
                                  
                                  {/* Ações para marcos customizados */}
                                  {!milestone.id.includes('milestone-start') && 
                                   !milestone.id.includes('milestone-completion') && (
                                    <>
                                      <button
                                        onClick={() => handleUpdateMilestoneStatus(
                                          milestone.id, 
                                          milestone.status === 'completed' ? 'pending' : 'completed'
                                        )}
                                        className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-green-600"
                                        title={milestone.status === 'completed' ? 'Marcar como pendente' : 'Marcar como concluído'}
                                      >
                                        {milestone.status === 'completed' ? 
                                          <Circle className="w-4 h-4" /> : 
                                          <CheckCircle className="w-4 h-4" />
                                        }
                                      </button>
                                      <button
                                        onClick={async () => {
                                          if (window.confirm('Tem certeza que deseja remover este marco?')) {
                                            const updatedTimeline = timelineMilestones.filter(m => m.id !== milestone.id);
                                            setTimelineMilestones(updatedTimeline);
                                            await saveTimeline(activeTracking!.id, updatedTimeline);
                                            alertDialog.showSuccess('Marco Removido', 'O marco foi removido do timeline.');
                                          }
                                        }}
                                        className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-red-600"
                                        title="Remover marco"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Formulário para adicionar novos marcos */}
                <div className="bg-gray-50 rounded-lg p-6">
                  <h4 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
                    <Flag className="w-4 h-4 text-blue-600" />
                    Adicionar Marco do Timeline
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Título do Marco
                      </label>
                      <input
                        type="text"
                        value={newMilestone.title}
                        onChange={(e) => setNewMilestone(prev => ({ ...prev, title: e.target.value }))}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500"
                        placeholder="Ex: Instalação da rede primária"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Data
                      </label>
                      <input
                        type="date"
                        value={newMilestone.date}
                        onChange={(e) => setNewMilestone(prev => ({ ...prev, date: e.target.value }))}
                        min={timelineMilestones.find(m => m.id.includes('milestone-start'))?.date}
                        max={timelineMilestones.find(m => m.id.includes('milestone-completion'))?.date}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Data deve estar entre o início e a conclusão da obra
                      </p>
                    </div>
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Descrição
                    </label>
                    <textarea
                      rows={3}
                      value={newMilestone.description}
                      onChange={(e) => setNewMilestone(prev => ({ ...prev, description: e.target.value }))}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500"
                      placeholder="Descreva os detalhes deste marco..."
                    />
                  </div>
                  <button 
                    onClick={handleAddMilestone}
                    disabled={!newMilestone.title.trim() || !newMilestone.date}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 font-medium text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Adicionar Marco
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white/95 border-b border-slate-200 shadow-sm sticky top-0 z-50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button onClick={() => setActiveModule(null)} className="flex items-center space-x-2 text-slate-600 hover:text-[#1D3140]">
                <ArrowLeft className="w-5 h-5" />
                <span className="text-sm font-medium">Voltar ao Admin</span>
              </button>
              <div className="h-6 border-l border-slate-300" />
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${ON_COLORS.navy} 0%, ${ON_COLORS.blue} 100%)` }}>
                  <Activity className="w-5 h-5 text-white" />
                </div>
                <div>
                  <span className="text-base font-bold text-[#1D3140] block">Portal do Engenheiro</span>
                  <span className="text-xs text-slate-500 block">Gestão de Obras</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentView === 'dashboard' && renderDashboard()}
        {currentView === 'select-budget' && renderSelectBudget()}
        {currentView === 'tracking-detail' && renderTrackingDetail()}
      </div>

      {/* Modal de Progresso do Poste */}
      {selectedPostForModal && activeTracking && (
        <PostProgressModal
          isOpen={isPostModalOpen}
          onClose={() => {
            setIsPostModalOpen(false);
            setSelectedPostForModal(null);
          }}
          post={selectedPostForModal}
          onSave={handleSavePostProgress}
          trackingInfo={{
            projectName: activeTracking.budget_data.project_name,
            clientName: activeTracking.budget_data.client_name,
            city: activeTracking.budget_data.city,
          }}
        />
      )}

      <AlertDialog {...alertDialog.dialogProps} />
    </div>
  );
}