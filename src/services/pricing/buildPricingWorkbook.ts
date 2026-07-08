import ExcelJS from 'exceljs';
import { costItemTipoLabel, describeCostItemFormula } from '@/components/precificacao/types';
import type {
  CostItem,
  PricingMaterialSnapshot,
  PricingSaveMode,
  ServicePricingResult,
} from '@/components/precificacao/types';

const MONEY_FMT = '"R$" #,##0.00';
const PERCENT_FMT = '0.00%';
const QTY_FMT = '#,##0.00';
const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF3F4F6' },
};

export interface PricingWorkbookData {
  title: string;
  budgetName: string;
  clientName?: string | null;
  city?: string | null;
  saveMode?: PricingSaveMode | 'current';
  exportedAt: Date;
  result: ServicePricingResult;
  costItems: CostItem[];
  materials: PricingMaterialSnapshot[];
}

function formatDateTime(date: Date): string {
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function saveModeLabel(mode: PricingWorkbookData['saveMode']) {
  if (mode === 'snapshot') return 'Snapshot salvo';
  if (mode === 'live') return 'Vinculado ao orçamento atual';
  return 'Exportação da calculadora';
}

function autoFitColumns(sheet: ExcelJS.Worksheet, columnCount: number) {
  for (let c = 1; c <= columnCount; c++) {
    let maxLen = 12;
    sheet.eachRow((row) => {
      const value = row.getCell(c).value;
      const text = value == null ? '' : String(value);
      maxLen = Math.max(maxLen, text.length);
    });
    sheet.getColumn(c).width = Math.min(Math.max(maxLen + 2, 12), 48);
  }
}

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: 'middle' };
  });
}

export async function buildPricingWorkbook(data: PricingWorkbookData): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'OrcaRede';
  workbook.created = data.exportedAt;

  const summary = workbook.addWorksheet('Resumo');
  summary.mergeCells(1, 1, 1, 2);
  summary.getCell(1, 1).value = data.title;
  summary.getCell(1, 1).font = { bold: true, size: 16 };

  const summaryRows: Array<[string, string | number]> = [
    ['Orçamento', data.budgetName],
    ['Cliente', data.clientName || '-'],
    ['Cidade', data.city || '-'],
    ['Modo', saveModeLabel(data.saveMode)],
    ['Exportado em', formatDateTime(data.exportedAt)],
    ['Valor dos materiais', data.result.valorMateriais],
    ['Valor do serviço', data.result.valorServico],
    ['Total de custos', data.result.totalCustos],
    ['Lucro bruto', data.result.lucroBruto],
    ['Imposto sobre VS', data.result.impostoValor],
    ['Lucro líquido', data.result.lucroLiquido],
    ['Total ao cliente', data.result.precoTotalCliente],
  ];

  summaryRows.forEach(([label, value], index) => {
    const row = summary.getRow(index + 3);
    row.getCell(1).value = label;
    row.getCell(1).font = { bold: true };
    row.getCell(2).value = value;
    if (typeof value === 'number') {
      row.getCell(2).numFmt = MONEY_FMT;
    }
  });

  const percentRows: Array<[string, number]> = [
    [
      'Margem sobre materiais',
      data.result.valorMateriais > 0 ? data.result.valorServico / data.result.valorMateriais : 0,
    ],
    ['Custos sobre VS', data.result.totalCustosPercent / 100],
    ['Lucro bruto sobre VS', data.result.lucroBrutoPercent / 100],
    ['Imposto informado', data.result.impostoPercent / 100],
    ['Lucro líquido sobre VS', data.result.lucroLiquidoPercent / 100],
  ];

  percentRows.forEach(([label, value], index) => {
    const row = summary.getRow(summaryRows.length + index + 4);
    row.getCell(1).value = label;
    row.getCell(1).font = { bold: true };
    row.getCell(2).value = value;
    row.getCell(2).numFmt = PERCENT_FMT;
  });

  autoFitColumns(summary, 2);

  const costs = workbook.addWorksheet('Custos');
  const costsHeader = costs.getRow(1);
  ['Descrição', 'Tipo', 'Cálculo', 'Total', '% do VS'].forEach((label, index) => {
    costsHeader.getCell(index + 1).value = label;
  });
  styleHeader(costsHeader);

  if (data.costItems.length === 0) {
    costs.getRow(2).getCell(1).value = 'Nenhum custo cadastrado.';
  } else {
    data.costItems.forEach((item, index) => {
      const detalhe = data.result.custosDetalhados.find((custo) => custo.id === item.id);
      const row = costs.getRow(index + 2);
      row.getCell(1).value = item.descricao || 'Custo sem descrição';
      row.getCell(2).value = costItemTipoLabel(item.tipo);
      row.getCell(3).value = describeCostItemFormula(item);
      row.getCell(4).value = detalhe?.valor ?? item.valor;
      row.getCell(4).numFmt = MONEY_FMT;
      row.getCell(5).value = (detalhe?.percentualDoVS ?? 0) / 100;
      row.getCell(5).numFmt = PERCENT_FMT;
    });
  }
  autoFitColumns(costs, 5);

  const materials = workbook.addWorksheet('Materiais');
  const materialHeader = materials.getRow(1);
  ['Código', 'Material', 'Unidade', 'Quantidade', 'Preço unitário', 'Subtotal'].forEach((label, index) => {
    materialHeader.getCell(index + 1).value = label;
  });
  styleHeader(materialHeader);

  if (data.materials.length === 0) {
    materials.getRow(2).getCell(1).value = 'Nenhum material importado.';
  } else {
    data.materials.forEach((item, index) => {
      const row = materials.getRow(index + 2);
      row.getCell(1).value = item.codigo;
      row.getCell(2).value = item.nome;
      row.getCell(3).value = item.unidade;
      row.getCell(4).value = item.quantidade;
      row.getCell(4).numFmt = QTY_FMT;
      row.getCell(5).value = item.precoUnit;
      row.getCell(5).numFmt = MONEY_FMT;
      row.getCell(6).value = item.subtotal;
      row.getCell(6).numFmt = MONEY_FMT;
    });
  }
  autoFitColumns(materials, 6);

  return workbook;
}

export async function pricingWorkbookToBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
