-- =============================================================================
-- Reconciliação genérica de OC ambígua — sucessora de 20260818130000
--
-- POR QUE ESTA MIGRATION EXISTE, E POR QUE A ANTERIOR NÃO SERVE
--   20260818130000_purchase_orders_resolve_remaining.sql resolveu 4 grupos
--   (sessão, OC) do banco de DEV com os números da OC escritos no SQL
--   ('595', '596', '619', '625'). Isso funcionou lá porque eram só 4 casos,
--   auditados um a um manualmente.
--
--   Produção tem os MESMOS 4 casos — dev é um snapshot antigo de produção,
--   confirmado comparando os números de OC e os totais — só que produção
--   cresceu desde o snapshot: existem OUTROS 7 grupos ambíguos que não
--   existiam no dev (659, 664, 665, duas OCs "CASSOL", "FATURAMENTO DIRETO",
--   e o "651" de duas sessões diferentes). Copiar a migration anterior não
--   resolveria esses 7 — o WHERE oc_number = '595' etc. simplesmente não
--   bateria com eles, e a migration passaria em branco sem avisar.
--
--   Esta versão generaliza a REGRA (não os números): para cada par
--   (sessão, número de OC) com material pendente, calcula o fornecedor de
--   maior cobertura entre os candidatos, desempate por menor total — a
--   mesma lógica que a migration anterior tinha hardcoded só para a OC 595.
--
-- A REGRA DE CONFIANÇA (idêntica à anterior, agora aplicada a todo grupo)
--   1. Se o grupo já tem ALGUMA seleção real no Cenário Ideal e o fornecedor
--      dessa seleção COINCIDE com o vencedor calculado para o resto do
--      grupo: estende sem marcar como estimativa — não é chute, é a mesma
--      OC/fornecedor que já foi confirmado por decisão humana.
--   2. Se a seleção real do grupo aponta para um fornecedor DIFERENTE do
--      vencedor calculado: NÃO resolve automaticamente — é um conflito
--      genuíno (dado contraditório) e fica para revisão manual, reportado
--      via WARNING. Auditado neste banco antes de aplicar: não existe
--      nenhum caso assim nos dados atuais (verificado por consulta read-only
--      antes desta migration ser escrita).
--   3. Se o grupo não tem seleção real nenhuma: usa o vencedor calculado
--      como estimativa, e o cabeçalho nasce com `notes` avisando disso —
--      mesmo princípio da 20260818130000 para a OC 595.
--   4. Material sem cotação de nenhum fornecedor: fica de fora, reportado
--      por WARNING. Não há como inferir preço do nada.
--
-- IDEMPOTENTE E SEGURA DE RODAR EM CIMA DE DADO JÁ RESOLVIDO
--   Só processa (sessão, material) que ainda não tem item de OC — rodar de
--   novo depois que tudo já foi resolvido não faz nada (testado em dev antes
--   de aplicar em produção: dev já tinha os 4 grupos originais resolvidos
--   pela migration anterior, e esta rodou como no-op sobre eles).
-- =============================================================================

DO $do$
DECLARE
  grp RECORD;
  v_best_supplier   TEXT;
  v_anchor_supplier TEXT;
  v_header_id       UUID;
  v_oc_final        TEXT;
  v_org_id          UUID;
  v_budget_id       UUID;
  v_user_id         UUID;
  v_grupos_estendidos   INT := 0;
  v_grupos_estimados    INT := 0;
  v_grupos_conflito     INT := 0;
  v_itens_inseridos     INT := 0;
  v_n INT;
