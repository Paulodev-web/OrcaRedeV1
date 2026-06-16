-- =============================================================================
-- SIMULACAO DE DIARIOS PUBLICADOS PELO GERENTE (DESENVOLVIMENTO)
--
-- O gerente real publica diarios via APK (futuro). Para validar o fluxo
-- engineer-side (Realtime, badges, aprovar/rejeitar, historico de versoes,
-- notificacoes), use estes scripts SQL.
--
-- Pre-requisitos:
--   1. Migration 20260505000000_andamento_obra_daily_logs_milestones.sql aplicada.
--   2. Existe uma obra com manager_id NOT NULL e o manager listado em
--      work_members(work_id, role='manager').
--
-- Como usar:
--   Substitua os placeholders abaixo:
--     <work_id>          UUID da obra (public.works.id)
--     <manager_user_id>  UUID do usuario manager (auth.users.id)
--     <log_id>           UUID novo para o diario (gere com gen_random_uuid)
--     <rev_id>           UUID novo para a revisao (gere com gen_random_uuid)
--     <log_date>         Data do diario no formato YYYY-MM-DD
--
-- LIMITACAO: bypassa o Server Action publishDailyLog (sem validacao de
-- tamanho, MIME, idempotencia client_event_id). Esses caminhos serao testados
-- quando o APK for integrado.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Inspecao auxiliar (descobrir IDs antes de simular)
-- -----------------------------------------------------------------------------
-- SELECT w.id AS work_id, w.name, w.manager_id
--   FROM public.works w
--  WHERE w.manager_id IS NOT NULL
--  ORDER BY w.created_at DESC;

-- SELECT * FROM public.work_members
--  WHERE work_id = '<work_id>'::uuid
--    AND user_id = '<manager_user_id>'::uuid;

-- -----------------------------------------------------------------------------
-- 1. Diario simples (so texto) - primeira publicacao
--
-- A FK current_revision_id em work_daily_logs e DEFERRABLE INITIALLY DEFERRED,
-- entao podemos inserir o log primeiro e atualizar o ponteiro depois sem
-- BEGIN/COMMIT explicito (DML autoocomita comporta-se assim em uma sessao
-- linear). Mas o helper abaixo usa BEGIN/COMMIT para deixar claro o agrupamento
-- de comandos que precisam ser atomicos no caso de republicacao (item 3).
-- -----------------------------------------------------------------------------
BEGIN;

INSERT INTO public.work_daily_logs (
  id, work_id, log_date, published_by, status
) VALUES (
  '<log_id>'::uuid,
  '<work_id>'::uuid,
  '<log_date>'::date,
  '<manager_user_id>'::uuid,
  'pending_approval'
);

INSERT INTO public.work_daily_log_revisions (
  id, daily_log_id, revision_number,
  crew_present, activities, posts_installed_count,
  meters_installed, materials_consumed, incidents
) VALUES (
  '<rev_id>'::uuid,
  '<log_id>'::uuid,
  1,
  '[]'::jsonb,
  'Iniciamos a frente de servico no canteiro central. Equipe de 5 colaboradores. Demarcacao concluida.',
  0,
  '{"BT": 120, "MT": 0, "rede": 0}'::jsonb,
  '[]'::jsonb,
  NULL
);

UPDATE public.work_daily_logs
   SET current_revision_id = '<rev_id>'::uuid
 WHERE id = '<log_id>'::uuid;

COMMIT;

