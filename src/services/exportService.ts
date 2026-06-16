import * as XLSX from 'xlsx';

export interface MaterialExport {
  materialId: string;
  codigo: string;
  nome: string;
  unidade: string;
  precoUnit: number;
  quantidade: number;
  subtotal: number;
}

export interface ExportOptions {
  budgetName: string;
  totalCost: number;
  totalPosts: number;
  totalUniqueMaterials: number;
  exportDate: string;
}

const formatarNumero = (numero: number, casasDecimais: number = 2): string => {
  return numero.toFixed(casasDecimais).replace('.', ',');
};

export const exportToExcel = (materiais: MaterialExport[], options: ExportOptions): void => {
  const materialsData = materiais.map(material => ({
    'Código': material.codigo || '-',
    'Material': material.nome,
    'Unidade': material.unidade || '-',
    'Quantidade Total': formatarNumero(material.quantidade),
    'Preço Unitário (R$)': formatarNumero(material.precoUnit),
    'Subtotal (R$)': formatarNumero(material.subtotal),
  }));

  materialsData.push({
    'Código': '',
    'Material': 'TOTAL',
    'Unidade': '',
    'Quantidade Total': '',
    'Preço Unitário (R$)': '',
    'Subtotal (R$)': formatarNumero(options.totalCost),
  } as any);

  const infoData = [
    ['Orçamento', options.budgetName],
    ['Data de Exportação', options.exportDate],
    ['Total de Postes', options.totalPosts],
    ['Materiais Únicos', options.totalUniqueMaterials],
    ['Custo Total', `R$ ${formatarNumero(options.totalCost)}`],
  ];

  const workbook = XLSX.utils.book_new();
  const materialsWorksheet = XLSX.utils.json_to_sheet(materialsData);
  materialsWorksheet['!cols'] = [
    { wch: 15 }, { wch: 40 }, { wch: 10 }, { wch: 15 }, { wch: 18 }, { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(workbook, materialsWorksheet, 'Materiais');

  const infoWorksheet = XLSX.utils.aoa_to_sheet(infoData);
  infoWorksheet['!cols'] = [{ wch: 25 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(workbook, infoWorksheet, 'Informações');

  const fileName = `${sanitizeFileName(options.budgetName)}_materiais_${formatDateForFileName(new Date())}.xlsx`;
  XLSX.writeFile(workbook, fileName);
};

export const exportToCSV = (materiais: MaterialExport[], options: ExportOptions): void => {
  const headers = ['Código', 'Material', 'Unidade', 'Quantidade Total', 'Preço Unitário (R$)', 'Subtotal (R$)'];
  const rows = materiais.map(material => [
    material.codigo || '-',
    material.nome,
    material.unidade || '-',
    formatarNumero(material.quantidade),
    formatarNumero(material.precoUnit),
    formatarNumero(material.subtotal),
  ]);
  rows.push(['', '', '', '', '', '']);
  rows.push(['', 'TOTAL', '', '', '', formatarNumero(options.totalCost)]);
  rows.push(['', '', '', '', '', '']);
  rows.push(['Informações do Orçamento', '', '', '', '', '']);
  rows.push(['Orçamento', options.budgetName, '', '', '', '']);
  rows.push(['Data de Exportação', options.exportDate, '', '', '', '']);
  rows.push(['Total de Postes', options.totalPosts.toString(), '', '', '', '']);
  rows.push(['Materiais Únicos', options.totalUniqueMaterials.toString(), '', '', '', '']);
  rows.push(['Custo Total', `R$ ${formatarNumero(options.totalCost)}`, '', '', '', '']);

  const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  const fileName = `${sanitizeFileName(options.budgetName)}_materiais_${formatDateForFileName(new Date())}.csv`;
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const exportToExcelForSuppliers = (materiais: MaterialExport[], options: ExportOptions): void => {
  const materialsData = materiais.map(material => ({
    'Código': material.codigo || '-',
    'Material': material.nome,
    'Unidade': material.unidade || '-',
    'Quantidade Total': formatarNumero(material.quantidade),
  }));
  const infoData = [
    ['Orçamento', options.budgetName],
    ['Data de Exportação', options.exportDate],
    ['Total de Postes', options.totalPosts],
    ['Materiais Únicos', options.totalUniqueMaterials],
  ];
  const workbook = XLSX.utils.book_new();
  const materialsWorksheet = XLSX.utils.json_to_sheet(materialsData);
  materialsWorksheet['!cols'] = [{ wch: 15 }, { wch: 50 }, { wch: 10 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(workbook, materialsWorksheet, 'Materiais');
  const infoWorksheet = XLSX.utils.aoa_to_sheet(infoData);
  infoWorksheet['!cols'] = [{ wch: 25 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(workbook, infoWorksheet, 'Informações');
  const fileName = `${sanitizeFileName(options.budgetName)}_fornecedores_${formatDateForFileName(new Date())}.xlsx`;
  XLSX.writeFile(workbook, fileName);
};

export const exportToCSVForSuppliers = (materiais: MaterialExport[], options: ExportOptions): void => {
  const headers = ['Código', 'Material', 'Unidade', 'Quantidade Total'];
  const rows = materiais.map(material => [
    material.codigo || '-',
    material.nome,
    material.unidade || '-',
    formatarNumero(material.quantidade),
  ]);
  rows.push(['', '', '', '']);
  rows.push(['Informações do Orçamento', '', '', '']);
  rows.push(['Orçamento', options.budgetName, '', '']);
  rows.push(['Data de Exportação', options.exportDate, '', '']);
  rows.push(['Total de Postes', options.totalPosts.toString(), '', '']);
  rows.push(['Materiais Únicos', options.totalUniqueMaterials.toString(), '', '']);
  const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  const fileName = `${sanitizeFileName(options.budgetName)}_fornecedores_${formatDateForFileName(new Date())}.csv`;
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export interface PostWithMaterials {
  postName: string;
  postType: string;
  coords: { x: number; y: number };
  groups: {
    groupName: string;
    materials: { codigo: string; nome: string; unidade: string; quantidade: number; precoUnit: number; subtotal: number }[];
  }[];
  looseMaterials: { codigo: string; nome: string; unidade: string; quantidade: number; precoUnit: number; subtotal: number }[];
}

export const exportByPostAndGroupToExcel = (posts: PostWithMaterials[], budgetName: string): void => {
  const workbook = XLSX.utils.book_new();
  const sheetData: any[] = [];
  sheetData.push([`ORÇAMENTO: ${budgetName}`]);
  sheetData.push([`Data de Exportação: ${new Date().toLocaleString('pt-BR')}`]);
  sheetData.push([]);
  let totalGeral = 0;
  posts.forEach((post, postIndex) => {
    sheetData.push([`POSTE ${postIndex + 1}: ${post.postName} - ${post.postType}`]);
    sheetData.push([`Localização: X: ${post.coords.x}, Y: ${post.coords.y}`]);
    sheetData.push([]);
    let totalPoste = 0;
    if (post.groups.length > 0) {
      post.groups.forEach((group) => {
        sheetData.push([`  GRUPO: ${group.groupName}`]);
        sheetData.push(['    Código', 'Material', 'Unidade', 'Quantidade', 'Preço Unit. (R$)', 'Subtotal (R$)']);
        group.materials.forEach((material) => {
          sheetData.push([`    ${material.codigo}`, material.nome, material.unidade, formatarNumero(material.quantidade), formatarNumero(material.precoUnit), formatarNumero(material.subtotal)]);
          totalPoste += material.subtotal;
        });
        sheetData.push([]);
      });
    }
    if (post.looseMaterials.length > 0) {
      sheetData.push([`  MATERIAIS AVULSOS`]);
      sheetData.push(['    Código', 'Material', 'Unidade', 'Quantidade', 'Preço Unit. (R$)', 'Subtotal (R$)']);
      post.looseMaterials.forEach((material) => {
        sheetData.push([`    ${material.codigo}`, material.nome, material.unidade, formatarNumero(material.quantidade), formatarNumero(material.precoUnit), formatarNumero(material.subtotal)]);
        totalPoste += material.subtotal;
      });
      sheetData.push([]);
    }
    sheetData.push(['', '', '', '', 'TOTAL DO POSTE:', formatarNumero(totalPoste)]);
    sheetData.push([]);
    sheetData.push([]);
    totalGeral += totalPoste;
  });
  sheetData.push(['', '', '', '', 'TOTAL GERAL DO ORÇAMENTO:', formatarNumero(totalGeral)]);
  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
  worksheet['!cols'] = [{ wch: 20 }, { wch: 50 }, { wch: 10 }, { wch: 15 }, { wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Materiais por Poste');
  const fileName = `${sanitizeFileName(budgetName)}_por_poste_${formatDateForFileName(new Date())}.xlsx`;
  XLSX.writeFile(workbook, fileName);
};

const sanitizeFileName = (name: string): string => {
  return name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_').substring(0, 100);
};

const formatDateForFileName = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
};
