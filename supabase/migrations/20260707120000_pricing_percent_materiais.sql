-- =============================================================================
-- Precificação por percentual sobre materiais:
-- - novo modo de entrada 'percentual' (VS = materiais × %)
-- - coluna percent_materiais_input para persistir o % digitado
-- O modo legado 'lucro' permanece aceito para linhas antigas (a aplicação o
-- converte para 'valor' ao carregar).
-- =============================================================================

ALTER TABLE public.saved_pricing_budgets
  ADD COLUMN IF NOT EXISTS percent_materiais_input NUMERIC NOT NULL DEFAULT 0
    CHECK (percent_materiais_input >= 0);

ALTER TABLE public.saved_pricing_budgets
  DROP CONSTRAINT IF EXISTS saved_pricing_budgets_pricing_input_mode_check;

ALTER TABLE public.saved_pricing_budgets
  ADD CONSTRAINT saved_pricing_budgets_pricing_input_mode_check
    CHECK (pricing_input_mode IN ('valor', 'lucro', 'percentual'));
