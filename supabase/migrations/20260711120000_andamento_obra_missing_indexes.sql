-- Indices faltando identificados na otimizacao de carregamento do modulo
-- Andamento de Obra (dashboard + area de trabalho): cobrem os padroes de
-- filtro usados por getWorkPendingApprovals.ts e getUnreadCountsForWorks.ts,
-- que hoje se apoiam em indices parciais (work_id + outra coluna) e acabam
-- filtrando em memoria a coluna que falta.

-- getWorkPendingApprovals: eq('status','awaiting_approval').in('work_id', workIds)
-- Hoje so existe idx_work_milestones_work_order (work_id, order_index), que nao cobre status.
create index if not exists idx_work_milestones_work_status
  on public.work_milestones (work_id, status);

-- getUnreadCountsForWorks: in('work_id', workIds).eq('sender_role','manager').is('read_by_engineer_at', null)
-- Indice parcial: cobre exatamente o padrao "nao lidas pelo engenheiro" e cresce devagar,
-- ja que so inclui linhas ainda nao lidas.
create index if not exists idx_work_messages_unread_engineer
  on public.work_messages (work_id, sender_role)
  where read_by_engineer_at is null;

-- Consistencia com as demais tabelas de midia do modulo (todas indexadas por work_id
-- alem da FK de origem); work_alert_media era a unica sem esse indice.
create index if not exists idx_work_alert_media_work
  on public.work_alert_media (work_id);
