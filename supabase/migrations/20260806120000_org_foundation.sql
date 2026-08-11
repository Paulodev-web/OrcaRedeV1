-- =============================================================================
-- FUNDAÇÃO DE ORGANIZAÇÃO (multi-tenant) — Fase 1 de 3
--
-- PROPÓSITO
--   Hoje a fronteira de todo dado do sistema é a pessoa: ~250 policies dizem
--   `auth.uid() = user_id`. Isso torna impossível o Comercial ler um orçamento
--   da Engenharia — e é a razão de 20260624000000_duplicate_luan_to_paulo.sql
--   ter precisado DUPLICAR fisicamente cada linha do banco para dar acesso a um
--   segundo usuário. Com quatro setores isso é inviável.
--
--   Esta migration cria a camada de organização. O dado passa a pertencer à
--   ORG; `user_id` sobrevive como AUTOR (auditoria, "quem criou"), não como dono.
--
-- ESTA FASE É ADITIVA
--   Nenhuma tabela existente ganha `org_id` aqui, nenhuma policy de dado é
--   reescrita, nada é removido ou renomeado. `profiles.role` fica INTACTA — o
--   APK Android valida `role = 'manager'` direto no Supabase
--   (docs/apk-contracts/01-authentication.md) e não conhece esta camada.
--
-- QUATRO EIXOS ORTOGONAIS — não confundir
--   platform_admins     → opera a PLATAFORMA, acima de todas as orgs (o dev)
--   profiles.role       → engineer | manager      (contrato do APK, imutável)
--   org_members.role    → owner | admin | member  (governança DENTRO de uma org)
--   org_members.sector  → comercial | engenharia | compras | execucao (trabalho)
--   module_permissions  → o que cada um vê/edita por módulo (tabela já existe)
--
--   Admin de plataforma ≠ admin de org. O Luan é `owner` da ON e administra a
--   ON. O dev não é membro da ON: ele opera a plataforma e, quando precisa dar
--   suporte, ELEGE a org ativa e passa a agir dentro dela — uma org por vez.
--
-- ROADMAP
--   Fase 1 (este arquivo) — organizations, platform_admins, org_members,
--                           helpers, seed. Sem efeito sobre leitura/escrita de
--                           dado existente.
--   Fase 2 — `org_id` nas ~30 tabelas-raiz + backfill (= org do dono atual).
--            ATENÇÃO às 3 tabelas que fogem do padrão `user_id`:
--            works (engineer_id/manager_id), checklist_templates (engineer_id),
--            crew_members (owner_id).
--   Fase 3 — flip do RLS: `auth.uid() = user_id` → `org_id = current_org_id()`.
--            São 254 policies no schema public, 68 delas com o padrão literal
--            `auth.uid() = user_id`; o restante exige inspeção caso a caso.
--            As policies filhas (que herdam via EXISTS no pai) não mudam.
--
--   Plano completo, com o estado do banco verificado: PLANO-ORG-MULTITENANCY.md
--
-- ⚠ REGRA DE OPERAÇÃO QUE NASCE AQUI (verificado no banco em 06/08/2026)
--   Excluir um usuário no painel do Supabase causa DOIS estragos distintos:
--
--   a) PERDA REAL — 14 FKs fazem ON DELETE CASCADE a partir de auth.users:
--      company_settings, crew_members.owner_id, device_tokens, media_library,
--      media_library_tags, media_tags, module_permissions, proposals,
--      proposal_templates, proposal_template_responsibility_items,
--      session_material_exclusions, technical_responsibles, user_module_seen,
--      work_segments.
--      `proposals` está aí dentro: apaga inclusive proposta já publicada com
--      share_token na mão do cliente.
--
--   b) ORFANDADE — budgets, budget_folders, materials, quotation_sessions e
--      suppliers têm `user_id uuid` SEM FK nenhuma. As linhas sobrevivem
--      apontando para um UUID inexistente: somem da interface (nenhum
--      auth.uid() bate), mas são recuperáveis reatribuindo o user_id.
--
--   Em ambos os casos a regra é a mesma — desligamento é SEMPRE soft delete:
--     UPDATE profiles    SET is_active = false WHERE id = :user_id;
--     UPDATE org_members SET is_active = false WHERE user_id = :user_id;
--   Nunca DELETE FROM auth.users.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. organizations
--
--    INSERT/DELETE ficam sem policy de propósito: com RLS ligada e sem policy,
--    ambos falham para `authenticated`. Criar organização é ato de onboarding,
--    feito por service role. Quando existir auto-cadastro, entra aqui uma policy
--    de INSERT + trigger que promove o criador a owner.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  slug        TEXT        NOT NULL UNIQUE,
  cnpj        TEXT        NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT organizations_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT organizations_slug_format     CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

