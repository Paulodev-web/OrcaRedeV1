-- =============================================================================
-- CONFIGURAÇÕES DO SISTEMA — Empresa e Responsáveis Técnicos
--
-- PROPÓSITO
--   Telas novas de /configuracoes/empresa e /configuracoes/responsaveis
--   (Escopo §6.4). São a origem dos blocos `ProposalCompany` e
--   `ProposalTechnicalResponsible` de src/types/proposal.ts, e o número de
--   WhatsApp aqui é o do botão da página pública da proposta (§9.2).
--
-- ADITIVA (§3.3): duas tabelas novas + um bucket de storage. Nada existente
-- é tocado. `profiles.role` intacta.
--
-- OBRIGATORIEDADE
--   O contrato marca legalName, cnpj, address, phonePrimary, email e
--   whatsappNumber como string (não nula). No banco eles são NULL/'' porque a
--   tela precisa salvar um cadastro pela metade. A validação de "proposta
--   publicável" é da aplicação, não do schema.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. company_settings — um registro por usuário (o operador é o dono da empresa)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_settings (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  legal_name        TEXT        NOT NULL DEFAULT '',
  trade_name        TEXT        NULL,
  cnpj              TEXT        NULL,
  address           TEXT        NULL,
  phone_primary     TEXT        NULL,
  phone_secondary   TEXT        NULL,
  email             TEXT        NULL,
  website           TEXT        NULL,
  instagram         TEXT        NULL,
  whatsapp_number   TEXT        NULL,
  logo_url          TEXT        NULL,
  logo_storage_path TEXT        NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT company_settings_user_key UNIQUE (user_id)
);

COMMENT ON TABLE public.company_settings IS
  'Dados institucionais da empresa. Um registro por usuário — a escrita natural '
  'é um upsert ON CONFLICT (user_id). Origem de ProposalCompany.';

COMMENT ON COLUMN public.company_settings.whatsapp_number IS
  'Formato E.164 (ex.: +5554999999999). Usado no botão de WhatsApp da página '
  'pública da proposta. Guardar sem máscara.';

COMMENT ON COLUMN public.company_settings.logo_url IS
  'URL pública do logo no bucket company-assets. logo_storage_path guarda o '
  'caminho para permitir substituir/remover o arquivo antigo.';

CREATE OR REPLACE FUNCTION public.update_company_settings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_company_settings_updated_at ON public.company_settings;
CREATE TRIGGER trg_company_settings_updated_at
  BEFORE UPDATE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_company_settings_updated_at();

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_settings_select" ON public.company_settings;
CREATE POLICY "company_settings_select" ON public.company_settings
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "company_settings_insert" ON public.company_settings;
CREATE POLICY "company_settings_insert" ON public.company_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "company_settings_update" ON public.company_settings;
CREATE POLICY "company_settings_update" ON public.company_settings
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "company_settings_delete" ON public.company_settings;
CREATE POLICY "company_settings_delete" ON public.company_settings
  FOR DELETE USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 2. technical_responsibles — vários cadastros, escolhidos por proposta
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.technical_responsibles (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name              TEXT        NOT NULL,
  crea                   TEXT        NOT NULL,
  signature_url          TEXT        NULL,
  signature_storage_path TEXT        NULL,
  is_active              BOOLEAN     NOT NULL DEFAULT true,
  order_index            INT         NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT technical_responsibles_name_not_blank CHECK (length(btrim(full_name)) > 0),
  CONSTRAINT technical_responsibles_crea_not_blank CHECK (length(btrim(crea)) > 0),
  CONSTRAINT technical_responsibles_user_crea_key UNIQUE (user_id, crea)
);

COMMENT ON TABLE public.technical_responsibles IS
  'Responsáveis técnicos com CREA e imagem de assinatura. A proposta aponta '
  'para um deles; o Termo de Aceite do PDF usa nome + CREA + assinatura.';

COMMENT ON COLUMN public.technical_responsibles.is_active IS
  'Soft delete: inativo some do seletor mas continua resolvendo propostas antigas.';

CREATE INDEX IF NOT EXISTS idx_technical_responsibles_user_active
  ON public.technical_responsibles (user_id, is_active, order_index);

CREATE OR REPLACE FUNCTION public.update_technical_responsibles_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_technical_responsibles_updated_at ON public.technical_responsibles;
CREATE TRIGGER trg_technical_responsibles_updated_at
  BEFORE UPDATE ON public.technical_responsibles
  FOR EACH ROW EXECUTE FUNCTION public.update_technical_responsibles_updated_at();

ALTER TABLE public.technical_responsibles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "technical_responsibles_select" ON public.technical_responsibles;
CREATE POLICY "technical_responsibles_select" ON public.technical_responsibles
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "technical_responsibles_insert" ON public.technical_responsibles;
CREATE POLICY "technical_responsibles_insert" ON public.technical_responsibles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "technical_responsibles_update" ON public.technical_responsibles;
CREATE POLICY "technical_responsibles_update" ON public.technical_responsibles
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "technical_responsibles_delete" ON public.technical_responsibles;
CREATE POLICY "technical_responsibles_delete" ON public.technical_responsibles
  FOR DELETE USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 3. Storage — bucket company-assets (logo + assinaturas)
--
--    PÚBLICO de leitura por decisão consciente: logo e assinatura aparecem na
--    página pública da proposta e no PDF gerado por @react-pdf/renderer, que
--    baixa a imagem sem sessão. Mesmo modelo do bucket `plans`.
--    Escrita restrita ao dono via prefixo de pasta {user_id}/...
--    Path esperado: {user_id}/logo/<arquivo>, {user_id}/assinaturas/<arquivo>
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-assets', 'company-assets', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "company_assets_insert" ON storage.objects;
CREATE POLICY "company_assets_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'company-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "company_assets_update" ON storage.objects;
CREATE POLICY "company_assets_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'company-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'company-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "company_assets_delete" ON storage.objects;
CREATE POLICY "company_assets_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'company-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- SELECT não precisa de policy: bucket público é servido pelo endpoint
-- /object/public sem passar por storage.objects RLS.
