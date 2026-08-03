-- =============================================================================
-- FASE 6 — Analytics da proposta pública
--
--   proposal_views        uma linha por sessão anônima que abriu /proposta/[token]
--   proposal_view_events  eventos granulares (ProposalViewEventType do contrato)
--
-- PRIVACIDADE — IP NUNCA EM CLARO (Escopo §9.3)
--   `proposal_views.ip_hash` só aceita 64 caracteres hexadecimais, ou seja o
--   digest SHA-256 já calculado pela aplicação com um pepper de servidor. O
--   CHECK não é decoração: ele torna estruturalmente impossível gravar
--   "189.4.x.x" nessa coluna. Não existe coluna de IP em claro nesta migration.
--   A localização aproximada entra em geo_country/geo_region/geo_city, derivada
--   do IP e descartando o IP.
--
-- ESCRITA ANÔNIMA, LEITURA DO DONO
--   INSERT liberado para `anon` — mas apenas em proposta cujo token foi
--   apresentado na requisição (public.proposal_is_publicly_shared).
--   SELECT/UPDATE/DELETE: só o dono da proposta. O visitante nunca lê a
--   analytics, nem a sua própria linha.
--   O caminho recomendado para o cliente é o par de RPCs abaixo: elas fazem
--   upsert por (proposal_id, session_id), o que limita naturalmente quanto um
--   visitante consegue inflar a tabela.
--
-- ADITIVA (§3.3): tabelas e funções novas. Depende das colunas de módulo em
-- `notifications` criadas em 20260803120000.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. proposal_views
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proposal_views (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id        UUID        NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  session_id         TEXT        NOT NULL,
  device_type        TEXT        NULL CHECK (device_type IS NULL OR device_type IN
                                   ('desktop', 'mobile', 'tablet', 'bot', 'unknown')),
  os                 TEXT        NULL,
  browser            TEXT        NULL,
  geo_country        TEXT        NULL,
  geo_region         TEXT        NULL,
  geo_city           TEXT        NULL,
  ip_hash            TEXT        NULL CHECK (ip_hash IS NULL OR ip_hash ~ '^[0-9a-f]{64}$'),
  referrer           TEXT        NULL,
  user_agent         TEXT        NULL,
  first_seen_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_seconds      INT         NOT NULL DEFAULT 0 CHECK (total_seconds >= 0),
  max_scroll_percent INT         NOT NULL DEFAULT 0
                                 CHECK (max_scroll_percent >= 0 AND max_scroll_percent <= 100),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT proposal_views_session_not_blank CHECK (length(btrim(session_id)) > 0),
  CONSTRAINT proposal_views_proposal_session_unq UNIQUE (proposal_id, session_id)
);

COMMENT ON TABLE public.proposal_views IS
  'Uma linha por sessão anônima na página pública da proposta. '
  'first_seen_at/last_seen_at dão primeira e última visita; a contagem de '
  'linhas dá o número de acessos.';

COMMENT ON COLUMN public.proposal_views.session_id IS
  'Identificador opaco da sessão anônima, gerado no cliente. Não identifica '
  'pessoa: serve para não contar a mesma leitura duas vezes.';

COMMENT ON COLUMN public.proposal_views.ip_hash IS
  'SHA-256 hex (64 chars) do IP + pepper de servidor, calculado pela aplicação. '
  'O CHECK de formato impede fisicamente gravar IP em claro aqui.';

COMMENT ON COLUMN public.proposal_views.total_seconds IS
  'Tempo acumulado na página, alimentado por heartbeat via track_proposal_view. '
  'Sempre cresce (GREATEST), nunca regride com um heartbeat atrasado.';

CREATE INDEX IF NOT EXISTS idx_proposal_views_proposal_first_seen
  ON public.proposal_views (proposal_id, first_seen_at DESC);