COMMENT ON TABLE public.organizations IS
  'Tenant. Toda linha de dado do sistema passa a pertencer a uma organização '
  '(via org_id, adicionado na Fase 2). Substitui a posse individual por user_id.';

COMMENT ON COLUMN public.organizations.slug IS
  'Identificador estável e legível (ex.: on-engenharia-eletrica). Serve para '
  'URLs e para seeds idempotentes referenciarem a org sem UUID hardcoded.';

CREATE OR REPLACE FUNCTION public.update_organizations_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON public.organizations;
CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_organizations_updated_at();

-- -----------------------------------------------------------------------------
-- 2. platform_admins — quem OPERA o sistema, acima de qualquer org
--
--    ⚠ POR QUE É UMA TABELA, E NÃO UMA COLUNA EM `profiles`
--    A policy `profiles_update` permite `auth.uid() = id`: o usuário edita a
--    própria linha. O trigger trg_profiles_enforce_immutable só congela
--    id / created_at / role / created_by / email. Uma coluna `is_platform_admin`
--    ali seria AUTO-PROMOVÍVEL — qualquer usuário viraria admin da plataforma
--    com um PATCH na API REST do Supabase. Numa tabela separada sem policy de
--    escrita, a única forma de conceder é service role.
--
--    Concessão e revogação são deliberadamente fora do app: é o cofre.
--      INSERT INTO public.platform_admins (user_id, note)
--      SELECT id, 'motivo' FROM auth.users WHERE email = '...';
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id     UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  note        TEXT        NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by  UUID        NULL REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.platform_admins IS
  'Operadores da plataforma (não de uma org). Agem SEMPRE dentro de uma única '
  'org por vez, a de profiles.active_org_id — nunca enxergam duas orgs na mesma '
  'query. Sem policy de INSERT/UPDATE/DELETE: concessão só por service role.';

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- Só a própria linha, e só leitura: é o que permite a UI decidir se mostra o
-- seletor de organização. Ninguém descobre quem mais é admin da plataforma.
DROP POLICY IF EXISTS "platform_admins_select_self" ON public.platform_admins;
CREATE POLICY "platform_admins_select_self" ON public.platform_admins
  FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins pa
    WHERE pa.user_id = auth.uid()
  );
$$;

-- -----------------------------------------------------------------------------
-- 3. org_members — quem pertence a qual org, com que poder e em que setor
--
--    SEM UNIQUE(user_id): multi-tenant de verdade, um usuário pode pertencer a
--    várias orgs. Qual delas está valendo na sessão é `profiles.active_org_id`
--    (seção 5).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.org_members (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT        NOT NULL DEFAULT 'member'
                          CHECK (role IN ('owner', 'admin', 'member')),
  sector      TEXT        NULL
                          CHECK (sector IN ('comercial', 'engenharia', 'compras', 'execucao')),
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  invited_by  UUID        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT org_members_org_user_key UNIQUE (org_id, user_id)
);

COMMENT ON TABLE public.org_members IS
  'Vínculo usuário↔organização. Três informações independentes: pertencimento '
  '(org_id), governança (role) e função operacional (sector).';

COMMENT ON COLUMN public.org_members.role IS
  'Governança DENTRO da org — não confundir com profiles.role (contrato do APK) '
  'nem com platform_admins (opera a plataforma inteira). '
  'owner: dono, não pode ser removido nem rebaixado se for o último. '
  'admin: convida/remove membros e edita module_permissions. member: nenhum poder administrativo.';

COMMENT ON COLUMN public.org_members.sector IS
  'Setor operacional — alimenta o roteamento de cards no módulo Quadro de '
  'Trabalho. NULL = ainda não atribuído (usuário entra sem fila de trabalho).';

