-- =============================================================================
-- SIMULACAO DE INSTALACAO DE POSTE PELO GERENTE (DESENVOLVIMENTO)
--
-- O gerente real marca instalacoes em campo via APK (futuro). Para validar o
-- fluxo engineer-side (canvas com pins, KPI, Realtime, galeria, notificacao
-- 'pole_installed'), use estes scripts SQL.
--
-- IDEMPOTENCIA FORTE: e o primeiro uso real de client_event_id no roadmap.
-- A coluna e UNIQUE NOT NULL; tentar inserir duas instalacoes com o mesmo
-- client_event_id falha com unique violation. O Server Action recupera essa
-- semantica em corrida de concorrencia retornando a linha existente.
--
-- Pre-requisitos:
--   1. Migration 20260506000000_andamento_obra_pole_installations.sql aplicada.
--   2. Existe uma obra com manager_id NOT NULL e o manager listado em
--      work_members(work_id, role='manager').
--
-- Como usar:
--   Substitua os placeholders abaixo:
--     <work_id>          UUID da obra
--     <manager_user_id>  UUID do usuario manager
--     <installation_id>  UUID novo da instalacao (gerado pelo APK; mesmo
--                        UUID usado no path do Storage)
--     <client_event_id>  UUID novo (idempotencia); diferente por evento
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Inspecao auxiliar
-- -----------------------------------------------------------------------------
-- SELECT w.id AS work_id, w.name, w.manager_id, p.full_name AS manager_name
--   FROM public.works w
--   LEFT JOIN public.profiles p ON p.id = w.manager_id
--  WHERE w.manager_id IS NOT NULL
--  ORDER BY w.created_at DESC;

-- -----------------------------------------------------------------------------
-- 1. Instalacao simples (sem foto)
--
-- Coordenadas (3000, 2500) ficam no centro do canvas 6000x6000 - bom para
-- validar que o pin aparece na regiao central do PDF.
-- GPS exemplo: Nao-Me-Toque, RS.
-- -----------------------------------------------------------------------------
BEGIN;

INSERT INTO public.work_pole_installations (
  id, work_id, created_by,
  x_coord, y_coord,
  gps_lat, gps_lng, gps_accuracy_meters,
  numbering, pole_type, notes,
  installed_at, client_event_id
) VALUES (
  '<installation_id>'::uuid,
  '<work_id>'::uuid,
  '<manager_user_id>'::uuid,
  3000, 2500,
  -28.4583, -52.8131, 10,
  'P-1', 'Concreto 11m', 'Poste instalado conforme projeto',
  now(),
  '<client_event_id>'::uuid
);

COMMIT;

-- -----------------------------------------------------------------------------
-- 2. Instalacao com foto principal
--
-- PASSO MANUAL OBRIGATORIO:
--   - Acesse Supabase Studio > Storage > andamento-obra
--   - Crie a pasta: <work_id>/pole-installations/<installation_id>/
--   - Faca upload manual de 1-3 fotos (ex.: foto-1.jpg)
--   - Substitua <installation_id> e <client_event_id> por NOVOS valores
-- -----------------------------------------------------------------------------
WITH new_install AS (
  INSERT INTO public.work_pole_installations (
    id, work_id, created_by,
    x_coord, y_coord,
    gps_lat, gps_lng, gps_accuracy_meters,
    numbering, pole_type, notes,
    installed_at, client_event_id
  ) VALUES (
    '<installation_id>'::uuid,
    '<work_id>'::uuid,
    '<manager_user_id>'::uuid,
    3200, 2400,
    -28.4585, -52.8128, 8,
    'P-2', 'Concreto 11m', 'Marcado com foto',
    now(),
    '<client_event_id>'::uuid
  )
  RETURNING id
)
INSERT INTO public.work_pole_installation_media (
  installation_id, work_id, kind, storage_path, mime_type, size_bytes, is_primary
)
SELECT
  new_install.id,
  '<work_id>'::uuid,
  'image',
  '<work_id>/pole-installations/' || new_install.id::text || '/foto-1.jpg',
  'image/jpeg',
  2097152,  -- ~2MB
  true
