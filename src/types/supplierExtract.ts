/** Item extraído de PDF / Gemini (antes de persistir em supplier_quote_items). */
export type SupplierExtractItem = {
  descricao: string;
  unidade: string;
  quantidade: number;
  preco_unit: number;
  total_item: number;
  ipi_percent: number;
  st_incluso: boolean;
  alerta: boolean;
};