COMMENT ON COLUMN public.org_members.is_active IS
  'Soft delete do vínculo. É o caminho correto para desligar alguém: excluir o '
  'auth.user faria CASCADE nos orçamentos dele (ver cabeçalho desta migration).';

CREATE INDEX IF NOT EXISTS idx_org_members_user
  ON public.org_members (user_id) WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_org_members_org_sector
  ON public.org_members (org_id, sector) WHERE is_active;

CREATE OR REPLACE FUNCTION public.update_org_members_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_org_members_updated_at ON public.org_members;
CREATE TRIGGER trg_org_members_updated_at
  BEFORE UPDATE ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.update_org_members_updated_at();

-- A coluna precisa existir ANTES dos helpers: current_org_id() é LANGUAGE sql,
-- e o Postgres valida o corpo de função SQL na criação (ao contrário de
-- plpgsql). Criar o helper primeiro falha com `column p.active_org_id does not
-- exist`. O trigger que a valida fica na seção 5, depois de platform_admins.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active_org_id UUID NULL
    REFERENCES public.organizations(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.profiles.active_org_id IS
  'Org ativa na sessão do usuário. NULL = usa a primeira org ativa dele '
  '(ver COALESCE em public.current_org_id). Para admin de plataforma é a org '
  'em que ele está operando no momento.';

-- -----------------------------------------------------------------------------
-- 4. Helpers SECURITY DEFINER
--
--    OBRIGATÓRIO serem SECURITY DEFINER: uma policy em org_members que
--    consultasse org_members diretamente entraria em recursão infinita. O
--    projeto já sangrou nisso — ver 20260509000000_fix_rls_recursion_works_members
--    e o comentário de public.is_work_member. Toda policy abaixo usa helper,
--    nunca subquery direta.
--
--    STABLE + sem argumento (user_org_ids, current_org_id) permite ao planner
--    resolver como InitPlan: uma avaliação por statement, não por linha. Por
--    isso na Fase 3 as policies devem escrever `(SELECT public.current_org_id())`
--    — o SELECT força o InitPlan e evita chamada por linha em tabela grande.
--
--    ⚠ O ADMIN DE PLATAFORMA ENTRA POR AQUI, E SÓ NA ORG ATIVA.
--    is_org_member/is_org_admin comparam `_org_id` com current_org_id(): o
--    poder é real, mas confinado a uma org por vez. Nunca `OR
--    is_platform_admin()` sozinho — isso liberaria QUALQUER org_id de uma vez e
--    faria uma listagem misturar dado de tenants diferentes.
-- -----------------------------------------------------------------------------

-- Todas as orgs ativas do usuário atual. Base do seletor de organização.
-- Admin de plataforma não aparece aqui: o seletor dele vem de `organizations`
-- (ver policy organizations_select), não do vínculo.
CREATE OR REPLACE FUNCTION public.user_org_ids()
RETURNS UUID[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(m.org_id), '{}')
  FROM public.org_members m
  WHERE m.user_id = auth.uid()
    AND m.is_active;
$$;

-- Org valendo na sessão.
--
-- Duas travas dentro do COALESCE:
--   1. active_org_id só vale se o usuário for membro ativo dela — OU se for
--      admin de plataforma e a org estiver ativa. É o que dá ao dev o acesso de
--      suporte sem precisar de vínculo fictício em org_members.
--   2. Fallback anti-lockout: usuário que nunca escolheu org (ou que só tem
--      uma) continua enxergando seu dado depois do flip da Fase 3, sem depender
--      de UPDATE prévio em profiles.
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT p.active_org_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.active_org_id IS NOT NULL
        AND (
          EXISTS (
            SELECT 1 FROM public.org_members m
            WHERE m.org_id = p.active_org_id
              AND m.user_id = p.id
              AND m.is_active
          )
          OR (
            public.is_platform_admin()
            AND EXISTS (
              SELECT 1 FROM public.organizations o
              WHERE o.id = p.active_org_id AND o.is_active
            )
          )
        )
    ),
    (
      SELECT m.org_id
      FROM public.org_members m
      WHERE m.user_id = auth.uid()
        AND m.is_active
      ORDER BY m.created_at
      LIMIT 1
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members m
    WHERE m.org_id = _org_id
      AND m.user_id = auth.uid()
      AND m.is_active
  )
  OR (public.is_platform_admin() AND _org_id = public.current_org_id());
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members m
    WHERE m.org_id = _org_id
      AND m.user_id = auth.uid()
      AND m.is_active
      AND m.role IN ('owner', 'admin')
  )
  OR (public.is_platform_admin() AND _org_id = public.current_org_id());
