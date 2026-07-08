-- ===========================================================================
-- Migration: duplicar todos os dados de luan → paulo
-- Source: luan@onengenhariaeletrica.com.br  (3be0e200-d520-46ea-bd5a-7579303dee4f)
-- Target: paulodev.website@gmail.com        (bc26a070-f32b-42df-86a4-8e0872d7c7bc)
-- Schema verificado em 2026-06-24
-- ===========================================================================

DO $$
DECLARE
  v_src UUID := '3be0e200-d520-46ea-bd5a-7579303dee4f';
  v_tgt UUID := 'bc26a070-f32b-42df-86a4-8e0872d7c7bc';
BEGIN

-- ---------------------------------------------------------------------------
-- TABELAS DE MAPEAMENTO old_id → new_id
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _sup_map (old_id UUID PRIMARY KEY, new_id UUID NOT NULL);
CREATE TEMP TABLE _mat_map (old_id UUID PRIMARY KEY, new_id UUID NOT NULL);
CREATE TEMP TABLE _pt_map  (old_id UUID PRIMARY KEY, new_id UUID NOT NULL);
CREATE TEMP TABLE _fld_map (old_id UUID PRIMARY KEY, new_id UUID NOT NULL);
CREATE TEMP TABLE _bud_map (old_id UUID PRIMARY KEY, new_id UUID NOT NULL);
CREATE TEMP TABLE _pst_map (old_id UUID PRIMARY KEY, new_id UUID NOT NULL);
CREATE TEMP TABLE _grp_map (old_id UUID PRIMARY KEY, new_id UUID NOT NULL);
CREATE TEMP TABLE _tpl_map (old_id UUID PRIMARY KEY, new_id UUID NOT NULL);
CREATE TEMP TABLE _fb_map  (old_id UUID PRIMARY KEY, new_id UUID NOT NULL);
CREATE TEMP TABLE _qs_map  (old_id UUID PRIMARY KEY, new_id UUID NOT NULL);
CREATE TEMP TABLE _sq_map  (old_id UUID PRIMARY KEY, new_id UUID NOT NULL);
CREATE TEMP TABLE _sqi_map (old_id UUID PRIMARY KEY, new_id UUID NOT NULL);
CREATE TEMP TABLE _wt_map  (old_id UUID PRIMARY KEY, new_id UUID NOT NULL);
CREATE TEMP TABLE _tp_map  (old_id UUID PRIMARY KEY, new_id UUID NOT NULL);

-- ---------------------------------------------------------------------------
-- 1. SUPPLIERS
-- ---------------------------------------------------------------------------
INSERT INTO _sup_map SELECT id, gen_random_uuid() FROM suppliers WHERE user_id = v_src;

INSERT INTO suppliers
  (id, user_id, name, cnpj, phone, email, address,
   sales_contact, payment_terms, notes, is_active, created_at, updated_at)
SELECT m.new_id, v_tgt, s.name, s.cnpj, s.phone, s.email, s.address,
       s.sales_contact, s.payment_terms, s.notes, s.is_active, now(), now()
FROM suppliers s JOIN _sup_map m ON m.old_id = s.id;

-- ---------------------------------------------------------------------------
-- 2. MATERIALS
-- price_source_quote_id / price_source_session_id ficam NULL agora;
-- serão atualizados após criar quotes/sessions (passo 17).
-- ---------------------------------------------------------------------------
INSERT INTO _mat_map SELECT id, gen_random_uuid() FROM materials WHERE user_id = v_src;

INSERT INTO materials
  (id, code, name, description, unit, price, created_at, user_id,
   active_in_supplies, price_source_supplier_name, price_source_supplier_id,
   price_source_quote_id, price_source_session_id, price_source_updated_at, embedding)
SELECT m.new_id, s.code, s.name, s.description, s.unit, s.price, now(), v_tgt,
       s.active_in_supplies, s.price_source_supplier_name,
       sm.new_id,     -- supplier remapeado
       NULL,          -- atualizado no passo 17
       NULL,          -- atualizado no passo 17
       s.price_source_updated_at, s.embedding
FROM materials s
JOIN _mat_map m ON m.old_id = s.id
LEFT JOIN _sup_map sm ON sm.old_id = s.price_source_supplier_id;

