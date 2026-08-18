-- =============================================================================
-- Fallback de migração: OC sem passagem pelo Cenário Ideal, mas sem ambiguidade
--
-- ACHADO (auditoria pós-20260818122000, em dev)
--   152 linhas de scenario_purchase_orders, 5 números de OC distintos.
--   Só 619 e 596 tinham scenario_ideal_selections e por isso já viraram
--   purchase_orders — e mesmo assim, PARCIALMENTE: nem todo material desses
--   dois grupos tinha seleção ideal. Os outros três (595, 625, "FATURAR
--   DIRETO") não tinham seleção ideal nenhuma: o Paulo digitou o número da OC
--   direto na tela de cotação, sem passar pelo Cenário Ideal.
--
--   Consultado o dado: "FATURAR DIRETO" tem exatamente 1 cotação candidata por
--   material (FONINI METALURGIA), sem ambiguidade — dá para resolver.
--   595 e 625 têm 8 e 5 cotações concorrentes por grupo: qual delas venceu não
--   está registrado em lugar nenhum. Inventar um vencedor aqui fabricaria dado
--   financeiro — exatamente o que MD/PLANO-DRE-OBRA.md §3 recusa fazer com a
--   receita, e a mesma recusa vale para o custo. Ficam de fora, para
--   reconciliação manual (ver NOTICE ao final).
--
-- RESULTADO REAL EM DEV
--   Da amostra de 152 linhas (materiais tagueados com nº de OC), só 27 (18%)
--   puderam ser migrados com segurança — os outros 125 ficaram sem fornecedor/
--   preço resolvível. Isso é limite do dado histórico, não bug da migração:
--   o fluxo de "Cenário Ideal" não era usado de forma consistente antes de
--   marcar o número da OC. Uma tela de reconciliação manual (Fase 1 da UI, não
--   deste lote de SQL) é pré-requisito para a DRE de obras antigas confiar no
--   realizado.
--
-- REGRA DO FALLBACK
--   Só resolve (session, material) sem seleção ideal quando existir
--   EXATAMENTE UMA cotação, de UM fornecedor, com item casado para aquele
--   material naquela sessão. Mais de uma cotação candidata = não resolve.
-- =============================================================================

DO $do$
DECLARE
  v_ocs   INT := 0;
  v_itens INT := 0;
BEGIN
  IF to_regclass('public.scenario_purchase_orders') IS NULL THEN
    RAISE NOTICE 'scenario_purchase_orders ausente — nada a migrar.';
    RETURN;
  END IF;

  WITH pendentes AS (
    -- (session, material) que a migração anterior não resolveu: sem seleção
    -- ideal E ainda não vinculado a nenhum purchase_order_item existente.
    SELECT DISTINCT spo.session_id, spo.material_id, spo.user_id,
           btrim(spo.oc_number) AS oc_number
    FROM public.scenario_purchase_orders spo
    WHERE length(btrim(spo.oc_number)) > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.scenario_ideal_selections sis
        WHERE sis.session_id = spo.session_id
          AND sis.material_id = spo.material_id
          AND sis.user_id = spo.user_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.purchase_orders po
        JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
        WHERE po.session_id = spo.session_id
          AND poi.material_id = spo.material_id
      )
  ),
  candidatos AS (
    SELECT
      p.session_id, p.material_id, p.user_id, p.oc_number,
      qs.org_id, qs.budget_id,
      sq.id             AS quote_id,
      sq.supplier_name,
      COALESCE(sqi.preco_negociado, sqi.preco_unit, 0) AS preco_unit,
      NULLIF(sqi.quantidade, 0)                        AS quantidade,
      count(*) OVER (PARTITION BY p.session_id, p.material_id) AS n_candidatos
    FROM pendentes p
    JOIN public.quotation_sessions qs ON qs.id = p.session_id
    JOIN public.supplier_quotes sq ON sq.session_id = p.session_id
    JOIN public.supplier_quote_items sqi
      ON sqi.quote_id = sq.id AND sqi.matched_material_id = p.material_id
  ),
  resolvidos AS (
    -- Só quem tem candidato único, com quantidade válida
    SELECT * FROM candidatos WHERE n_candidatos = 1 AND quantidade IS NOT NULL
  ),
  cabecalhos AS (
    SELECT DISTINCT ON (session_id, oc_number, supplier_name)
      session_id, oc_number, supplier_name, org_id, budget_id, user_id
    FROM resolvidos
    ORDER BY session_id, oc_number, supplier_name
  ),
  numerados AS (
    SELECT
      c.*,
      CASE
        WHEN count(*) OVER (PARTITION BY c.org_id, c.oc_number) > 1
          THEN c.oc_number || ' — ' || c.supplier_name
        ELSE c.oc_number
      END AS oc_number_final
    FROM cabecalhos c
  ),
  inseridos AS (
    INSERT INTO public.purchase_orders
      (org_id, budget_id, session_id, oc_number, supplier_name,
       freight_value, delivery_date, status, user_id)
    SELECT
      n.org_id, n.budget_id, n.session_id, n.oc_number_final, n.supplier_name,
      NULL, NULL, 'emitida', n.user_id
    FROM numerados n
    WHERE NOT EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.org_id = n.org_id AND po.oc_number = n.oc_number_final
    )
    RETURNING id, session_id, oc_number, supplier_name
  )
  SELECT count(*) INTO v_ocs FROM inseridos;

  WITH pendentes AS (
    SELECT DISTINCT spo.session_id, spo.material_id, spo.user_id,
           btrim(spo.oc_number) AS oc_number
    FROM public.scenario_purchase_orders spo
    WHERE length(btrim(spo.oc_number)) > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.scenario_ideal_selections sis
        WHERE sis.session_id = spo.session_id
          AND sis.material_id = spo.material_id
          AND sis.user_id = spo.user_id
      )
  ),
  candidatos AS (
    SELECT
      p.session_id, p.material_id, p.oc_number,
      sq.supplier_name,
      COALESCE(sqi.preco_negociado, sqi.preco_unit, 0) AS preco_unit,
      NULLIF(sqi.quantidade, 0)                        AS quantidade,
      count(*) OVER (PARTITION BY p.session_id, p.material_id) AS n_candidatos
    FROM pendentes p
    JOIN public.supplier_quotes sq ON sq.session_id = p.session_id
    JOIN public.supplier_quote_items sqi
      ON sqi.quote_id = sq.id AND sqi.matched_material_id = p.material_id
  ),
  resolvidos AS (
    SELECT * FROM candidatos WHERE n_candidatos = 1 AND quantidade IS NOT NULL
  ),
  pareado AS (
    SELECT DISTINCT ON (po.id, r.material_id)
      po.id AS purchase_order_id, r.material_id, r.quantidade, r.preco_unit
    FROM resolvidos r
    JOIN public.purchase_orders po
      ON  po.session_id    = r.session_id
      AND po.supplier_name = r.supplier_name
      AND (po.oc_number = r.oc_number
           OR po.oc_number = r.oc_number || ' — ' || r.supplier_name)
    ORDER BY po.id, r.material_id
  ),
  ins AS (
    INSERT INTO public.purchase_order_items
      (purchase_order_id, material_id, quantidade, preco_unit)
    SELECT purchase_order_id, material_id, quantidade, preco_unit
    FROM pareado
    ON CONFLICT (purchase_order_id, material_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_itens FROM ins;

  RAISE NOTICE 'Fallback sem ambiguidade: % cabeçalhos novos, % itens novos.', v_ocs, v_itens;

  -- Relatório do que ficou de fora — não é erro, é limite honesto do dado.
  DECLARE
    v_ambiguos INT;
  BEGIN
    SELECT count(DISTINCT (spo.session_id, spo.material_id)) INTO v_ambiguos
    FROM public.scenario_purchase_orders spo
    WHERE length(btrim(spo.oc_number)) > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.scenario_ideal_selections sis
        WHERE sis.session_id = spo.session_id AND sis.material_id = spo.material_id
          AND sis.user_id = spo.user_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.purchase_orders po
        JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
        WHERE po.session_id = spo.session_id AND poi.material_id = spo.material_id
      );

    IF v_ambiguos > 0 THEN
      RAISE WARNING '% (sessão, material) seguem sem OC migrada — fornecedor '
                    'ambíguo entre múltiplas cotações, sem seleção ideal para '
                    'desempatar. Precisam de conferência manual antes de a DRE '
                    'confiar no realizado dessas obras.', v_ambiguos;
    END IF;
  END;
END
$do$;