$$;

-- Setor do usuário na org ativa. Usado pelo Quadro de Trabalho para filtrar
-- "a fila do meu setor" sem o app precisar carregar o vínculo.
-- Admin de plataforma sem vínculo retorna NULL: ele não tem fila de trabalho.
CREATE OR REPLACE FUNCTION public.current_org_sector()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT m.sector
  FROM public.org_members m
  WHERE m.user_id = auth.uid()
    AND m.org_id = public.current_org_id()
    AND m.is_active;
$$;

DO $$
DECLARE fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.is_platform_admin()',
    'public.user_org_ids()',
    'public.current_org_id()',
    'public.is_org_member(uuid)',
    'public.is_org_admin(uuid)',
    'public.current_org_sector()'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 5. Validação de profiles.active_org_id (a coluna nasce na seção 3)
--
--    Fica em profiles (e não numa tabela de sessão) porque a troca de org é
--    decisão persistente do usuário, não do dispositivo: trocar no desktop e
--    reabrir no celular deve manter a escolha.
--
--    O trigger de imutabilidade existente (trg_profiles_enforce_immutable) trava
--    id/created_at/role/created_by/email. Coluna nova não é afetada — e a policy
--    profiles_update já permite `auth.uid() = id`, então o próprio usuário troca
--    a org ativa. O trigger abaixo garante que só possa apontar para org da qual
--    ele realmente participa — ou, sendo admin de plataforma, para qualquer org
--    ativa. É este trigger que sustenta o "uma org por vez": trocar de org é uma
--    escrita explícita e auditável, não um parâmetro de query.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profiles_validate_active_org()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.active_org_id IS NULL
     OR NEW.active_org_id IS NOT DISTINCT FROM OLD.active_org_id THEN
    RETURN NEW;
  END IF;

  -- Admin de plataforma pode eleger qualquer org ATIVA (acesso de suporte).
  -- Checa NEW.id, não auth.uid(): o privilégio é de quem terá a org ativa, não
  -- de quem está executando o UPDATE.
  IF EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = NEW.id) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = NEW.active_org_id AND o.is_active
    ) THEN
      RAISE EXCEPTION 'active_org_id inválido: organização % não existe ou está inativa',
        NEW.active_org_id;
    END IF;
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.org_members m
    WHERE m.org_id = NEW.active_org_id
      AND m.user_id = NEW.id
      AND m.is_active
  ) THEN
    RAISE EXCEPTION 'active_org_id inválido: usuário % não é membro ativo da organização %',
      NEW.id, NEW.active_org_id;
  END IF;

  RETURN NEW;
END; $$;

-- Nome com prefixo trg_z para rodar DEPOIS de trg_profiles_enforce_immutable
-- (Postgres dispara triggers BEFORE em ordem alfabética de nome).
DROP TRIGGER IF EXISTS trg_z_profiles_validate_active_org ON public.profiles;
CREATE TRIGGER trg_z_profiles_validate_active_org
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_validate_active_org();

-- -----------------------------------------------------------------------------
-- 6. Proteção do último owner
--    Sem isto, um admin pode rebaixar/desativar o último owner e a org fica sem
--    ninguém capaz de administrar — exatamente o buraco que module_permissions
--    tem hoje ao se ancorar em `is_profile_creator`.
--
--    A rede de segurança de segundo nível é o admin de plataforma: se a org
--    travar mesmo assim, ele elege a org como ativa e promove outro owner, sem
--    precisar de service role. Por isso a ON pode operar com um owner só.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.org_members_protect_last_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := COALESCE(OLD.org_id, NEW.org_id);
  v_was_active_owner BOOLEAN := (OLD.role = 'owner' AND OLD.is_active);
  v_still_owner BOOLEAN := (TG_OP = 'UPDATE' AND NEW.role = 'owner' AND NEW.is_active);
