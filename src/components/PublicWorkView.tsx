"use client";
import { useState, useEffect } from 'react';
import { 
  BarChart3, 
  Clock, 
  Image as ImageIcon, 
  Map, 
  Calendar,
  MapPin,
  CheckCircle,
  TrendingUp,
  Building,
  Eye
} from 'lucide-react';
import { WorkTracking } from '@/types';
import { CanvasVisual } from './CanvasVisual';
import { supabase } from '@/lib/supabaseClient';

interface PublicWorkViewProps {
  workId: string;
}

export function PublicWorkView({ workId }: PublicWorkViewProps) {
  const [workData, setWorkData] = useState<WorkTracking | null>(null);
  const [workImages, setWorkImages] = useState<Array<{
    id: string;
    name: string;
    url: string;
    uploadDate: string;
    description?: string;
  }>>([]);
  const [timelineMilestones, setTimelineMilestones] = useState<Array<{
    id: string;
    title: string;
    description: string;
    date: string;
    status: 'completed' | 'in-progress' | 'pending';
    createdAt: string;
  }>>([]);
  const [activeTab, setActiveTab] = useState<'progress' | 'timeline' | 'images' | 'map'>('progress');
  const [loading, setLoading] = useState(true);

  // Função para calcular progresso ponderado adaptada para Supabase
  const calcProgress = (work: WorkTracking): number => {
    const ratio = (v: number, p?: number) => (!p || p <= 0 ? 0 : Math.min(v / p, 1));
    
    // Usar valores planejados se disponíveis, senão usar dados dos tracked_posts como referência
    const pMt = work.planned_mt_meters ?? 0;
    const pBt = work.planned_bt_meters ?? 0;
    const pPoles = work.planned_poles ?? work.tracked_posts.length; // Fallback para número de postes rastreados
    const pEquip = work.planned_equipment ?? 0;
    const pLight = work.planned_public_lighting ?? 0;
    
    // Se não há valores planejados para redes e equipamentos, usar apenas progresso dos postes
    const hasPlannedValues = [pMt, pBt, pEquip, pLight].some((v) => v > 0);
    
    if (!hasPlannedValues && pPoles > 0) {
      // Usar apenas progresso dos postes quando não há outros valores planejados
      const completedPosts = work.tracked_posts.filter(p => p.status === 'Concluído').length;
      return Math.round((completedPosts / pPoles) * 100);
    }
    
    if (![pMt, pBt, pPoles, pEquip, pLight].some((v) => v > 0)) {
      return work.progress_percentage ?? 0;
    }
    
    // Usar postes instalados ou contar postes concluídos
    const polesCompleted = work.poles_installed ?? work.tracked_posts.filter(p => p.status === 'Concluído').length;
    
    return Math.max(0, Math.min(100, Math.round(
      ratio(polesCompleted, pPoles) * 40 +
      ratio((work.mt_extension_km ?? 0) * 1000, pMt) * 15 +
      ratio((work.bt_extension_km ?? 0) * 1000, pBt) * 25 +
      ratio(work.equipment_installed ?? 0, pEquip) * 10 +
      ratio(work.public_lighting_installed ?? 0, pLight) * 10,
    )));
  };

  useEffect(() => {
    // Carregar dados da obra do Supabase
    const loadWorkData = async () => {
      try {
        const { data: row, error } = await supabase
          .from('work_trackings')
          .select('*')
          .eq('public_id', workId)
          .maybeSingle();
        
        if (!error && row) {
          const [pr, cr] = await Promise.all([
            supabase.from('tracked_posts').select('*').eq('tracking_id', row.id).order('name'),
            supabase.from('post_connections').select('*').eq('tracking_id', row.id),
          ]);
          
          const work: WorkTracking = {
            id: row.public_id ?? workId,
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
            tracked_posts: (pr.data || []).map((p) => ({
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
            post_connections: (cr.data || []).map((c: any) => {
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
          
          setWorkData(work);
          
          // Debug: verificar se os postes estão sendo carregados corretamente
          console.log('🏗️ PublicWorkView - Dados carregados:', {
            workId,
            postsCount: work.tracked_posts.length,
            posts: work.tracked_posts.map(p => ({ 
              id: p.id, 
              name: p.name, 
              x: p.x_coord, 
              y: p.y_coord,
              hasCoords: p.x_coord != null && p.y_coord != null && p.x_coord !== 0 && p.y_coord !== 0
            })),
            connectionsCount: work.post_connections.length
          });
          
          // Carregar imagens do Supabase
          if (Array.isArray(row.work_images)) {
            setWorkImages(row.work_images);
          }
          
          // Carregar timeline do Supabase ou gerar marcos padrão
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
      } catch (error) {
        console.error('Erro ao carregar dados da obra:', error);
      } finally {
        setLoading(false);
      }
    };

    loadWorkData();
  }, [workId]);

  const formatDate = (date?: string): string => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('pt-BR');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando dados da obra...</p>
        </div>
      </div>
    );
  }

  if (!workData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Building className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Obra não encontrada</h2>
          <p className="text-gray-600">A obra solicitada não foi encontrada ou não está mais disponível.</p>
        </div>
      </div>
    );
  }

  const completedPosts = workData.tracked_posts.filter(p => p.status === 'Concluído').length;
  const totalPosts = workData.tracked_posts.length;
  const realProgress = calcProgress(workData);

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      {/* Header: logos à esquerda, nome do orçamento no centro */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            {/* Esquerda: logo fixa do sistema + logo do engenheiro */}
            <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0 order-2 sm:order-1">
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
            <div className="flex-1 min-w-0 flex flex-col items-center justify-center order-1 sm:order-2">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 truncate w-full text-center">{workData.name}</h1>
              <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 mt-2 text-xs sm:text-sm text-gray-600">
                <span className="flex items-center gap-1.5">
                  <Building className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                  <span className="truncate">{workData.budget_data.client_name || 'Cliente'}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                  <span className="truncate">{workData.budget_data.city || 'Localização'}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                  <span className="whitespace-nowrap">Início: {formatDate(workData.start_date)}</span>
                </span>
              </div>
            </div>
            
            {/* Direita: status */}
            <div className="text-center sm:text-right flex-shrink-0 order-3">
              <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                workData.status === 'Concluído' ? 'bg-green-100 text-green-800' :
                workData.status === 'Em Andamento' ? 'bg-blue-100 text-blue-800' :
                workData.status === 'Pausado' ? 'bg-yellow-100 text-yellow-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {workData.status}
              </div>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">Atualizado em {formatDate(workData.updated_at?.split('T')[0])}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Navegação por Abas */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 lg:px-6">
          <nav className="flex overflow-x-auto scrollbar-hide"
               style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            <button
              onClick={() => setActiveTab('progress')}
              className={`py-3 sm:py-4 px-2 sm:px-3 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors whitespace-nowrap ${
                activeTab === 'progress'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Progresso
            </button>
            <button
              onClick={() => setActiveTab('timeline')}
              className={`py-3 sm:py-4 px-2 sm:px-3 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors whitespace-nowrap ${
                activeTab === 'timeline'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Timeline
            </button>
            <button
              onClick={() => setActiveTab('images')}
              className={`py-3 sm:py-4 px-2 sm:px-3 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors whitespace-nowrap ${
                activeTab === 'images'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Imagens ({workImages.length})</span>
              <span className="sm:hidden">Fotos</span>
            </button>
            <button
              onClick={() => setActiveTab('map')}
              className={`py-3 sm:py-4 px-2 sm:px-3 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors whitespace-nowrap ${
                activeTab === 'map'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Map className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Mapa
            </button>
          </nav>
        </div>
      </div>

      {/* Conteúdo das Abas */}
      <div className="max-w-6xl mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 lg:py-8">
        {activeTab === 'progress' && (
          <div className="space-y-6 sm:space-y-8">
            {/* Cards de Estatísticas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              <div className="bg-white rounded-xl p-4 sm:p-6 shadow-lg">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-600 mb-1">Progresso Geral</p>
                    <p className="text-2xl sm:text-3xl font-bold text-blue-600">{realProgress}%</p>
                  </div>
                  <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600 flex-shrink-0" />
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 sm:p-6 shadow-lg">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-600 mb-1">Postes</p>
                    <p className="text-xl sm:text-3xl font-bold text-green-600">{completedPosts}/{totalPosts}</p>
                  </div>
                  <CheckCircle className="w-6 h-6 sm:w-8 sm:h-8 text-green-600 flex-shrink-0" />
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 sm:p-6 shadow-lg">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-600 mb-1">Rede MT</p>
                    <p className="text-lg sm:text-2xl lg:text-3xl font-bold text-blue-600 truncate">
                      {Math.round((workData.mt_extension_km ?? 0) * 1000)}/{workData.planned_mt_meters ?? 0}m
                    </p>
                  </div>
                  <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600 flex-shrink-0" />
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 sm:p-6 shadow-lg">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-600 mb-1">Rede BT</p>
                    <p className="text-lg sm:text-2xl lg:text-3xl font-bold text-emerald-600 truncate">
                      {Math.round((workData.bt_extension_km ?? 0) * 1000)}/{workData.planned_bt_meters ?? 0}m
                    </p>
                  </div>
                  <Building className="w-6 h-6 sm:w-8 sm:h-8 text-emerald-600 flex-shrink-0" />
                </div>
              </div>

            </div>

            {/* Componentes da Obra */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
              {/* Componentes Detalhados */}
              <div className="bg-white rounded-xl p-4 sm:p-6 shadow-lg">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Componentes da Obra</h3>
                <div className="space-y-4">
                  {/* Postes */}
                  <div>
                    <div className="flex justify-between text-sm text-gray-600 mb-2">
                      <span>Postes (Peso: 40%)</span>
                      <span>
                        {workData.poles_installed ?? workData.tracked_posts.filter(p => p.status === 'Concluído').length}/
                        {workData.planned_poles ?? workData.tracked_posts.length}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div 
                        className="bg-blue-500 h-3 rounded-full transition-all duration-500"
                        style={{ 
                          width: `${(() => {
                            const planned = workData.planned_poles ?? workData.tracked_posts.length;
                            const completed = workData.poles_installed ?? workData.tracked_posts.filter(p => p.status === 'Concluído').length;
                            return planned > 0 ? Math.min((completed / planned) * 100, 100) : 0;
                          })()}%` 
                        }}
                      />
                    </div>
                  </div>

                  {/* Rede BT */}
                  <div>
                    <div className="flex justify-between text-sm text-gray-600 mb-2">
                      <span>Rede Baixa Tensão (Peso: 25%)</span>
                      <span>
                        {Math.round((workData.bt_extension_km ?? 0) * 1000)}m
                        {workData.planned_bt_meters ? `/${workData.planned_bt_meters}m` : ' instalados'}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div 
                        className="bg-emerald-500 h-3 rounded-full transition-all duration-500"
                        style={{ 
                          width: `${workData.planned_bt_meters ? 
                            Math.min(((workData.bt_extension_km ?? 0) * 1000) / workData.planned_bt_meters * 100, 100) : 
                            (workData.bt_extension_km ?? 0) > 0 ? 100 : 0
                          }%` 
                        }}
                      />
                    </div>
                  </div>

                  {/* Rede MT */}
                  <div>
                    <div className="flex justify-between text-sm text-gray-600 mb-2">
                      <span>Rede Média Tensão (Peso: 15%)</span>
                      <span>
                        {Math.round((workData.mt_extension_km ?? 0) * 1000)}m
                        {workData.planned_mt_meters ? `/${workData.planned_mt_meters}m` : ' instalados'}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div 
                        className="bg-blue-400 h-3 rounded-full transition-all duration-500"
                        style={{ 
                          width: `${workData.planned_mt_meters ? 
                            Math.min(((workData.mt_extension_km ?? 0) * 1000) / workData.planned_mt_meters * 100, 100) : 
                            (workData.mt_extension_km ?? 0) > 0 ? 100 : 0
                          }%` 
                        }}
                      />
                    </div>
                  </div>

                  {/* Equipamentos */}
                  <div>
                    <div className="flex justify-between text-sm text-gray-600 mb-2">
                      <span>Equipamentos (Peso: 10%)</span>
                      <span>
                        {workData.equipment_installed ?? 0}
                        {workData.planned_equipment ? `/${workData.planned_equipment}` : ' instalados'}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div 
                        className="bg-purple-500 h-3 rounded-full transition-all duration-500"
                        style={{ 
                          width: `${workData.planned_equipment ? 
                            Math.min((workData.equipment_installed ?? 0) / workData.planned_equipment * 100, 100) : 
                            (workData.equipment_installed ?? 0) > 0 ? 100 : 0
                          }%` 
                        }}
                      />
                    </div>
                  </div>

                  {/* Iluminação Pública */}
                  <div>
                    <div className="flex justify-between text-sm text-gray-600 mb-2">
                      <span>Iluminação Pública (Peso: 10%)</span>
                      <span>
                        {workData.public_lighting_installed ?? 0}
                        {workData.planned_public_lighting ? `/${workData.planned_public_lighting}` : ' instalados'}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div 
                        className="bg-orange-500 h-3 rounded-full transition-all duration-500"
                        style={{ 
                          width: `${workData.planned_public_lighting ? 
                            Math.min((workData.public_lighting_installed ?? 0) / workData.planned_public_lighting * 100, 100) : 
                            (workData.public_lighting_installed ?? 0) > 0 ? 100 : 0
                          }%` 
                        }}
                      />
                    </div>
                  </div>
                </div>
                
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs text-blue-800 font-semibold mb-1">Progresso Ponderado</p>
                  <p className="text-xs text-blue-700">
                    O progresso geral ({realProgress}%) considera pesos diferentes: Postes (40%), Rede BT (25%), Rede MT (15%), Equipamentos e Iluminação (10% cada). 
                    {!workData.planned_mt_meters && !workData.planned_bt_meters && !workData.planned_equipment && !workData.planned_public_lighting && 
                      ' Como esta obra tem apenas postes cadastrados, o progresso é baseado na conclusão dos postes.'
                    }
                  </p>
                </div>
              </div>
              {/* Status dos Postes */}
              <div className="bg-white rounded-xl p-4 sm:p-6 shadow-lg">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Status dos Postes</h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm text-gray-600 mb-2">
                      <span>Concluídos</span>
                      <span>{completedPosts} de {totalPosts} ({realProgress}%)</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-4">
                      <div 
                        className="bg-gradient-to-r from-green-500 to-green-600 h-4 rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                        style={{ width: `${realProgress}%` }}
                      >
                        {realProgress > 10 && (
                          <span className="text-white text-xs font-medium">{realProgress}%</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Mensagem personalizada / Foco atual */}
              <div className="rounded-xl p-4 sm:p-6 shadow-lg text-white" style={{ backgroundColor: '#1D3140' }}>
                <p className="text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: '#64ABDE' }}>
                  {workData.current_focus_title?.trim() || 'Mensagem personalizada'}
                </p>
                <p className="text-sm sm:text-base leading-relaxed text-white/90">
                  {workData.current_focus_description?.trim() || (
                    workData.status === 'Concluído'
                      ? 'Obra concluída. Painel em modo de histórico final.'
                      : 'Priorizar finalização dos postes e consolidação da rede para acelerar o encerramento.'
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'timeline' && (
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Timeline da Obra</h3>
              <p className="text-gray-600">Acompanhe os marcos e progresso da obra</p>
            </div>
            
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
                        <div className={`flex-shrink-0 w-4 h-4 ${getStatusColor(milestone.status)} rounded-full`}></div>
                        {index < timelineMilestones.length - 1 && (
                          <div className="w-0.5 h-12 bg-gray-200 mt-2"></div>
                        )}
                      </div>
                      <div className="flex-1 pb-6">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-semibold text-gray-900">{milestone.title}</h4>
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-gray-500">{formatDate(milestone.date)}</span>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              milestone.status === 'completed' ? 'bg-green-100 text-green-800' :
                              milestone.status === 'in-progress' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {getStatusText(milestone.status)}
                            </span>
                          </div>
                        </div>
                        {milestone.description && <p className="text-gray-600">{milestone.description}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'images' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Galeria da Obra</h3>
                  <p className="text-gray-600 text-sm sm:text-base">Fotos do progresso e diferentes etapas da obra</p>
                </div>
                <div className="text-sm text-gray-500 flex-shrink-0">
                  {workImages.length} imagem{workImages.length !== 1 ? 's' : ''}
                </div>
              </div>

              {workImages.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {workImages.map((image) => (
                    <div key={image.id} className="group relative bg-gray-100 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                      <img 
                        src={image.url} 
                        alt={image.name}
                        className="w-full h-48 object-cover"
                      />
                      
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button
                          onClick={() => window.open(image.url, '_blank')}
                          className="p-3 bg-white/20 rounded-full hover:bg-white/30 transition-colors"
                        >
                          <Eye className="w-5 h-5 text-white" />
                        </button>
                      </div>

                      <div className="p-4">
                        <h4 className="font-medium text-gray-900 mb-1 truncate">{image.name}</h4>
                        <p className="text-sm text-gray-500">
                          {new Date(image.uploadDate).toLocaleDateString('pt-BR')}
                        </p>
                        {image.description && (
                          <p className="text-sm text-gray-600 mt-2 truncate">{image.description}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h4 className="text-lg font-medium text-gray-900 mb-2">Nenhuma imagem disponível</h4>
                  <p className="text-gray-600">As imagens da obra aparecerão aqui conforme forem adicionadas.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'map' && (
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Mapa da Obra</h3>
                  <p className="text-gray-600 text-sm sm:text-base">Planta da obra</p>
                </div>
              </div>
            </div>
            
            <div className="h-64 sm:h-80 lg:h-[500px] xl:h-[600px] relative">
              {workData.budget_data.plan_image_url ? (
                <CanvasVisual
                  orcamento={{
                    id: workData.budget_id,
                    nome: workData.name,
                    imagemPlanta: workData.budget_data.plan_image_url,
                    clientName: workData.budget_data.client_name,
                    city: workData.budget_data.city,
                    concessionariaId: '',
                    dataModificacao: workData.updated_at || new Date().toISOString(),
                    status: workData.status as any,
                    postes: [],
                  } as any}
                  budgetDetails={{
                    id: workData.budget_id,
                    name: workData.name,
                    client_name: workData.budget_data.client_name,
                    city: workData.budget_data.city,
                    render_version: workData.render_version || 2,
                    posts: workData.tracked_posts
                      .filter(p => p.x_coord != null && p.y_coord != null && p.x_coord !== 0 && p.y_coord !== 0)
                      .map(p => ({
                        id: p.id,
                        name: p.name || 'Poste',
                        custom_name: p.custom_name,
                        counter: 0,
                        x_coord: p.x_coord,
                        y_coord: p.y_coord,
                        post_types: null,
                        post_item_groups: [],
                        post_materials: [],
                      })),
                  }}
                  selectedPoste={null}
                  selectedPostDetail={null}
                  onPosteClick={() => {}}
                  onPostDetailClick={() => {}}
                  onEditPost={() => {}}
                  onAddPoste={() => {}}
                  onUpdatePoste={() => {}}
                  onUploadImage={() => {}}
                  onDeleteImage={() => {}}
                  onDeletePoste={() => {}}
                  postConnections={workData.post_connections || []}
                  hidePostNames={true}
                  postIconAlwaysGreen={true}
                  loadingUpload={false}
                  hideToolbar={true}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <div className="text-center">
                    <Map className="w-12 h-12 mx-auto mb-4" />
                    <p>Planta da obra não disponível</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}