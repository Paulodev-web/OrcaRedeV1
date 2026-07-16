-- =============================================================================
-- Recados provisórios por sessão de cotação (Maninho / Luan)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.quotation_session_notes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID        NOT NULL REFERENCES public.quotation_sessions(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  author      TEXT        NOT NULL CHECK (author IN ('maninho', 'luan')),
  body        TEXT        NOT NULL CHECK (char_length(trim(body)) > 0 AND char_length(body) <= 2000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quotation_session_notes_session_created
  ON public.quotation_session_notes(session_id, created_at ASC);

ALTER TABLE public.quotation_session_notes ENABLE ROW LEVEL SECURITY;

-- Acesso alinhado à sessão: quem vê/edita a sessão vê/escreve os recados.
CREATE POLICY "quotation_session_notes_select" ON public.quotation_session_notes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.quotation_sessions qs
      WHERE qs.id = session_id AND qs.user_id = auth.uid()
    )
  );

CREATE POLICY "quotation_session_notes_insert" ON public.quotation_session_notes
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.quotation_sessions qs
      WHERE qs.id = session_id AND qs.user_id = auth.uid()
    )
  );

CREATE POLICY "quotation_session_notes_delete" ON public.quotation_session_notes
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.quotation_sessions qs
      WHERE qs.id = session_id AND qs.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.quotation_session_notes IS
  'Recados provisórios entre Maninho e Luan na sessão de cotação. Substituir por chat/usuário real depois.';
