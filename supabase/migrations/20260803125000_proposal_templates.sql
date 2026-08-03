-- =============================================================================
-- TEMPLATES DE PROPOSTA — texto institucional + estrutura de seções padrão
--
-- PROPÓSITO
--   Tela /configuracoes/templates-proposta (Escopo §6.4). Guarda o boilerplate
--   que hoje é copiado à mão entre propostas e que produziu os defeitos da §8.1
--   (placeholder "TEXTO DO SEU PARÁGRAFO" vazado, estrutura divergente entre
--   duas propostas, numeração de tabela incoerente).
--
-- CONTRATO
--   Os campos JSONB seguem src/types/proposal.ts:
--     default_sections        ProposalSectionConfig[]
--     institutional           { quemSomos, identidade, compromisso,
--                               diferencialOrcaRede }  — cada um ProposalRichBlock | null
--     billing_conditions      ProposalRichBlock | null
--     final_considerations    ProposalRichBlock[]
--   ProposalRichBlock = { heading: string|null, paragraphs: string[], bullets: string[] }.
--   Nunca string única com markdown: o motor de PDF pagina por parágrafo.
--
-- ADITIVA (§3.3): duas tabelas novas + uma função. Nada existente é tocado.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Função de referência — as 19 seções do contrato, na ordem canônica
--    Usada como DEFAULT em proposal_templates e em proposals. IMMUTABLE de
--    propósito: mudar a lista exige migration nova, o que força a conversa
--    entre as três camadas (§16.1).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.proposal_default_sections()
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT '[
    {"key":"capa",                    "title":"Capa",                                  "order":1,  "enabled":true},
    {"key":"quem_somos",              "title":"Quem Somos",                            "order":2,  "enabled":true},
    {"key":"seu_projeto",             "title":"Seu Projeto",                           "order":3,  "enabled":true},
    {"key":"localizacao",             "title":"Localização da Obra",                   "order":4,  "enabled":true},
    {"key":"fotos_obra",              "title":"Fotos da Obra",                         "order":5,  "enabled":true},
    {"key":"descricao_atividades",    "title":"Descrição das Atividades",              "order":6,  "enabled":true},
    {"key":"escopo_materiais",        "title":"Escopo dos Materiais Subdivididos",     "order":7,  "enabled":true},
    {"key":"curva_abc",               "title":"Curva de Preços",                       "order":8,  "enabled":true},
    {"key":"condicoes_faturamento",   "title":"Condições de Faturamento de Materiais", "order":9,  "enabled":true},
    {"key":"valores_por_segmento",    "title":"Valores Globais por Segmento",          "order":10, "enabled":true},
    {"key":"valores_globais",         "title":"Valores Globais",                       "order":11, "enabled":true},
    {"key":"investimento_por_unidade","title":"Investimento por Unidade",              "order":12, "enabled":true},
    {"key":"condicoes_pagamento",     "title":"Condições de Pagamento",                "order":13, "enabled":true},
    {"key":"cronograma",              "title":"Cronograma Executivo",                  "order":14, "enabled":true},
    {"key":"matriz_responsabilidade", "title":"Matriz de Responsabilidade",            "order":15, "enabled":true},
    {"key":"consideracoes_finais",    "title":"Considerações Finais",                  "order":16, "enabled":true},
    {"key":"diferencial_orcarede",    "title":"Diferencial Tecnológico OrçaRede",      "order":17, "enabled":true},
    {"key":"termo_aceite",            "title":"Termo de Aceite",                       "order":18, "enabled":true},
    {"key":"contato",                 "title":"Contato",                               "order":19, "enabled":true}
  ]'::jsonb;
$$;

COMMENT ON FUNCTION public.proposal_default_sections() IS
  'ProposalSectionConfig[] padrão — espelha ProposalSectionKey de src/types/proposal.ts.';

GRANT EXECUTE ON FUNCTION public.proposal_default_sections() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. proposal_templates
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proposal_templates (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name                    TEXT        NOT NULL,
  description             TEXT        NULL,
  is_default              BOOLEAN     NOT NULL DEFAULT false,
  scope_label             TEXT        NOT NULL DEFAULT 'TIPO DE ESCOPO',
  default_sections        JSONB       NOT NULL DEFAULT public.proposal_default_sections()
                                      CHECK (jsonb_typeof(default_sections) = 'array'),
  institutional           JSONB       NOT NULL DEFAULT '{}'::jsonb
                                      CHECK (jsonb_typeof(institutional) = 'object'),
  billing_conditions      JSONB       NULL
                                      CHECK (billing_conditions IS NULL OR jsonb_typeof(billing_conditions) = 'object'),
  final_considerations    JSONB       NOT NULL DEFAULT '[]'::jsonb
                                      CHECK (jsonb_typeof(final_considerations) = 'array'),
  acceptance_closing_text TEXT        NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT proposal_templates_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT proposal_templates_user_name_key UNIQUE (user_id, name)
);

