"use client";
import { useEffect, useState } from 'react';
import {
  Building,
  Calendar,
  Clock,
  Map,
  MapPin,
} from 'lucide-react';
import { BudgetPostDetail, WorkTracking } from '@/types';
import { supabase } from '@/lib/supabaseClient';
import { CanvasVisual } from './CanvasVisual';

interface PublicWorkViewProps {
  workId: string;
}

// ── SVG Donut ────────────────────────────────────────────────────────────────
function DonutChart({ percent, color = '#64ABDE', size = 80, stroke = 8 }: {
  percent: number; color?: string; size?: number; stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(percent, 100) / 100) * circ;
  const cx = size / 2;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} />
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
    </svg>
  );
}

// ── Metric Donut Card ────────────────────────────────────────────────────────
function MetricDonut({ title, installed, planned, suffix = '' }: {
  title: string; installed: number; planned: number; suffix?: string;
}) {
  const percent = planned > 0 ? Math.min(Math.round((installed / planned) * 100), 100) : 0;
  return (
    <div className="flex items-center gap-3.5">
      <div className="relative flex-shrink-0" style={{ width: 80, height: 80 }}>
        <DonutChart percent={percent} size={80} stroke={8} />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-bold text-white">{percent}%</span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-[#64ABDE] uppercase tracking-wider leading-tight">
          {title}
        </p>
        <p className="text-lg font-bold text-white leading-tight mt-0.5">
          {installed.toLocaleString('pt-BR')}
          <span className="text-white/40 text-sm font-normal">
            /{planned.toLocaleString('pt-BR')}{suffix}
          </span>
        </p>
      </div>
    </div>
  );
}

