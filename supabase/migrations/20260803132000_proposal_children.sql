-- =============================================================================
-- FASE 5 — Tabelas filhas da proposta comercial
--
--   proposal_sections              seção, ordem, ativa, conteúdo
--   proposal_pricing_options       N precificações apresentadas, rótulo, recomendada
--   proposal_segment_totals        material + mão de obra por segmento
--   proposal_payment_terms         parcelas geradas, editáveis
--   proposal_abc_rows              curva ABC materializada e editável
--   proposal_responsibility_items  matriz de responsabilidade da proposta
--   proposal_media                 mídias por seção, com legenda e ordem
--   proposal_schedule_rows         linhas do cronograma executivo
--
-- PADRÃO UNIFORME
--   Toda filha carrega `proposal_id` (mesmo quando também pende de uma opção de
--   preço) para que o RLS seja sempre o mesmo par de policies:
--     dono autenticado  → public.proposal_is_owned(proposal_id)      → ALL
--     leitor anônimo    → public.proposal_is_publicly_shared(...)    → SELECT
--   Ambos os helpers foram criados em 20260803131000_proposals_core.sql. O
--   anônimo depende de COMPARAÇÃO do token; nenhuma policy aqui usa
--   `IS NOT NULL` como critério de exposição.
--
-- CONGELAMENTO
--   Rótulos e valores são copiados, não referenciados: `label` em vez do nome
--   atual do segmento, `url` em vez de só o id da mídia, totais em vez de join
--   com a precificação. Uma proposta enviada ao cliente não pode mudar porque
--   alguém renomeou um segmento ou editou um preço depois. Os ids de origem
--   (segment_id, media_id, saved_pricing_budget_id) ficam como rastro e são
--   todos ON DELETE SET NULL.
--
-- ADITIVA (§3.3): tabelas novas. Nada existente é tocado.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. proposal_sections
--    A lista de section_key espelha ProposalSectionKey de src/types/proposal.ts.
--    Está escrita por extenso (e repetida em proposal_media) de propósito: uma
--    função IMMUTABLE dentro do CHECK complicaria restore de dump. Mudar o
--    contrato exige migration nova, o que força a conversa entre as camadas (§16.1).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proposal_sections (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID        NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  section_key TEXT        NOT NULL CHECK (section_key IN (
                            'capa', 'quem_somos', 'seu_projeto', 'localizacao',
                            'fotos_obra', 'descricao_atividades', 'escopo_materiais',
                            'curva_abc', 'condicoes_faturamento', 'valores_por_segmento',
                            'valores_globais', 'investimento_por_unidade',
                            'condicoes_pagamento', 'cronograma', 'matriz_responsabilidade',
                            'consideracoes_finais', 'diferencial_orcarede',
                            'termo_aceite', 'contato')),
  title       TEXT        NOT NULL,
  order_index INT         NOT NULL DEFAULT 0,
  enabled     BOOLEAN     NOT NULL DEFAULT true,
  content     JSONB       NULL CHECK (content IS NULL OR jsonb_typeof(content) = 'object'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT proposal_sections_proposal_key_unq UNIQUE (proposal_id, section_key)
);

COMMENT ON TABLE public.proposal_sections IS
  'ProposalSectionConfig[] materializado por proposta: liga/desliga e ordem. '
  'Uma linha por seção presente.';

COMMENT ON COLUMN public.proposal_sections.content IS
  'Sobrescritas e extras específicos desta seção nesta proposta. O corpo padrão '
  'das seções de texto mora em colunas de `proposals` (institutional, activities, '
  'billing_conditions, final_considerations, acceptance_closing_text) — ver o '
  'mapa de campos em 20260803131000_proposals_core.sql.';

CREATE INDEX IF NOT EXISTS idx_proposal_sections_proposal_order
  ON public.proposal_sections (proposal_id, order_index);

-- -----------------------------------------------------------------------------
-- 2. proposal_pricing_options — ProposalPricingOption
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proposal_pricing_options (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id             UUID        NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  saved_pricing_budget_id UUID        NULL REFERENCES public.saved_pricing_budgets(id) ON DELETE SET NULL,
  label                   TEXT        NOT NULL,
  is_recommended          BOOLEAN     NOT NULL DEFAULT false,
  order_index             INT         NOT NULL DEFAULT 0,

  -- ProposalGlobals congelado
  material_total          NUMERIC     NOT NULL DEFAULT 0 CHECK (material_total >= 0),
  labor_total             NUMERIC     NOT NULL DEFAULT 0 CHECK (labor_total >= 0),
  grand_total             NUMERIC     NOT NULL DEFAULT 0 CHECK (grand_total >= 0),

  -- ProposalUnitInvestment; NULL herda units_count/units_label de proposals
  units_count             INT         NULL CHECK (units_count IS NULL OR units_count > 0),
  units_label             TEXT        NULL,
  amount_per_unit         NUMERIC     NULL CHECK (amount_per_unit IS NULL OR amount_per_unit >= 0),

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT proposal_pricing_options_label_not_blank CHECK (length(btrim(label)) > 0),
  CONSTRAINT proposal_pricing_options_proposal_label_unq UNIQUE (proposal_id, label)
);

COMMENT ON TABLE public.proposal_pricing_options IS
  'Opções de preço apresentadas ao cliente. Cada uma aponta para um cenário de '
  'saved_pricing_budgets, mas guarda os totais congelados: a peça não muda se o '
  'cenário for editado ou apagado depois.';

COMMENT ON COLUMN public.proposal_pricing_options.material_total IS
  'ProposalGlobals.materialTotal — materiais, faturados direto do fornecedor.';

COMMENT ON COLUMN public.proposal_pricing_options.labor_total IS
  'ProposalGlobals.laborTotal — serviços da ON, o VS da precificação. É sobre '
  'ESTE valor que o parcelamento incide, nunca sobre materiais (§8.2).';

CREATE INDEX IF NOT EXISTS idx_proposal_pricing_options_proposal
  ON public.proposal_pricing_options (proposal_id, order_index);

-- No máximo uma opção recomendada por proposta.
CREATE UNIQUE INDEX IF NOT EXISTS uq_proposal_pricing_options_recommended
  ON public.proposal_pricing_options (proposal_id)
  WHERE is_recommended;

-- -----------------------------------------------------------------------------
-- 3. proposal_segment_totals — ProposalSegmentTotal (por opção de preço)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proposal_segment_totals (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id       UUID        NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  pricing_option_id UUID        NOT NULL REFERENCES public.proposal_pricing_options(id) ON DELETE CASCADE,
  segment_id        UUID        NULL REFERENCES public.work_segments(id) ON DELETE SET NULL,
  label             TEXT        NOT NULL,
  material_amount   NUMERIC     NOT NULL DEFAULT 0 CHECK (material_amount >= 0),
  labor_amount      NUMERIC     NOT NULL DEFAULT 0 CHECK (labor_amount >= 0),
  total_amount      NUMERIC     NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  percent           NUMERIC     NOT NULL DEFAULT 0 CHECK (percent >= 0 AND percent <= 100),
  order_index       INT         NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT proposal_segment_totals_label_not_blank CHECK (length(btrim(label)) > 0),
  CONSTRAINT proposal_segment_totals_option_label_unq UNIQUE (pricing_option_id, label)
);

COMMENT ON COLUMN public.proposal_segment_totals.label IS
  'Rótulo congelado do segmento. segment_id guarda a origem em work_segments, '
  'mas renomear ou excluir o segmento não altera a proposta já emitida.';

CREATE INDEX IF NOT EXISTS idx_proposal_segment_totals_option
  ON public.proposal_segment_totals (pricing_option_id, order_index);

CREATE INDEX IF NOT EXISTS idx_proposal_segment_totals_proposal
  ON public.proposal_segment_totals (proposal_id);

-- -----------------------------------------------------------------------------
-- 4. proposal_payment_terms — ProposalPaymentTerm (por opção de preço)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proposal_payment_terms (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id       UUID        NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  pricing_option_id UUID        NOT NULL REFERENCES public.proposal_pricing_options(id) ON DELETE CASCADE,
  order_index       INT         NOT NULL DEFAULT 0,
  percent           NUMERIC     NOT NULL DEFAULT 0 CHECK (percent >= 0 AND percent <= 100),
  amount            NUMERIC     NOT NULL DEFAULT 0 CHECK (amount >= 0),
  due_label         TEXT        NOT NULL,
  due_date          DATE        NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT proposal_payment_terms_due_label_not_blank CHECK (length(btrim(due_label)) > 0)
);

COMMENT ON TABLE public.proposal_payment_terms IS
  'Parcelas geradas pelo gerador de parcelamento (§8.5), editáveis linha a linha '
  'depois. Incidem sempre sobre proposal_pricing_options.labor_total.';

COMMENT ON COLUMN public.proposal_payment_terms.due_date IS
  'Vencimento calculado pelo gerador quando o intervalo em dias é informado. '
  'due_label é o texto que sai na peça ("entrada", "30 dias").';

-- Sem UNIQUE em order_index: reordenar em lote esbarraria na constraint.
CREATE INDEX IF NOT EXISTS idx_proposal_payment_terms_option
  ON public.proposal_payment_terms (pricing_option_id, order_index);

CREATE INDEX IF NOT EXISTS idx_proposal_payment_terms_proposal
  ON public.proposal_payment_terms (proposal_id);

-- -----------------------------------------------------------------------------
-- 5. proposal_abc_rows — ProposalAbcRow
--    A invariante do contrato (soma das linhas === abc_grand_total, percentual
--    coerente com o valor) é validada na aplicação antes de publicar. Foi
--    exatamente essa checagem que faltou na proposta da Maxif4 (§8.4).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proposal_abc_rows (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID        NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  curve       TEXT        NOT NULL CHECK (curve IN ('A', 'B', 'C')),
  label       TEXT        NOT NULL,
  amount      NUMERIC     NOT NULL DEFAULT 0 CHECK (amount >= 0),
  percent     NUMERIC     NOT NULL DEFAULT 0 CHECK (percent >= 0 AND percent <= 100),
  order_index INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT proposal_abc_rows_label_not_blank CHECK (length(btrim(label)) > 0)
);

COMMENT ON COLUMN public.proposal_abc_rows.label IS
  'Rótulo comercial, editável — pode divergir do nome técnico do subgrupo de '
  'material que originou a linha.';

CREATE INDEX IF NOT EXISTS idx_proposal_abc_rows_proposal
  ON public.proposal_abc_rows (proposal_id, curve, order_index);

-- -----------------------------------------------------------------------------
-- 6. proposal_responsibility_items — ProposalResponsibilityItem
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proposal_responsibility_items (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID        NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  order_index INT         NOT NULL DEFAULT 0,
  description TEXT        NOT NULL,
  responsible TEXT        NOT NULL CHECK (responsible IN ('contratada', 'contratante', 'ambos')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT proposal_responsibility_items_desc_not_blank CHECK (length(btrim(description)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_proposal_responsibility_items_proposal
  ON public.proposal_responsibility_items (proposal_id, order_index);

-- -----------------------------------------------------------------------------
-- 7. proposal_media — ProposalMedia por seção
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proposal_media (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID        NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  section_key TEXT        NOT NULL CHECK (section_key IN (
                            'capa', 'quem_somos', 'seu_projeto', 'localizacao',
                            'fotos_obra', 'descricao_atividades', 'escopo_materiais',
                            'curva_abc', 'condicoes_faturamento', 'valores_por_segmento',
                            'valores_globais', 'investimento_por_unidade',
                            'condicoes_pagamento', 'cronograma', 'matriz_responsabilidade',
                            'consideracoes_finais', 'diferencial_orcarede',
                            'termo_aceite', 'contato')),
  media_id    UUID        NULL REFERENCES public.media_library(id) ON DELETE SET NULL,
  url         TEXT        NOT NULL,
  caption     TEXT        NULL,
  group_label TEXT        NULL,
  order_index INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT proposal_media_url_not_blank CHECK (length(btrim(url)) > 0)
);

COMMENT ON COLUMN public.proposal_media.group_label IS
  'ProposalMedia.group: agrupador livre dentro da seção (ex.: "ESTRUTURAS CIVIL").';

COMMENT ON COLUMN public.proposal_media.url IS
  'URL congelada. media_id é só o rastro para a biblioteca: excluir a foto de lá '
  'não deve apagar a imagem de uma proposta já enviada.';

CREATE INDEX IF NOT EXISTS idx_proposal_media_proposal_section
  ON public.proposal_media (proposal_id, section_key, order_index);

CREATE INDEX IF NOT EXISTS idx_proposal_media_media
  ON public.proposal_media (media_id)
  WHERE media_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 8. proposal_schedule_rows — ProposalScheduleRow
--    As colunas do cronograma (ProposalScheduleColumn[]) ficam em
--    proposals.schedule_columns; `marks` é chaveado por ProposalScheduleColumn.key.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proposal_schedule_rows (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID        NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  order_index INT         NOT NULL DEFAULT 0,
  stage       TEXT        NOT NULL,
  marks       JSONB       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(marks) = 'object'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT proposal_schedule_rows_stage_not_blank CHECK (length(btrim(stage)) > 0)
);

COMMENT ON COLUMN public.proposal_schedule_rows.marks IS
  'Record<string, boolean | string> chaveado por ProposalScheduleColumn.key. '
  'true marca X; string exibe o texto.';

CREATE INDEX IF NOT EXISTS idx_proposal_schedule_rows_proposal
  ON public.proposal_schedule_rows (proposal_id, order_index);

-- =============================================================================
-- 9. updated_at — uma função compartilhada pelas oito filhas
-- =============================================================================
CREATE OR REPLACE FUNCTION public.update_proposal_child_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'proposal_sections',
    'proposal_pricing_options',
    'proposal_segment_totals',
    'proposal_payment_terms',
    'proposal_abc_rows',
    'proposal_responsibility_items',
    'proposal_media',
    'proposal_schedule_rows'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || t || '_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.update_proposal_child_updated_at()',
      'trg_' || t || '_updated_at', t
    );
  END LOOP;
END $$;

-- =============================================================================
-- 10. RLS — o mesmo par de policies nas oito filhas
--
--     dono autenticado : ALL    via public.proposal_is_owned(proposal_id)
--     leitor anônimo   : SELECT via public.proposal_is_publicly_shared(proposal_id)
--
--     O helper anônimo compara o token apresentado na requisição com
--     proposals.share_token. Sem token → NULL → nenhuma linha. Nenhuma destas
--     policies expõe linha por "campo preenchido".
-- =============================================================================
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'proposal_sections',
    'proposal_pricing_options',
    'proposal_segment_totals',
    'proposal_payment_terms',
    'proposal_abc_rows',
    'proposal_responsibility_items',
    'proposal_media',
    'proposal_schedule_rows'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING (public.proposal_is_owned(proposal_id)) '
      'WITH CHECK (public.proposal_is_owned(proposal_id))',
      t || '_owner_all', t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_public_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO anon '
      'USING (public.proposal_is_publicly_shared(proposal_id))',
      t || '_public_select', t
    );
  END LOOP;
END $$;
