-- =============================================================================
-- 20260803134000_proposal_public_identity_read
--
-- PROPÓSITO
--   Permitir que a página pública /proposta/[token] leia os dados de identidade
--   que a peça exibe: empresa (logo, CNPJ, contatos, WhatsApp) e responsável
--   técnico (nome, CREA, assinatura).
--
--   A proposta e suas 8 tabelas filhas já têm leitura anônima por comparação de
--   token (20260803131000 e 20260803132000). company_settings e
--   technical_responsibles ficaram de fora e são owner-only, então o rodapé e o
--   termo de aceite sairiam vazios no link do cliente.
--
-- SEGURANÇA
--   Mesmo princípio do resto: COMPARAÇÃO de token, nunca "campo preenchido".
--   Sem token válido, current_share_token() é NULL, o EXISTS é falso e nada
--   volta. A empresa só é exposta enquanto existir uma proposta DELA publicada,
--   não revogada, cujo token seja exatamente o apresentado. O responsável é
--   ainda mais estreito: só o que aquela proposta referencia.
--
-- ADITIVA (§3.3): apenas policies novas. Nenhuma tabela ou coluna é alterada, e
-- nada do que já existe é revogado. O APK não conhece estas tabelas.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Empresa — visível enquanto houver proposta publicada dela com o token
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "company_settings_public_select" ON public.company_settings;
CREATE POLICY "company_settings_public_select" ON public.company_settings
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1
        FROM public.proposals p
       WHERE p.user_id = company_settings.user_id
         AND p.status = 'published'
         AND p.revoked_at IS NULL
         AND p.share_token = public.current_share_token()
    )
  );

COMMENT ON POLICY "company_settings_public_select" ON public.company_settings IS
  'Leitura anônima do cadastro da empresa para a página pública da proposta. '
  'Exige token que case com uma proposta publicada e não revogada do mesmo dono.';

-- -----------------------------------------------------------------------------
-- 2. Responsável técnico — só o referenciado pela proposta do token
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "technical_responsibles_public_select" ON public.technical_responsibles;
CREATE POLICY "technical_responsibles_public_select" ON public.technical_responsibles
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1
        FROM public.proposals p
       WHERE p.technical_responsible_id = technical_responsibles.id
         AND p.status = 'published'
         AND p.revoked_at IS NULL
         AND p.share_token = public.current_share_token()
    )
  );

COMMENT ON POLICY "technical_responsibles_public_select" ON public.technical_responsibles IS
  'Leitura anônima do responsável técnico que assina a proposta do token. Não '
  'expõe os demais responsáveis cadastrados pelo mesmo usuário.';

-- -----------------------------------------------------------------------------
-- 3. Índices de apoio às policies
--    O EXISTS filtra por dono e por responsável; sem índice, cada linha lida
--    dispararia varredura em proposals.
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_proposals_user_published
  ON public.proposals (user_id)
  WHERE status = 'published' AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_proposals_responsible_published
  ON public.proposals (technical_responsible_id)
  WHERE status = 'published' AND revoked_at IS NULL;