-- ---------------------------------------------------------------------------
-- 3. POST TYPES (material_id remapeado para o novo material)
-- ---------------------------------------------------------------------------
INSERT INTO _pt_map SELECT id, gen_random_uuid() FROM post_types WHERE user_id = v_src;

INSERT INTO post_types
  (id, code, name, description, shape, height_m, price, created_at, material_id, user_id)
SELECT m.new_id, s.code, s.name, s.description, s.shape, s.height_m, s.price, now(),
       mm.new_id,   -- material remapeado (NULL se post_type não tinha material)
       v_tgt
FROM post_types s
JOIN _pt_map m ON m.old_id = s.id
LEFT JOIN _mat_map mm ON mm.old_id = s.material_id;

-- ---------------------------------------------------------------------------
-- 4. BUDGET FOLDERS (raiz primeiro; depois filhas — self-ref FK)
-- ---------------------------------------------------------------------------
INSERT INTO _fld_map SELECT id, gen_random_uuid() FROM budget_folders WHERE user_id = v_src;

INSERT INTO budget_folders (id, name, color, user_id, created_at, updated_at, parent_id)
SELECT m.new_id, s.name, s.color, v_tgt, now(), now(), NULL
FROM budget_folders s JOIN _fld_map m ON m.old_id = s.id WHERE s.parent_id IS NULL;

INSERT INTO budget_folders (id, name, color, user_id, created_at, updated_at, parent_id)
SELECT m.new_id, s.name, s.color, v_tgt, now(), now(), pm.new_id
FROM budget_folders s
JOIN _fld_map m  ON m.old_id  = s.id
JOIN _fld_map pm ON pm.old_id = s.parent_id
WHERE s.parent_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. BUDGETS
-- ---------------------------------------------------------------------------
INSERT INTO _bud_map SELECT id, gen_random_uuid() FROM budgets WHERE user_id = v_src;

INSERT INTO budgets
  (id, project_name, client_name, city, status, plan_image_url, user_id,
   created_at, updated_at, company_id, plantas, folder_id, render_version,
   profit_margin_percent, extra_cost_items)
SELECT m.new_id, s.project_name, s.client_name, s.city, s.status, s.plan_image_url, v_tgt,
       now(), now(), s.company_id, s.plantas,
       fm.new_id,
       s.render_version, s.profit_margin_percent, s.extra_cost_items
FROM budgets s
JOIN _bud_map m ON m.old_id = s.id
LEFT JOIN _fld_map fm ON fm.old_id = s.folder_id;

-- ---------------------------------------------------------------------------
-- 6. ITEM GROUP TEMPLATES (antes de post_item_groups, que referencia template_id)
-- ---------------------------------------------------------------------------
INSERT INTO _tpl_map SELECT id, gen_random_uuid() FROM item_group_templates WHERE user_id = v_src;

INSERT INTO item_group_templates (id, name, company_id, created_at, description, user_id)
SELECT m.new_id, s.name, s.company_id, now(), s.description, v_tgt
FROM item_group_templates s JOIN _tpl_map m ON m.old_id = s.id;

-- ---------------------------------------------------------------------------
-- 7. TEMPLATE MATERIALS
-- ---------------------------------------------------------------------------
INSERT INTO template_materials (template_id, material_id, quantity)
SELECT tm.new_id, mm.new_id, s.quantity
FROM template_materials s
JOIN _tpl_map tm ON tm.old_id = s.template_id
JOIN _mat_map mm ON mm.old_id = s.material_id;

-- ---------------------------------------------------------------------------
-- 8. BUDGET POSTS
-- ---------------------------------------------------------------------------
INSERT INTO _pst_map
  SELECT bp.id, gen_random_uuid()
  FROM budget_posts bp
  JOIN budgets b ON b.id = bp.budget_id
  WHERE b.user_id = v_src;

INSERT INTO budget_posts
  (id, budget_id, post_type_id, name, x_coord, y_coord, created_at, counter, custom_name)
