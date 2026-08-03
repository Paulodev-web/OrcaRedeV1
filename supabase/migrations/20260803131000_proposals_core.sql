-- =============================================================================
-- FASE 5 — Proposta Comercial: entidade raiz, token público e helpers de RLS
--
-- PROPÓSITO
--   Criar `proposals` modelada a partir de src/types/proposal.ts (contrato
--   canônico, §16.1) e a infraestrutura de acesso que as tabelas filhas e a
--   analytics vão reusar:
--     public.generate_proposal_share_token()   token opaco e aleatório
--     public.current_share_token()             token apresentado na requisição
--     public.proposal_is_owned(uuid)           dono autenticado
--     public.proposal_is_publicly_shared(uuid) leitura anônima por COMPARAÇÃO
--
-- SEGURANÇA DO LINK PÚBLICO (Escopo §9.1)
--   A policy anônima compara o token: `share_token = public.current_share_token()`.
--   Quando nenhum token é apresentado a função devolve NULL, a igualdade vira
--   NULL, e o RLS descarta a linha. Não existe em lugar nenhum deste arquivo uma
--   condição do tipo `share_token IS NOT NULL`.
--
--   O precedente de work_trackings.public_id (rota /obra/[...slug]) libera
--   leitura anônima para QUALQUER registro com o campo preenchido. Esse padrão
--   é inseguro e NÃO foi copiado — aqui a proposta expõe preço.
--
--   Como o cliente apresenta o token: header `x-proposal-token` (PostgREST o
--   entrega em current_setting('request.headers')) ou a GUC
--   `request.proposal_token` via set_config em fluxo server-side.
--
-- ADITIVA (§3.3): tabela e funções novas. Nada existente é tocado. O APK não
-- conhece propostas.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. pgcrypto — necessário para gen_random_bytes (CSPRNG)
--    O Supabase já instala por padrão; o bloco cobre bancos limpos e tolera o
--    schema onde a extensão vive.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
    BEGIN
      EXECUTE 'CREATE EXTENSION pgcrypto WITH SCHEMA extensions';
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'CREATE EXTENSION pgcrypto';
    END;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. generate_proposal_share_token — 24 bytes de CSPRNG em base64url
--    ~192 bits de entropia, 32 caracteres. Não sequencial, não derivado de
--    timestamp, não derivado do id da proposta (§9.1).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_proposal_share_token()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SET search_path = extensions, public, pg_catalog
AS $$
BEGIN
  RETURN translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_');
END;
$$;

COMMENT ON FUNCTION public.generate_proposal_share_token() IS
  'Token opaco de compartilhamento (base64url de 24 bytes aleatórios).';

REVOKE EXECUTE ON FUNCTION public.generate_proposal_share_token() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.generate_proposal_share_token() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. current_share_token — token apresentado nesta requisição
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_share_token()
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT NULLIF(
    COALESCE(
      NULLIF(current_setting('request.proposal_token', true), ''),
      NULLIF(current_setting('request.headers', true), '')::json ->> 'x-proposal-token'
    ),
    ''
  );
$$;

COMMENT ON FUNCTION public.current_share_token() IS
  'Token de proposta apresentado na requisição: GUC request.proposal_token ou '
  'header x-proposal-token. NULL quando ausente — e NULL nunca casa com '
  'share_token, então a policy anônima simplesmente não devolve linha.';

