-- =============================================================================
-- create_purchase_order_with_items — permite criar uma OC com N materiais de
-- uma vez (cabeçalho + itens), numa única transação implícita de função.
--
-- Até aqui não existia NENHUM caminho de escrita na aplicação para
-- purchase_orders/purchase_order_items — só o campo de texto solto de
-- scenario_purchase_orders (um material por vez, sem valor/fornecedor real).
-- Esta função é o formulário de OC de verdade: usuário seleciona vários
-- materiais que compartilham a mesma OC e grava tudo de uma vez.
--
-- SECURITY INVOKER (padrão) de propósito: roda com o papel de quem chama, para
-- que as policies de RLS de purchase_orders/purchase_order_items (já escritas
-- para checar org_id/user_id) continuem valendo normalmente.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_purchase_order_with_items(
  p_oc_number TEXT,
  p_supplier_name TEXT,
  p_supplier_id UUID,
  p_budget_id UUID,
  p_session_id UUID,
  p_freight_value NUMERIC,
  p_freight_type TEXT,
  p_delivery_date DATE,
  p_notes TEXT,
  p_items JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos um material para a OC.';
  END IF;

  INSERT INTO public.purchase_orders (
    oc_number, supplier_name, supplier_id, budget_id, session_id,
    freight_value, freight_type, delivery_date, notes
  ) VALUES (
    p_oc_number, p_supplier_name, p_supplier_id, p_budget_id, p_session_id,
    p_freight_value, p_freight_type, p_delivery_date, p_notes
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.purchase_order_items (purchase_order_id, material_id, quantidade, preco_unit)
  SELECT
    v_order_id,
    (item->>'material_id')::UUID,
    (item->>'quantidade')::NUMERIC,
    (item->>'preco_unit')::NUMERIC
  FROM jsonb_array_elements(p_items) AS item;

  RETURN v_order_id;
END;
$$;

COMMENT ON FUNCTION public.create_purchase_order_with_items IS
  'Cria uma OC (purchase_orders) com N itens (purchase_order_items) numa única '
  'transação — cabeçalho e itens ou nada. Se algum item violar uma constraint '
  '(quantidade<=0, preco_unit<0, material duplicado na mesma OC), a função '
  'inteira falha e nada é gravado.';

GRANT EXECUTE ON FUNCTION public.create_purchase_order_with_items(
  TEXT, TEXT, UUID, UUID, UUID, NUMERIC, TEXT, DATE, TEXT, JSONB
) TO authenticated;
