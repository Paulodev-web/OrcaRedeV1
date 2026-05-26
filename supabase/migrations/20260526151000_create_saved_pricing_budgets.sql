-- =============================================================================
-- Precificacoes salvas: um card de precificacao por usuario/orcamento.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.saved_pricing_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  budget_id UUID NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
  save_mode TEXT NOT NULL CHECK (save_mode IN ('snapshot', 'live')),
  budget_name TEXT NOT NULL,
  client_name TEXT,
  city TEXT,
  pricing_input_mode TEXT NOT NULL CHECK (pricing_input_mode IN ('valor', 'lucro')),
  valor_servico_input NUMERIC NOT NULL DEFAULT 0 CHECK (valor_servico_input >= 0),
  lucro_percent_input NUMERIC NOT NULL DEFAULT 0 CHECK (lucro_percent_input >= 0),
  imposto_percent NUMERIC NOT NULL DEFAULT 0 CHECK (imposto_percent >= 0 AND imposto_percent <= 100),
  cost_items JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(cost_items) = 'array'),
  materials_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(materials_snapshot) = 'array'),
  result_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(result_snapshot) = 'object'),
  valor_materiais NUMERIC NOT NULL DEFAULT 0 CHECK (valor_materiais >= 0),
  valor_servico NUMERIC NOT NULL DEFAULT 0 CHECK (valor_servico >= 0),
  total_custos NUMERIC NOT NULL DEFAULT 0 CHECK (total_custos >= 0),
  imposto_valor NUMERIC NOT NULL DEFAULT 0 CHECK (imposto_valor >= 0),
  lucro_bruto NUMERIC NOT NULL DEFAULT 0,
  lucro_liquido NUMERIC NOT NULL DEFAULT 0,
  preco_total_cliente NUMERIC NOT NULL DEFAULT 0 CHECK (preco_total_cliente >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, budget_id)
);

ALTER TABLE public.saved_pricing_budgets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'saved_pricing_budgets'
      AND policyname = 'saved_pricing_budgets_select'
  ) THEN
    CREATE POLICY "saved_pricing_budgets_select" ON public.saved_pricing_budgets
      FOR SELECT USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'saved_pricing_budgets'
      AND policyname = 'saved_pricing_budgets_insert'
  ) THEN
    CREATE POLICY "saved_pricing_budgets_insert" ON public.saved_pricing_budgets
      FOR INSERT WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
          SELECT 1
          FROM public.budgets b
          WHERE b.id = budget_id
            AND b.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'saved_pricing_budgets'
      AND policyname = 'saved_pricing_budgets_update'
  ) THEN
    CREATE POLICY "saved_pricing_budgets_update" ON public.saved_pricing_budgets
      FOR UPDATE USING (user_id = auth.uid())
      WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
          SELECT 1
          FROM public.budgets b
          WHERE b.id = budget_id
            AND b.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'saved_pricing_budgets'
      AND policyname = 'saved_pricing_budgets_delete'
  ) THEN
    CREATE POLICY "saved_pricing_budgets_delete" ON public.saved_pricing_budgets
      FOR DELETE USING (user_id = auth.uid());
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.update_saved_pricing_budgets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_saved_pricing_budgets_updated_at ON public.saved_pricing_budgets;
CREATE TRIGGER trg_saved_pricing_budgets_updated_at
  BEFORE UPDATE ON public.saved_pricing_budgets
  FOR EACH ROW EXECUTE FUNCTION public.update_saved_pricing_budgets_updated_at();

CREATE INDEX IF NOT EXISTS idx_saved_pricing_budgets_user_updated
  ON public.saved_pricing_budgets(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_saved_pricing_budgets_budget
  ON public.saved_pricing_budgets(budget_id);
