-- =============================================================================
-- Sessões de cotação e jobs assíncronos de extração de PDF
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. quotation_sessions — Dashboard de sessões (global ou por orçamento)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quotation_sessions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  title       TEXT        NOT NULL,
  budget_id   UUID        NULL REFERENCES budgets(id) ON DELETE SET NULL,
  status      TEXT        NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'completed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE quotation_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quotation_sessions_select" ON quotation_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "quotation_sessions_insert" ON quotation_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "quotation_sessions_update" ON quotation_sessions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "quotation_sessions_delete" ON quotation_sessions
  FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_quotation_sessions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_quotation_sessions_updated_at
  BEFORE UPDATE ON quotation_sessions
  FOR EACH ROW EXECUTE FUNCTION update_quotation_sessions_updated_at();

CREATE INDEX IF NOT EXISTS idx_quotation_sessions_user_created
  ON quotation_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotation_sessions_budget ON quotation_sessions(budget_id);
CREATE INDEX IF NOT EXISTS idx_quotation_sessions_status ON quotation_sessions(status);

-- -----------------------------------------------------------------------------
-- 2. supplier_quotes — session_id + budget opcional (sessão global)
-- -----------------------------------------------------------------------------
ALTER TABLE supplier_quotes
  ALTER COLUMN budget_id DROP NOT NULL;

ALTER TABLE supplier_quotes
  ADD COLUMN IF NOT EXISTS session_id UUID NULL REFERENCES quotation_sessions(id) ON DELETE SET NULL;

ALTER TABLE supplier_quotes
  ADD CONSTRAINT supplier_quotes_budget_or_session_chk
  CHECK (budget_id IS NOT NULL OR session_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_supplier_quotes_session_created
  ON supplier_quotes(session_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 3. extraction_jobs — Fila assíncrona por sessão
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS extraction_jobs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       UUID        NOT NULL REFERENCES quotation_sessions(id) ON DELETE CASCADE,
  user_id          UUID        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  file_path        TEXT        NOT NULL,
  supplier_name    TEXT        NULL,
  status           TEXT        NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending', 'processing', 'completed', 'error')),
  error_message    TEXT        NULL,
  estimated_time   INTEGER     NULL,
  quote_id         UUID        NULL REFERENCES supplier_quotes(id) ON DELETE SET NULL,
  started_at       TIMESTAMPTZ NULL,
  finished_at      TIMESTAMPTZ NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE extraction_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "extraction_jobs_select" ON extraction_jobs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "extraction_jobs_insert" ON extraction_jobs
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM quotation_sessions qs
      WHERE qs.id = session_id AND qs.user_id = auth.uid()
    )
  );

CREATE POLICY "extraction_jobs_update" ON extraction_jobs
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "extraction_jobs_delete" ON extraction_jobs
  FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_extraction_jobs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_extraction_jobs_updated_at
  BEFORE UPDATE ON extraction_jobs
  FOR EACH ROW EXECUTE FUNCTION update_extraction_jobs_updated_at();

CREATE INDEX IF NOT EXISTS idx_extraction_jobs_session_created
  ON extraction_jobs(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_extraction_jobs_status_created
  ON extraction_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_extraction_jobs_user ON extraction_jobs(user_id);

-- -----------------------------------------------------------------------------
-- 4. Realtime — publicar extraction_jobs (idempotente)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE extraction_jobs;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
