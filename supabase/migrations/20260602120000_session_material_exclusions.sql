-- Materiais ocultos apenas na sessão de cotação (não afeta outras sessões nem o orçamento).

CREATE TABLE IF NOT EXISTS session_material_exclusions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID        NOT NULL REFERENCES quotation_sessions(id) ON DELETE CASCADE,
  material_id UUID        NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (session_id, material_id, user_id)
);

ALTER TABLE session_material_exclusions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session_material_exclusions_select" ON session_material_exclusions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "session_material_exclusions_insert" ON session_material_exclusions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "session_material_exclusions_delete" ON session_material_exclusions
  FOR DELETE USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_session_material_exclusions_session
  ON session_material_exclusions(session_id);
