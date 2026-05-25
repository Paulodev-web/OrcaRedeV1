import type {
  IdealExportSessionContext,
  SupplierExportData,
} from '@/types/exportIdeal';
import type { GeneratePdfRequest, SupplierPdfInfo } from '@/types/pdfExport';
import type { Supplier } from '@/types';

function pdfCell(value: string | number): string {
  return String(value)
    .replace(/\t/g, ' ')
    .replace(/\r\n?|\n/g, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const moneyFmt = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const qtyFmt = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const EXPORT_TIME_ZONE = 'America/Sao_Paulo';

function formatExportedAt(date: Date): string {
  return date.toLocaleString('pt-BR', {
    timeZone: EXPORT_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function supplierToPdfInfo(
  supplier: SupplierExportData,
  master: Supplier | null
): SupplierPdfInfo {
  if (master) {
    return {
      name: pdfCell(master.name),
      cnpj: master.cnpj ? pdfCell(master.cnpj) : null,
      phone: master.phone ? pdfCell(master.phone) : null,
      email: master.email ? pdfCell(master.email) : null,
      address: master.address ? pdfCell(master.address) : null,
      salesContact: master.sales_contact ? pdfCell(master.sales_contact) : null,
      paymentTerms: master.payment_terms ? pdfCell(master.payment_terms) : null,
    };
  }
  return { name: pdfCell(supplier.supplierName) };
}

export function mapSupplierExportToPdfRequest(
  supplier: SupplierExportData,
  ctx: IdealExportSessionContext,
  master: Supplier | null
): GeneratePdfRequest {
  const dataRows = supplier.rows.map((row) => [
    pdfCell(row.codigo),
    pdfCell(row.material),
    pdfCell(moneyFmt.format(row.precoNegociadoNorm)),
    pdfCell(qtyFmt.format(row.quantidade)),
    pdfCell(moneyFmt.format(row.precoTotal)),
  ]);

  const totalRow = [
    'TOTAL GERAL',
    '',
    '',
    '',
    moneyFmt.format(supplier.grandTotal),
  ];

  return {
    supplier: supplierToPdfInfo(supplier, master),
    meta: {
      sessionTitle: pdfCell(ctx.sessionTitle),
      budgetLabel: pdfCell(ctx.budgetLabel),
      exportedAt: pdfCell(formatExportedAt(ctx.exportedAt)),
    },
    tables: [
      {
        title: 'Itens do pedido',
        columns: [
          { header: 'Código', weight: 1 },
          { header: 'Material', weight: 4 },
          { header: 'Preço Unitário', weight: 1.4 },
          { header: 'Quantidade', weight: 1 },
          { header: 'Preço Total', weight: 1.5 },
        ],
        rows: [...dataRows, totalRow],
      },
    ],
  };
}