FROM new_install;

-- -----------------------------------------------------------------------------
-- 3. Idempotencia forte (T2)
--
-- Rodar a mesma instalacao duas vezes com o MESMO client_event_id. A segunda
-- execucao deve falhar com unique violation:
--   ERROR:  duplicate key value violates unique constraint
--           "work_pole_installations_client_event_unique"
-- O Server Action recordPoleInstallation captura esse erro e retorna a linha
-- existente como sucesso idempotente.
-- -----------------------------------------------------------------------------
-- Repita o INSERT do passo 1 com OS MESMOS UUIDs para reproduzir o erro.

-- -----------------------------------------------------------------------------
-- 4. Remocao soft (correcao de marcacao errada)
--
-- Apenas o criador pode remover (RLS + trigger protect_fields).
-- Status passa a 'removed'; pin some do canvas; KPI decrementa; foto persiste
-- no storage (limpeza fica em job batch, divida explicita do plano).
-- -----------------------------------------------------------------------------
UPDATE public.work_pole_installations
   SET status = 'removed',
       removed_at = now(),
       removed_by = '<manager_user_id>'::uuid,
       notes = COALESCE(notes,'') || ' [Removido: marcacao errada]'
 WHERE id = '<installation_id>'::uuid;

-- -----------------------------------------------------------------------------
-- 5. Verificacoes
-- -----------------------------------------------------------------------------
-- 5.1. Instalacoes ativas da obra:
SELECT id, numbering, x_coord, y_coord, status, installed_at, removed_at
  FROM public.work_pole_installations
 WHERE work_id = '<work_id>'::uuid
 ORDER BY installed_at DESC;

-- 5.2. Midia primaria das instalacoes ativas:
SELECT i.id, i.numbering, m.storage_path, m.is_primary
  FROM public.work_pole_installations i
  LEFT JOIN public.work_pole_installation_media m
    ON m.installation_id = i.id
 WHERE i.work_id = '<work_id>'::uuid
   AND i.status = 'installed'
 ORDER BY i.installed_at DESC, m.is_primary DESC;

-- 5.3. Notificacoes 'pole_installed':
SELECT kind, title, body, created_at
  FROM public.notifications
 WHERE work_id = '<work_id>'::uuid
   AND kind = 'pole_installed'
 ORDER BY created_at DESC
 LIMIT 10;

-- 5.4. last_activity_at:
SELECT id, name, last_activity_at FROM public.works WHERE id = '<work_id>'::uuid;

-- 5.5. KPI rapido: instalados x removidos.
SELECT status, count(*)
  FROM public.work_pole_installations
 WHERE work_id = '<work_id>'::uuid
 GROUP BY status;

-- -----------------------------------------------------------------------------
-- 6. Testes negativos (esperam falhar)
-- -----------------------------------------------------------------------------

-- 6.1. T11 - CHECK do banco rejeita coordenada > 6000:
-- INSERT INTO public.work_pole_installations (
--   work_id, created_by, x_coord, y_coord, installed_at, client_event_id
-- ) VALUES (
--   '<work_id>'::uuid, '<manager_user_id>'::uuid,
--   7000, 0, now(), gen_random_uuid()
-- );
-- ESPERADO: ERRO do CHECK work_pole_installations_x_coord_check.

-- 6.2. T10 - protect_fields bloqueia mudanca em coordenadas:
-- UPDATE public.work_pole_installations SET x_coord = 4000
--  WHERE id = '<installation_id>'::uuid;
-- ESPERADO: ERRO 'Colunas imutaveis nao podem ser alteradas...'.

-- 6.3. T9 - Engineer (nao manager) bloqueado por RLS+trigger:
-- (rodar logado como engineer no SQL Editor)
-- UPDATE public.work_pole_installations SET status='removed'
--  WHERE id='<installation_id>'::uuid;
-- ESPERADO: 0 linhas afetadas (RLS) ou erro do trigger.