// ── Progress Bar ─────────────────────────────────────────────────────────────
function ProgressBar({ label, value, total, color = '#64ABDE', weight }: {
  label: string; value: number; total: number; color?: string; weight?: number;
}) {
  const pct = total > 0 ? Math.min(Math.round((value / total) * 100), 100) : 0;
  const weightedContribution = weight && total > 0 ? Math.min(Math.round(((value / total) * weight)), weight) : pct;
  
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
        <span>{label}</span>
        <div className="text-right">
          <span className="font-semibold">{value}/{total} ({pct}%)</span>
          {weight && (
            <div className="text-[10px] text-slate-500">
              Peso: {weightedContribution}/{weight}%
            </div>
          )}
        </div>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-2.5">
        <div className="h-2.5 rounded-full transition-all duration-500"
          style={{ width: `${weight ? (weightedContribution / weight) * 100 : pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function PublicWorkView({ workId }: PublicWorkViewProps) {
  const ON = { navy: '#1D3140', blue: '#64ABDE', accent: '#4E90C1' };

  const [workData, setWorkData] = useState<WorkTracking | null>(null);
  const [, setWorkImages] = useState<Array<{
    id: string; name: string; url: string; uploadDate: string; description?: string;
  }>>([]);
  const [timelineMilestones, setTimelineMilestones] = useState<Array<{
    id: string; title: string; description: string; date: string;
    status: 'completed' | 'in-progress' | 'pending'; createdAt: string;
  }>>([]);
  const [loading, setLoading] = useState(true);

  const calcProgress = (work: WorkTracking): number => {
    const ratio = (v: number, p?: number) => (!p || p <= 0 ? 0 : Math.min(v / p, 1));
    const pMt = work.planned_mt_meters ?? 0, pBt = work.planned_bt_meters ?? 0;
    const pPoles = work.planned_poles ?? 0, pEquip = work.planned_equipment ?? 0;
    const pLight = work.planned_public_lighting ?? 0;
    if (![pMt, pBt, pPoles, pEquip, pLight].some((v) => v > 0)) return work.progress_percentage ?? 0;
    return Math.max(0, Math.min(100, Math.round(
      ratio(work.poles_installed ?? 0, pPoles) * 40 +
      ratio((work.mt_extension_km ?? 0) * 1000, pMt) * 15 +
      ratio((work.bt_extension_km ?? 0) * 1000, pBt) * 25 +
      ratio(work.equipment_installed ?? 0, pEquip) * 10 +
      ratio(work.public_lighting_installed ?? 0, pLight) * 10,
    )));
  };

  useEffect(() => {
    (async () => {
      try {
        const { data: row, error } = await supabase
          .from('work_trackings').select('*').eq('public_id', workId).maybeSingle();
        if (!error && row) {
          const [pr, cr] = await Promise.all([
            supabase.from('tracked_posts').select('*').eq('tracking_id', row.id).order('name'),
            supabase.from('post_connections').select('*').eq('tracking_id', row.id),
          ]);
          const work: WorkTracking = {
            id: row.public_id ?? workId, budget_id: row.budget_id ?? '',
            name: row.name ?? '', status: row.status ?? 'Planejado',
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
            tracked_posts: (pr.data || []).map((p) => ({
              id: p.id, tracking_id: p.tracking_id, original_post_id: p.original_post_id || p.id,
              name: p.name, custom_name: p.custom_name || undefined,
              x_coord: Number(p.x_coord), y_coord: Number(p.y_coord),
              status: p.status as any, installation_date: p.installation_date || undefined,
              completion_date: p.completion_date || undefined, notes: p.notes || undefined,
              photos: [], materials: [],
            })),
            post_connections: (cr.data || []).map((c: any) => {
              const et = c.connection_type === 'green' ? 'green' : c.connection_type === 'blue' ? 'blue' : null;
              const enc = typeof c.client_id === 'string' ? c.client_id : '';
              return { id: c.id, from_post_id: c.from_post_id, to_post_id: c.to_post_id,
                connection_type: (et ?? (enc.startsWith('green:') ? 'green' : 'blue')) as 'blue' | 'green' };
            }),
          };
          setWorkData(work);
          
          // Debug: verificar se os postes estão sendo carregados corretamente
          console.log('🏗️ PublicWorkViewPremium - Dados carregados:', {
            workId,
            postsCount: work.tracked_posts.length,
            posts: work.tracked_posts.map(p => ({ 
              id: p.id, 
              name: p.name, 
              x: p.x_coord, 
              y: p.y_coord,
              hasCoords: p.x_coord != null && p.y_coord != null
            })),
            connectionsCount: work.post_connections.length
          });
          
          if (Array.isArray(row.work_images)) setWorkImages(row.work_images);
          if (Array.isArray(row.timeline_milestones) && row.timeline_milestones.length > 0) {
            setTimelineMilestones([...row.timeline_milestones].sort((a: any, b: any) => {
              if (a.id?.includes('milestone-start')) return -1;
              if (b.id?.includes('milestone-start')) return 1;
              if (a.id?.includes('milestone-completion')) return 1;
              if (b.id?.includes('milestone-completion')) return -1;
              return new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime();
            }));
          } else {
            // Marcos padrão quando não há timeline salva
            const startDate = row.start_date || new Date().toISOString().split('T')[0];
            const endDate = row.estimated_completion || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const isCompleted = row.status === 'Concluído';
            setTimelineMilestones([
              { id: 'milestone-start', title: 'Início da Obra', description: 'Início oficial dos trabalhos', date: startDate, status: 'completed', createdAt: '' },
              { id: 'milestone-completion', title: 'Conclusão da Obra', description: 'Finalização completa da obra', date: endDate, status: isCompleted ? 'completed' : 'pending', createdAt: '' },
            ]);
          }
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [workId]);

  const fmt = (d?: string) => d ? new Date(d).toLocaleDateString('pt-BR') : '-';

  const statusBadge = (s: WorkTracking['status']) => {
    if (s === 'Concluído') return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
    if (s === 'Em Andamento') return 'bg-blue-100 text-blue-800 border border-blue-200';
    if (s === 'Pausado') return 'bg-amber-100 text-amber-800 border border-amber-200';
    return 'bg-slate-100 text-slate-700 border border-slate-200';
  };

  const msStyle = (s: 'completed' | 'in-progress' | 'pending') => ({
    dot: s === 'completed' ? 'bg-emerald-500' : s === 'in-progress' ? 'bg-amber-500' : 'bg-slate-300',
    badge: s === 'completed' ? 'bg-emerald-100 text-emerald-800' : s === 'in-progress' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600',
    label: s === 'completed' ? 'Concluido' : s === 'in-progress' ? 'Em andamento' : 'Pendente',
  });

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-slate-100">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 mx-auto mb-3" style={{ borderColor: ON.blue }} />
        <p className="text-slate-500 text-sm">Carregando...</p>
      </div>
    </div>
  );

  if (!workData) return (
    <div className="h-screen flex items-center justify-center bg-slate-100">
      <div className="text-center">
        <Building className="w-14 h-14 text-slate-300 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-slate-900">Obra nao encontrada</h2>
      </div>
    </div>
  );

  // ── Derived ─────────────────────────────────────────────────────────────────
  const totalPoles = workData.planned_poles ?? 0;
  const polesInstalled = workData.poles_installed ?? 0;
  const totalPosts = totalPoles > 0 ? totalPoles : workData.tracked_posts.length;
  const completedPosts = totalPoles > 0 ? polesInstalled
    : workData.tracked_posts.filter(p => p.status === 'Concluído').length;

  const mtInstalled = Math.round((workData.mt_extension_km ?? 0) * 1000);
  const btInstalled = Math.round((workData.bt_extension_km ?? 0) * 1000);
  const mtPlanned = workData.planned_mt_meters ?? 0;
  const btPlanned = workData.planned_bt_meters ?? 0;
  const equipInstalled = workData.equipment_installed ?? 0;
  const equipPlanned = workData.planned_equipment ?? 0;
  const lightInstalled = workData.public_lighting_installed ?? 0;
  const lightPlanned = workData.planned_public_lighting ?? 0;

  const completedMs = timelineMilestones.filter(m => m.status === 'completed').length;
  const realPct = calcProgress(workData);

  const daysPlanned = (() => {
    if (!workData.start_date || !workData.estimated_completion) return null;
    const s = new Date(workData.start_date).getTime(), e = new Date(workData.estimated_completion).getTime();
    return (!Number.isNaN(s) && !Number.isNaN(e) && e >= s) ? Math.ceil((e - s) / 86400000) : null;
  })();

  const donutBg = { background: `conic-gradient(${ON.blue} ${realPct * 3.6}deg, rgba(255,255,255,0.18) 0deg)` };

  const postsForCanvas: BudgetPostDetail[] = workData.tracked_posts
    .filter(p => p.x_coord != null && p.y_coord != null && p.x_coord !== 0 && p.y_coord !== 0)
    .map(p => ({
      id: p.id, name: p.name || 'Poste', custom_name: p.custom_name,
      counter: 0, x_coord: p.x_coord, y_coord: p.y_coord,
      post_types: null, post_item_groups: [], post_materials: [],
    }));
    
  console.log('🎯 PostsForCanvas:', {
    originalCount: workData.tracked_posts.length,
    filteredCount: postsForCanvas.length,
    filtered: postsForCanvas.map(p => ({ id: p.id, name: p.name, x: p.x_coord, y: p.y_coord }))
  });

  const canvasProps = {
    orcamento: { id: workData.budget_id, nome: workData.name, imagemPlanta: workData.budget_data.plan_image_url,
      clientName: workData.budget_data.client_name, city: workData.budget_data.city } as any,
    budgetDetails: { id: workData.budget_id, name: workData.name,
      client_name: workData.budget_data.client_name, city: workData.budget_data.city,
      render_version: workData.render_version || 2, posts: postsForCanvas },
    selectedPoste: null, selectedPostDetail: null,
    onPosteClick: () => {}, onPostDetailClick: () => {}, onEditPost: () => {},
    onAddPoste: () => {}, onUpdatePoste: () => {}, onUploadImage: () => {},
    onDeleteImage: () => {}, onDeletePoste: () => {},
    postConnections: workData.post_connections || [],
    hidePostNames: true, postIconAlwaysGreen: true, loadingUpload: false,
    hideToolbar: true,
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen w-full max-w-[100vw] flex flex-col overflow-hidden bg-slate-100">

      {/* ── HEADER: logos à esquerda, nome do orçamento no centro ───────────── */}
      <div className="flex-shrink-0 relative overflow-hidden min-w-0"
        style={{ background: `linear-gradient(140deg, ${ON.navy} 0%, #223f52 45%, ${ON.accent} 100%)` }}>
        <div className="absolute inset-0 opacity-20"
          style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, #ffffff 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
        <div className="relative px-3 sm:px-4 lg:px-6 xl:px-8 py-4 sm:py-5 lg:py-7 text-white min-w-0">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4 min-w-0">
            {/* Esquerda: logo fixa do sistema + logo do engenheiro */}
            <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
              <img src="/OnEngenharia.webp" alt="ON Engenharia" className="h-14 sm:h-16 w-auto object-contain" />
              {workData.budget_data?.client_logo_url && (
                <img
                  src={workData.budget_data.client_logo_url}
                  alt="Logo da empresa"
                  className="h-14 sm:h-16 w-auto max-w-[120px] sm:max-w-[180px] object-contain"
                />
              )}
            </div>

            {/* Centro: nome do orçamento */}
            <div className="flex-1 min-w-0 flex flex-col items-center justify-center text-center">
              <h1 className="text-lg sm:text-xl lg:text-3xl font-bold tracking-tight leading-tight truncate w-full">
                {workData.budget_data.project_name || workData.name}
              </h1>
              <p className="text-white/80 mt-1.5 max-w-2xl text-xs sm:text-sm mx-auto">
                {workData.project_description ||
                  'Painel executivo com visao de avanco fisico da obra, evolucao da rede, marcos de entrega e registros visuais.'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs justify-center">
                {[
                  { icon: Building, label: workData.budget_data.client_name || 'Cliente' },
                  { icon: MapPin, label: workData.budget_data.city || 'Localizacao' },
                  { icon: Calendar, label: `Inicio: ${fmt(workData.start_date)}` },
                ].map(({ icon: Icon, label }) => (
                  <div key={label} className="rounded-xl bg-white/10 border border-white/20 px-2 sm:px-3 py-1.5">
                    <span className="flex items-center gap-1.5 text-white/90">
                      <Icon className="w-3.5 h-3.5" />{label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            {/* Right: donut card */}
            <div className="rounded-2xl bg-white/10 border border-white/20 backdrop-blur-sm p-3 sm:p-4 min-w-0 flex-shrink-0">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-white/80">Status do projeto</p>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusBadge(workData.status)}`}>
                  {workData.status}
                </span>
              </div>
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full p-2 flex-shrink-0" style={donutBg}>
                  <div className="w-full h-full rounded-full bg-[#173040] flex items-center justify-center">
                    <span className="text-sm sm:text-base font-bold">{realPct}%</span>
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-white/70">Atualizado em</p>
                  <p className="font-semibold text-sm">{fmt(workData.updated_at?.split('T')[0])}</p>
                  <p className="text-xs text-white/60 mt-0.5">{completedPosts} de {totalPosts} postes concluidos</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── DASHBOARD responsivo ─────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden p-2 sm:p-2.5 lg:p-3">
        {/* Layout mobile/tablet: vertical stack */}
        <div className="h-full xl:hidden flex flex-col gap-2.5 overflow-y-auto overflow-x-hidden min-w-0">
          {/* Métricas compactas */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 flex-shrink-0">
            {[
              { title: 'Postes', installed: completedPosts, planned: totalPosts, suffix: '' },
              { title: 'MT', installed: mtInstalled, planned: mtPlanned, suffix: 'm' },
              { title: 'BT', installed: btInstalled, planned: btPlanned, suffix: 'm' },
              { title: 'Equip.', installed: equipInstalled, planned: equipPlanned, suffix: '' },
              { title: 'Ilum.', installed: lightInstalled, planned: lightPlanned, suffix: '' },
            ].map(({ title, installed, planned, suffix }) => {
              const percent = planned > 0 ? Math.min(Math.round((installed / planned) * 100), 100) : 0;
              return (
                <div key={title} className="bg-white rounded-xl p-3 shadow-sm border border-slate-200">
                  <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">{title}</p>
                  <div className="flex items-center gap-2">
                    <div className="relative w-8 h-8 flex-shrink-0">
                      <DonutChart percent={percent} size={32} stroke={3} />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[8px] font-bold text-slate-700">{percent}%</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900 leading-tight">
                        {installed.toLocaleString('pt-BR')}
                      </p>
                      <p className="text-xs text-slate-500 leading-tight">
                        /{planned.toLocaleString('pt-BR')}{suffix}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Canvas */}
          <div className="h-64 sm:h-80 rounded-2xl overflow-hidden bg-white shadow-sm border border-slate-200 relative flex-shrink-0">
            {workData.budget_data.plan_image_url ? (
              <CanvasVisual {...canvasProps} />
            ) : (
              <div className="flex items-center justify-center h-full text-slate-300">
                <div className="text-center">
                  <Map className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="text-xs">Planta nao disponivel</p>
                </div>
              </div>
            )}
          </div>

          {/* Painéis de informação */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 flex-shrink-0">
            {/* Execution panel */}
            <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-200">
              <p className="text-sm font-semibold text-slate-900 mb-2.5">Painel de execucao</p>
              <div className="space-y-2">
                <ProgressBar label="Postes" value={completedPosts} total={totalPosts} color={ON.blue} />
                <ProgressBar label="Rede MT (m)" value={mtInstalled} total={mtPlanned} color="#4E90C1" />
                <ProgressBar label="Rede BT (m)" value={btInstalled} total={btPlanned} color="#2dd4bf" />
                <ProgressBar label="Equipamentos" value={equipInstalled} total={equipPlanned} color="#a78bfa" />
                <ProgressBar label="Iluminacao" value={lightInstalled} total={lightPlanned} color="#fb923c" />
              </div>
            </div>

            {/* Timeline compacta */}
            <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-slate-900">Timeline</p>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                  {completedMs}/{timelineMilestones.length}
                </span>
              </div>
              {timelineMilestones.length > 0 ? (
                <div className="space-y-2 max-h-40 overflow-y-auto [scrollbar-width:thin]">
                  {timelineMilestones.slice(0, 4).map((m) => {
                    const st = msStyle(m.status);
                    return (
                      <div key={m.id} className="flex gap-2">
                        <div className={`w-2 h-2 rounded-full mt-1 ${st.dot} flex-shrink-0`} />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-900 leading-tight truncate">{m.title}</p>
                          <p className="text-[11px] text-slate-400">{fmt(m.date)}</p>
                        </div>
                      </div>
                    );
                  })}
                  {timelineMilestones.length > 4 && (
                    <p className="text-xs text-slate-400 text-center">+{timelineMilestones.length - 4} mais...</p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-300 py-4">
                  <Clock className="w-6 h-6 mb-1 opacity-50" />
                  <p className="text-xs">Nenhum marco cadastrado.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Layout desktop: 3 colunas - minmax(0,...) permite encolher */}
        <div className="hidden xl:grid h-full gap-2.5 min-w-0 w-full" 
             style={{ gridTemplateColumns: 'minmax(0, 380px) minmax(0, 1fr) minmax(0, 420px)' }}>

          {/* ── LEFT: sidebar de métricas ────────────────────────────────── */}
          <div className="h-full min-w-0 rounded-2xl flex flex-col overflow-hidden" style={{ backgroundColor: ON.navy }}>
            <div className="px-4 xl:px-6 pt-5 pb-3 flex-shrink-0">
              <p className="text-[11px] font-bold text-[#64ABDE] uppercase tracking-widest">Avanco fisico</p>
            </div>
            <div className="flex-1 overflow-y-auto px-4 xl:px-6 pb-5 space-y-5 [scrollbar-width:thin]">
              <MetricDonut title="Postes" installed={completedPosts} planned={totalPosts} />
              <div className="border-t border-white/10" />
              <MetricDonut title="Rede Media Tensao" installed={mtInstalled} planned={mtPlanned} suffix="m" />
              <div className="border-t border-white/10" />
              <MetricDonut title="Rede Baixa Tensao" installed={btInstalled} planned={btPlanned} suffix="m" />
              <div className="border-t border-white/10" />
              <MetricDonut title="Equipamentos" installed={equipInstalled} planned={equipPlanned} />
              <div className="border-t border-white/10" />
              <MetricDonut title="Iluminacao Publica" installed={lightInstalled} planned={lightPlanned} />
            </div>
            <div className="flex-shrink-0 border-t border-white/10 px-4 xl:px-6 py-4">
              <div className="flex justify-between text-[11px] text-white/60 mb-2">
                <span>Progresso geral</span>
                <span className="font-bold text-white">{realPct}%</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-2.5">
                <div className="h-2.5 rounded-full transition-all duration-700"
                  style={{ width: `${realPct}%`, backgroundColor: ON.blue }} />
              </div>
            </div>
          </div>

          {/* ── MIDDLE: canvas ───────────────────────────────────────────── */}
          <div className="h-full min-w-0 rounded-2xl overflow-hidden bg-white shadow-sm border border-slate-200 relative">
            {workData.budget_data.plan_image_url ? (
              <CanvasVisual {...canvasProps} />
            ) : (
              <div className="flex items-center justify-center h-full text-slate-300">
                <div className="text-center">
                  <Map className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="text-xs">Planta nao disponivel</p>
                </div>
              </div>
            )}
          </div>

          {/* ── RIGHT: paineis sem scroll ────────────────────────────────── */}
          <div className="h-full min-w-0 flex flex-col gap-1.5 overflow-hidden">

            {/* mini stats */}
            <div className="grid grid-cols-3 gap-1 flex-shrink-0 min-w-0">
              {[
                { label: 'Progresso', value: `${realPct}%`, color: ON.blue },
                { label: 'Postes', value: `${completedPosts}/${totalPosts}`, color: '#10b981' },
                { label: 'Marcos', value: `${completedMs}/${timelineMilestones.length}`, color: '#f59e0b' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-white rounded-lg p-2 shadow-sm border border-slate-200 text-center min-w-0 overflow-hidden">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide leading-tight">{label}</p>
                  <p className="text-sm font-bold" style={{ color }}>{value}</p>
                </div>
              ))}
            </div>

            {/* execution panel */}
            <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-200 flex-shrink-0 min-w-0 overflow-hidden">
              <p className="text-sm font-semibold text-slate-900 mb-2.5">Painel de execucao</p>
              <div className="space-y-2">
                <ProgressBar label="Postes" value={completedPosts} total={totalPosts} color={ON.blue} />
                <ProgressBar label="Rede MT (m)" value={mtInstalled} total={mtPlanned} color="#4E90C1" />
                <ProgressBar label="Rede BT (m)" value={btInstalled} total={btPlanned} color="#2dd4bf" />
                <ProgressBar label="Equipamentos" value={equipInstalled} total={equipPlanned} color="#a78bfa" />
                <ProgressBar label="Iluminacao" value={lightInstalled} total={lightPlanned} color="#fb923c" />
              </div>
            </div>

            {/* cronograma + mensagem lado a lado */}
            <div className="grid grid-cols-2 gap-2 flex-shrink-0 min-w-0">
              {/* schedule summary */}
              <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-200 min-w-0 overflow-hidden">
                <p className="text-sm font-semibold text-slate-900 mb-2">Cronograma</p>
                <div className="space-y-1.5">
                  {[
                    { l: 'Inicio', v: fmt(workData.start_date) },
                    { l: 'Entrega', v: fmt(workData.estimated_completion) },
                    { l: 'Duracao', v: daysPlanned ? `${daysPlanned}d` : '-' },
                  ].map(({ l, v }) => (
                    <div key={l} className="flex justify-between items-center rounded-lg bg-slate-50 px-2.5 py-1.5">
                      <span className="text-xs text-slate-500">{l}</span>
                      <span className="text-xs font-semibold text-slate-800">{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* mensagem personalizada */}
              <div className="rounded-2xl p-3 text-white min-w-0 overflow-y-auto" style={{ backgroundColor: ON.navy }}>
                <p className="text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: ON.blue }}>
                  {workData.current_focus_title?.trim() || 'Mensagem personalizada'}
                </p>
                <p className="text-xs leading-relaxed text-white/90 break-words">
                  {workData.current_focus_description?.trim() || (
                    workData.status === 'Concluído'
                      ? 'Obra concluída. Painel em modo de histórico final.'
                      : 'Priorizar finalização dos postes e consolidação da rede para acelerar o encerramento.'
                  )}
                </p>
              </div>
            </div>

            {/* timeline - ocupa o resto do espaço */}
            <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-200 flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden">
              <div className="flex items-center justify-between mb-2 flex-shrink-0">
                <p className="text-sm font-semibold text-slate-900">Timeline</p>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                  {completedMs}/{timelineMilestones.length}
                </span>
              </div>
              {timelineMilestones.length > 0 ? (
                <div className="space-y-2 flex-1 min-h-0 overflow-y-auto [scrollbar-width:none]">
                  {timelineMilestones.map((m, i) => {
                    const st = msStyle(m.status);
                    return (
                      <div key={m.id} className="flex gap-2.5">
                        <div className="flex flex-col items-center flex-shrink-0">
                          <div className={`w-2 h-2 rounded-full mt-1 ${st.dot}`} />
                          {i < timelineMilestones.length - 1 && <div className="w-px flex-1 bg-slate-200 mt-1" />}
                        </div>
                        <div className="pb-2 min-w-0">
                          <div className="flex items-start justify-between gap-1">
                            <p className="text-xs font-semibold text-slate-900 leading-tight">{m.title}</p>
                            <span className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${st.badge}`}>
                              {st.label}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">{fmt(m.date)}</p>
                          {m.description && (
                            <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{m.description}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-300">
                  <Clock className="w-6 h-6 mb-1 opacity-50" />
                  <p className="text-xs">Nenhum marco cadastrado.</p>
                </div>
              )}
            </div>

          </div>{/* /right */}
        </div>
      </div>
    </div>
  );
}