GRANT EXECUTE ON FUNCTION public.current_share_token() TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. proposals
--
--    MAPA PARA src/types/proposal.ts (ProposalData)
--      header.*                → colunas de identificação abaixo
--      company                 → company_settings (join por user_id)
--      responsible             → technical_responsibles (technical_responsible_id)
--      sections                → tabela proposal_sections
--      institutional           → coluna institutional (JSONB)
--      media.*                 → tabela proposal_media (agrupada por section_key)
--      activities              → coluna activities (JSONB)
--      materials               → coluna materials_snapshot (JSONB)
--      abc.rows / abc.totals   → tabela proposal_abc_rows / agregação
--      abc.grandTotal          → coluna abc_grand_total
--      billingConditions       → coluna billing_conditions (JSONB)
--      pricingOptions          → tabela proposal_pricing_options (+ filhas)
--      schedule.columns        → coluna schedule_columns (JSONB)
--      schedule.rows           → tabela proposal_schedule_rows
--      schedule.footnote       → coluna schedule_footnote
--      responsibilityMatrix    → tabela proposal_responsibility_items
--      finalConsiderations     → coluna final_considerations (JSONB)
--      acceptance.closingText  → coluna acceptance_closing_text
--
--    Regra: número tem tabela ou coluna numérica; prosa mora em JSONB.
--    Nada aqui é recalculado pela IA (§12.2).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proposals (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  budget_id                UUID        NOT NULL REFERENCES public.budgets(id) ON DELETE RESTRICT,
  template_id              UUID        NULL REFERENCES public.proposal_templates(id) ON DELETE SET NULL,
  technical_responsible_id UUID        NULL REFERENCES public.technical_responsibles(id) ON DELETE SET NULL,

  -- ProposalHeader
  proposal_number          INT         NOT NULL CHECK (proposal_number > 0),
  version                  INT         NOT NULL DEFAULT 1 CHECK (version > 0),
  scope_label              TEXT        NOT NULL DEFAULT 'TIPO DE ESCOPO',
  project_title            TEXT        NOT NULL DEFAULT '',
  project_subtitle         TEXT        NULL,
  client_name              TEXT        NOT NULL DEFAULT '',
  city                     TEXT        NOT NULL DEFAULT '',
  issued_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  validity_date            DATE        NULL,

  status                   TEXT        NOT NULL DEFAULT 'draft'
                                       CHECK (status IN ('draft', 'published', 'archived')),

  -- ProposalUnitInvestment padrão da proposta (cada opção de preço pode sobrescrever)
  units_count              INT         NULL CHECK (units_count IS NULL OR units_count > 0),
  units_label              TEXT        NULL,

  -- Blocos de conteúdo do contrato sem tabela própria
  institutional            JSONB       NOT NULL DEFAULT '{}'::jsonb
                                       CHECK (jsonb_typeof(institutional) = 'object'),
  activities               JSONB       NOT NULL DEFAULT '[]'::jsonb
                                       CHECK (jsonb_typeof(activities) = 'array'),
  materials_snapshot       JSONB       NOT NULL DEFAULT '[]'::jsonb
                                       CHECK (jsonb_typeof(materials_snapshot) = 'array'),
  billing_conditions       JSONB       NULL
                                       CHECK (billing_conditions IS NULL OR jsonb_typeof(billing_conditions) = 'object'),
  final_considerations     JSONB       NOT NULL DEFAULT '[]'::jsonb
                                       CHECK (jsonb_typeof(final_considerations) = 'array'),
  acceptance_closing_text  TEXT        NULL,
  schedule_columns         JSONB       NOT NULL DEFAULT '[]'::jsonb
                                       CHECK (jsonb_typeof(schedule_columns) = 'array'),
  schedule_footnote        TEXT        NULL,
  abc_grand_total          NUMERIC     NOT NULL DEFAULT 0 CHECK (abc_grand_total >= 0),

  -- Publicação
  share_token              TEXT        NOT NULL DEFAULT public.generate_proposal_share_token(),
  published_at             TIMESTAMPTZ NULL,
  revoked_at               TIMESTAMPTZ NULL,

  -- Auditoria da geração por IA: qual versão de prompt escreveu esta proposta.
  -- Alimentado pelas constantes *_PROMPT_VERSION de src/services/ai/prompts/.
  ai_prompt_version        TEXT        NULL,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT proposals_share_token_key UNIQUE (share_token),
  CONSTRAINT proposals_share_token_len CHECK (length(share_token) >= 24),
  CONSTRAINT proposals_number_version_key UNIQUE (user_id, proposal_number, version)
);

COMMENT ON TABLE public.proposals IS
  'Proposta comercial. Etapa 4 da esteira do orçamento. Espelha ProposalData de '
  'src/types/proposal.ts — ver o mapa de campos no cabeçalho da migration.';

COMMENT ON COLUMN public.proposals.proposal_number IS
  'Número da proposta, herdado do número do orçamento (ex.: 287). Junto com '
  'version forma a identificação "287.1" das peças atuais.';

COMMENT ON COLUMN public.proposals.materials_snapshot IS
  'ProposalMaterialRow[] congelado no momento da geração. Congelado de propósito: '
  'a proposta enviada ao cliente não pode mudar porque alguém editou um preço no '
  'catálogo depois. É também a fonte do Pareto da curva ABC.';

COMMENT ON COLUMN public.proposals.activities IS
  'ProposalActivityGroup[]. A prosa é [IA]; `facts` são quantitativos computados '
  'do orçamento e injetados como dados fechados — a IA cita, nunca recalcula.';

COMMENT ON COLUMN public.proposals.share_token IS
  'Token opaco do link público /proposta/[token]. Aleatório (CSPRNG), não '
  'sequencial, não derivado do id. Regenerado se a proposta for republicada '
  'depois de revogada.';

COMMENT ON COLUMN public.proposals.validity_date IS
  'Informativa na peça. NÃO expira o link público: o link vive até revoked_at (§9.1).';

COMMENT ON COLUMN public.proposals.revoked_at IS
  'Revogação manual do link. Preenchido = leitura anônima bloqueada.';

