-- Adiciona coluna de preço unitário com desconto em supplier_quote_items.
-- Presente apenas quando o PDF do fornecedor tem coluna separada de preço com desconto.
-- Quando preenchido, é o valor efetivamente usado no cálculo do total_item.
ALTER TABLE supplier_quote_items
  ADD COLUMN IF NOT EXISTS preco_unit_desconto NUMERIC(12, 4) DEFAULT NULL;
