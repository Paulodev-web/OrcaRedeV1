-- Watchdog server-side: extensões + função que dirige jobs travados.
-- pg_net  : HTTP assíncrono a partir do Postgres (re-invoca Edge / chama /continue).
-- pg_cron : agendador (a migração seguinte agenda 1x/min).
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Segredo lido do Vault em runtime (NUNCA hardcoded/commitado):
--   watchdog_service_role_key = mesmo valor de SUPABASE_SERVICE_ROLE_KEY (aceito por
--   /api/process-pdfs/continue e pela Edge). Crie com:
--     select vault.create_secret('<SERVICE_ROLE_KEY>', 'watchdog_service_role_key');
-- Enquanto o segredo não existir, a função apenas registra um log e não faz nada.
create or replace function public.drive_stuck_extraction_jobs()
returns void
language plpgsql
security definer
set search_path = public, net, vault, extensions
as $$
declare
  v_key text;
  v_edge_url text := 'https://ubqyjbtjkzxlexbuxoum.supabase.co/functions/v1/extract-supplier-pdf';
  v_continue_url text := 'https://orcaredeteste.vercel.app/api/process-pdfs/continue';
  r record;
  v_req bigint;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'watchdog_service_role_key'
  limit 1;

  if v_key is null then
    raise log '[watchdog] segredo watchdog_service_role_key ausente no Vault; nada a fazer';
    return;
  end if;

  for r in
    select *
    from public.extraction_jobs
    where status = 'processing'
      and updated_at < now() - interval '120 seconds'         -- inativo (sem escrita) por >120s
      and (last_dispatch_at is null or last_dispatch_at < now() - interval '180 seconds')
      and watchdog_attempts < 60                              -- backstop anti-runaway
    order by updated_at asc
    limit 20                                                  -- fan-out limitado por tick
    for update skip locked
  loop
    if r.quote_id is null and coalesce(r.pipeline_phase, 'extract') = 'extract' then
      -- Fase de extração, sem cotação criada.
      if r.started_at < now() - interval '15 minutes' then
        -- Extração realmente expirou (todas as tentativas falharam): marca erro server-side.
        update public.extraction_jobs
          set status = 'error',
              error_message = 'Processamento expirou (extração não concluída). Use "Tentar processar novamente" ou exclua.',
              finished_at = now()
          where id = r.id and status = 'processing';
        insert into public.watchdog_log (job_id, branch) values (r.id, 'extract_timeout');

      elsif r.started_at < now() - interval '240 seconds' then
        -- Re-invoca a Edge. 240s > teto de wall-clock da Edge (~150s) => nenhuma
        -- extração concorrente em voo => impossível duplicar cotação SEM tocar a Edge.
        -- O cooldown de 180s (last_dispatch_at) impede sobreposição entre re-invokes.
        update public.extraction_jobs
          set last_dispatch_at = now(), watchdog_attempts = watchdog_attempts + 1
          where id = r.id;
        select net.http_post(
          url := v_edge_url,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_key
          ),
          body := jsonb_build_object(
            'job_id', r.id,
            'chain_token', v_key,
            'pipeline_continue_url', v_continue_url
          )
        ) into v_req;
        insert into public.watchdog_log (job_id, branch, http_request_id) values (r.id, 'extract', v_req);
      end if;
      -- else: jovem demais (<240s); a Edge inicial ainda pode estar rodando. Não toca.

    else
      -- Tem cotação (post_extract / match / finalize): a cadeia /continue quebrou.
      -- Concorrência de lote é neutralizada pelo lock otimista em match_batch_index.
      update public.extraction_jobs
        set last_dispatch_at = now(), watchdog_attempts = watchdog_attempts + 1
        where id = r.id;
      select net.http_post(
        url := v_continue_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_key
        ),
        body := jsonb_build_object('job_id', r.id)
      ) into v_req;
      insert into public.watchdog_log (job_id, branch, http_request_id) values (r.id, 'continue', v_req);
    end if;
  end loop;
end;
$$;

-- Função privilegiada (lê Vault, bypassa RLS): só o owner/cron a executa.
revoke all on function public.drive_stuck_extraction_jobs() from public;
