-- =============================================================================
-- Fixa search_path nas funções trigger da DRE de Obra
--
--   O linter de segurança do Supabase aponta search_path mutável nas 6
--   funções criadas nesta feature (mais proposals_validate_accepted_option).
--   Sem SET search_path, a função resolve nomes de objeto (public.work_dre
--   etc.) conforme o search_path da sessão que a chama — abrindo, em tese,
--   sequestro por um schema malicioso colocado antes de `public` no path de
--   quem invoca.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_work_dre_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.work_dre_seed_group_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.dre_group_status (dre_id, grupo)
  SELECT NEW.id, g
  FROM unnest(enum_range(NULL::public.dre_group)) AS g
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.update_purchase_orders_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.purchase_orders_recalc_items_value()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_oc UUID := COALESCE(NEW.purchase_order_id, OLD.purchase_order_id);
BEGIN
  UPDATE public.purchase_orders o
     SET items_value = COALESCE((
           SELECT sum(i.quantidade * i.preco_unit)
           FROM public.purchase_order_items i
           WHERE i.purchase_order_id = v_oc
         ), 0)
   WHERE o.id = v_oc;
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.update_dre_actuals_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.dre_actuals_bloqueia_dre_fechada()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status
  FROM public.work_dre
  WHERE id = COALESCE(NEW.dre_id, OLD.dre_id);

  IF v_status = 'fechada' THEN
    RAISE EXCEPTION 'DRE fechada não aceita lançamento. Reabra a DRE primeiro.';
  END IF;

  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE OR REPLACE FUNCTION public.proposals_validate_accepted_option()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.accepted_pricing_option_id IS NULL THEN
    NEW.accepted_at := NULL;
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.proposal_pricing_options o
    WHERE o.id = NEW.accepted_pricing_option_id
      AND o.proposal_id = NEW.id
  ) THEN
    RAISE EXCEPTION
      'accepted_pricing_option_id % não pertence à proposta %',
      NEW.accepted_pricing_option_id, NEW.id;
  END IF;

  IF NEW.accepted_at IS NULL THEN
    NEW.accepted_at := now();
  END IF;

  RETURN NEW;
END;
$$;
