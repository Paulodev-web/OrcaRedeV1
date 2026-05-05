-- =============================================================================
-- Simulate Manager Alert (Bloco 8)
--
-- Pre-requisitos:
--   - Manager cadastrado como work_members com role='manager'
--   - Obra em status 'in_progress' ou 'planned'
--
-- Uso:
--   1. Substitua os UUIDs abaixo pelos seus valores reais
--   2. Execute bloco a bloco no SQL Editor do Supabase
-- =============================================================================

-- Variaveis (substitua)
-- :manager_id = UUID do manager
-- :work_id    = UUID da obra
-- :engineer_id = UUID do engenheiro

-- 1. Manager abre alerta severity='critical'
INSERT INTO public.work_alerts (
  work_id, created_by, severity, category, title, description, client_event_id
) VALUES (
  ':work_id',
  ':manager_id',
  'critical',
  'accident',
  'Acidente com equipe no poste P-05',
  'Um membro da equipe sofreu queda durante instalacao do poste P-05. Equipe ja prestou primeiros socorros.',
  gen_random_uuid()
) RETURNING id AS alert_id;

-- Guardar o alert_id retornado para os proximos passos
-- :alert_id = UUID retornado acima

-- 2. Verificar notificacao para engineer (alert_opened)
SELECT * FROM public.notifications
WHERE work_id = ':work_id'
  AND kind = 'alert_opened'
ORDER BY created_at DESC
LIMIT 1;

-- 3. Inserir evento 'opened' na timeline
INSERT INTO public.work_alert_updates (
  alert_id, work_id, actor_id, actor_role, update_type, notes
) VALUES (
  ':alert_id', ':work_id', ':manager_id', 'manager', 'opened', NULL
);

-- 4. Engineer reconhece (open -> in_progress)
UPDATE public.work_alerts
SET status = 'in_progress'
WHERE id = ':alert_id';

INSERT INTO public.work_alert_updates (
  alert_id, work_id, actor_id, actor_role, update_type, notes
) VALUES (
  ':alert_id', ':work_id', ':engineer_id', 'engineer', 'in_progress', 'Reconhecido, tomando providencias.'
);

-- 5. Verificar notificacao (alert_acknowledged -> manager)
SELECT * FROM public.notifications
WHERE work_id = ':work_id'
  AND kind = 'alert_acknowledged'
ORDER BY created_at DESC
LIMIT 1;

-- 6. Manager resolve em campo (in_progress -> resolved_in_field)
UPDATE public.work_alerts
SET status = 'resolved_in_field',
    field_resolution_at = now(),
    field_resolution_notes = 'Equipe removida da area. SAMU acionado. Membro estavel.'
WHERE id = ':alert_id';

INSERT INTO public.work_alert_updates (
  alert_id, work_id, actor_id, actor_role, update_type, notes
) VALUES (
  ':alert_id', ':work_id', ':manager_id', 'manager', 'resolved_in_field',
  'Equipe removida da area. SAMU acionado. Membro estavel.'
);

-- 7. Verificar notificacao (alert_resolved_in_field -> engineer)
SELECT * FROM public.notifications
WHERE work_id = ':work_id'
  AND kind = 'alert_resolved_in_field'
ORDER BY created_at DESC
LIMIT 1;

-- 8. Engineer fecha alerta (resolved_in_field -> closed)
UPDATE public.work_alerts
SET status = 'closed',
    closed_by = ':engineer_id',
    closed_at = now(),
    closure_notes = 'Confirmado com equipe. Membro hospitalizado, prognóstico bom.'
WHERE id = ':alert_id';

INSERT INTO public.work_alert_updates (
  alert_id, work_id, actor_id, actor_role, update_type, notes
) VALUES (
  ':alert_id', ':work_id', ':engineer_id', 'engineer', 'closed',
  'Confirmado com equipe. Membro hospitalizado, prognóstico bom.'
);

-- 9. Verificar notificacao (alert_closed -> manager)
SELECT * FROM public.notifications
WHERE work_id = ':work_id'
  AND kind = 'alert_closed'
ORDER BY created_at DESC
LIMIT 1;

-- 10. Verificar last_activity_at atualizado na obra
SELECT last_activity_at FROM public.works WHERE id = ':work_id';

-- 11. Verificar timeline completa
SELECT update_type, actor_role, notes, created_at
FROM public.work_alert_updates
WHERE alert_id = ':alert_id'
ORDER BY created_at;
