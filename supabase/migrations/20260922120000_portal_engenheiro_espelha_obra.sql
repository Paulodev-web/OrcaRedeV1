-- ============================================================================
-- Portal do Engenheiro deixa de ser ilha e vira espelho do Andamento de Obra.
--
-- O problema, medido em produção: a obra ACMA - ILUMINAÇÃO tem 24 postes de
-- projeto e 24 instalações registradas pelo gerente no APK, e o tracking que o
-- cliente abre tem ZERO postes. O campo trabalhou, o portal não soube.
--
-- O elo entre os dois lados sempre existiu, só nunca foi percorrido: os dois
-- descendem de `budget_posts`. `work_project_posts.source_post_id` e
-- `tracked_posts.original_post_id` apontam para a mesma linha do orçamento, com
-- a mesma coordenada. Casar é junção, não heurística.
--
-- A regra nova, em uma frase: o poste levantado em campo acende na hora no
-- canvas interno (como já era, e a doc de arquitetura defende), mas só
-- atravessa para o portal do cliente depois que o engenheiro aprova. O portal
-- é superfície externa; aprovar é o portão.
--
-- Dono do dado: daqui pra frente `tracked_posts` de tracking espelhado é
-- escrito SÓ por este código. As linhas do espelho são marcadas por
-- `client_id` com prefixo 'orcamento:' ou 'campo:', e nenhuma função aqui
-- encosta em linha sem esse prefixo. Tracking legado, marcado na mão pelo
-- engenheiro ao longo dos anos, continua intocado.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. O vínculo obra <-> tracking
-- ---------------------------------------------------------------------------

ALTER TABLE public.work_trackings
  ADD COLUMN IF NOT EXISTS work_id uuid REFERENCES public.works(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.work_trackings.work_id IS
  'Obra do Andamento de Obra que alimenta este tracking. Preenchido = espelho '
  '(postes e progresso são derivados, o engenheiro não marca poste na mão). '
  'NULL = tracking legado, editável à mão como sempre foi.';

CREATE UNIQUE INDEX IF NOT EXISTS work_trackings_work_id_key
  ON public.work_trackings (work_id)
  WHERE work_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. A aprovação na instalação
-- ---------------------------------------------------------------------------

ALTER TABLE public.work_pole_installations
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id);

COMMENT ON COLUMN public.work_pole_installations.approved_at IS
  'Quando o engenheiro liberou este poste para o portal do cliente. NULL = '
  'registrado em campo e visível internamente, ainda não publicado.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'work_pole_installations_approval_pair'
  ) THEN
    ALTER TABLE public.work_pole_installations
      ADD CONSTRAINT work_pole_installations_approval_pair
      CHECK ((approved_at IS NULL) = (approved_by IS NULL));
  END IF;
END $$;

-- A fila do engenheiro: "o que o campo levantou e ainda não publiquei".
CREATE INDEX IF NOT EXISTS work_pole_installations_pending_approval_idx
  ON public.work_pole_installations (work_id, installed_at DESC)
  WHERE approved_at IS NULL AND status = 'installed';

CREATE INDEX IF NOT EXISTS work_pole_installations_approved_idx
  ON public.work_pole_installations (work_id)
  WHERE approved_at IS NOT NULL AND status = 'installed';

-- ---------------------------------------------------------------------------
-- 3. Quem pode aprovar
--
-- A trava de escrita de `work_pole_installations` foi desenhada para um dono
-- só: o gerente que criou a linha. O engenheiro nunca escrevia nada, e tanto a
-- policy de UPDATE quanto o trigger `protect_fields` diziam isso.
--
-- A aprovação é a primeira escrita do engenheiro nessa tabela. Ela entra como
-- caminho próprio e estreito: só as duas colunas de aprovação mudam, mais nada
-- junto, e só o engenheiro da obra passa.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS work_pole_installations_update_approval ON public.work_pole_installations;
CREATE POLICY work_pole_installations_update_approval
  ON public.work_pole_installations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.work_members wm
       WHERE wm.work_id = work_pole_installations.work_id
         AND wm.user_id = auth.uid()
         AND wm.role = 'engineer'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.work_members wm
       WHERE wm.work_id = work_pole_installations.work_id
         AND wm.user_id = auth.uid()
         AND wm.role = 'engineer'
    )
  );

