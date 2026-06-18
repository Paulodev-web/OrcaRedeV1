/** Item extraído de PDF / Gemini (antes de persistir em supplier_quote_items). */
export type SupplierExtractItem = {
  descricao: string;
  unidade: string;
  quantidade: number;
  preco_unit: number;
  /** Preço unitário com desconto aplicado — presente quando o PDF tem coluna de desconto separada. É o valor efetivo usado no total_item. */
  preco_unit_desconto?: number | null;
  total_item: number;
  ipi_percent: number;
  st_incluso: boolean;
  alerta: boolean;
};

export type GeminiExtractSuccess = {
  items: SupplierExtractItem[];
  observacoesGerais: string;
  quoteDate: string | null;
};

export type GeminiExtractResult =
  | { success: true; data: GeminiExtractSuccess }
  | { success: false; error: string };
