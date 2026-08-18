-- =============================================================================
-- Correção: cabeçalho duplicado gerado pela migração de fallback
--
--   20260818122500 numerou seus próprios candidatos sem checar se já existia
--   um cabeçalho SEM sufixo para o mesmo fornecedor, criado por 20260818122000
--   numa passada anterior. Resultado observado em dev: "619" e
--   "619 — ELECTRASUL..." nasceram como duas OCs do mesmo fornecedor, na
--   mesma sessão — o mesmo custo correndo o risco de ser contado em dois
--   lugares diferentes numa DRE futura.
--
--   Corrige mesclando o duplicado no cabeçalho base (mesma sessão + mesmo
--   fornecedor + número "base — fornecedor"), movendo os itens e apagando o
--   cabeçalho sobrando. items_value do base recalcula sozinho via trigger
--   quando os itens são inseridos nele.
-- =============================================================================

DO $do$
DECLARE
  r RECORD;
  v_merges INT := 0;
BEGIN
  FOR r IN
    SELECT dup.id AS id_duplicado, base.id AS id_base,
           dup.oc_number AS numero_duplicado, base.oc_number AS numero_base
    FROM public.purchase_orders dup
    JOIN public.purchase_orders base
      ON base.session_id = dup.session_id
     AND base.supplier_name = dup.supplier_name
     AND base.id <> dup.id
     AND dup.oc_number = base.oc_number || ' — ' || dup.supplier_name
  LOOP
    -- Move os itens do duplicado para o base. ON CONFLICT: se o mesmo material
    -- já existir nos dois (não deveria, mas a checagem é grátis), mantém o do
    -- base e descarta o do duplicado.
    UPDATE public.purchase_order_items
       SET purchase_order_id = r.id_base
     WHERE purchase_order_id = r.id_duplicado
       AND material_id NOT IN (
         SELECT material_id FROM public.purchase_order_items
         WHERE purchase_order_id = r.id_base
       );

    DELETE FROM public.purchase_order_items WHERE purchase_order_id = r.id_duplicado;
    DELETE FROM public.purchase_orders WHERE id = r.id_duplicado;

    RAISE NOTICE 'Mesclado "%" em "%"', r.numero_duplicado, r.numero_base;
    v_merges := v_merges + 1;
  END LOOP;

  RAISE NOTICE 'Cabeçalhos duplicados mesclados: %', v_merges;
END
$do$;
