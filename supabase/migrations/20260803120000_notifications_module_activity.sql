-- =============================================================================
-- FASE 1 — Notificações multi-módulo + cursor de "atividade não vista"
--
-- PROPÓSITO
--   1. Tirar `notifications` da exclusividade do Andamento de Obra. Ganha
--      `module_key`, `entity_type` e `entity_id` (todos NULL) para que
--      Orçamentos, Precificação, Suprimentos e Propostas usem a mesma tabela.
--   2. Colocar `notifications` na publication do Realtime. Hoje ela está FORA,
--      e por isso o sino do painel sobrevive de polling de 60s (Escopo §4).
--   3. Criar `user_module_seen`: cursor de visita por (usuário, módulo, escopo)
--      que alimenta a bolinha de atividade não vista da sidebar global (§10.1).
--
-- ADITIVA (Regra Inviolável §3.3)
--   Nenhuma coluna existente é removida, renomeada ou muda de semântica.
--   As três colunas novas entram NULL. `profiles.role` não é tocada.
--   O APK (docs/apk-contracts/10-realtime.md) assina INSERT em `notifications`
--   filtrando por `user_id`: continua funcionando e passa a receber os eventos
--   pelo Realtime em vez de depender de refetch.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. notifications — colunas de roteamento por módulo
-- -----------------------------------------------------------------------------
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS module_key  TEXT NULL,
  ADD COLUMN IF NOT EXISTS entity_type TEXT NULL,
  ADD COLUMN IF NOT EXISTS entity_id   UUID NULL;

COMMENT ON COLUMN public.notifications.module_key IS
  'Módulo de origem da notificação. Valores canônicos: orcamentos, precificacao, '
  'suprimentos, andamento-obra, portal-engenheiro, propostas, configuracoes. '
  'NULL em linhas antigas não classificadas. Sem CHECK de propósito: módulo novo '
  'não deve exigir migration.';

COMMENT ON COLUMN public.notifications.entity_type IS
  'Tipo da entidade referenciada (ex.: work, budget, proposal, quotation_session). '
  'Par com entity_id; ambos NULL quando a notificação não aponta para um registro.';

COMMENT ON COLUMN public.notifications.entity_id IS
  'Id da entidade referenciada. Propositalmente SEM foreign key: a tabela serve '
  'módulos distintos e a notificação sobrevive à exclusão do registro de origem.';

-- Backfill: tudo que tem work_id veio do Andamento de Obra.
UPDATE public.notifications
   SET module_key = 'andamento-obra'
 WHERE work_id IS NOT NULL
   AND module_key IS NULL;

-- Contagem de não lidas por módulo (query da bolinha da sidebar).
CREATE INDEX IF NOT EXISTS idx_notifications_user_module_unread
  ON public.notifications (user_id, module_key)
  WHERE is_read = false;

-- Navegação "notificações desta entidade".
CREATE INDEX IF NOT EXISTS idx_notifications_entity
  ON public.notifications (entity_type, entity_id)
  WHERE entity_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. Realtime — publicar notifications (idempotente)
--    Mesmo padrão de 20260407120000_quotation_sessions_extraction_jobs.sql.
--    REPLICA IDENTITY fica no default (chave primária): basta para entregar
--    INSERT e o novo registro no UPDATE de is_read. FULL só aumentaria WAL.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- 3. user_module_seen — cursor de visita por usuário/módulo/escopo
--
--    scope_key permite granularidade dentro do módulo sem tabela nova:
--      ('andamento-obra', '')            → módulo inteiro
--      ('andamento-obra', <work_id>)     → uma obra específica
--    Default '' (e não NULL) justamente para caber na chave primária composta.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_module_seen (
  user_id      UUID        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  module_key   TEXT        NOT NULL,
  scope_key    TEXT        NOT NULL DEFAULT '',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, module_key, scope_key)
);

COMMENT ON TABLE public.user_module_seen IS
  'Cursor de "visto por último" por usuário/módulo/escopo. Alimenta a bolinha de '
  'atividade não vista. Não é notificação: não tem histórico nem destinatário.';

CREATE INDEX IF NOT EXISTS idx_user_module_seen_user
  ON public.user_module_seen (user_id, module_key);

CREATE OR REPLACE FUNCTION public.update_user_module_seen_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_user_module_seen_updated_at ON public.user_module_seen;
CREATE TRIGGER trg_user_module_seen_updated_at
  BEFORE UPDATE ON public.user_module_seen
  FOR EACH ROW EXECUTE FUNCTION public.update_user_module_seen_updated_at();

-- -----------------------------------------------------------------------------
-- 3.1 RLS — user_module_seen (o cursor é estritamente do próprio usuário)
--     INSERT + UPDATE liberados porque a escrita natural é um upsert
--     ON CONFLICT (user_id, module_key, scope_key).
-- -----------------------------------------------------------------------------
ALTER TABLE public.user_module_seen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_module_seen_select" ON public.user_module_seen;
CREATE POLICY "user_module_seen_select" ON public.user_module_seen
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_module_seen_insert" ON public.user_module_seen;
CREATE POLICY "user_module_seen_insert" ON public.user_module_seen
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_module_seen_update" ON public.user_module_seen;
CREATE POLICY "user_module_seen_update" ON public.user_module_seen
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_module_seen_delete" ON public.user_module_seen;
CREATE POLICY "user_module_seen_delete" ON public.user_module_seen
  FOR DELETE USING (auth.uid() = user_id);