SELECT m.new_id, bm.new_id, pm.new_id, s.name, s.x_coord, s.y_coord, now(), s.counter, s.custom_name
FROM budget_posts s
JOIN _pst_map m  ON m.old_id  = s.id
JOIN _bud_map bm ON bm.old_id = s.budget_id
LEFT JOIN _pt_map pm ON pm.old_id = s.post_type_id;

-- ---------------------------------------------------------------------------
-- 9. POST ITEM GROUPS
-- ---------------------------------------------------------------------------
INSERT INTO _grp_map
  SELECT pig.id, gen_random_uuid()
  FROM post_item_groups pig
  JOIN budget_posts bp ON bp.id = pig.budget_post_id
  JOIN budgets b       ON b.id  = bp.budget_id
  WHERE b.user_id = v_src;

INSERT INTO post_item_groups (id, budget_post_id, template_id, name)
SELECT m.new_id, pm.new_id,
       COALESCE(tm.new_id, s.template_id),  -- usa novo template se era do luan; senão mantém
       s.name
FROM post_item_groups s
JOIN _grp_map m  ON m.old_id  = s.id
JOIN _pst_map pm ON pm.old_id = s.budget_post_id
LEFT JOIN _tpl_map tm ON tm.old_id = s.template_id;

-- ---------------------------------------------------------------------------
-- 10. POST ITEM GROUP MATERIALS (sem coluna id; PK composta)
-- ---------------------------------------------------------------------------
INSERT INTO post_item_group_materials (post_item_group_id, material_id, quantity, price_at_addition)
SELECT gm.new_id, mm.new_id, s.quantity, s.price_at_addition
FROM post_item_group_materials s
JOIN _grp_map gm ON gm.old_id = s.post_item_group_id
JOIN _mat_map mm ON mm.old_id = s.material_id;

-- ---------------------------------------------------------------------------
-- 11. POST MATERIALS
-- ---------------------------------------------------------------------------
INSERT INTO post_materials (post_id, material_id, quantity, price_at_addition)
SELECT pm.new_id, mm.new_id, s.quantity, s.price_at_addition
FROM post_materials s
JOIN _pst_map pm ON pm.old_id = s.post_id
JOIN _mat_map mm ON mm.old_id = s.material_id;

-- ---------------------------------------------------------------------------
-- 12. FINALIZED BUDGETS (snapshot autônomo — sem FK para budgets)
-- ---------------------------------------------------------------------------
INSERT INTO _fb_map SELECT id, gen_random_uuid() FROM finalized_budgets WHERE user_id = v_src;

INSERT INTO finalized_budgets
  (id, project_name, client_name, city, status, plan_image_url,
   user_id, original_created_at, finalized_at, total_cost)
SELECT m.new_id, s.project_name, s.client_name, s.city, s.status, s.plan_image_url,
       v_tgt, s.original_created_at, s.finalized_at, s.total_cost
FROM finalized_budgets s JOIN _fb_map m ON m.old_id = s.id;

-- ---------------------------------------------------------------------------
-- 13. FINALIZED BUDGET ITEMS
-- ---------------------------------------------------------------------------
INSERT INTO finalized_budget_items
  (finalized_budget_id, item_type, code, name, description, unit, quantity, unit_price, total_price)
SELECT fbm.new_id, s.item_type, s.code, s.name, s.description, s.unit, s.quantity, s.unit_price, s.total_price
FROM finalized_budget_items s
JOIN _fb_map fbm ON fbm.old_id = s.finalized_budget_id;

-- ---------------------------------------------------------------------------
-- 14. QUOTATION SESSIONS
-- ---------------------------------------------------------------------------
INSERT INTO _qs_map SELECT id, gen_random_uuid() FROM quotation_sessions WHERE user_id = v_src;

INSERT INTO quotation_sessions (id, user_id, title, budget_id, status, created_at, updated_at)
SELECT m.new_id, v_tgt, s.title, bm.new_id, s.status, now(), now()
FROM quotation_sessions s
JOIN _qs_map  m  ON m.old_id  = s.id
JOIN _bud_map bm ON bm.old_id = s.budget_id;

-- ---------------------------------------------------------------------------
-- 15. SUPPLIER QUOTES (tem budget_id E session_id)
-- ---------------------------------------------------------------------------
INSERT INTO _sq_map SELECT id, gen_random_uuid() FROM supplier_quotes WHERE user_id = v_src;