COMMENT ON TABLE public.proposal_templates IS
  'Texto institucional + estrutura de seções padrão + matriz de responsabilidade '
  'padrão. A proposta copia daqui na criação; editar o template não altera '
  'proposta já criada.';

COMMENT ON COLUMN public.proposal_templates.scope_label IS
  'Rótulo do topo da capa (ProposalHeader.scopeLabel): "TIPO DE ESCOPO", '
  '"TIPO DE SERVIÇO". Editável por proposta.';

-- Um template padrão por usuário.
CREATE UNIQUE INDEX IF NOT EXISTS uq_proposal_templates_default
  ON public.proposal_templates (user_id)
  WHERE is_default;

CREATE INDEX IF NOT EXISTS idx_proposal_templates_user
  ON public.proposal_templates (user_id, name);

CREATE OR REPLACE FUNCTION public.update_proposal_templates_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_proposal_templates_updated_at ON public.proposal_templates;
CREATE TRIGGER trg_proposal_templates_updated_at
  BEFORE UPDATE ON public.proposal_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_proposal_templates_updated_at();

ALTER TABLE public.proposal_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proposal_templates_select" ON public.proposal_templates;
CREATE POLICY "proposal_templates_select" ON public.proposal_templates
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "proposal_templates_insert" ON public.proposal_templates;
CREATE POLICY "proposal_templates_insert" ON public.proposal_templates
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "proposal_templates_update" ON public.proposal_templates;
CREATE POLICY "proposal_templates_update" ON public.proposal_templates
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "proposal_templates_delete" ON public.proposal_templates;
CREATE POLICY "proposal_templates_delete" ON public.proposal_templates
  FOR DELETE USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 3. proposal_template_responsibility_items — matriz de responsabilidade padrão
--    Espelha ProposalResponsibilityItem do contrato.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proposal_template_responsibility_items (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID        NOT NULL REFERENCES public.proposal_templates(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  order_index INT         NOT NULL DEFAULT 0,
  description TEXT        NOT NULL,
  responsible TEXT        NOT NULL
                          CHECK (responsible IN ('contratada', 'contratante', 'ambos')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT proposal_template_resp_desc_not_blank CHECK (length(btrim(description)) > 0)
);

COMMENT ON TABLE public.proposal_template_responsibility_items IS
  'Matriz de responsabilidade padrão do template. Copiada para '
  'proposal_responsibility_items quando a proposta é criada.';

CREATE INDEX IF NOT EXISTS idx_proposal_template_resp_items_template
  ON public.proposal_template_responsibility_items (template_id, order_index);

CREATE OR REPLACE FUNCTION public.update_proposal_template_resp_items_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_proposal_template_resp_items_updated_at
  ON public.proposal_template_responsibility_items;
CREATE TRIGGER trg_proposal_template_resp_items_updated_at
  BEFORE UPDATE ON public.proposal_template_responsibility_items
  FOR EACH ROW EXECUTE FUNCTION public.update_proposal_template_resp_items_updated_at();

ALTER TABLE public.proposal_template_responsibility_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proposal_template_resp_items_select"
  ON public.proposal_template_responsibility_items;
CREATE POLICY "proposal_template_resp_items_select"
  ON public.proposal_template_responsibility_items
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "proposal_template_resp_items_insert"
  ON public.proposal_template_responsibility_items;
CREATE POLICY "proposal_template_resp_items_insert"
  ON public.proposal_template_responsibility_items
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.proposal_templates t
      WHERE t.id = template_id AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "proposal_template_resp_items_update"
  ON public.proposal_template_responsibility_items;
CREATE POLICY "proposal_template_resp_items_update"
  ON public.proposal_template_responsibility_items
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "proposal_template_resp_items_delete"
  ON public.proposal_template_responsibility_items;
CREATE POLICY "proposal_template_resp_items_delete"
  ON public.proposal_template_responsibility_items
  FOR DELETE USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 4. Seed — um template padrão por usuário que já tem orçamento
--    Só a casca: as 19 seções ligadas e nenhum texto. O texto institucional é
--    escrito na tela de Configurações, não semeado com placeholder — foi
--    justamente placeholder não substituído que vazou na proposta da Maxif4.
-- -----------------------------------------------------------------------------
--    Guarda com NOT EXISTS em vez de ON CONFLICT: a linha colide tanto com
--    proposal_templates_user_name_key quanto com o índice parcial
--    uq_proposal_templates_default, e ON CONFLICT só trata o arbiter declarado.
INSERT INTO public.proposal_templates (user_id, name, description, is_default)
SELECT DISTINCT b.user_id, 'Padrão', 'Template inicial com as 19 seções da proposta.', true
FROM public.budgets b
WHERE b.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.proposal_templates t WHERE t.user_id = b.user_id
  );
