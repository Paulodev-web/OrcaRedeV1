-- =============================================================================
-- Remove a constraint de CHECK legada (nome antigo, sem o prefixo "pricing_")
-- que ainda restringia pricing_input_mode a ('valor', 'lucro') e bloqueava
-- o modo 'percentual' introduzido em 20260707120000_pricing_percent_materiais.sql.
-- =============================================================================

ALTER TABLE public.saved_pricing_budgets
  DROP CONSTRAINT IF EXISTS saved_pricing_budgets_input_mode_check;
