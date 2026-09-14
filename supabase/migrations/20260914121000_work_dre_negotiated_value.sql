-- =============================================================================
-- work_dre.negotiated_value — preço final negociado com o CLIENTE
--
-- Distinto de tudo que já existe com "negociado" no banco: supplier_quote_items
-- .preco_negociado é do lado COMPRA (fornecedor). Este campo é do lado VENDA —
-- quanto a ON efetivamente fechou com o cliente para a obra, que pode diferir
-- do `contract_value` congelado (proposta aceita / precificação primária).
--
-- Opcional e editável a qualquer momento pela DRE (diferente de contract_value,
-- que é congelado na abertura) — é um ajuste manual pós-fechamento, não um
-- recálculo automático.
-- =============================================================================

ALTER TABLE public.work_dre
  ADD COLUMN IF NOT EXISTS negotiated_value NUMERIC NULL
    CHECK (negotiated_value IS NULL OR negotiated_value > 0),
  ADD COLUMN IF NOT EXISTS negotiated_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS negotiated_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.work_dre.negotiated_value IS
  'Preço final negociado com o cliente para fechar a obra, distinto do '
  'contract_value congelado (proposta aceita/precificação primária). Lançamento '
  'manual, editável a qualquer momento pela DRE.';