-- -----------------------------------------------------------------------------
-- 2. Diario com fotos (instrucoes manuais para upload)
--
-- PASSO MANUAL OBRIGATORIO:
--   - Acesse Supabase Studio > Storage > andamento-obra
--   - Crie a pasta: <work_id>/daily-logs/<log_id>/<rev_id>/
--   - Faca upload manual de 1-3 fotos JPG/PNG
--   - Substitua <photo_uuid> e nome do arquivo abaixo
-- -----------------------------------------------------------------------------
-- Apos rodar item 1, anexe midias com:
INSERT INTO public.work_daily_log_media (
  revision_id, daily_log_id, work_id, kind, storage_path, mime_type, size_bytes
) VALUES (
  '<rev_id>'::uuid,
  '<log_id>'::uuid,
  '<work_id>'::uuid,
  'image',
  '<work_id>/daily-logs/<log_id>/<rev_id>/<photo_uuid>.jpg',
  'image/jpeg',
  2097152  -- ~2MB
);

-- -----------------------------------------------------------------------------
-- 3. Republicacao apos rejeicao (testa versionamento)
--
-- Pre-requisito: o engenheiro rejeitou o diario via UI; status = 'rejected'.
-- Substitua <new_rev_id> por um UUID novo (gen_random_uuid()).
-- O BEGIN/COMMIT abaixo aproveita a deferral da FK para criar a nova
-- revision e ja apontar current_revision_id na mesma transacao, mantendo
-- consistencia.
-- -----------------------------------------------------------------------------
BEGIN;

WITH new_rev AS (
  INSERT INTO public.work_daily_log_revisions (
    id, daily_log_id, revision_number,
    crew_present, activities, posts_installed_count,
    meters_installed, materials_consumed, incidents
  )
  SELECT
    '<new_rev_id>'::uuid,
    dl.id,
    coalesce(max(r.revision_number), 0) + 1,
    '[]'::jsonb,
    'Versao corrigida: incluimos foto da placa de identificacao do quadro e descricao do material consumido.',
    1,
    '{"BT": 200, "MT": 0, "rede": 0}'::jsonb,
    '[{"name":"Cabo BT 10mm","unit":"m","quantity":200}]'::jsonb,
    NULL
  FROM public.work_daily_logs dl
  LEFT JOIN public.work_daily_log_revisions r ON r.daily_log_id = dl.id
  WHERE dl.id = '<log_id>'::uuid
  GROUP BY dl.id
  RETURNING id
)
UPDATE public.work_daily_logs
   SET current_revision_id = (SELECT id FROM new_rev),
       status = 'pending_approval',
       rejected_at = NULL,
       approved_by = NULL,
       approved_at = NULL
 WHERE id = '<log_id>'::uuid;

COMMIT;

-- -----------------------------------------------------------------------------
-- 4. Verificacoes
-- -----------------------------------------------------------------------------
-- 4.1. Diario com revisao atual:
SELECT dl.id, dl.log_date, dl.status, dl.current_revision_id,
       r.revision_number, r.activities, r.created_at
  FROM public.work_daily_logs dl
  LEFT JOIN public.work_daily_log_revisions r ON r.id = dl.current_revision_id
 WHERE dl.work_id = '<work_id>'::uuid
 ORDER BY dl.log_date DESC;

-- 4.2. Notificacoes geradas:
SELECT kind, title, body, created_at
  FROM public.notifications
 WHERE work_id = '<work_id>'::uuid
   AND kind LIKE 'daily_log_%'
 ORDER BY created_at DESC
 LIMIT 10;

-- 4.3. last_activity_at deve ter sido atualizado:
SELECT id, name, last_activity_at
  FROM public.works
 WHERE id = '<work_id>'::uuid;

-- 4.4. Historico de revisoes:
SELECT id, revision_number, rejection_reason, created_at
  FROM public.work_daily_log_revisions
 WHERE daily_log_id = '<log_id>'::uuid
 ORDER BY revision_number DESC;

-- -----------------------------------------------------------------------------
-- 5. Limpeza opcional
-- -----------------------------------------------------------------------------
-- DELETE FROM public.work_daily_logs
--  WHERE id = '<log_id>'::uuid;
-- (Cascata remove revisoes/midia via FK ON DELETE CASCADE.)
-- (Storage em <work_id>/daily-logs/* precisa ser removido manualmente.)