-- -----------------------------------------------------------------------------
-- 2. proposal_view_events — ProposalViewEventType
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proposal_view_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID        NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  view_id     UUID        NOT NULL REFERENCES public.proposal_views(id) ON DELETE CASCADE,
  event_type  TEXT        NOT NULL CHECK (event_type IN (
                            'session_start', 'heartbeat', 'section_view',
                            'pdf_download', 'whatsapp_click')),
  section_key TEXT        NULL CHECK (section_key IS NULL OR section_key IN (
                            'capa', 'quem_somos', 'seu_projeto', 'localizacao',
                            'fotos_obra', 'descricao_atividades', 'escopo_materiais',
                            'curva_abc', 'condicoes_faturamento', 'valores_por_segmento',
                            'valores_globais', 'investimento_por_unidade',
                            'condicoes_pagamento', 'cronograma', 'matriz_responsabilidade',
                            'consideracoes_finais', 'diferencial_orcarede',
                            'termo_aceite', 'contato')),
  payload     JSONB       NULL CHECK (payload IS NULL OR jsonb_typeof(payload) = 'object'),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.proposal_view_events IS
  'Eventos granulares da sessão anônima. Espelha ProposalViewEvent do contrato.';

COMMENT ON COLUMN public.proposal_view_events.event_type IS
  'heartbeat existe no contrato, mas gravar uma linha por batida engorda a '
  'tabela à toa: o caminho recomendado é chamar track_proposal_view, que só '
  'atualiza total_seconds e max_scroll_percent da sessão.';

