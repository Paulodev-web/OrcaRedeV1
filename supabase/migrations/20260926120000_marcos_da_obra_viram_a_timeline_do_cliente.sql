-- ============================================================================
-- A timeline que o cliente lê passa a sair dos marcos da obra.
--
-- Até aqui existiam duas linhas do tempo que não se falavam. O engenheiro
-- gerenciava seis marcos em `work_milestones` (Locação, Postes, Cabeamento BT,
-- Cabeamento MT, Energização, Comissionamento), com o gerente reportando do
-- campo e o engenheiro aprovando. E o cliente lia `work_trackings.
-- timeline_milestones`, um JSON digitado à mão no Portal do Engenheiro, que na
-- prática ficava vazio e caía num padrão de dois itens: "Início da Obra" e
-- "Conclusão da Obra".
--
-- O resultado era o descompasso que dá para ver na obra de teste: o cliente lê
-- "Timeline 1/2" enquanto a obra diz "Marcos 0/6". Aprovar marco não mexia em
-- nada do lado de fora.
--
-- Daqui pra frente a timeline é derivada, como já são os postes e o progresso.
--
-- **O que NÃO atravessa:** as observações do marco (`notes`). São o que o
-- gerente escreveu do canteiro, para o engenheiro ler, e podem conter recado
-- interno. O cliente recebe nome, estado e data, que é o que ele precisa saber.
--
-- **Acompanhamento legado continua intocado.** Nada aqui olha tracking sem
-- `work_id`: quem digitou a timeline à mão no Portal antigo fica com ela.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. A tradução
--
-- `work_milestones.status` tem cinco valores e o painel do cliente tem três.
-- O mapa é direto, com uma decisão: marco devolvido (`rejected`) aparece como
-- pendente, e não como um estado próprio. Devolver é conversa entre engenheiro
-- e gerente; para quem contratou a obra, aquilo simplesmente não ficou pronto.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.build_work_client_timeline(p_work_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',          'milestone-' || m.id::text,
        'title',       m.name,
        'description', '',
        'order',       m.order_index,
        -- A marca que separa o que a obra gera do que o engenheiro escreveu à
        -- mão. Mesma ideia dos prefixos `orcamento:` / `campo:` em
        -- `tracked_posts`: a sincronia só mexe no que é dela.
        'source',      'obra',
        'status',      CASE
                         WHEN m.status = 'approved' THEN 'completed'
                         WHEN m.status IN ('awaiting_approval', 'in_progress') THEN 'in-progress'
                         ELSE 'pending'
                       END,
        'date',        COALESCE(
                         to_char((m.approved_at AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM-DD'),
                         to_char((m.reported_at AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM-DD'),
                         ''
                       ),
        'createdAt',   to_char(m.created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF')
      )
      ORDER BY m.order_index
    ),
    '[]'::jsonb
  )
  FROM work_milestones m
  WHERE m.work_id = p_work_id;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Quem escreve, e o que ela promete não encostar
--
-- Só mexe em tracking espelhado. Se a obra não tem portal (sem orçamento de
-- origem, ou portal legado marcado à mão), sai sem fazer nada.
--
-- **A sincronia é um merge, não uma substituição.** Os seis marcos da obra são
-- o esqueleto, e servem para dizer em que etapa a obra está. Mas a timeline do
-- cliente sempre foi também o lugar onde o engenheiro conta a história em
-- palavras dele: o Loteamento Sol Poente tem quatro entradas semanais escritas
-- na mão, do tipo "Semana 01: abertura de cavas e instalação de 23 postes".
-- Isso é comunicação com cliente, não estado de obra, e nenhum marco fixo
-- substitui.
--
-- Então entrada sem `source: 'obra'` é do engenheiro e sobrevive a toda
-- sincronia. A regra vale inclusive para o que já estava escrito antes desta
-- migration, que não tem o campo e por isso conta como manual.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_work_client_timeline(p_work_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_manual jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
    INTO v_manual
    FROM work_trackings t
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(t.timeline_milestones, '[]'::jsonb)) AS item
   WHERE t.work_id = p_work_id
     AND COALESCE(item->>'source', 'manual') <> 'obra';

  UPDATE work_trackings t
     SET timeline_milestones = build_work_client_timeline(p_work_id) || COALESCE(v_manual, '[]'::jsonb),
         updated_at          = now()
   WHERE t.work_id = p_work_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Os gatilhos
--
-- Dois, e cada um cobre um buraco do outro:
--
--  - em `work_milestones`, por statement, para reportar/aprovar/devolver
--    refletir na hora. Statement e não linha porque criar a obra insere os seis
--    marcos de uma vez, e isso deve virar uma sincronia, não seis.
--  - em `work_trackings`, quando o vínculo com a obra nasce ou muda, para o
--    portal já surgir com a timeline preenchida em vez de esperar o primeiro
--    marco se mexer. `UPDATE OF work_id` de propósito: escrever
--    `timeline_milestones` não redispara o gatilho, então não há recursão.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.on_work_milestone_sync_timeline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT work_id FROM alterados LOOP
    BEGIN
      PERFORM sync_work_client_timeline(r.work_id);
    EXCEPTION WHEN OTHERS THEN
      -- Mesma regra do espelho de postes: o portal do cliente nunca derruba a
      -- gestão de marcos. Volta a convergir na próxima mexida ou no botão de
      -- ressincronizar.
      RAISE WARNING 'Falha ao espelhar marcos da obra % no portal: %', r.work_id, SQLERRM;
    END;
  END LOOP;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_work_milestones_sync_timeline_ins ON public.work_milestones;
CREATE TRIGGER trg_work_milestones_sync_timeline_ins
  AFTER INSERT ON public.work_milestones
  REFERENCING NEW TABLE AS alterados
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.on_work_milestone_sync_timeline();

DROP TRIGGER IF EXISTS trg_work_milestones_sync_timeline_upd ON public.work_milestones;
CREATE TRIGGER trg_work_milestones_sync_timeline_upd
  AFTER UPDATE ON public.work_milestones
  REFERENCING NEW TABLE AS alterados
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.on_work_milestone_sync_timeline();

DROP TRIGGER IF EXISTS trg_work_milestones_sync_timeline_del ON public.work_milestones;
CREATE TRIGGER trg_work_milestones_sync_timeline_del
  AFTER DELETE ON public.work_milestones
  REFERENCING OLD TABLE AS alterados
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.on_work_milestone_sync_timeline();

CREATE OR REPLACE FUNCTION public.on_work_tracking_link_sync_timeline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.work_id IS NOT NULL THEN
    BEGIN
      PERFORM sync_work_client_timeline(NEW.work_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Falha ao preencher timeline do portal da obra %: %', NEW.work_id, SQLERRM;
    END;
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_work_tracking_link_sync_timeline ON public.work_trackings;
CREATE TRIGGER trg_work_tracking_link_sync_timeline
  AFTER INSERT OR UPDATE OF work_id ON public.work_trackings
  FOR EACH ROW
  EXECUTE FUNCTION public.on_work_tracking_link_sync_timeline();

-- ---------------------------------------------------------------------------
-- 4. Fechar a porta das funções de gatilho
--
-- Mesma razão da migration anterior: disparo de trigger não consulta EXECUTE,
-- então revogar não tira funcionamento e fecha a chamada na mão.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.on_work_milestone_sync_timeline()     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_work_tracking_link_sync_timeline() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_work_client_timeline(uuid)       FROM PUBLIC, anon;

-- O portal do engenheiro precisa poder ressincronizar na mão, pelo mesmo botão
-- que já ressincroniza os postes.
GRANT EXECUTE ON FUNCTION public.sync_work_client_timeline(uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.build_work_client_timeline(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Backfill
--
-- Todo tracking já espelhado ganha a timeline agora, senão o conserto só
-- apareceria na próxima vez que alguém encostasse num marco.
-- ---------------------------------------------------------------------------

-- Limpeza de uma vez só: tira da timeline as entradas que apontam para um marco
-- real da obra e não carregam `source`. São derivadas de uma rodada anterior
-- desta migration, antes de a marca existir; sem isto o merge as trataria como
-- escritas à mão e a timeline sairia em duplicata.
UPDATE work_trackings t
   SET timeline_milestones = COALESCE((
         SELECT jsonb_agg(item)
           FROM jsonb_array_elements(t.timeline_milestones) AS item
          WHERE item->>'source' IS NOT NULL
             OR NOT EXISTS (
                  SELECT 1 FROM work_milestones m
                   WHERE m.work_id = t.work_id
                     AND 'milestone-' || m.id::text = item->>'id'
                )
       ), '[]'::jsonb)
 WHERE t.work_id IS NOT NULL
   AND jsonb_typeof(t.timeline_milestones) = 'array';

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT work_id FROM work_trackings WHERE work_id IS NOT NULL LOOP
    PERFORM sync_work_client_timeline(r.work_id);
  END LOOP;
END $$;
