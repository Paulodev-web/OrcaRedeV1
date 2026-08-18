-- =============================================================================
-- proposals.accepted_pricing_option_id — qual opção o CLIENTE fechou
--
-- PROPÓSITO
--   A DRE de Obra precisa de uma receita, e a receita é o valor de contrato
--   (MD/PLANO-DRE-OBRA.md §3). Hoje a proposta sabe qual opção a ON RECOMENDOU
--   (`proposal_pricing_options.is_recommended`), que não é a mesma coisa que a
--   opção que o cliente aceitou — o cliente pode fechar a mais barata.
--
--   `proposal_pricing_options` já congela `grand_total` por opção
--   (20260803132000:76). Ele é o número certo para a DRE justamente por ser
--   congelado: reprecificar o orçamento em julho não pode reescrever o que o
--   cliente assinou em março.
--
-- ADITIVA
--   Duas colunas NULL. Nenhuma proposta existente muda de comportamento, e a
--   ausência de opção aceita é um estado legítimo (proposta ainda em aberto).
--
-- ON DELETE RESTRICT de propósito
--   Apagar a opção que o cliente fechou apagaria a receita de uma DRE viva.
--   Quem quiser apagar precisa antes desmarcar o aceite — decisão consciente.
-- =============================================================================

DO $do$
BEGIN
  IF to_regclass('public.proposal_pricing_options') IS NULL THEN
    RAISE EXCEPTION 'proposal_pricing_options ausente. Aplique 20260803132000 primeiro.';
  END IF;
END
$do$;

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS accepted_pricing_option_id UUID NULL
    REFERENCES public.proposal_pricing_options(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.proposals.accepted_pricing_option_id IS
  'Opção de preço que o cliente fechou. Fonte canônica do valor de contrato da '
  'DRE de Obra. Diferente de is_recommended, que é o que a ON sugeriu.';

COMMENT ON COLUMN public.proposals.accepted_at IS
  'Quando o aceite foi registrado. Preenchido pelo trigger junto com a opção.';

-- -----------------------------------------------------------------------------
-- Integridade: a opção aceita tem que ser DESTA proposta.
-- Sem isso, um UPDATE errado apontaria a receita de uma obra para o preço de
-- outra — e o número pareceria plausível o suficiente para ninguém perceber.
-- FK não resolve (ela só garante que a opção existe, não de quem ela é).
-- -----------------------------------------------------------------------------
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

  -- Só carimba na transição; reeditar a proposta não move a data do aceite.
  IF NEW.accepted_at IS NULL THEN
    NEW.accepted_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proposals_validate_accepted_option ON public.proposals;
CREATE TRIGGER trg_proposals_validate_accepted_option
  BEFORE INSERT OR UPDATE OF accepted_pricing_option_id ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.proposals_validate_accepted_option();

CREATE INDEX IF NOT EXISTS idx_proposals_accepted_option
  ON public.proposals (accepted_pricing_option_id)
  WHERE accepted_pricing_option_id IS NOT NULL;
