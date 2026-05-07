-- =============================================================================
-- SIMULACAO DE REPORTE DE MARCO PELO GERENTE (DESENVOLVIMENTO)
--
-- O gerente real reporta marcos via APK (futuro). Para validar o fluxo
-- engineer-side (Realtime, badges, aprovar/reprovar, historico de eventos,
-- notificacoes), use estes scripts SQL.
--
-- Pre-requisitos:
--   1. Migration 20260505000000_andamento_obra_daily_logs_milestones.sql aplicada.
--   2. Existe uma obra com manager_id NOT NULL e o manager listado em
--      work_members(work_id, role='manager').
--   3. Os marcos da obra ja foram seedados pelo trigger seed_work_defaults
--      (sao 6 marcos com status inicial = 'pending').
--
-- Como usar:
--   Substitua os placeholders abaixo:
--     <work_id>          UUID da obra
--     <manager_user_id>  UUID do usuario manager
--     <milestone_id>     UUID do marco a reportar (status = pending|in_progress|rejected)
--     <event_id>         UUID novo para o evento (gere com gen_random_uuid)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Inspecao auxiliar
-- -----------------------------------------------------------------------------
-- SELECT id, code, name, order_index, status FROM public.work_milestones
--  WHERE work_id = '<work_id>'::uuid ORDER BY order_index;

-- -----------------------------------------------------------------------------
-- 1. Reportar marco (transicao para awaiting_approval)
--
-- Atualiza o marco com reported_by/reported_at e cria evento associado.
-- Triggers cuidam da notificacao para o engenheiro.
-- -----------------------------------------------------------------------------
BEGIN;

UPDATE public.work_milestones
   SET status = 'awaiting_approval',
       reported_by = '<manager_user_id>'::uuid,
       reported_at = now(),
       notes = 'Conclusao reportada para aprovacao. Equipe finalizou as atividades planejadas.',
       evidence_media_ids = jsonb_build_array('<event_id>'::text),
       approved_by = NULL,
       approved_at = NULL
 WHERE id = '<milestone_id>'::uuid;

INSERT INTO public.work_milestone_events (
  id, milestone_id, work_id, event_type, actor_id, actor_role, notes
) VALUES (
  '<event_id>'::uuid,
  '<milestone_id>'::uuid,
  '<work_id>'::uuid,
  'reported',
  '<manager_user_id>'::uuid,
  'manager',
  'Conclusao reportada para aprovacao. Equipe finalizou as atividades planejadas.'
);

COMMIT;

-- -----------------------------------------------------------------------------
-- 2. Adicionar evidencia ao evento (instrucoes manuais)
--
-- PASSO MANUAL OBRIGATORIO:
--   - Acesse Supabase Studio > Storage > andamento-obra
--   - Crie a pasta: <work_id>/milestones/<milestone_id>/<event_id>/
--   - Faca upload manual de 1-3 fotos
--   - Substitua <photo_uuid> e nome do arquivo abaixo
-- -----------------------------------------------------------------------------
INSERT INTO public.work_milestone_event_media (
  event_id, milestone_id, work_id, kind, storage_path, mime_type, size_bytes
) VALUES (
  '<event_id>'::uuid,
  '<milestone_id>'::uuid,
  '<work_id>'::uuid,
  'image',
  '<work_id>/milestones/<milestone_id>/<event_id>/<photo_uuid>.jpg',
  'image/jpeg',
  2097152  -- ~2MB
);

-- -----------------------------------------------------------------------------
-- 3. Verificacoes
-- -----------------------------------------------------------------------------
-- 3.1. Marco em awaiting_approval:
SELECT id, code, name, status, reported_by, reported_at, notes
  FROM public.work_milestones
 WHERE id = '<milestone_id>'::uuid;

-- 3.2. Eventos do marco:
SELECT e.id, e.event_type, e.actor_role, e.created_at, e.notes,
       (SELECT count(*) FROM public.work_milestone_event_media m WHERE m.event_id = e.id) AS media_count
  FROM public.work_milestone_events e
 WHERE e.milestone_id = '<milestone_id>'::uuid
 ORDER BY e.created_at DESC;

-- 3.3. Notificacoes:
SELECT kind, title, body, created_at
  FROM public.notifications
 WHERE work_id = '<work_id>'::uuid
   AND kind LIKE 'milestone_%'
 ORDER BY created_at DESC
 LIMIT 10;

-- 3.4. last_activity_at:
SELECT id, name, last_activity_at FROM public.works WHERE id = '<work_id>'::uuid;

-- -----------------------------------------------------------------------------
-- 4. Re-reporte apos rejeicao (transicao rejected -> awaiting_approval)
--
-- Pre-requisito: o engenheiro rejeitou o marco via UI; status = 'rejected'.
-- Use um <new_event_id> diferente.
-- -----------------------------------------------------------------------------
BEGIN;

UPDATE public.work_milestones
   SET status = 'awaiting_approval',
       reported_by = '<manager_user_id>'::uuid,
       reported_at = now(),
       notes = 'Versao corrigida: incluimos as fotos solicitadas e comentamos as duvidas do engenheiro.',
       evidence_media_ids = evidence_media_ids || jsonb_build_array('<new_event_id>'::text),
       approved_by = NULL,
       approved_at = NULL
 WHERE id = '<milestone_id>'::uuid;

INSERT INTO public.work_milestone_events (
  id, milestone_id, work_id, event_type, actor_id, actor_role, notes
) VALUES (
  '<new_event_id>'::uuid,
  '<milestone_id>'::uuid,
  '<work_id>'::uuid,
  'reported',
  '<manager_user_id>'::uuid,
  'manager',
  'Versao corrigida apos rejeicao.'
);

COMMIT;

-- -----------------------------------------------------------------------------
-- 5. Limpeza opcional
-- -----------------------------------------------------------------------------
-- Resetar marco para pending (dev-only):
-- UPDATE public.work_milestones
--   SET status = 'pending',
--       reported_by = NULL, reported_at = NULL,
--       approved_by = NULL, approved_at = NULL,
--       rejected_at = NULL, rejection_reason = NULL,
--       notes = NULL, evidence_media_ids = '[]'::jsonb
-- WHERE id = '<milestone_id>'::uuid;
-- IMPORTANTE: o trigger work_milestones_protect_fields bloqueia transicoes
-- arbitrarias. Para reset, use o role service_role no SQL Editor (bypassa RLS
-- mas o trigger usa auth.uid() que e NULL nesse caso, o que pode falhar).
-- Recomendado: usar gen_random_uuid() como new_event_id e seguir o fluxo
-- normal de fluxo manager (item 1 ou 4) ao inves de resetar.