CREATE INDEX IF NOT EXISTS idx_proposal_view_events_proposal_type
  ON public.proposal_view_events (proposal_id, event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_proposal_view_events_view
  ON public.proposal_view_events (view_id, occurred_at);

-- -----------------------------------------------------------------------------
-- 3. RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.proposal_views       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_view_events ENABLE ROW LEVEL SECURITY;

-- 3.1 proposal_views
DROP POLICY IF EXISTS "proposal_views_owner_select" ON public.proposal_views;
CREATE POLICY "proposal_views_owner_select" ON public.proposal_views
  FOR SELECT TO authenticated
  USING (public.proposal_is_owned(proposal_id));

DROP POLICY IF EXISTS "proposal_views_owner_delete" ON public.proposal_views;
CREATE POLICY "proposal_views_owner_delete" ON public.proposal_views
  FOR DELETE TO authenticated
  USING (public.proposal_is_owned(proposal_id));

DROP POLICY IF EXISTS "proposal_views_public_insert" ON public.proposal_views;
CREATE POLICY "proposal_views_public_insert" ON public.proposal_views
  FOR INSERT TO anon
  WITH CHECK (public.proposal_is_publicly_shared(proposal_id));

-- SEM policy de SELECT/UPDATE para anon: o visitante escreve e não lê.
-- Atualizar tempo e scroll da própria sessão é papel de track_proposal_view.

-- 3.2 proposal_view_events
DROP POLICY IF EXISTS "proposal_view_events_owner_select" ON public.proposal_view_events;
CREATE POLICY "proposal_view_events_owner_select" ON public.proposal_view_events
  FOR SELECT TO authenticated
  USING (public.proposal_is_owned(proposal_id));

DROP POLICY IF EXISTS "proposal_view_events_owner_delete" ON public.proposal_view_events;
CREATE POLICY "proposal_view_events_owner_delete" ON public.proposal_view_events
  FOR DELETE TO authenticated
  USING (public.proposal_is_owned(proposal_id));

DROP POLICY IF EXISTS "proposal_view_events_public_insert" ON public.proposal_view_events;
CREATE POLICY "proposal_view_events_public_insert" ON public.proposal_view_events
  FOR INSERT TO anon
  WITH CHECK (
    public.proposal_is_publicly_shared(proposal_id)
    AND EXISTS (
      SELECT 1 FROM public.proposal_views v
      WHERE v.id = view_id AND v.proposal_id = proposal_view_events.proposal_id
    )
  );

-- -----------------------------------------------------------------------------
-- 4. RPC — track_proposal_view
--    Caminho recomendado para o cliente anônimo: valida o token por COMPARAÇÃO,
--    faz upsert da sessão e devolve o id da visita.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.track_proposal_view(
  p_share_token        TEXT,
  p_session_id         TEXT,
  p_device_type        TEXT DEFAULT NULL,
  p_os                 TEXT DEFAULT NULL,
  p_browser            TEXT DEFAULT NULL,
  p_geo_country        TEXT DEFAULT NULL,
  p_geo_region         TEXT DEFAULT NULL,
  p_geo_city           TEXT DEFAULT NULL,
  p_ip_hash            TEXT DEFAULT NULL,
  p_referrer           TEXT DEFAULT NULL,
  p_user_agent         TEXT DEFAULT NULL,
  p_total_seconds      INT  DEFAULT NULL,
  p_max_scroll_percent INT  DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal_id UUID;
  v_view_id     UUID;
BEGIN
  IF p_share_token IS NULL OR p_session_id IS NULL OR length(btrim(p_session_id)) = 0 THEN
    RAISE EXCEPTION 'token e sessão são obrigatórios' USING ERRCODE = '22023';
  END IF;

  -- Comparação de token. Sem correspondência não há o que registrar.
  SELECT p.id INTO v_proposal_id
    FROM public.proposals p
   WHERE p.share_token = p_share_token
     AND p.status = 'published'
     AND p.revoked_at IS NULL;

  IF v_proposal_id IS NULL THEN
    RAISE EXCEPTION 'proposta não disponível' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.proposal_views AS v (
    proposal_id, session_id, device_type, os, browser,
    geo_country, geo_region, geo_city, ip_hash, referrer, user_agent,
    total_seconds, max_scroll_percent
  ) VALUES (
    v_proposal_id, p_session_id, p_device_type, p_os, p_browser,
    p_geo_country, p_geo_region, p_geo_city, p_ip_hash, p_referrer, p_user_agent,
    COALESCE(p_total_seconds, 0), COALESCE(p_max_scroll_percent, 0)
  )
  ON CONFLICT (proposal_id, session_id) DO UPDATE
     SET last_seen_at       = now(),
         total_seconds      = GREATEST(v.total_seconds, COALESCE(EXCLUDED.total_seconds, 0)),
         max_scroll_percent = GREATEST(v.max_scroll_percent, COALESCE(EXCLUDED.max_scroll_percent, 0)),
         device_type        = COALESCE(v.device_type, EXCLUDED.device_type),
         os                 = COALESCE(v.os,          EXCLUDED.os),
         browser            = COALESCE(v.browser,     EXCLUDED.browser),
         geo_country        = COALESCE(v.geo_country, EXCLUDED.geo_country),
         geo_region         = COALESCE(v.geo_region,  EXCLUDED.geo_region),
         geo_city           = COALESCE(v.geo_city,    EXCLUDED.geo_city),
         ip_hash            = COALESCE(v.ip_hash,     EXCLUDED.ip_hash),
         referrer           = COALESCE(v.referrer,    EXCLUDED.referrer),
         user_agent         = COALESCE(v.user_agent,  EXCLUDED.user_agent)
  RETURNING v.id INTO v_view_id;

  RETURN v_view_id;
END;
$$;

COMMENT ON FUNCTION public.track_proposal_view IS
  'Upsert da sessão anônima de leitura da proposta. Valida o token por '
  'comparação; nunca aceita "qualquer proposta com token preenchido".';

REVOKE EXECUTE ON FUNCTION public.track_proposal_view(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INT, INT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_proposal_view(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INT, INT
) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. RPC — track_proposal_view_event
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.track_proposal_view_event(
  p_share_token TEXT,
  p_session_id  TEXT,
  p_event_type  TEXT,
  p_section_key TEXT        DEFAULT NULL,
  p_payload     JSONB       DEFAULT NULL,
  p_occurred_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_view_id     UUID;
  v_proposal_id UUID;
  v_event_id    UUID;
BEGIN
  -- Reusa a validação de token e garante que a sessão existe.
  v_view_id := public.track_proposal_view(p_share_token, p_session_id);

  SELECT v.proposal_id INTO v_proposal_id
    FROM public.proposal_views v
   WHERE v.id = v_view_id;

  INSERT INTO public.proposal_view_events
    (proposal_id, view_id, event_type, section_key, payload, occurred_at)
  VALUES
    (v_proposal_id, v_view_id, p_event_type, p_section_key, p_payload,
     COALESCE(p_occurred_at, now()))
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

COMMENT ON FUNCTION public.track_proposal_view_event IS
  'Registra um evento da sessão anônima (section_view, pdf_download, '
  'whatsapp_click). Cria a sessão se ainda não existir.';

REVOKE EXECUTE ON FUNCTION public.track_proposal_view_event(
  TEXT, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_proposal_view_event(
  TEXT, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ
) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6. Notificação de atividade do cliente (§9.3 e §10.2)
--
--    Primeira abertura da proposta, download do PDF e clique no WhatsApp viram
--    notificação para o dono, com module_key='propostas'. Como notifications
--    entrou na publication do Realtime em 20260803120000, o sino acende na hora.
--
--    Anti-spam: a primeira abertura só notifica quando é a PRIMEIRA sessão da
--    proposta; PDF e WhatsApp notificam uma vez por sessão.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_proposal_first_view()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner     UUID;
  v_budget_id UUID;
  v_title     TEXT;
BEGIN
  -- ON CONFLICT DO UPDATE dispara o trigger de UPDATE, não este: aqui só
  -- chegam sessões novas de verdade.
  IF EXISTS (
    SELECT 1 FROM public.proposal_views v
    WHERE v.proposal_id = NEW.proposal_id AND v.id <> NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT p.user_id, p.budget_id, p.project_title
    INTO v_owner, v_budget_id, v_title
    FROM public.proposals p
   WHERE p.id = NEW.proposal_id;

  IF v_owner IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications
    (user_id, kind, title, body, link_path, module_key, entity_type, entity_id)
  VALUES (
    v_owner,
    'proposal_first_view',
    'Proposta aberta pelo cliente',
    COALESCE(NULLIF(btrim(v_title), ''), 'A proposta') || ' foi aberta pela primeira vez.',
    '/orcamentos/' || v_budget_id::text || '/proposta',
    'propostas',
    'proposal',
    NEW.proposal_id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_proposal_first_view ON public.proposal_views;
CREATE TRIGGER trg_notify_proposal_first_view
  AFTER INSERT ON public.proposal_views
  FOR EACH ROW EXECUTE FUNCTION public.notify_proposal_first_view();

REVOKE EXECUTE ON FUNCTION public.notify_proposal_first_view() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_proposal_engagement_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner     UUID;
  v_budget_id UUID;
  v_title     TEXT;
  v_label     TEXT;
BEGIN
  IF NEW.event_type NOT IN ('pdf_download', 'whatsapp_click') THEN
    RETURN NEW;
  END IF;

  -- Uma notificação por tipo de evento por sessão.
  IF EXISTS (
    SELECT 1 FROM public.proposal_view_events e
    WHERE e.view_id = NEW.view_id
      AND e.event_type = NEW.event_type
      AND e.id <> NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT p.user_id, p.budget_id, p.project_title
    INTO v_owner, v_budget_id, v_title
    FROM public.proposals p
   WHERE p.id = NEW.proposal_id;

  IF v_owner IS NULL THEN
    RETURN NEW;
  END IF;

  v_label := CASE NEW.event_type
               WHEN 'pdf_download'   THEN 'O cliente baixou o PDF da proposta'
               WHEN 'whatsapp_click' THEN 'O cliente clicou no WhatsApp da proposta'
             END;

  INSERT INTO public.notifications
    (user_id, kind, title, body, link_path, module_key, entity_type, entity_id)
  VALUES (
    v_owner,
    'proposal_' || NEW.event_type,
    v_label,
    COALESCE(NULLIF(btrim(v_title), ''), 'A proposta') || ' — ' || lower(v_label) || '.',
    '/orcamentos/' || v_budget_id::text || '/proposta',
    'propostas',
    'proposal',
    NEW.proposal_id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_proposal_engagement_event ON public.proposal_view_events;
CREATE TRIGGER trg_notify_proposal_engagement_event
  AFTER INSERT ON public.proposal_view_events
  FOR EACH ROW EXECUTE FUNCTION public.notify_proposal_engagement_event();

REVOKE EXECUTE ON FUNCTION public.notify_proposal_engagement_event() FROM PUBLIC, anon, authenticated;