CREATE OR REPLACE FUNCTION public.work_pole_installations_protect_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_role     TEXT;
  v_approval BOOLEAN;
BEGIN
  -- Campos absolutamente imutaveis, para todo mundo.
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.work_id IS DISTINCT FROM OLD.work_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.x_coord IS DISTINCT FROM OLD.x_coord
     OR NEW.y_coord IS DISTINCT FROM OLD.y_coord
     OR NEW.gps_lat IS DISTINCT FROM OLD.gps_lat
     OR NEW.gps_lng IS DISTINCT FROM OLD.gps_lng
     OR NEW.gps_accuracy_meters IS DISTINCT FROM OLD.gps_accuracy_meters
     OR NEW.installed_at IS DISTINCT FROM OLD.installed_at
     OR NEW.client_event_id IS DISTINCT FROM OLD.client_event_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Colunas imutaveis nao podem ser alteradas em work_pole_installations';
  END IF;

  v_approval := NEW.approved_at IS DISTINCT FROM OLD.approved_at
             OR NEW.approved_by IS DISTINCT FROM OLD.approved_by;

  -- ---- Caminho do engenheiro: publicar ou despublicar no portal do cliente.
  IF v_approval THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.numbering IS DISTINCT FROM OLD.numbering
       OR NEW.pole_type IS DISTINCT FROM OLD.pole_type
       OR NEW.notes IS DISTINCT FROM OLD.notes
       OR NEW.project_post_id IS DISTINCT FROM OLD.project_post_id
       OR NEW.removed_at IS DISTINCT FROM OLD.removed_at
       OR NEW.removed_by IS DISTINCT FROM OLD.removed_by
    THEN
      RAISE EXCEPTION 'Aprovacao nao pode vir junto de outra alteracao';
    END IF;

    SELECT role INTO v_role
      FROM public.work_members
     WHERE work_id = NEW.work_id
       AND user_id = auth.uid();

    IF v_role IS DISTINCT FROM 'engineer' THEN
      RAISE EXCEPTION 'Apenas o engenheiro responsavel aprova instalacoes';
    END IF;

    IF NEW.approved_at IS NOT NULL AND NEW.approved_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'approved_by deve ser o engenheiro que aprovou';
    END IF;

    IF OLD.status <> 'installed' THEN
      RAISE EXCEPTION 'Instalacao removida nao se aprova';
    END IF;

    RETURN NEW;
  END IF;

  -- ---- Caminho do gerente, inalterado.
  IF auth.uid() IS NULL OR auth.uid() <> OLD.created_by THEN
    RAISE EXCEPTION 'Somente o gerente que criou a instalacao pode atualiza-la';
  END IF;

  SELECT role INTO v_role
    FROM public.work_members
   WHERE work_id = NEW.work_id
     AND user_id = auth.uid();

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Usuario nao e membro da obra';
  END IF;
  IF v_role <> 'manager' THEN
    RAISE EXCEPTION 'Apenas o gerente pode atualizar instalacoes';
  END IF;

  IF OLD.status = 'installed' AND NEW.status = 'removed' THEN
    IF NEW.removed_at IS NULL THEN
      RAISE EXCEPTION 'removed_at obrigatorio ao remover instalacao';
    END IF;
    IF NEW.removed_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'removed_by deve ser o gerente que removeu';
    END IF;
  ELSIF OLD.status = NEW.status THEN
    IF NEW.removed_at IS DISTINCT FROM OLD.removed_at
       OR NEW.removed_by IS DISTINCT FROM OLD.removed_by
    THEN
      RAISE EXCEPTION 'removed_at/removed_by so podem ser atribuidos ao remover';
    END IF;
  ELSE
    RAISE EXCEPTION 'Transicao invalida: % -> %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. O rótulo do poste, uma regra só