INSERT INTO supplier_quotes
  (id, budget_id, supplier_name, pdf_path, status, observacoes_gerais, user_id,
   created_at, updated_at, session_id, extraction_validated_at, display_name,
   supplier_id, quote_date, raw_extraction, extraction_error_message, extraction_error_at)
SELECT m.new_id, bm.new_id, s.supplier_name, s.pdf_path, s.status, s.observacoes_gerais, v_tgt,
       now(), now(),
       qsm.new_id,
       s.extraction_validated_at, s.display_name,
       COALESCE(sm.new_id, s.supplier_id),
       s.quote_date, s.raw_extraction, s.extraction_error_message, s.extraction_error_at
FROM supplier_quotes s
JOIN _sq_map  m   ON m.old_id   = s.id
JOIN _bud_map bm  ON bm.old_id  = s.budget_id
LEFT JOIN _qs_map  qsm ON qsm.old_id = s.session_id
LEFT JOIN _sup_map sm  ON sm.old_id  = s.supplier_id;

-- ---------------------------------------------------------------------------
-- 16. SUPPLIER QUOTE ITEMS (colunas em português)
-- matched_material_id remapeado para novo material
-- ---------------------------------------------------------------------------
INSERT INTO _sqi_map
  SELECT sqi.id, gen_random_uuid()
  FROM supplier_quote_items sqi
  JOIN supplier_quotes sq ON sq.id = sqi.quote_id
  WHERE sq.user_id = v_src;

INSERT INTO supplier_quote_items
  (id, quote_id, descricao, unidade, quantidade, preco_unit, total_item,
   ipi_percent, st_incluso, alerta, matched_material_id, conversion_factor,
   match_status, created_at, match_level, match_confidence, match_method,
   preco_negociado, preco_unit_desconto)
SELECT m.new_id, sqm.new_id, s.descricao, s.unidade, s.quantidade, s.preco_unit, s.total_item,
       s.ipi_percent, s.st_incluso, s.alerta,
       mm.new_id,   -- matched_material remapeado
       s.conversion_factor, s.match_status, now(),
       s.match_level, s.match_confidence, s.match_method,
       s.preco_negociado, s.preco_unit_desconto
FROM supplier_quote_items s
JOIN _sqi_map m   ON m.old_id   = s.id
JOIN _sq_map  sqm ON sqm.old_id = s.quote_id
LEFT JOIN _mat_map mm ON mm.old_id = s.matched_material_id;

-- ---------------------------------------------------------------------------
-- 17. ATUALIZAR materials: corrigir price_source_quote_id e price_source_session_id
-- ---------------------------------------------------------------------------
UPDATE materials new_mat
SET
  price_source_quote_id   = sqm.new_id,
  price_source_session_id = qsm.new_id