COMMENT ON COLUMN public.proposals.budget_id IS
  'RESTRICT, não CASCADE: proposta publicada tem URL ativa e analytics acumulado, '
  'e não pode evaporar em silêncio junto com o orçamento. Excluir o orçamento exige '
  'lidar com as propostas antes — a UI deve avisar em vez de deixar estourar erro cru.';

COMMENT ON COLUMN public.proposals.ai_prompt_version IS
  'Versão dos prompts que geraram o rascunho, para auditoria. Vem das constantes '
  '*_PROMPT_VERSION de src/services/ai/prompts/. NULL = escrita sem IA.';

CREATE INDEX IF NOT EXISTS idx_proposals_user_updated
  ON public.proposals (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_proposals_budget
  ON public.proposals (budget_id, version DESC);

-- Caminho quente da página pública: token de proposta ativa.
CREATE INDEX IF NOT EXISTS idx_proposals_share_token_active
  ON public.proposals (share_token)
  WHERE status = 'published' AND revoked_at IS NULL;

CREATE OR REPLACE FUNCTION public.update_proposals_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_proposals_updated_at ON public.proposals;
CREATE TRIGGER trg_proposals_updated_at
  BEFORE UPDATE ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.update_proposals_updated_at();

-- -----------------------------------------------------------------------------
-- 4.1 Trigger de ciclo de publicação
--     * carimba published_at na primeira publicação
--     * ao republicar algo que estava revogado, gera um token NOVO — um link
--       revogado nunca volta a funcionar, mesmo que alguém o tenha guardado
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.proposals_handle_publication()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'published' AND NEW.published_at IS NULL THEN
    NEW.published_at := now();
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.revoked_at IS NOT NULL
     AND NEW.revoked_at IS NULL
     AND NEW.share_token = OLD.share_token THEN
    NEW.share_token := public.generate_proposal_share_token();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proposals_publication ON public.proposals;
CREATE TRIGGER trg_proposals_publication
  BEFORE INSERT OR UPDATE ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.proposals_handle_publication();

REVOKE EXECUTE ON FUNCTION public.proposals_handle_publication() FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Helpers de RLS reusados por todas as tabelas filhas
-- -----------------------------------------------------------------------------

-- 5.1 Dono autenticado.
CREATE OR REPLACE FUNCTION public.proposal_is_owned(_proposal_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.proposals p
    WHERE p.id = _proposal_id
      AND p.user_id = auth.uid()
      AND auth.uid() IS NOT NULL
  );
$$;

COMMENT ON FUNCTION public.proposal_is_owned(UUID) IS
  'Helper SECURITY DEFINER para policies das tabelas filhas: a proposta é do '
  'usuário autenticado. Evita reaplicar o RLS de proposals dentro de cada policy.';

REVOKE EXECUTE ON FUNCTION public.proposal_is_owned(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.proposal_is_owned(UUID) TO authenticated, service_role;

-- 5.2 Leitura anônima por COMPARAÇÃO de token.
--     Repare que não há `share_token IS NOT NULL`: se current_share_token()
--     devolver NULL, a igualdade é NULL, o EXISTS é falso e nada vaza.
CREATE OR REPLACE FUNCTION public.proposal_is_publicly_shared(_proposal_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.proposals p
    WHERE p.id = _proposal_id
      AND p.status = 'published'
      AND p.revoked_at IS NULL
      AND p.share_token = public.current_share_token()
  );
$$;

COMMENT ON FUNCTION public.proposal_is_publicly_shared(UUID) IS
  'A proposta está publicada, não revogada, e o token apresentado na requisição '
  'é exatamente o dela. Base da leitura anônima de /proposta/[token].';

REVOKE EXECUTE ON FUNCTION public.proposal_is_publicly_shared(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.proposal_is_publicly_shared(UUID) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6. RLS — proposals
-- -----------------------------------------------------------------------------
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proposals_select" ON public.proposals;
CREATE POLICY "proposals_select" ON public.proposals
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "proposals_insert" ON public.proposals;
CREATE POLICY "proposals_insert" ON public.proposals
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.budgets b
      WHERE b.id = budget_id AND b.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "proposals_update" ON public.proposals;
CREATE POLICY "proposals_update" ON public.proposals
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.budgets b
      WHERE b.id = budget_id AND b.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "proposals_delete" ON public.proposals;
CREATE POLICY "proposals_delete" ON public.proposals
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Leitura anônima: SOMENTE a linha cujo token bate com o apresentado.
DROP POLICY IF EXISTS "proposals_public_select" ON public.proposals;
CREATE POLICY "proposals_public_select" ON public.proposals
  FOR SELECT TO anon
  USING (
    share_token = public.current_share_token()
    AND status = 'published'
    AND revoked_at IS NULL
  );
