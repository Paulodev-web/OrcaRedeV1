export interface TableColumn {
  header: string;
  weight?: number;
}

export interface TableData {
  title?: string;
  columns: TableColumn[];
  rows: string[][];
}

export interface SupplierPdfInfo {
  name: string;
  cnpj?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  salesContact?: string | null;
  paymentTerms?: string | null;
}

export interface PdfDocumentMeta {
  sessionTitle?: string;
  budgetLabel?: string;
  exportedAt?: string;
}

export interface GeneratePdfRequest {
  tables: TableData[];
  supplier?: SupplierPdfInfo;
  meta?: PdfDocumentMeta;
}

export class PdfTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfTemplateError';
  }
}