FROM materials old_mat
JOIN _mat_map mm ON mm.old_id = old_mat.id AND mm.new_id = new_mat.id
LEFT JOIN _sq_map sqm ON sqm.old_id = old_mat.price_source_quote_id
LEFT JOIN _qs_map qsm ON qsm.old_id = old_mat.price_source_session_id
WHERE new_mat.user_id = v_tgt
  AND (old_mat.price_source_quote_id IS NOT NULL OR old_mat.price_source_session_id IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 18. SUPPLIER MATERIAL MAPPINGS (mapeamento global por nome de fornecedor)
-- internal_material_id remapeado para o novo material
-- ---------------------------------------------------------------------------
INSERT INTO supplier_material_mappings
  (user_id, supplier_name, supplier_material_name, internal_material_id,
   conversion_factor, created_at, updated_at, last_seen_at,
   times_used, source, confidence_snapshot)
SELECT v_tgt, s.supplier_name, s.supplier_material_name, mm.new_id,
       s.conversion_factor, now(), now(), s.last_seen_at,
       s.times_used, s.source, s.confidence_snapshot
FROM supplier_material_mappings s
JOIN _mat_map mm ON mm.old_id = s.internal_material_id
WHERE s.user_id = v_src;

-- ---------------------------------------------------------------------------
-- 19. SCENARIO IDEAL SELECTIONS
-- ---------------------------------------------------------------------------
INSERT INTO scenario_ideal_selections
  (session_id, material_id, quote_id, user_id, created_at, updated_at)
SELECT qsm.new_id, mm.new_id, sqm.new_id, v_tgt, now(), now()
FROM scenario_ideal_selections s
JOIN _qs_map qsm ON qsm.old_id = s.session_id
JOIN _mat_map mm ON mm.old_id  = s.material_id
JOIN _sq_map sqm ON sqm.old_id = s.quote_id
WHERE s.user_id = v_src;

-- ---------------------------------------------------------------------------
-- 20. SESSION MATERIAL EXCLUSIONS
-- ---------------------------------------------------------------------------
INSERT INTO session_material_exclusions (session_id, material_id, user_id, created_at)
SELECT qsm.new_id, mm.new_id, v_tgt, now()
FROM session_material_exclusions s
JOIN _qs_map qsm ON qsm.old_id = s.session_id
JOIN _mat_map mm ON mm.old_id  = s.material_id
WHERE s.user_id = v_src;

-- ---------------------------------------------------------------------------
-- 21. SESSION MATERIAL STOCK INPUTS (quantity_in_stock → stock_qty)
-- ---------------------------------------------------------------------------
INSERT INTO session_material_stock_inputs
  (session_id, material_id, user_id, stock_qty, created_at, updated_at)
SELECT qsm.new_id, mm.new_id, v_tgt, s.stock_qty, now(), now()
FROM session_material_stock_inputs s
JOIN _qs_map qsm ON qsm.old_id = s.session_id
JOIN _mat_map mm ON mm.old_id  = s.material_id
WHERE s.user_id = v_src;

-- ---------------------------------------------------------------------------
-- 22. EXTRACTION JOBS (tem session_id e quote_id)
-- ---------------------------------------------------------------------------
INSERT INTO extraction_jobs
  (session_id, user_id, file_path, supplier_name, status, error_message,
   estimated_time, quote_id, started_at, finished_at, created_at, updated_at,
   supplier_id, pipeline_phase, match_batch_index, match_total_batches,
   pipeline_context, last_dispatch_at, watchdog_attempts)
SELECT qsm.new_id, v_tgt, s.file_path, s.supplier_name, s.status, s.error_message,
       s.estimated_time,
       sqm.new_id,
       s.started_at, s.finished_at, now(), now(),
       COALESCE(sm.new_id, s.supplier_id),
       s.pipeline_phase, s.match_batch_index, s.match_total_batches,
       s.pipeline_context, s.last_dispatch_at, s.watchdog_attempts
FROM extraction_jobs s
JOIN _qs_map qsm ON qsm.old_id = s.session_id
JOIN _sq_map sqm ON sqm.old_id = s.quote_id
LEFT JOIN _sup_map sm ON sm.old_id = s.supplier_id
WHERE s.user_id = v_src;

-- ---------------------------------------------------------------------------
-- 23. SAVED PRICING BUDGETS
-- ---------------------------------------------------------------------------
INSERT INTO saved_pricing_budgets
  (user_id, budget_id, save_mode, budget_name, client_name, city,
   pricing_input_mode, valor_servico_input, lucro_percent_input, imposto_percent,
   cost_items, materials_snapshot, result_snapshot,
   valor_materiais, valor_servico, total_custos, imposto_valor,
   lucro_bruto, lucro_liquido, preco_total_cliente, created_at, updated_at)
SELECT v_tgt, bm.new_id, s.save_mode, s.budget_name, s.client_name, s.city,
       s.pricing_input_mode, s.valor_servico_input, s.lucro_percent_input, s.imposto_percent,
       s.cost_items, s.materials_snapshot, s.result_snapshot,
       s.valor_materiais, s.valor_servico, s.total_custos, s.imposto_valor,
       s.lucro_bruto, s.lucro_liquido, s.preco_total_cliente, now(), now()
FROM saved_pricing_budgets s
JOIN _bud_map bm ON bm.old_id = s.budget_id
WHERE s.user_id = v_src;

-- ---------------------------------------------------------------------------
-- 24. WORK TRACKINGS (sem user_id; ligado via budget_id)
-- ---------------------------------------------------------------------------
INSERT INTO _wt_map
  SELECT wt.id, gen_random_uuid()
  FROM work_trackings wt
  JOIN budgets b ON b.id = wt.budget_id
  WHERE b.user_id = v_src;

INSERT INTO work_trackings
  (id, budget_id, name, status, network_extension_km, start_date,
   estimated_completion, actual_completion, progress_percentage, notes,
   created_at, updated_at, planned_network_meters, plan_image_url,
   client_name, city, current_focus_title, current_focus_description,
   timeline_milestones, project_description, responsible_person, work_images,
   planned_mt_meters, mt_extension_km, planned_bt_meters, bt_extension_km,
   planned_poles, poles_installed, planned_equipment, equipment_installed,
   planned_public_lighting, public_lighting_installed, client_logo_url,
   public_id)
SELECT m.new_id, bm.new_id, s.name, s.status, s.network_extension_km, s.start_date,
       s.estimated_completion, s.actual_completion, s.progress_percentage, s.notes,
       now(), now(), s.planned_network_meters, s.plan_image_url,
       s.client_name, s.city, s.current_focus_title, s.current_focus_description,
       s.timeline_milestones, s.project_description, s.responsible_person, s.work_images,
       s.planned_mt_meters, s.mt_extension_km, s.planned_bt_meters, s.bt_extension_km,
       s.planned_poles, s.poles_installed, s.planned_equipment, s.equipment_installed,
       s.planned_public_lighting, s.public_lighting_installed, s.client_logo_url,
       'tracking-' || replace(left(m.new_id::text, 18), '-', '')  -- public_id único
FROM work_trackings s
JOIN _wt_map  m  ON m.old_id  = s.id
JOIN _bud_map bm ON bm.old_id = s.budget_id;

-- ---------------------------------------------------------------------------
-- 25. TRACKED POSTS
-- ---------------------------------------------------------------------------
INSERT INTO _tp_map
  SELECT tp.id, gen_random_uuid()
  FROM tracked_posts tp
  JOIN work_trackings wt ON wt.id = tp.tracking_id
  JOIN budgets b         ON b.id  = wt.budget_id
  WHERE b.user_id = v_src;

INSERT INTO tracked_posts
  (id, tracking_id, original_post_id, name, custom_name,
   x_coord, y_coord, status, installation_date, completion_date,
   notes, created_at, updated_at, client_id, is_visible)
SELECT m.new_id, wm.new_id,
       COALESCE(pm.new_id, s.original_post_id),
       s.name, s.custom_name,
       s.x_coord, s.y_coord, s.status, s.installation_date, s.completion_date,
       s.notes, now(), now(), s.client_id, s.is_visible
FROM tracked_posts s
JOIN _tp_map  m  ON m.old_id  = s.id
JOIN _wt_map  wm ON wm.old_id = s.tracking_id
LEFT JOIN _pst_map pm ON pm.old_id = s.original_post_id;

-- ---------------------------------------------------------------------------
-- 26. POST CONNECTIONS (tracking_id → work_trackings; from/to → tracked_posts)
-- ---------------------------------------------------------------------------
INSERT INTO post_connections
  (tracking_id, from_post_id, to_post_id, status, cable_type,
   length_meters, installation_date, created_at, client_id, connection_type)
SELECT wm.new_id, fpm.new_id, tpm.new_id,
       s.status, s.cable_type, s.length_meters, s.installation_date, now(),
       s.client_id, s.connection_type
FROM post_connections s
JOIN _wt_map wm  ON wm.old_id  = s.tracking_id
JOIN _tp_map fpm ON fpm.old_id = s.from_post_id
JOIN _tp_map tpm ON tpm.old_id = s.to_post_id;

-- ---------------------------------------------------------------------------
-- 27. TRACKED POST PHOTOS
-- ---------------------------------------------------------------------------
INSERT INTO tracked_post_photos (tracked_post_id, url, description, photo_type, uploaded_at)
SELECT tpm.new_id, s.url, s.description, s.photo_type, now()
FROM tracked_post_photos s
JOIN _tp_map tpm ON tpm.old_id = s.tracked_post_id;

RAISE NOTICE 'Duplicação concluída com sucesso para user %', v_tgt;

END $$;
