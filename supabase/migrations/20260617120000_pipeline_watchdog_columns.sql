-- Watchdog server-side (pg_cron) para o pipeline de extração/conciliação.
-- Move jobs travados para frente independente do navegador aberto.
-- Esta migração é aditiva e inerte até o watchdog (migração seguinte) rodar.

-- Colunas auxiliares do watchdog:
--   last_dispatch_at   : último disparo (re-invoke da Edge ou /continue) feito pelo watchdog.
--                        Cooldown >= 180s entre disparos do mesmo job (> teto da Edge ~150s)
--                        impede sobreposição de invocações => sem extração duplicada.
--   watchdog_attempts  : contador de disparos; cap de segurança contra runaway.
alter table public.extraction_jobs
  add column if not exists last_dispatch_at timestamptz,
  add column if not exists watchdog_attempts integer not null default 0;

-- Scan por minuto fica O(jobs travados), não full table scan.
create index if not exists idx_extraction_jobs_stuck
  on public.extraction_jobs (updated_at)
  where status = 'processing';

-- Observabilidade: cada disparo do watchdog grava uma linha aqui (join futuro com
-- net._http_response via http_request_id revela 401/URL errada/segredo ausente).
create table if not exists public.watchdog_log (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  job_id uuid,
  branch text,
  http_request_id bigint
);

create index if not exists idx_watchdog_log_ran_at on public.watchdog_log (ran_at desc);

-- Sem policies: acessível apenas via service_role / postgres (o watchdog).
-- Não exposto à API pública (PostgREST) para roles anon/authenticated.
alter table public.watchdog_log enable row level security;
