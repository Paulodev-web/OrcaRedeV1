-- Modo de orçamento padrão: marcar orçamentos como modelo (template) clonável
ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS is_template boolean NOT NULL DEFAULT false;

ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS template_source_id uuid REFERENCES public.budgets (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS budgets_is_template_idx
  ON public.budgets (user_id, is_template)
  WHERE is_template = true;

COMMENT ON COLUMN public.budgets.is_template IS 'Quando true, o orçamento aparece como modelo selecionável ao criar um novo orçamento';
COMMENT ON COLUMN public.budgets.template_source_id IS 'Modelo de origem usado para criar este orçamento (rastreabilidade), se houver';
