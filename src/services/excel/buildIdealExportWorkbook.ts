import ExcelJS from 'exceljs';
import type { IdealExportSessionContext, SupplierExportData } from '@/types/exportIdeal';

const MONEY_FMT = '"R$" #,##0.00';
const QTY_FMT = '#,##0.00';
const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF3F4F6' },
};
const NEGATIVE_DIFF_FONT: Partial<ExcelJS.Font> = {
  color: { argb: 'FFB91C1C' },
};

const TABLE_HEADERS = [
  'Fornecedor',
  'Código',
  'Material',
  'Unidade',
  'Preço no PDF',
  'Preço unit. (cotação)',
  'Diferença (R$)',
  'Quantidade',
  'Preço Total',
] as const;

const COL_COUNT = TABLE_HEADERS.length;

function formatExportedAt(date: Date): string {
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function cellTextLength(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number') return String(value).length;
  return String(value).length;
}

function autoFitColumns(sheet: ExcelJS.Worksheet, startRow: number, endRow: number) {
  for (let c = 1; c <= COL_COUNT; c++) {
    let maxLen = TABLE_HEADERS[c - 1]?.length ?? 10;
    for (let r = startRow; r <= endRow; r++) {
      const cell = sheet.getRow(r).getCell(c);
      maxLen = Math.max(maxLen, cellTextLength(cell.value));
    }
    sheet.getColumn(c).width = Math.min(Math.max(maxLen + 2, 12), 50);
  }
}

export async function buildIdealExportWorkbook(
  suppliers: SupplierExportData[],
  ctx: IdealExportSessionContext
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'OrcaRede';
  workbook.created = ctx.exportedAt;
  workbook.modified = ctx.exportedAt;

  const sheet = workbook.addWorksheet('Materiais');

  sheet.mergeCells(1, 1, 1, COL_COUNT);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = 'Cenário Ideal - Lista de Materiais';
  titleCell.font = { bold: true, size: 16 };
  titleCell.alignment = { vertical: 'middle' };

  sheet.mergeCells(2, 1, 2, COL_COUNT);
  sheet.getCell(2, 1).value = `Sessão: ${ctx.sessionTitle} · Orçamento: ${ctx.budgetLabel}`;
  sheet.getCell(2, 1).font = { size: 11 };

  sheet.mergeCells(3, 1, 3, COL_COUNT);
  sheet.getCell(3, 1).value = `Exportado em: ${formatExportedAt(ctx.exportedAt)}`;
  sheet.getCell(3, 1).font = { size: 11, color: { argb: 'FF6B7280' } };

  const headerRowNum = 5;
  const headerRow = sheet.getRow(headerRowNum);
  TABLE_HEADERS.forEach((label, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = label;
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: 'middle', horizontal: i >= 4 ? 'right' : 'left' };
  });

  let dataRowNum = headerRowNum + 1;
  for (const supplier of suppliers) {
    for (const row of supplier.rows) {
      const excelRow = sheet.getRow(dataRowNum);
      excelRow.getCell(1).value = supplier.supplierName;
      excelRow.getCell(2).value = row.codigo;
      excelRow.getCell(3).value = row.material;
      excelRow.getCell(4).value = row.unidade;
      excelRow.getCell(5).value = row.precoOriginalNorm;
      excelRow.getCell(5).numFmt = MONEY_FMT;
      excelRow.getCell(6).value = row.precoNegociadoNorm;
      excelRow.getCell(6).numFmt = MONEY_FMT;
      excelRow.getCell(7).value = row.diferenca;
      excelRow.getCell(7).numFmt = MONEY_FMT;
      if (row.diferenca < 0) {
        excelRow.getCell(7).font = NEGATIVE_DIFF_FONT;
      }
      excelRow.getCell(8).value = row.quantidade;
      excelRow.getCell(8).numFmt = QTY_FMT;
      excelRow.getCell(9).value = row.precoTotal;
      excelRow.getCell(9).numFmt = MONEY_FMT;
      dataRowNum += 1;
    }
  }

  const totalRowNum = dataRowNum;
  sheet.mergeCells(totalRowNum, 1, totalRowNum, COL_COUNT - 1);
  const totalLabel = sheet.getCell(totalRowNum, 1);
  totalLabel.value = 'TOTAL GERAL';
  totalLabel.font = { bold: true };
  totalLabel.alignment = { horizontal: 'right', vertical: 'middle' };

  const totalValue = sheet.getCell(totalRowNum, COL_COUNT);
  totalValue.value = suppliers.reduce((sum, supplier) => sum + supplier.grandTotal, 0);
  totalValue.numFmt = MONEY_FMT;
  totalValue.font = { bold: true };

  sheet.autoFilter = {
    from: { row: headerRowNum, column: 1 },
    to: { row: headerRowNum, column: COL_COUNT },
  };
  sheet.views = [{ state: 'frozen', ySplit: headerRowNum }];
  autoFitColumns(sheet, headerRowNum, totalRowNum);

  return workbook;
}

export async function workbookToBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
