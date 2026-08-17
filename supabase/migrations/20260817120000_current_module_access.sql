-- =============================================================================
-- current_module_access() — colapsa 3 idas ao banco em 1 por navegação
--
--   `getModuleAccess()` (src/lib/auth/moduleAccess.ts) roda em TODA página e
--   layout do sistema, e fazia três consultas EM SÉRIE, cada uma esperando a
--   anterior:
--
--     1. rpc('current_org_id')            → descobre a org ativa
--     2. rpc('is_org_admin', { org_id })  → precisa do resultado de (1)
--     3. select em module_permissions     → precisa do resultado de (1)
--
--   Medido contra esta produção, o piso de uma requisição PostgREST é de
--   ~250ms (o banco executa em ~37ms; o resto é ida e volta de rede). Três em
--   série custavam ~500-750ms ANTES de a página buscar qualquer dado próprio —
--   em todo clique, no sistema inteiro. Era a maior parte do "clica e demora
--   pra acontecer" que sobrou depois de o auth deixar de bater na rede
--   (`getClaims()` em src/lib/supabaseServer.ts e src/proxy.ts).
--
--   As três respostas dependem só de quem é o usuário, e o banco já tem tudo
--   em mãos numa única execução. Nada aqui muda a REGRA de acesso — é a mesma
--   lógica, no mesmo lugar, numa chamada só.
--
--   SECURITY INVOKER de propósito, não DEFINER: a leitura de
--   `module_permissions` continua passando pela RLS da tabela, cuja policy de
--   SELECT já permite `auth.uid() = user_id`. Marcar como DEFINER aqui
--   removeria esse controle sem necessidade nenhuma — a função não precisa de
--   privilégio que o próprio usuário não tenha. `current_org_id()` e
--   `is_org_admin()` seguem DEFINER como já eram, e continuam funcionando
--   normalmente quando chamadas daqui.
--
--   Sem `is_platform_admin()` explícito: ele já está embutido dentro de
--   `current_org_id()` e de `is_org_admin()`. Reimplementar a regra aqui seria
--   duplicar lógica de segurança em dois lugares — o jeito garantido de elas
--   divergirem com o tempo.
--
--   ⚠ Ordem: depois de 20260811130000_module_permission_enforcement — depende
--   de `module_permissions`, `is_org_admin()` e `current_org_id()` prontos.
-- =============================================================================

create or replace function public.current_module_access()
returns jsonb
language sql
stable
security invoker
set search_path to 'public'
as $$
  with ctx as (
    select public.current_org_id() as org_id
  )
  select jsonb_build_object(
    'org_id',   ctx.org_id,
    'is_admin', coalesce(public.is_org_admin(ctx.org_id), false),
    -- `coalesce` para '[]': sem linha nenhuma o `jsonb_agg` devolve NULL, e a
    -- aplicação trataria isso como "falhou" em vez de "esta pessoa não tem
    -- permissão para módulo nenhum" — que é uma resposta legítima e, desde a
    -- 20260811130000, significa justamente "sem acesso".
    'permissions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'module_key', mp.module_key,
        'can_view',   mp.can_view,
        'can_edit',   mp.can_edit
      ))
      from public.module_permissions mp
      where mp.org_id = ctx.org_id
        and mp.user_id = auth.uid()
    ), '[]'::jsonb)
  )
  from ctx;
$$;

comment on function public.current_module_access() is
  'Org ativa + flag de admin + permissoes de modulo do usuario corrente, em UMA chamada. '
  'Substitui a cadeia sequencial current_org_id() -> is_org_admin() -> select module_permissions, '
  'que custava 3 round-trips de rede por navegacao. Mesma regra de acesso, mesma RLS.';

-- Só `authenticated`. `anon` fica de fora de propósito, e o efeito prático foi
-- verificado chamando a função sem sessão: como ela é SECURITY INVOKER, o
-- anônimo esbarra em `permission denied for function current_org_id` (42501) —
-- ou seja, não vaza nada. A aplicação nunca chega nesse ponto: `getModuleAccess`
-- devolve EMPTY_STATE antes de chamar o RPC quando não há usuário.
grant execute on function public.current_module_access() to authenticated;
