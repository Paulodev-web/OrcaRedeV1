import type {
  IdealExportSessionContext,
  SupplierExportData,
} from '@/types/exportIdeal';
import type { GeneratePdfRequest, SupplierPdfInfo } from '@/types/pdfExport';
import type { Supplier } from '@/types';

const moneyFmt = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const qtyFmt = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatExportedAt(date: Date): string {
  return date.toLocaleString('pt-BR', {
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
      name: master.name,
      cnpj: master.cnpj,
      phone: master.phone,
      email: master.email,
      address: master.address,
      salesContact: master.sales_contact,
      paymentTerms: master.payment_terms,
    };
  }
  return { name: supplier.supplierName };
}

export function mapSupplierExportToPdfRequest(
  supplier: SupplierExportData,
  ctx: IdealExportSessionContext,
  master: Supplier | null
): GeneratePdfRequest {
  const dataRows = supplier.rows.map((row) => [
    row.codigo,
    row.material,
    moneyFmt.format(row.precoOriginalNorm),
    moneyFmt.format(row.precoNegociadoNorm),
    moneyFmt.format(row.diferenca),
    qtyFmt.format(row.quantidade),
    moneyFmt.format(row.precoTotal),
  ]);

  const totalRow = [
    'TOTAL GERAL',
    '',
    '',
    '',
    '',
    '',
    moneyFmt.format(supplier.grandTotal),
  ];

  return {
    supplier: supplierToPdfInfo(supplier, master),
    meta: {
      sessionTitle: ctx.sessionTitle,
      budgetLabel: ctx.budgetLabel,
      exportedAt: formatExportedAt(ctx.exportedAt),
    },
    tables: [
      {
        title: 'Itens do pedido',
        columns: [
          { header: 'Código', weight: 1 },
          { header: 'Material', weight: 3 },
          { header: 'Preço Unit. Original', weight: 1.2 },
          { header: 'Preço Unit. Negociado', weight: 1.2 },
          { header: 'Diferença (R$)', weight: 1 },
          { header: 'Quantidade', weight: 0.8 },
          { header: 'Preço Total', weight: 1.2 },
        ],
        rows: [...dataRows, totalRow],
      },
    ],
  };
}