BEGIN
  IF v_was_active_owner AND NOT v_still_owner THEN
    IF (
      SELECT count(*) FROM public.org_members m
      WHERE m.org_id = v_org AND m.role = 'owner' AND m.is_active AND m.id <> OLD.id
    ) = 0 THEN
      RAISE EXCEPTION 'A organização % ficaria sem owner. Promova outro membro antes.', v_org;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_org_members_protect_last_owner ON public.org_members;
CREATE TRIGGER trg_org_members_protect_last_owner
  BEFORE UPDATE OR DELETE ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.org_members_protect_last_owner();

-- As duas funções acima são de TRIGGER e SECURITY DEFINER. Sem este REVOKE, o
-- PostgREST as publica em /rest/v1/rpc/<nome> e qualquer anônimo pode invocá-las
-- — foi o que o advisor `anon_security_definer_function_executable` acusou. O
-- trigger dispara pelo mecanismo do Postgres, que não exige EXECUTE do usuário,
-- então revogar de todo mundo não quebra nada e fecha a porta.
REVOKE EXECUTE ON FUNCTION public.org_members_protect_last_owner()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.profiles_validate_active_org()
  FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 7. RLS — organizations e org_members
-- -----------------------------------------------------------------------------
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- O `OR is_platform_admin()` é a ÚNICA leitura cross-org do sistema, e é
-- deliberada: sem ela o admin de plataforma enxergaria só a org já ativa e
-- ficaria preso — não teria como listar as demais para trocar. O que vaza aqui
-- é metadado de tenant (nome, slug, CNPJ), nunca dado operacional: este é o
-- alimentador do seletor de organização.
DROP POLICY IF EXISTS "organizations_select" ON public.organizations;
CREATE POLICY "organizations_select" ON public.organizations
  FOR SELECT USING (
    public.is_org_member(id)
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "organizations_update" ON public.organizations;
CREATE POLICY "organizations_update" ON public.organizations
  FOR UPDATE USING (public.is_org_admin(id))
         WITH CHECK (public.is_org_admin(id));

ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

-- Ver os colegas da própria org. `auth.uid() = user_id` vem primeiro para que o
-- usuário sempre leia o próprio vínculo, mesmo em estado inconsistente.
DROP POLICY IF EXISTS "org_members_select" ON public.org_members;
CREATE POLICY "org_members_select" ON public.org_members
  FOR SELECT USING (
    auth.uid() = user_id
    OR public.is_org_member(org_id)
  );

DROP POLICY IF EXISTS "org_members_insert" ON public.org_members;
CREATE POLICY "org_members_insert" ON public.org_members
  FOR INSERT WITH CHECK (public.is_org_admin(org_id));

-- Ninguém edita o próprio vínculo: é o que impede escalada de privilégio pela
-- API do Supabase (member se promovendo a admin). Mesmo princípio das policies
-- de module_permissions em 20260803124000.
DROP POLICY IF EXISTS "org_members_update" ON public.org_members;
CREATE POLICY "org_members_update" ON public.org_members
  FOR UPDATE USING (public.is_org_admin(org_id) AND user_id <> auth.uid())
         WITH CHECK (public.is_org_admin(org_id) AND user_id <> auth.uid());

DROP POLICY IF EXISTS "org_members_delete" ON public.org_members;
CREATE POLICY "org_members_delete" ON public.org_members
  FOR DELETE USING (public.is_org_admin(org_id) AND user_id <> auth.uid());

-- -----------------------------------------------------------------------------
-- 8. Visibilidade entre colegas — ÚNICA mudança de comportamento desta fase
--
--    profiles_select hoje é `auth.uid() = id OR (auth.uid() = created_by AND
--    role = 'manager')`: colegas de empresa NÃO enxergam o nome um do outro.
--    Sem isto, a tela /configuracoes/usuarios não lista ninguém e o Quadro de
--    Trabalho não consegue exibir o responsável de um card.
--
--    Estritamente aditiva: um OR a mais, nenhuma condição existente removida.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.shares_org_with(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.org_members mine
    JOIN public.org_members theirs ON theirs.org_id = mine.org_id
    WHERE mine.user_id = auth.uid()
      AND mine.is_active
      AND theirs.user_id = _user_id
      AND theirs.is_active
  )
  -- Admin de plataforma vê os perfis da org que está operando — e só dela.
  OR (
    public.is_platform_admin()
    AND EXISTS (
      SELECT 1 FROM public.org_members t
      WHERE t.user_id = _user_id
        AND t.is_active
        AND t.org_id = public.current_org_id()
    )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.shares_org_with(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.shares_org_with(UUID) TO authenticated, service_role;

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT
  USING (
    auth.uid() = id
    OR (auth.uid() = created_by AND role = 'manager')
    OR public.shares_org_with(id)
  );

-- -----------------------------------------------------------------------------
-- 9. Seed
--
--    Duas orgs desde o início, de propósito: uma org só não prova isolamento
--    nenhum. Com ON + devpaulo dá para testar em dev que o dado de uma não
--    aparece na outra antes do flip da Fase 3 ir para produção.
--
--    Membros da ON entram por DOMÍNIO DE E-MAIL, não por lista de UUID:
--    idempotente, e não arrasta conta de teste (teste@gmail.com) para dentro da
--    org quando a Fase 3 fechar o RLS.
-- -----------------------------------------------------------------------------
INSERT INTO public.organizations (name, slug, is_active)
VALUES ('ON Engenharia Elétrica', 'on-engenharia-eletrica', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.organizations (name, slug, is_active)
VALUES ('devpaulo.com.br', 'devpaulo', true)
ON CONFLICT (slug) DO NOTHING;

-- Todo perfil ativo do domínio da ON entra como member, sem setor definido.
-- A atribuição de setor é feita pelo Luan na tela de administração de usuários.
INSERT INTO public.org_members (org_id, user_id, role, sector, is_active)
SELECT
  o.id,
  p.id,
  'member',
  NULL,
  true
FROM public.profiles p
CROSS JOIN public.organizations o
WHERE o.slug = 'on-engenharia-eletrica'
  AND p.is_active
  AND lower(COALESCE(p.email, '')) LIKE '%@onengenhariaeletrica.com.br'
ON CONFLICT (org_id, user_id) DO NOTHING;

-- Luan é o owner e o administrador da ON (mapeamento operacional §5.3).
UPDATE public.org_members m
SET role = 'owner', sector = 'engenharia'
FROM public.organizations o, public.profiles p
WHERE o.slug = 'on-engenharia-eletrica'
  AND m.org_id = o.id
  AND m.user_id = p.id
  AND lower(p.email) = 'luan@onengenhariaeletrica.com.br';

-- O dev NÃO é membro da ON. Ele é dono da própria org (onde vive o dado de
-- teste dele) e opera a ON pelo eixo de plataforma, elegendo-a como org ativa.
INSERT INTO public.org_members (org_id, user_id, role, sector, is_active)
SELECT o.id, p.id, 'owner', NULL, true
FROM public.profiles p
CROSS JOIN public.organizations o
WHERE o.slug = 'devpaulo'
  AND lower(p.email) = 'paulodev.website@gmail.com'
ON CONFLICT (org_id, user_id) DO NOTHING;

INSERT INTO public.platform_admins (user_id, note)
SELECT p.id, 'Desenvolvedor e operador da plataforma (devpaulo.com.br)'
FROM public.profiles p
WHERE lower(p.email) = 'paulodev.website@gmail.com'
ON CONFLICT (user_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 10. Verificação — a Fase 2 NÃO deve ser aplicada se isto vier incompleto
--     Todo usuário que possui dado precisa estar em alguma org antes do flip do
--     RLS, senão ele perde acesso ao próprio trabalho.
--
--     SELECT p.email,
--            o.name AS org,
--            om.role,
--            om.sector,
--            (pa.user_id IS NOT NULL) AS admin_plataforma
--     FROM public.profiles p
--     LEFT JOIN public.org_members   om ON om.user_id = p.id AND om.is_active
--     LEFT JOIN public.organizations o  ON o.id = om.org_id
--     LEFT JOIN public.platform_admins pa ON pa.user_id = p.id
--     WHERE p.is_active
--     ORDER BY o.name NULLS FIRST, p.email;
--
--     Qualquer linha com `org` NULL é um usuário que ficará sem acesso no flip
--     — e ser admin de plataforma NÃO resolve isso: o dado dele continuaria sem
--     org_id e reprovaria no SET NOT NULL da Fase 2.
-- -----------------------------------------------------------------------------
