-- =============================================================================
-- Andamento de Obra — Fundação de Pessoas (Fase 1)
-- profiles + crew_members + device_tokens
-- Trigger on_auth_user_created, backfill, RLS completo, trigger de imutabilidade
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. profiles — Extende auth.users (1:1) com papel e auditoria mínima
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT        NOT NULL DEFAULT '',
  phone       TEXT        NULL,
  email       TEXT        NULL,
  role        TEXT        NOT NULL CHECK (role IN ('engineer', 'manager')),
  created_by  UUID        NULL REFERENCES auth.users(id),
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT profiles_manager_requires_creator
    CHECK (role <> 'manager' OR created_by IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_created_by ON public.profiles(created_by);

CREATE OR REPLACE FUNCTION public.update_profiles_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_profiles_updated_at();

-- -----------------------------------------------------------------------------
-- 1.1 Trigger BEFORE UPDATE — imutabilidade de colunas sensíveis
-- Reforça as regras já presentes em RLS:
--   * id, created_at: imutáveis sempre
--   * role, created_by: imutáveis (mudança de papel exige fluxo administrativo via service role)
--   * email: imutável quando o ator é created_by atualizando um manager
--            (nesta fase, e-mail só muda em auth.users + service role)
-- A política RLS já restringe quem alcança esta linha, então o trigger
-- apenas força os campos para os valores antigos quando aplicável.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profiles_enforce_immutable_columns()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  acting_uid UUID := auth.uid();
  is_self    BOOLEAN := acting_uid IS NOT NULL AND acting_uid = OLD.id;
  is_creator BOOLEAN := acting_uid IS NOT NULL
                        AND OLD.role = 'manager'
                        AND OLD.created_by IS NOT NULL
                        AND acting_uid = OLD.created_by;
BEGIN
  IF is_self OR is_creator THEN
    NEW.id := OLD.id;
    NEW.created_at := OLD.created_at;
    NEW.role := OLD.role;
    NEW.created_by := OLD.created_by;
    NEW.email := OLD.email;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_profiles_enforce_immutable ON public.profiles;
CREATE TRIGGER trg_profiles_enforce_immutable
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_enforce_immutable_columns();

-- -----------------------------------------------------------------------------
-- 1.2 RLS — profiles
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT
  USING (
    auth.uid() = id
    OR (auth.uid() = created_by AND role = 'manager')
  );

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE
  USING (
    auth.uid() = id
    OR (auth.uid() = created_by AND role = 'manager')
  )
  WITH CHECK (
    auth.uid() = id
    OR (auth.uid() = created_by AND role = 'manager')
  );

-- INSERT e DELETE permanecem sem política para o papel authenticated:
-- com RLS habilitada e sem policy, ambos retornam erro — o que queremos.
-- INSERT vem do trigger on_auth_user_created e do fluxo service role.
-- DELETE é desabilitado (soft delete via is_active).

-- -----------------------------------------------------------------------------
-- 2. crew_members — Membros de equipe sem login, ligados ao engenheiro
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crew_members (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT        NOT NULL,
  role        TEXT        NULL,
  phone       TEXT        NULL,
  document_id TEXT        NULL,
  notes       TEXT        NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_members_owner ON public.crew_members(owner_id);
CREATE INDEX IF NOT EXISTS idx_crew_members_is_active ON public.crew_members(is_active);

CREATE OR REPLACE FUNCTION public.update_crew_members_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_crew_members_updated_at ON public.crew_members;
CREATE TRIGGER trg_crew_members_updated_at
  BEFORE UPDATE ON public.crew_members
  FOR EACH ROW EXECUTE FUNCTION public.update_crew_members_updated_at();

ALTER TABLE public.crew_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crew_members_select" ON public.crew_members;
CREATE POLICY "crew_members_select" ON public.crew_members
  FOR SELECT USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "crew_members_insert" ON public.crew_members;
CREATE POLICY "crew_members_insert" ON public.crew_members
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "crew_members_update" ON public.crew_members;
CREATE POLICY "crew_members_update" ON public.crew_members
  FOR UPDATE USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "crew_members_delete" ON public.crew_members;
CREATE POLICY "crew_members_delete" ON public.crew_members
  FOR DELETE USING (auth.uid() = owner_id);

-- -----------------------------------------------------------------------------
-- 3. device_tokens — Reservada para o APK; RLS já configurada
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.device_tokens (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token        TEXT        NOT NULL UNIQUE,
  platform     TEXT        NULL CHECK (platform IN ('ios', 'android', 'web')),
  last_seen_at TIMESTAMPTZ NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON public.device_tokens(user_id);

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "device_tokens_select" ON public.device_tokens;
CREATE POLICY "device_tokens_select" ON public.device_tokens
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "device_tokens_insert" ON public.device_tokens;
CREATE POLICY "device_tokens_insert" ON public.device_tokens
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "device_tokens_update" ON public.device_tokens;
CREATE POLICY "device_tokens_update" ON public.device_tokens
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "device_tokens_delete" ON public.device_tokens;
CREATE POLICY "device_tokens_delete" ON public.device_tokens
  FOR DELETE USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 4. Trigger on_auth_user_created — cria profile mínimo automaticamente
--    Tolerante a falhas: erros viram WARNING para não abortar criação de auth.user.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  resolved_role       TEXT;
  resolved_creator    UUID;
  resolved_full_name  TEXT;
  resolved_phone      TEXT;
BEGIN
  IF (NEW.raw_user_meta_data ->> 'role') = 'manager' THEN
    resolved_role := 'manager';
  ELSE
    resolved_role := 'engineer';
  END IF;

  BEGIN
    resolved_creator := NULLIF(NEW.raw_user_meta_data ->> 'created_by', '')::UUID;
  EXCEPTION WHEN OTHERS THEN
    resolved_creator := NULL;
  END;

  resolved_full_name := COALESCE(NEW.raw_user_meta_data ->> 'full_name', '');
  resolved_phone     := NULLIF(NEW.raw_user_meta_data ->> 'phone', '');

  -- Coerência: manager exige created_by; se vier sem, registra como engineer
  -- (fallback defensivo). O fluxo correto sempre passa created_by.
  IF resolved_role = 'manager' AND resolved_creator IS NULL THEN
    resolved_role := 'engineer';
  END IF;

  BEGIN
    INSERT INTO public.profiles (id, full_name, phone, email, role, created_by)
    VALUES (
      NEW.id,
      resolved_full_name,
      resolved_phone,
      NEW.email,
      resolved_role,
      resolved_creator
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_auth_user: falha ao inserir profile para %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- 5. Backfill — garante profile para todo auth.user existente
--    Executa com privilégios da migration (postgres role), bypassando RLS.
-- -----------------------------------------------------------------------------
INSERT INTO public.profiles (id, full_name, phone, email, role, created_by)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data ->> 'full_name', ''),
  NULLIF(u.raw_user_meta_data ->> 'phone', ''),
  u.email,
  CASE
    WHEN (u.raw_user_meta_data ->> 'role') = 'manager'
         AND (u.raw_user_meta_data ->> 'created_by') IS NOT NULL
    THEN 'manager'
    ELSE 'engineer'
  END,
  CASE
    WHEN (u.raw_user_meta_data ->> 'role') = 'manager'
    THEN NULLIF(u.raw_user_meta_data ->> 'created_by', '')::UUID
    ELSE NULL
  END
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = u.id
);
