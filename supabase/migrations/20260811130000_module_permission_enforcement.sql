-- =============================================================================
-- module_permissions passa a ser fiscalizada — inverte a regra da ausência
--
--   20260803124000_module_permissions.sql decidiu, de propósito:
--
--     "Ausência de linha NÃO significa 'sem acesso'. […] para que ligar a
--      feature não tranque ninguém para fora de um sistema que já está em
--      produção."
--
--   Esta migration inverte essa regra: a partir de agora, ausência de linha
--   PARA UM MÓDULO VALE COMO "SEM ACESSO" — a aplicação passou a esconder o
--   módulo da navegação e a barrar a URL direta
--   (src/lib/auth/moduleAccess.ts, src/contexts/ModuleAccessContext.tsx).
--
--   A inversão só é segura porque esta mesma migration SEMEIA acesso total a
--   quem já é membro ativo de alguma organização, antes de qualquer código
--   passar a fiscalizar. Ninguém que já usa o sistema perde algo que já tinha
--   — a restrição só passa a valer para quem for cadastrado dali em diante, ou
--   para quem um admin explicitamente restringir depois.
--
--   owner/admin da organização (e admin de plataforma) continuam vendo tudo
--   SEM depender de linha nenhuma — é o `is_org_admin()` já embutido em
--   `getModuleAccess()`. Sem isso, um admin conseguiria se trancar para fora da
--   própria tela de permissões.
--
--   ⚠ Ordem: depois de 20260807140000_org_rls_flip e 20260811120000
--   (org_shared_uniques) — precisa de `org_members`/`is_org_admin` prontos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Portão
-- -----------------------------------------------------------------------------
DO $do$
BEGIN
  IF to_regclass('public.module_permissions') IS NULL THEN
    RAISE EXCEPTION 'module_permissions ausente. Aplique 20260803124000 primeiro.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='module_permissions' AND column_name='org_id'
  ) THEN
    RAISE EXCEPTION 'module_permissions.org_id ausente. Aplique a Fase 2 (org_id_backfill) primeiro.';
  END IF;
END
$do$;

-- -----------------------------------------------------------------------------
-- 1. Seed — acesso total a quem já é membro ativo, para nenhum módulo faltar
--
--    Valores de `module_key` = `AppModuleId` (src/components/layout/modules.tsx),
--    não os do comentário original da coluna (ver seção 3) — é o registro que
--    o código de fato usa, e as 3 linhas já existentes no banco (criadas pela
--    tela em 2026-08-11) já estão nesse formato.
--
--    `granted_by = NULL`: não foi ninguém que concedeu, é o baseline anterior à
--    fiscalização existir. `ON CONFLICT DO NOTHING` preserva qualquer linha que
--    já exista — inclusive as 3 de teste — em vez de sobrescrever.
-- -----------------------------------------------------------------------------
INSERT INTO public.module_permissions (user_id, org_id, module_key, can_view, can_edit, granted_by)
SELECT m.user_id, m.org_id, mod.module_key, true, true, NULL
FROM public.org_members m
CROSS JOIN (
  VALUES
    ('orca-rede'), ('propostas'), ('portal-engenheiro'),
    ('andamento-obra'), ('fornecedores'), ('precificacao'), ('configuracoes')
) AS mod(module_key)
WHERE m.is_active
ON CONFLICT (user_id, module_key) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. Verificação — todo membro ativo precisa sair daqui com os 7 módulos
--
--    Informativo, não aborta: uma linha faltando aqui não corrompe nada (o
--    módulo correspondente simplesmente fica invisível para a pessoa), mas é
--    o tipo de coisa que vale saber antes de aplicar em produção.
-- -----------------------------------------------------------------------------
DO $do$
DECLARE v_relatorio TEXT := ''; r RECORD;
BEGIN
  FOR r IN
    SELECT m.user_id, m.org_id, count(mp.module_key) AS linhas
    FROM public.org_members m
    LEFT JOIN public.module_permissions mp
      ON mp.user_id = m.user_id AND mp.org_id = m.org_id
    WHERE m.is_active
    GROUP BY m.user_id, m.org_id
    HAVING count(mp.module_key) < 7
  LOOP
    v_relatorio := v_relatorio || format('  user %s / org %s: %s de 7%s',
      r.user_id, r.org_id, r.linhas, chr(10));
  END LOOP;

  IF v_relatorio <> '' THEN
    RAISE NOTICE E'Membro(s) sem todos os módulos semeados (confira antes de restringir alguém):\n%', v_relatorio;
  ELSE
    RAISE NOTICE 'OK: todo membro ativo tem os 7 módulos semeados.';
  END IF;
END
$do$;

-- -----------------------------------------------------------------------------
-- 3. Documentação — o schema não pode continuar dizendo o oposto do código
-- -----------------------------------------------------------------------------
COMMENT ON TABLE public.module_permissions IS
  'Permissão explícita por módulo. Camada nova, ortogonal a profiles.role — o '
  'APK não lê esta tabela. Desde 20260811130000: ausência de linha PARA UM '
  'MÓDULO = sem acesso a ele — src/lib/auth/moduleAccess.ts esconde da '
  'navegação e barra a URL direta. owner/admin da org (e admin de plataforma) '
  'sempre veem tudo, independente de linha (is_org_admin()).';

COMMENT ON COLUMN public.module_permissions.module_key IS
  'Valores = AppModuleId (src/components/layout/modules.tsx): orca-rede, '
  'propostas, portal-engenheiro, andamento-obra, fornecedores, precificacao, '
  'configuracoes. Sem CHECK: módulo novo não deve exigir migration. Note que '
  'difere do conjunto documentado aqui antes de 20260811130000 '
  '(orcamentos/suprimentos/…) — o código sempre usou o AppModuleId; o '
  'comentário antigo é que estava errado.';
