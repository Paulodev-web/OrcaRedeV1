-- ============================================================================
-- O engenheiro passa a lançar poste pelo portal, não só o gerente pelo APK.
--
-- O modelo até aqui tinha uma porta só: o gerente toca no poste cinza no
-- aparelho e ele acende. Funciona enquanto existe gerente alocado e com o app
-- na mão. Não cobre o resto: obra tocada pelo próprio engenheiro, poste
-- levantado antes de o gerente existir, e o registro que chega por telefone
-- porque o aparelho ficou sem bateria. Hoje nada disso entra, e a obra fica
-- mentindo para menos.
--
-- A regra nova, em uma frase: quem é membro da obra registra execução, cada um
-- pelo seu meio. O gerente pelo APK, o engenheiro pelo canvas do portal.
--
-- Uma assimetria de propósito: poste que o ENGENHEIRO lança já nasce publicado
-- no portal do cliente. O portão de aprovação (ver 5.5 da doc) existe para o
-- engenheiro revisar o que o campo mandou. Quando é ele mesmo quem digita, a
-- revisão já aconteceu no ato, e pedir que ele aprove o próprio registro seria
-- teatro. Despublicar continua existindo para o arrependimento.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. A porta de entrada do engenheiro
--
-- Policy nova em vez de troca da existente: as duas são PERMISSIVE e o
-- Postgres soma com OR. O caminho do gerente fica byte a byte como estava, e
-- quem for ler isto amanhã consegue apagar o caminho do engenheiro sem
-- encostar no do campo.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS work_pole_installations_insert_engineer ON public.work_pole_installations;
CREATE POLICY work_pole_installations_insert_engineer
  ON public.work_pole_installations
  FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM public.work_members wm
       WHERE wm.work_id = work_pole_installations.work_id
         AND wm.user_id = auth.uid()
         AND wm.role = 'engineer'
    )
  );

DROP POLICY IF EXISTS work_pole_installation_media_insert_engineer ON public.work_pole_installation_media;
CREATE POLICY work_pole_installation_media_insert_engineer
  ON public.work_pole_installation_media
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.work_pole_installations i
        JOIN public.work_members wm
          ON wm.work_id = i.work_id
         AND wm.user_id = auth.uid()
         AND wm.role = 'engineer'
       WHERE i.id = work_pole_installation_media.installation_id
         AND i.work_id = work_pole_installation_media.work_id
         AND i.created_by = auth.uid()
    )
  );