--
-- `sync_work_project_from_budget` já traduzia counter/custom_name/name no
-- rótulo que o gerente vê. O portal precisa do MESMO rótulo, senão o poste 07
-- do canvas do engenheiro vira "Poste" no portal do cliente. Extraído para
-- função para não existir em duas cópias.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.budget_post_numbering(
  p_custom_name text,
  p_name        text,
  p_counter     integer
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN COALESCE(p_counter, 0) > 0 THEN
      CASE
        WHEN NULLIF(btrim(p_custom_name), '') IS NOT NULL
          THEN btrim(p_custom_name) || ' ' || lpad(p_counter::text, 2, '0')
        ELSE lpad(p_counter::text, 2, '0')
      END
    WHEN NULLIF(btrim(p_custom_name), '') IS NOT NULL THEN btrim(p_custom_name)
    ELSE NULLIF(btrim(p_name), '')
  END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Garantir o tracking da obra
--
-- Três caminhos, nessa ordem: já ligado; existe um tracking órfão do mesmo
-- orçamento (é o caso da ACMA, criada nos dois lados) e ele é adotado em vez
-- de duplicar o portal do cliente; não existe nenhum e é criado.
--
-- A trava do meio importa: tracking que o engenheiro marcou na mão NÃO é
-- adotado. `Loteamento Sol Poente` tem 170 postes pintados a mão ao longo de
-- meses; semear os postes do orçamento por cima mostraria a rede em duplicata
-- para o cliente. Obra antiga fica como está.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_work_tracking(p_work_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_work        RECORD;
  v_budget      RECORD;
  v_tracking_id uuid;
  v_legado      int;
  v_public_id   text;
  v_status      text;
BEGIN
  SELECT id, name, client_name, budget_id, status, started_at, expected_end_at, completed_at
    INTO v_work
    FROM works
   WHERE id = p_work_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Obra % nao encontrada', p_work_id;
  END IF;

  -- Obra sem orçamento não tem planta nem postes de projeto: não há portal do
  -- cliente para montar.
  IF v_work.budget_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id, project_name, client_name, city, plan_image_url
    INTO v_budget
    FROM budgets
   WHERE id = v_work.budget_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_tracking_id FROM work_trackings WHERE work_id = p_work_id;

  IF v_tracking_id IS NULL THEN
    SELECT id INTO v_tracking_id
      FROM work_trackings
     WHERE budget_id = v_work.budget_id
       AND work_id IS NULL
     ORDER BY created_at ASC
     LIMIT 1;

    IF v_tracking_id IS NOT NULL THEN
      SELECT count(*) INTO v_legado
        FROM tracked_posts tp
       WHERE tp.tracking_id = v_tracking_id
         AND (tp.client_id IS NULL
              OR (tp.client_id NOT LIKE 'orcamento:%' AND tp.client_id NOT LIKE 'campo:%'));

      IF v_legado > 0 THEN
        -- Portal feito a mão. Não se mexe.
        RETURN NULL;
      END IF;

      UPDATE work_trackings SET work_id = p_work_id WHERE id = v_tracking_id;
    END IF;
  END IF;

  IF v_tracking_id IS NULL THEN
    -- Mesmo formato que o Portal do Engenheiro sempre gerou, para o link
    -- público continuar reconhecível: /obra/tracking-<epoch ms>.
    v_public_id := 'tracking-' || (extract(epoch FROM clock_timestamp()) * 1000)::bigint::text;

    INSERT INTO work_trackings (budget_id, work_id, name, status, public_id)
    VALUES (v_work.budget_id, p_work_id, v_work.name, 'Planejado', v_public_id)
    RETURNING id INTO v_tracking_id;
  END IF;

  v_status := CASE v_work.status
                WHEN 'planned'     THEN 'Planejado'
                WHEN 'in_progress' THEN 'Em Andamento'
                WHEN 'paused'      THEN 'Pausado'
                WHEN 'completed'   THEN 'Concluído'
                ELSE NULL
              END;

  UPDATE work_trackings t
     SET name                 = COALESCE(NULLIF(btrim(v_work.name), ''), v_budget.project_name, t.name),
         client_name          = COALESCE(v_work.client_name, v_budget.client_name),
         city                 = v_budget.city,
         plan_image_url       = v_budget.plan_image_url,
         start_date           = v_work.started_at,
         estimated_completion = v_work.expected_end_at,
         actual_completion    = (v_work.completed_at AT TIME ZONE 'America/Sao_Paulo')::date,
         -- Obra cancelada não tem status correspondente no portal: fica como
         -- estava, e o engenheiro decide o que mostrar ao cliente.
         status               = COALESCE(v_status, t.status),
         updated_at           = now()
   WHERE t.id = v_tracking_id;

  RETURN v_tracking_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6. O espelho
--
-- Roda inteiro e é idempotente: pode ser chamada na importação, a cada
-- aprovação, ou de novo amanhã, que converge para o mesmo estado.
--
-- Coordenadas: `tracked_posts` vive no espaço do orçamento (é o mesmo
-- `CanvasVisual` do OrçaRede que desenha o portal), enquanto
-- `work_pole_installations` vive no quadro 6000x6000 do APK. Para poste de
-- projeto não há conversão nenhuma: a coordenada vem direto de `budget_posts`.
-- Para poste que o campo levantou fora do projeto, aplica-se a inversa da
-- transformada raster gravada no snapshot (identidade quando a planta é PDF).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_work_tracking_from_work(p_work_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tracking_id uuid;
  v_budget_id   uuid;
  v_scale       numeric := 1;
  v_off_x       numeric := 0;
  v_off_y       numeric := 0;
  v_semeados    int := 0;
  v_acesos      int := 0;
  v_apagados    int := 0;
  v_campo       int := 0;
  v_removidos   int := 0;
BEGIN
  -- SECURITY DEFINER escreve por cima da RLS de work_trackings, então a
  -- autorização é feita aqui na mão. auth.uid() nulo é service role (a
  -- importação de obra e o backfill), que já passou pela sua própria porta.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM work_members wm
     WHERE wm.work_id = p_work_id
       AND wm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Sem acesso a obra %', p_work_id;
  END IF;

  v_tracking_id := ensure_work_tracking(p_work_id);
  IF v_tracking_id IS NULL THEN
    RETURN jsonb_build_object(
      'skipped',
      'sem portal espelhavel: obra sem orcamento de origem, ou portal legado marcado a mao'
    );
  END IF;

  SELECT budget_id INTO v_budget_id FROM works WHERE id = p_work_id;

  SELECT COALESCE((s.plan_geometry->'rasterTransform'->>'scale')::numeric, 1),
         COALESCE((s.plan_geometry->'rasterTransform'->>'offsetX')::numeric, 0),
         COALESCE((s.plan_geometry->'rasterTransform'->>'offsetY')::numeric, 0)
    INTO v_scale, v_off_x, v_off_y
    FROM work_project_snapshot s
   WHERE s.work_id = p_work_id;

  IF v_scale IS NULL OR v_scale = 0 THEN
    v_scale := 1;
  END IF;

  -- 6.1. Todo poste do orçamento existe no portal, cinza até acender.
  INSERT INTO tracked_posts (
    tracking_id, client_id, original_post_id, name, custom_name,
    x_coord, y_coord, status
  )
  SELECT v_tracking_id,
         'orcamento:' || bp.id::text,
         bp.id,
         COALESCE(budget_post_numbering(bp.custom_name, bp.name, bp.counter), 'Poste'),
         NULLIF(btrim(bp.custom_name), ''),
         bp.x_coord,
         bp.y_coord,
         'Pendente'
    FROM budget_posts bp
   WHERE bp.budget_id = v_budget_id
  ON CONFLICT (tracking_id, client_id) WHERE client_id IS NOT NULL
  DO UPDATE SET
    original_post_id = EXCLUDED.original_post_id,
    name             = EXCLUDED.name,
    custom_name      = EXCLUDED.custom_name,
    x_coord          = EXCLUDED.x_coord,
    y_coord          = EXCLUDED.y_coord,
    updated_at       = now();
  GET DIAGNOSTICS v_semeados = ROW_COUNT;

  -- 6.2. Aprovado pelo engenheiro acende.
  UPDATE tracked_posts tp
     SET status            = 'Concluído',
         installation_date = COALESCE(tp.installation_date, a.dia),
         completion_date   = a.dia,
         updated_at        = now()
    FROM (
      SELECT pp.source_post_id,
             (min(i.installed_at) AT TIME ZONE 'America/Sao_Paulo')::date AS dia
        FROM work_pole_installations i
        JOIN work_project_posts pp ON pp.id = i.project_post_id
       WHERE i.work_id = p_work_id
         AND i.status = 'installed'
         AND i.approved_at IS NOT NULL
         AND pp.source_post_id IS NOT NULL
       GROUP BY pp.source_post_id
    ) a
   WHERE tp.tracking_id = v_tracking_id
     AND tp.client_id LIKE 'orcamento:%'
     AND tp.original_post_id = a.source_post_id
     AND tp.status IS DISTINCT FROM 'Concluído';
  GET DIAGNOSTICS v_acesos = ROW_COUNT;

  -- 6.3. Aprovação revogada ou marcação removida em campo: apaga de volta.
  UPDATE tracked_posts tp
     SET status          = 'Pendente',
         completion_date = NULL,
         updated_at      = now()
   WHERE tp.tracking_id = v_tracking_id
     AND tp.client_id LIKE 'orcamento:%'
     AND tp.status = 'Concluído'
     AND NOT EXISTS (
       SELECT 1
         FROM work_pole_installations i
         JOIN work_project_posts pp ON pp.id = i.project_post_id
        WHERE i.work_id = p_work_id
          AND i.status = 'installed'
          AND i.approved_at IS NOT NULL
          AND pp.source_post_id = tp.original_post_id
     );
  GET DIAGNOSTICS v_apagados = ROW_COUNT;

  -- 6.4. Poste que o campo levantou fora do projeto, uma vez aprovado, entra
  -- no portal já aceso. `original_post_id` aponta para a própria instalação:
  -- a coluna não tem FK e não existe poste de orçamento para referenciar.
  INSERT INTO tracked_posts (
    tracking_id, client_id, original_post_id, name,
    x_coord, y_coord, status, installation_date, completion_date, notes
  )
  SELECT v_tracking_id,
         'campo:' || i.id::text,
         i.id,
         COALESCE(NULLIF(btrim(i.numbering), ''), 'Poste de campo'),
         round(GREATEST((i.x_coord - v_off_x) / v_scale, 0), 2),
         round(GREATEST((i.y_coord - v_off_y) / v_scale, 0), 2),
         'Concluído',
         (i.installed_at AT TIME ZONE 'America/Sao_Paulo')::date,
         (i.installed_at AT TIME ZONE 'America/Sao_Paulo')::date,
         i.notes
    FROM work_pole_installations i
   WHERE i.work_id = p_work_id
     AND i.status = 'installed'
     AND i.approved_at IS NOT NULL
     AND i.project_post_id IS NULL
  ON CONFLICT (tracking_id, client_id) WHERE client_id IS NOT NULL
  DO UPDATE SET
    name            = EXCLUDED.name,
    x_coord         = EXCLUDED.x_coord,
    y_coord         = EXCLUDED.y_coord,
    status          = 'Concluído',
    completion_date = EXCLUDED.completion_date,
    notes           = EXCLUDED.notes,
    is_visible      = true,
    updated_at      = now();
  GET DIAGNOSTICS v_campo = ROW_COUNT;

  -- 6.5. Espelho não guarda o que a origem não tem mais: poste de campo
  -- removido ou desaprovado some, poste de orçamento apagado some se nunca
  -- acendeu (se acendeu, fica como divergência, mesma regra do canvas).
  DELETE FROM tracked_posts tp
   WHERE tp.tracking_id = v_tracking_id
     AND tp.client_id LIKE 'campo:%'
     AND NOT EXISTS (
       SELECT 1 FROM work_pole_installations i
        WHERE i.id = tp.original_post_id
          AND i.work_id = p_work_id
          AND i.status = 'installed'
          AND i.approved_at IS NOT NULL
     );
  GET DIAGNOSTICS v_removidos = ROW_COUNT;

  DELETE FROM tracked_posts tp
   WHERE tp.tracking_id = v_tracking_id
     AND tp.client_id LIKE 'orcamento:%'
     AND tp.status <> 'Concluído'
     AND NOT EXISTS (
       SELECT 1 FROM budget_posts bp
        WHERE bp.id = tp.original_post_id
          AND bp.budget_id = v_budget_id
     );

  PERFORM refresh_work_tracking_progress(v_tracking_id);

  RETURN jsonb_build_object(
    'trackingId', v_tracking_id,
    'seeded',     v_semeados,
    'lit',        v_acesos,
    'unlit',      v_apagados,
    'fieldPosts', v_campo,
    'pruned',     v_removidos
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 7. O número que o cliente lê
--
-- Mesma ponderação de sempre (poste 50, BT 25, MT 15, equipamento 8,
-- iluminação 2), com uma correção: divide pelo peso das metas que existem, não
-- por 100 fixo. Sem isso, uma obra só de postes trava em 50% com tudo pronto,
-- que é exatamente o caso da ACMA.
--
-- Vale só para acompanhamento espelhado, e esta função só roda para eles.
-- Acompanhamento legado continua na conta antiga, dentro de
-- `calculateWeightedProgress`: são links que já estão na mão de cliente há
-- meses, e trocar o divisor faria a barra pular sozinha num dia qualquer, sem
-- nada ter acontecido na obra.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.refresh_work_tracking_progress(p_tracking_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  t                 RECORD;
  v_work_id         uuid;
  v_planned_poles   integer;
  v_poles_installed integer;
  v_meters          jsonb;
  v_tem_snapshot    boolean := false;
  v_planned_bt      numeric;
  v_planned_mt      numeric;
  v_peso            numeric := 0;
  v_soma            numeric := 0;
  v_progresso       integer;
BEGIN
  SELECT * INTO t FROM work_trackings WHERE id = p_tracking_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_work_id := t.work_id;

  SELECT count(*) INTO v_planned_poles
    FROM budget_posts bp
   WHERE bp.budget_id = t.budget_id;

  SELECT count(*) INTO v_poles_installed
    FROM tracked_posts tp
   WHERE tp.tracking_id = p_tracking_id
     AND tp.is_visible
     AND tp.status = 'Concluído';

  v_planned_bt := t.planned_bt_meters;
  v_planned_mt := t.planned_mt_meters;

  -- Obra espelhada: o snapshot do orçamento manda nos metros previstos, e
  -- manda inclusive quando diz zero. Deixar o valor digitado à mão sobreviver
  -- aqui criaria o pior dos mundos: a coluna diz 370 m de BT, a conta do
  -- progresso ignora esses 370, e os dois números que o cliente lê na mesma
  -- tela param de bater entre si. É o caso literal da ACMA.
  IF v_work_id IS NOT NULL THEN
    SELECT s.meters_planned INTO v_meters
      FROM work_project_snapshot s
     WHERE s.work_id = v_work_id;

    IF FOUND AND v_meters IS NOT NULL THEN
      v_tem_snapshot := true;
      v_planned_bt := NULLIF((v_meters->>'BT')::numeric, 0);
      v_planned_mt := NULLIF((v_meters->>'MT')::numeric, 0);
    END IF;
  END IF;

  IF COALESCE(v_planned_poles, 0) > 0 THEN
    v_peso := v_peso + 50;
    v_soma := v_soma + 50 * LEAST(v_poles_installed::numeric / v_planned_poles, 1);
  END IF;
  IF COALESCE(v_planned_bt, 0) > 0 THEN
    v_peso := v_peso + 25;
    v_soma := v_soma + 25 * LEAST(COALESCE(t.bt_extension_km, 0) * 1000 / v_planned_bt, 1);
  END IF;
  IF COALESCE(v_planned_mt, 0) > 0 THEN
    v_peso := v_peso + 15;
    v_soma := v_soma + 15 * LEAST(COALESCE(t.mt_extension_km, 0) * 1000 / v_planned_mt, 1);
  END IF;
  IF COALESCE(t.planned_equipment, 0) > 0 THEN
    v_peso := v_peso + 8;
    v_soma := v_soma + 8 * LEAST(COALESCE(t.equipment_installed, 0)::numeric / t.planned_equipment, 1);
  END IF;
  IF COALESCE(t.planned_public_lighting, 0) > 0 THEN
    v_peso := v_peso + 2;
    v_soma := v_soma + 2 * LEAST(COALESCE(t.public_lighting_installed, 0)::numeric / t.planned_public_lighting, 1);
  END IF;

  IF v_peso = 0 THEN
    v_progresso := COALESCE(t.progress_percentage, 0);
  ELSE
    v_progresso := GREATEST(0, LEAST(100, round(v_soma / v_peso * 100)::integer));
  END IF;

  UPDATE work_trackings
     SET planned_poles       = COALESCE(NULLIF(v_planned_poles, 0), planned_poles),
         poles_installed     = v_poles_installed,
         planned_bt_meters   = CASE WHEN v_tem_snapshot THEN v_planned_bt ELSE planned_bt_meters END,
         planned_mt_meters   = CASE WHEN v_tem_snapshot THEN v_planned_mt ELSE planned_mt_meters END,
         progress_percentage = v_progresso,
         updated_at          = now()
   WHERE id = p_tracking_id;

  RETURN v_progresso;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 8. O gatilho
--
-- Por statement, não por linha: aprovar 24 postes de uma vez é um UPDATE só e
-- roda um espelhamento só. A tabela de transição permite comparar antes/depois
-- e ignorar update que não mexeu em aprovação nem em status (o gerente
-- corrigindo uma observação, por exemplo).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.on_pole_installation_sync_tracking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT d.work_id
      FROM depois d
      JOIN antes a ON a.id = d.id
     WHERE d.approved_at IS DISTINCT FROM a.approved_at
        OR d.status IS DISTINCT FROM a.status
  LOOP
    BEGIN
      PERFORM sync_work_tracking_from_work(r.work_id);
    EXCEPTION WHEN OTHERS THEN
      -- O portal do cliente nunca derruba o registro de campo. Espelho que
      -- falha volta a convergir na próxima aprovação ou no botão de
      -- ressincronizar.
      RAISE WARNING 'Falha ao espelhar obra % no portal: %', r.work_id, SQLERRM;
    END;
  END LOOP;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_pole_installation_sync_tracking ON public.work_pole_installations;
CREATE TRIGGER trg_pole_installation_sync_tracking
  AFTER UPDATE ON public.work_pole_installations
  REFERENCING OLD TABLE AS antes NEW TABLE AS depois
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.on_pole_installation_sync_tracking();

-- ---------------------------------------------------------------------------
-- 9. Notificação de poste: agora existe ação do engenheiro
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.on_pole_installation_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_work    RECORD;
  v_label   TEXT;
  v_body    TEXT;
BEGIN
  IF NEW.status <> 'installed' THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT id, name, engineer_id INTO v_work
      FROM public.works
     WHERE id = NEW.work_id;

    IF NOT FOUND THEN
      RAISE WARNING 'Obra % nao encontrada (instalacao de poste)', NEW.work_id;
      RETURN NEW;
    END IF;

    IF NEW.numbering IS NOT NULL AND length(trim(NEW.numbering)) > 0 THEN
      v_label := trim(NEW.numbering);
      v_body  := 'Poste ' || v_label || ' marcado via APK. Aprove para publicar no portal do cliente.';
    ELSE
      v_body  := 'Poste sem numeracao marcado via APK. Aprove para publicar no portal do cliente.';
    END IF;

    INSERT INTO public.notifications (user_id, work_id, kind, title, body, link_path)
    VALUES (
      v_work.engineer_id,
      v_work.id,
      'pole_installed',
      'Poste instalado em ' || v_work.name,
      v_body,
      '/tools/andamento-obra/obras/' || v_work.id::text || '/visao-geral'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Falha ao notificar instalacao de poste: %', SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 10. Permissões
-- ---------------------------------------------------------------------------

-- `sync_work_tracking_from_work` é a única porta aberta, e ela confere
-- pertencimento à obra por dentro. As outras duas são engrenagem interna:
-- rodam via SECURITY DEFINER a partir dela e do gatilho, e ninguém as chama
-- de fora.
REVOKE ALL ON FUNCTION public.ensure_work_tracking(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_work_tracking_progress(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.sync_work_tracking_from_work(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.budget_post_numbering(text, text, integer) TO authenticated, anon;