BEGIN
  IF to_regclass('public.scenario_purchase_orders') IS NULL THEN
    RAISE NOTICE 'scenario_purchase_orders ausente — nada a reconciliar.';
    RETURN;
  END IF;

  FOR grp IN
    SELECT DISTINCT spo.session_id, btrim(spo.oc_number) AS oc_number
    FROM public.scenario_purchase_orders spo
    WHERE length(btrim(spo.oc_number)) > 0
      AND EXISTS (
        -- só entra no loop quem tem pelo menos 1 material ainda sem OC migrada
        SELECT 1
        FROM public.scenario_purchase_orders spo2
        WHERE spo2.session_id = spo.session_id AND btrim(spo2.oc_number) = btrim(spo.oc_number)
          AND NOT EXISTS (
            SELECT 1 FROM public.purchase_order_items poi
            JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
            WHERE po.session_id = spo2.session_id AND poi.material_id = spo2.material_id
          )
      )
  LOOP
    -- ---------------------------------------------------------------------
    -- 1. Fornecedor vencedor entre os candidatos dos materiais PENDENTES
    --    deste grupo: maior cobertura, desempate por menor total.
    -- ---------------------------------------------------------------------
    SELECT sq.supplier_name
      INTO v_best_supplier
    FROM (
      SELECT DISTINCT spo.material_id
      FROM public.scenario_purchase_orders spo
      WHERE spo.session_id = grp.session_id AND btrim(spo.oc_number) = grp.oc_number
        AND NOT EXISTS (
          SELECT 1 FROM public.purchase_order_items poi
          JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
          WHERE po.session_id = grp.session_id AND poi.material_id = spo.material_id
        )
    ) pend
    JOIN public.supplier_quotes sq ON sq.session_id = grp.session_id
    JOIN public.supplier_quote_items sqi
      ON sqi.quote_id = sq.id AND sqi.matched_material_id = pend.material_id AND sqi.quantidade > 0
    GROUP BY sq.supplier_name
    ORDER BY count(DISTINCT pend.material_id) DESC,
             sum(COALESCE(sqi.preco_negociado, sqi.preco_unit, 0) * sqi.quantidade) ASC
    LIMIT 1;

    IF v_best_supplier IS NULL THEN
      -- Nenhum fornecedor cotou os materiais pendentes deste grupo — sem
      -- candidato, não é ambiguidade. Contabilizado no relatório final.
      CONTINUE;
    END IF;

    -- ---------------------------------------------------------------------
    -- 2. Este grupo já tem alguma seleção REAL no Cenário Ideal (âncora)?
    --    Se sim, de qual fornecedor?
    -- ---------------------------------------------------------------------
    SELECT sq.supplier_name
      INTO v_anchor_supplier
    FROM public.scenario_ideal_selections sis
    JOIN public.scenario_purchase_orders spo
      ON spo.session_id = sis.session_id AND spo.material_id = sis.material_id AND spo.user_id = sis.user_id
    JOIN public.supplier_quotes sq ON sq.id = sis.quote_id
    WHERE sis.session_id = grp.session_id AND btrim(spo.oc_number) = grp.oc_number
    LIMIT 1;

    IF v_anchor_supplier IS NOT NULL AND v_anchor_supplier <> v_best_supplier THEN
      -- Conflito genuíno: a seleção real aponta para um fornecedor, o
      -- cálculo pro resto do grupo aponta para outro. Não resolve sozinho.
      v_grupos_conflito := v_grupos_conflito + 1;
      RAISE WARNING 'Conflito em (sessão %, OC %): seleção ideal confirma "%", cálculo do resto do grupo aponta "%". Não resolvido — revisão manual.',
        grp.session_id, grp.oc_number, v_anchor_supplier, v_best_supplier;
      CONTINUE;
    END IF;

    -- ---------------------------------------------------------------------
    -- 3. Cabeçalho: reaproveita se já existe (criado pela seleção ideal ou
    --    por esta mesma migration numa OC irmã), cria se não existe.
    -- ---------------------------------------------------------------------
    SELECT po.id, po.oc_number
      INTO v_header_id, v_oc_final
    FROM public.purchase_orders po
    WHERE po.session_id = grp.session_id
      AND po.supplier_name = v_best_supplier
      AND (po.oc_number = grp.oc_number OR po.oc_number LIKE grp.oc_number || ' — %');

    IF v_header_id IS NULL THEN
      SELECT qs.org_id, qs.budget_id
        INTO v_org_id, v_budget_id
      FROM public.quotation_sessions qs
      WHERE qs.id = grp.session_id;

      SELECT spo.user_id INTO v_user_id
      FROM public.scenario_purchase_orders spo
      WHERE spo.session_id = grp.session_id LIMIT 1;

      -- Sufixo se já existir cabeçalho para OUTRO fornecedor com este número
      -- (OC dividida entre dois fornecedores reais — mesmo caso da OC 619).
      SELECT count(*) INTO v_n
      FROM public.purchase_orders po
      WHERE po.org_id = v_org_id AND po.oc_number = grp.oc_number;

      v_oc_final := CASE WHEN v_n > 0 THEN grp.oc_number || ' — ' || v_best_supplier ELSE grp.oc_number END;

      INSERT INTO public.purchase_orders
        (org_id, budget_id, session_id, oc_number, supplier_name, freight_value, delivery_date, status, user_id, notes)
      VALUES (
        v_org_id, v_budget_id, grp.session_id, v_oc_final, v_best_supplier,
        NULL, NULL, 'emitida', v_user_id,
        CASE WHEN v_anchor_supplier IS NULL THEN
          'Fornecedor estimado automaticamente (maior cobertura de materiais entre cotações concorrentes, '
          || 'desempate por menor total) — esta OC nunca passou por seleção no Cenário Ideal, não há confirmação '
          || 'real de qual fornecedor venceu. Ver MD/PLANO-DRE-OBRA.md §5.4.1 / 20260818150000.'
        ELSE NULL END
      )
      RETURNING id INTO v_header_id;

      IF v_anchor_supplier IS NULL THEN
        v_grupos_estimados := v_grupos_estimados + 1;
      ELSE
        v_grupos_estendidos := v_grupos_estendidos + 1;
      END IF;
    ELSIF v_anchor_supplier IS NOT NULL THEN
      v_grupos_estendidos := v_grupos_estendidos + 1;
    ELSE
      v_grupos_estimados := v_grupos_estimados + 1;
    END IF;

    -- ---------------------------------------------------------------------
    -- 4. Itens: todo material pendente do grupo que o fornecedor vencedor
    --    cotou com quantidade válida.
    -- ---------------------------------------------------------------------
    WITH resolvido AS (
      SELECT v_header_id AS purchase_order_id, spo.material_id, sqi.quantidade,
             COALESCE(sqi.preco_negociado, sqi.preco_unit, 0) AS preco_unit
      FROM (
        SELECT DISTINCT material_id
        FROM public.scenario_purchase_orders spo
        WHERE spo.session_id = grp.session_id AND btrim(spo.oc_number) = grp.oc_number
          AND NOT EXISTS (
            SELECT 1 FROM public.purchase_order_items poi
            JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
            WHERE po.session_id = grp.session_id AND poi.material_id = spo.material_id
          )
      ) spo
      JOIN public.supplier_quotes sq ON sq.session_id = grp.session_id AND sq.supplier_name = v_best_supplier
      JOIN public.supplier_quote_items sqi
        ON sqi.quote_id = sq.id AND sqi.matched_material_id = spo.material_id AND sqi.quantidade > 0
    ),
    ins AS (
      INSERT INTO public.purchase_order_items (purchase_order_id, material_id, quantidade, preco_unit)
      SELECT purchase_order_id, material_id, quantidade, preco_unit FROM resolvido
      ON CONFLICT (purchase_order_id, material_id) DO NOTHING
      RETURNING 1
    )
    SELECT count(*) INTO v_n FROM ins;
    v_itens_inseridos := v_itens_inseridos + v_n;
  END LOOP;

  RAISE NOTICE 'Reconciliação: % grupos estendidos (fornecedor já confirmado), % grupos estimados (sem âncora), % conflitos não resolvidos, % itens inseridos.',
    v_grupos_estendidos, v_grupos_estimados, v_grupos_conflito, v_itens_inseridos;

  -- ---------------------------------------------------------------------
  -- O que continua sem preço em lugar nenhum — não inventado, só reportado.
  -- ---------------------------------------------------------------------
  SELECT count(DISTINCT (spo.session_id, spo.material_id)) INTO v_n
  FROM public.scenario_purchase_orders spo
  WHERE length(btrim(spo.oc_number)) > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.purchase_order_items poi
      JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
      WHERE po.session_id = spo.session_id AND poi.material_id = spo.material_id
    );

  IF v_n > 0 THEN
    RAISE WARNING '% (sessão, material) seguem sem OC migrada — sem cotação de nenhum fornecedor com quantidade '
                  'válida, ou conflito de fornecedor não resolvido automaticamente (ver WARNINGs acima).', v_n;
  END IF;
END
$do$;
