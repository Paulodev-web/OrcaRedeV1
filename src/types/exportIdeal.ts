export interface ExportIdealParams {
  sessionId: string;
}

export interface IdealExportSessionContext {
  sessionId: string;
  sessionTitle: string;
  budgetLabel: string;
  exportedAt: Date;
}

export interface IdealExportRow {
  codigo: string;
  material: string;
  unidade: string;
  precoOriginalNorm: number;
  precoNegociadoNorm: number;
  /** Positivo = desconto (original > negociado); negativo = preço subiu. */
  diferenca: number;
  quantidade: number;
  precoTotal: number;
}

export interface SupplierExportData {
  supplierName: string;
  fileSlug: string;
  rows: IdealExportRow[];
  grandTotal: number;
  quoteIds: string[];
}

export interface IdealExportSupplierOption {
  supplierName: string;
  fileSlug: string;
}

export class ExportIdealError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 401 | 404 | 500 = 500
  ) {
    super(message);
    this.name = 'ExportIdealError';
  }
}
