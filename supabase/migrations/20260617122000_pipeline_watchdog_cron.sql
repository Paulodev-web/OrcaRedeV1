-- Agendamentos do watchdog (idempotente: remove antes de reagendar).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'extraction-watchdog') then
    perform cron.unschedule('extraction-watchdog');
  end if;
  if exists (select 1 from cron.job where jobname = 'pgnet-response-gc') then
    perform cron.unschedule('pgnet-response-gc');
  end if;
end $$;

-- A cada 1 min: dirige jobs travados (re-invoca Edge / chama /continue / marca erro).
select cron.schedule(
  'extraction-watchdog',
  '* * * * *',
  $$ select public.drive_stuck_extraction_jobs(); $$
);

-- A cada 10 min: limpa respostas do pg_net (evita crescimento ilimitado de net._http_response,
-- que pode travar os workers do pg_net e desligar silenciosamente o watchdog).
select cron.schedule(
  'pgnet-response-gc',
  '*/10 * * * *',
  $$ delete from net._http_response where created < now() - interval '1 hour'; $$
);