-- Storage: mesma pasta, mesmo predicado, outro papel. O UPDATE entra junto
-- porque sem ele a retentativa de foto trava para sempre, que foi exatamente
-- o defeito R2 consertado na E8 para o gerente.
DROP POLICY IF EXISTS andamento_obra_storage_insert_pole_installations_engineer ON storage.objects;
CREATE POLICY andamento_obra_storage_insert_pole_installations_engineer
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'andamento-obra'
    AND (storage.foldername(name))[2] = 'pole-installations'
    AND EXISTS (
      SELECT 1 FROM public.work_members wm
       WHERE wm.user_id = auth.uid()
         AND wm.role = 'engineer'
         AND wm.work_id::text = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS andamento_obra_storage_update_engineer ON storage.objects;
CREATE POLICY andamento_obra_storage_update_engineer
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'andamento-obra'
    AND (storage.foldername(name))[2] = 'pole-installations'
    AND EXISTS (
      SELECT 1 FROM public.work_members wm
       WHERE wm.user_id = auth.uid()
         AND wm.role = 'engineer'
         AND wm.work_id::text = (storage.foldername(name))[1]
    )
  )
  WITH CHECK (
    bucket_id = 'andamento-obra'
    AND (storage.foldername(name))[2] = 'pole-installations'
    AND EXISTS (
      SELECT 1 FROM public.work_members wm
       WHERE wm.user_id = auth.uid()
         AND wm.role = 'engineer'
         AND wm.work_id::text = (storage.foldername(name))[1]
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Aprovação nascida junto com a linha
--
-- Na tabela, `approved_at` só era escrito por UPDATE, e o trigger
-- `protect_fields` guardava esse caminho. Agora ela pode chegar já preenchida
-- no INSERT, e esse caminho não tinha guarda nenhuma: a RLS confere quem
-- insere, não o que vai dentro das colunas de aprovação.
--
-- Sem isto, um engenheiro conseguiria carimbar a aprovação no nome de outro.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.work_pole_installations_validate_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_role TEXT;
BEGIN
  -- auth.uid() nulo é service role: importação, backfill e seed, que já
  -- passaram pela porta deles. A RLS nem chega a ser consultada aí.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.approved_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.approved_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'approved_by deve ser quem esta registrando';
  END IF;

  SELECT role INTO v_role
    FROM public.work_members
   WHERE work_id = NEW.work_id
     AND user_id = auth.uid();

  IF v_role IS DISTINCT FROM 'engineer' THEN
    RAISE EXCEPTION 'Apenas o engenheiro responsavel publica poste no portal do cliente';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_work_pole_installations_validate_insert ON public.work_pole_installations;
CREATE TRIGGER trg_work_pole_installations_validate_insert
  BEFORE INSERT ON public.work_pole_installations
  FOR EACH ROW
  EXECUTE FUNCTION public.work_pole_installations_validate_insert();

-- ---------------------------------------------------------------------------
-- 3. Corrigir o que eu mesmo lancei
--
-- O caminho de correção dizia "somente o gerente", porque quando ele foi
-- escrito só existia gerente escrevendo nessa tabela. A trava real nunca foi o
-- papel, e sim a autoria: `auth.uid() = OLD.created_by`. Ela continua inteira.
-- O que muda é que o engenheiro que criou a linha também alcança a própria
-- correção.
--
-- O que NÃO muda: engenheiro não remove marcação do gerente. Quem levantou o
-- poste é quem sabe se ele foi mesmo derrubado, e apagar registro alheio é
-- reescrever a obra de outra pessoa.
-- ---------------------------------------------------------------------------

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

  -- ---- Caminho da correcao: so quem criou a linha, seja gerente ou engenheiro.
  IF auth.uid() IS NULL OR auth.uid() <> OLD.created_by THEN
    RAISE EXCEPTION 'Somente quem criou a marcacao pode atualiza-la';
  END IF;

  SELECT role INTO v_role
    FROM public.work_members
   WHERE work_id = NEW.work_id
     AND user_id = auth.uid();

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Usuario nao e membro da obra';
  END IF;
  IF v_role NOT IN ('manager', 'engineer') THEN
    RAISE EXCEPTION 'Papel sem permissao para atualizar instalacoes';
  END IF;

  IF OLD.status = 'installed' AND NEW.status = 'removed' THEN
    IF NEW.removed_at IS NULL THEN
      RAISE EXCEPTION 'removed_at obrigatorio ao remover instalacao';
    END IF;
    IF NEW.removed_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'removed_by deve ser quem removeu';
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
-- 4. O espelho também precisa ouvir o INSERT
--
-- Este é o furo que o lançamento pelo portal abriria se ninguém olhasse:
-- `trg_pole_installation_sync_tracking` é AFTER UPDATE. Faz todo sentido no
-- fluxo do campo, onde a linha nasce pendente e a aprovação é sempre um UPDATE
-- depois. O poste que o engenheiro lança nasce aprovado e nunca sofre UPDATE
-- nenhum, então o portal do cliente jamais ficaria sabendo dele.
--
-- Só dispara para linha que já nasce aprovada: INSERT de gerente chega
-- pendente, não atravessa nada, e não tem por que pagar um espelhamento.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.on_pole_installation_insert_sync_tracking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT work_id
      FROM depois
     WHERE approved_at IS NOT NULL
       AND status = 'installed'
  LOOP
    BEGIN
      PERFORM sync_work_tracking_from_work(r.work_id);
    EXCEPTION WHEN OTHERS THEN
      -- Mesma regra do gatilho de UPDATE: o portal do cliente nunca derruba o
      -- registro de execucao. Espelho que falha volta a convergir na proxima
      -- aprovacao ou no botao de ressincronizar.
      RAISE WARNING 'Falha ao espelhar obra % no portal: %', r.work_id, SQLERRM;
    END;
  END LOOP;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_pole_installation_insert_sync_tracking ON public.work_pole_installations;
CREATE TRIGGER trg_pole_installation_insert_sync_tracking
  AFTER INSERT ON public.work_pole_installations
  REFERENCING NEW TABLE AS depois
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.on_pole_installation_insert_sync_tracking();

-- ---------------------------------------------------------------------------
-- 5. Ninguém se notifica
--
-- A notificação de poste instalado existe para avisar o engenheiro de que o
-- campo trabalhou. Quando é o próprio engenheiro quem lança, ela vira e-mail
-- de você para você mesmo: chega no sino dizendo "aprove para publicar" um
-- poste que já está publicado.
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

    -- Lancado pelo proprio destinatario: nada a avisar.
    IF NEW.created_by = v_work.engineer_id THEN
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
-- 6. Função de gatilho não é porta
--
-- As três nascem com `EXECUTE` para `anon` e `authenticated`, que é o padrão
-- do Postgres para função nova, e é o que o advisor de segurança reclama em
-- cima de `SECURITY DEFINER`. Disparo de trigger não consulta essa permissão:
-- roda no contexto do dono da tabela. Ou seja, revogar não tira nada de
-- funcionamento e fecha a única forma de alguém chamá-las na mão.
--
-- A irmã de UPDATE entra junto porque nasceu com o mesmo buraco na migration
-- anterior, e deixar só a nova fechada seria consertar metade.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.on_pole_installation_insert_sync_tracking() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_pole_installation_sync_tracking()        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_pole_installation_notify()               FROM PUBLIC, anon, authenticated;
