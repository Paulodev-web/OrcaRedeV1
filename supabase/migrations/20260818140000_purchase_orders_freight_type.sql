-- =============================================================================
-- purchase_orders.freight_type — CIF ou FOB
--
--   Achado ao comparar com a planilha de referência do Paulo: ela tem uma
--   coluna de tipo de frete por OC. Isso não é só um dado a mais — explica uma
--   ambiguidade que o modelo original (20260818122000) deixou em aberto.
--
--   `freight_value NULL` hoje só significa "não informado". Mas frete **CIF**
--   (Cost, Insurance and Freight — o vendedor já embute o frete no preço do
--   material) não tem frete separado por definição: NULL/zero ali é o valor
--   CORRETO, não um dado faltando. Frete **FOB** (Free On Board — o comprador
--   paga o frete à parte) é onde `freight_value` realmente precisa ser
--   preenchido, e onde a Fase 3 avisa sobre lacuna faz sentido.
--
--   Sem `freight_type`, o aviso de "OC sem frete informado" da DRE
--   (`loadDreContext.ts`) não sabe distinguir as duas situações e trata toda
--   OC igual — inclusive as legitimamente CIF, que nunca deveriam ter sido
--   contadas como pendência.
--
--   NULL de propósito: nenhuma OC migrada (Fase 1, `scenario_purchase_orders`)
--   tinha essa informação na origem. NULL aqui soma junto com FOB no aviso de
--   lacuna — "não classificado" é tão incompleto quanto "FOB sem valor".
-- =============================================================================

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS freight_type TEXT NULL
    CHECK (freight_type IS NULL OR freight_type IN ('cif', 'fob'));

COMMENT ON COLUMN public.purchase_orders.freight_type IS
  'CIF = frete embutido no preço do material (freight_value 0/NULL é correto). '
  'FOB = frete pago à parte (freight_value deveria estar preenchido). NULL = '
  'não classificado — conta como lacuna igual a FOB sem valor.';
