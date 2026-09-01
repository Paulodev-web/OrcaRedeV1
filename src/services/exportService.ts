import * as XLSX from 'xlsx';

export interface MaterialExport {
  materialId: string;
  codigo: string;
  nome: string;
  unidade: string;
  precoUnit: number;
  quantidade: number;
  subtotal: number;
  subgrupo?: string;
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

export const exportToExcel = (
  materiais: MaterialExport[],
  options: ExportOptions,
  posts?: PostWithMaterials[]
): void => {
  // Um material quase sempre aparece em mais de um segmento, então a coluna
  // lista todos em que ele foi usado em vez de forçar um só.
  const segmentsByMaterial = posts && posts.length > 0 ? buildSegmentsByMaterial(posts) : null;
  const segmentosDo = (materialId: string, codigo: string, nome: string): string => {
    if (!segmentsByMaterial) return '-';
    const segmentos =
      segmentsByMaterial.get(materialId) ?? segmentsByMaterial.get(`${codigo}|${nome}`);
    return segmentos && segmentos.length > 0 ? segmentos.join(', ') : SEM_SEGMENTO;
  };

  const materialsData = materiais.map(material => ({
    'Código': material.codigo || '-',
    'Material': material.nome,
    'Subgrupo': material.subgrupo || '-',
    'Segmento(s) da Obra': segmentosDo(material.materialId, material.codigo, material.nome),
    'Unidade': material.unidade || '-',
    'Quantidade Total': formatarNumero(material.quantidade),
    'Preço Unitário (R$)': formatarNumero(material.precoUnit),
    'Subtotal (R$)': formatarNumero(material.subtotal),
  }));

  materialsData.push({
    'Código': '',
    'Material': 'TOTAL',
    'Subgrupo': '',
    'Segmento(s) da Obra': '',
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
    { wch: 15 }, { wch: 40 }, { wch: 20 }, { wch: 28 }, { wch: 10 }, { wch: 15 }, { wch: 18 }, { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(workbook, materialsWorksheet, 'Materiais');

  const subgroupWorksheet = XLSX.utils.aoa_to_sheet(buildSubgroupRows(materiais));
  subgroupWorksheet['!cols'] = [{ wch: 20 }, { wch: 50 }, { wch: 10 }, { wch: 15 }, { wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(workbook, subgroupWorksheet, 'Por Subgrupo');

  if (posts && posts.length > 0) {
    const segmentWorksheet = XLSX.utils.aoa_to_sheet(buildSegmentRows(posts));
    segmentWorksheet['!cols'] = [{ wch: 20 }, { wch: 50 }, { wch: 10 }, { wch: 15 }, { wch: 18 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(workbook, segmentWorksheet, 'Por Segmento');

    const postWorksheet = XLSX.utils.aoa_to_sheet(buildPostGroupRows(posts));
    postWorksheet['!cols'] = [{ wch: 20 }, { wch: 50 }, { wch: 10 }, { wch: 15 }, { wch: 18 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(workbook, postWorksheet, 'Por Poste');
  }

  const infoWorksheet = XLSX.utils.aoa_to_sheet(infoData);
  infoWorksheet['!cols'] = [{ wch: 25 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(workbook, infoWorksheet, 'Informações');

  const fileName = `${sanitizeFileName(options.budgetName)}_materiais_${formatDateForFileName(new Date())}.xlsx`;
  XLSX.writeFile(workbook, fileName);
};

export const exportToCSV = (
  materiais: MaterialExport[],
  options: ExportOptions,
  posts?: PostWithMaterials[]
): void => {
  const segmentsByMaterial = posts && posts.length > 0 ? buildSegmentsByMaterial(posts) : null;
  const segmentosDo = (material: MaterialExport): string => {
    if (!segmentsByMaterial) return '-';
    const segmentos =
      segmentsByMaterial.get(material.materialId) ??
      segmentsByMaterial.get(`${material.codigo}|${material.nome}`);
    return segmentos && segmentos.length > 0 ? segmentos.join(' / ') : SEM_SEGMENTO;
  };

  const headers = ['Código', 'Material', 'Segmento(s) da Obra', 'Unidade', 'Quantidade Total', 'Preço Unitário (R$)', 'Subtotal (R$)'];
  const rows = materiais.map(material => [
    material.codigo || '-',
    material.nome,
    segmentosDo(material),
    material.unidade || '-',
    formatarNumero(material.quantidade),
    formatarNumero(material.precoUnit),
    formatarNumero(material.subtotal),
  ]);
  rows.push(['', '', '', '', '', '', '']);
  rows.push(['', 'TOTAL', '', '', '', '', formatarNumero(options.totalCost)]);
  rows.push(['', '', '', '', '', '', '']);
  rows.push(['Informações do Orçamento', '', '', '', '', '', '']);
  rows.push(['Orçamento', options.budgetName, '', '', '', '', '']);
  rows.push(['Data de Exportação', options.exportDate, '', '', '', '', '']);
  rows.push(['Total de Postes', options.totalPosts.toString(), '', '', '', '', '']);
  rows.push(['Materiais Únicos', options.totalUniqueMaterials.toString(), '', '', '', '', '']);
  rows.push(['Custo Total', `R$ ${formatarNumero(options.totalCost)}`, '', '', '', '', '']);

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

export interface ExportMaterialLine {
  /** Id do material, usado para cruzar a lista consolidada com os segmentos. */
  materialId?: string;
  codigo: string;
  nome: string;
  unidade: string;
  quantidade: number;
  precoUnit: number;
  subtotal: number;
}

export interface PostWithMaterials {
  postName: string;
  postType: string;
  coords: { x: number; y: number };
  /**
   * Segmento de obra do poste já resolvido pela cascata da §7.3.
   * `null`/ausente = não segmentado (ou orçamento aberto fora do provider).
   */
  segment?: string | null;
  groups: {
    groupName: string;
    /** Segmento resolvido do grupo (override do grupo vence o do poste). */
    segment?: string | null;
    materials: ExportMaterialLine[];
  }[];
  looseMaterials: ExportMaterialLine[];
}

/** Rótulo do que não tem segmento marcado, igual em todas as abas. */
const SEM_SEGMENTO = 'Não segmentado';

const buildPostGroupRows = (posts: PostWithMaterials[]): any[][] => {
  const rows: any[][] = [];
  let totalGeral = 0;
  posts.forEach((post, postIndex) => {
    rows.push([`POSTE ${postIndex + 1}: ${post.postName} - ${post.postType}`]);
    rows.push([`Localização: X: ${post.coords.x}, Y: ${post.coords.y}`]);
    rows.push([`Segmento da obra: ${post.segment || SEM_SEGMENTO}`]);
    rows.push([]);
    let totalPoste = 0;
    if (post.groups.length > 0) {
      post.groups.forEach((group) => {
        rows.push([`  GRUPO: ${group.groupName}`, '', '', '', 'Segmento:', group.segment || post.segment || SEM_SEGMENTO]);
        rows.push(['    Código', 'Material', 'Unidade', 'Quantidade', 'Preço Unit. (R$)', 'Subtotal (R$)']);
        group.materials.forEach((material) => {
          rows.push([`    ${material.codigo}`, material.nome, material.unidade, formatarNumero(material.quantidade), formatarNumero(material.precoUnit), formatarNumero(material.subtotal)]);
          totalPoste += material.subtotal;
        });
        rows.push([]);
      });
    }
    if (post.looseMaterials.length > 0) {
      rows.push([`  MATERIAIS AVULSOS`, '', '', '', 'Segmento:', post.segment || SEM_SEGMENTO]);
      rows.push(['    Código', 'Material', 'Unidade', 'Quantidade', 'Preço Unit. (R$)', 'Subtotal (R$)']);
      post.looseMaterials.forEach((material) => {
        rows.push([`    ${material.codigo}`, material.nome, material.unidade, formatarNumero(material.quantidade), formatarNumero(material.precoUnit), formatarNumero(material.subtotal)]);
        totalPoste += material.subtotal;
      });
      rows.push([]);
    }
    rows.push(['', '', '', '', 'TOTAL DO POSTE:', formatarNumero(totalPoste)]);
    rows.push([]);
    rows.push([]);
    totalGeral += totalPoste;
  });
  rows.push(['', '', '', '', 'TOTAL GERAL DO ORÇAMENTO:', formatarNumero(totalGeral)]);
  return rows;
};

/**
 * Segmento resolvido de um grupo de itens: o override do grupo vence o poste,
 * e sem nenhum dos dois o material fica em "Não segmentado" (§7.3).
 */
const resolveLineSegment = (
  postSegment: string | null | undefined,
  groupSegment?: string | null
): string => groupSegment || postSegment || SEM_SEGMENTO;

interface SegmentAggregatedLine extends ExportMaterialLine {
  segmento: string;
}

/**
 * Consolida os materiais do orçamento por segmento de obra. A chave de
 * consolidação é o id do material (com fallback para código/nome nas
 * exportações antigas que não o carregam).
 */
export const aggregateMaterialsBySegment = (
  posts: PostWithMaterials[]
): SegmentAggregatedLine[] => {
  const bySegment = new Map<string, Map<string, SegmentAggregatedLine>>();

  const push = (segmento: string, material: ExportMaterialLine) => {
    if (!bySegment.has(segmento)) bySegment.set(segmento, new Map());
    const bucket = bySegment.get(segmento)!;
    const key = material.materialId || `${material.codigo}|${material.nome}`;
    const existing = bucket.get(key);
    if (existing) {
      existing.quantidade += material.quantidade;
      existing.subtotal += material.subtotal;
      return;
    }
    bucket.set(key, { ...material, segmento });
  };

  posts.forEach((post) => {
    post.groups.forEach((group) => {
      const segmento = resolveLineSegment(post.segment, group.segment);
      group.materials.forEach((material) => push(segmento, material));
    });
    const segmentoPoste = resolveLineSegment(post.segment);
    (post.looseMaterials || []).forEach((material) => push(segmentoPoste, material));
  });

  return Array.from(bySegment.entries())
    .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
    .flatMap(([, bucket]) =>
      Array.from(bucket.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    );
};

/** Aba "Por Segmento": os mesmos materiais, quebrados pelo segmento da obra. */
const buildSegmentRows = (posts: PostWithMaterials[]): any[][] => {
  const linhas = aggregateMaterialsBySegment(posts);
  const rows: any[][] = [];
  let totalGeral = 0;
  let segmentoAtual: string | null = null;
  let totalSegmento = 0;

  const fecharSegmento = () => {
    if (segmentoAtual === null) return;
    rows.push(['', '', '', '', 'TOTAL DO SEGMENTO:', formatarNumero(totalSegmento)]);
    rows.push([]);
    totalGeral += totalSegmento;
    totalSegmento = 0;
  };

  linhas.forEach((linha) => {
    if (linha.segmento !== segmentoAtual) {
      fecharSegmento();
      segmentoAtual = linha.segmento;
      rows.push([`SEGMENTO: ${linha.segmento}`]);
      rows.push(['Código', 'Material', 'Unidade', 'Quantidade', 'Preço Unit. (R$)', 'Subtotal (R$)']);
    }
    rows.push([
      linha.codigo || '-',
      linha.nome,
      linha.unidade || '-',
      formatarNumero(linha.quantidade),
      formatarNumero(linha.precoUnit),
      formatarNumero(linha.subtotal),
    ]);
    totalSegmento += linha.subtotal;
  });
  fecharSegmento();

  rows.push(['', '', '', '', 'TOTAL GERAL:', formatarNumero(totalGeral)]);
  return rows;
};

/**
 * Mapa "material → segmentos em que ele aparece", para a coluna Segmento(s) da
 * aba consolidada. Um mesmo material costuma cair em mais de um segmento, por
 * isso a coluna lista todos em vez de escolher um.
 */
const buildSegmentsByMaterial = (posts: PostWithMaterials[]): Map<string, string[]> => {
  const map = new Map<string, Set<string>>();

  const push = (material: ExportMaterialLine, segmento: string) => {
    const key = material.materialId || `${material.codigo}|${material.nome}`;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(segmento);
  };

  posts.forEach((post) => {
    post.groups.forEach((group) => {
      const segmento = resolveLineSegment(post.segment, group.segment);
      group.materials.forEach((material) => push(material, segmento));
    });
    const segmentoPoste = resolveLineSegment(post.segment);
    (post.looseMaterials || []).forEach((material) => push(material, segmentoPoste));
  });

  return new Map(
    Array.from(map.entries()).map(([key, segmentos]) => [
      key,
      Array.from(segmentos).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    ])
  );
};

const buildSubgroupRows = (materiais: MaterialExport[]): any[][] => {
  const SEM_SUBGRUPO = 'Não classificado';
  const bySubgroup = new Map<string, MaterialExport[]>();
  materiais.forEach((material) => {
    const key = material.subgrupo || SEM_SUBGRUPO;
    if (!bySubgroup.has(key)) bySubgroup.set(key, []);
    bySubgroup.get(key)!.push(material);
  });

  const subgroupNames = Array.from(bySubgroup.keys()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const rows: any[][] = [];
  let totalGeral = 0;
  subgroupNames.forEach((subgrupo) => {
    const items = [...bySubgroup.get(subgrupo)!].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    rows.push([`SUBGRUPO: ${subgrupo}`]);
    rows.push(['Código', 'Material', 'Unidade', 'Quantidade', 'Preço Unit. (R$)', 'Subtotal (R$)']);
    let totalSubgrupo = 0;
    items.forEach((material) => {
      rows.push([material.codigo || '-', material.nome, material.unidade || '-', formatarNumero(material.quantidade), formatarNumero(material.precoUnit), formatarNumero(material.subtotal)]);
      totalSubgrupo += material.subtotal;
    });
    rows.push(['', '', '', '', 'TOTAL DO SUBGRUPO:', formatarNumero(totalSubgrupo)]);
    rows.push([]);
    totalGeral += totalSubgrupo;
  });
  rows.push(['', '', '', '', 'TOTAL GERAL:', formatarNumero(totalGeral)]);
  return rows;
};

export const exportByPostAndGroupToExcel = (posts: PostWithMaterials[], budgetName: string): void => {
  const workbook = XLSX.utils.book_new();
  const sheetData: any[] = [
    [`ORÇAMENTO: ${budgetName}`],
    [`Data de Exportação: ${new Date().toLocaleString('pt-BR')}`],
    [],
    ...buildPostGroupRows(posts),
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
  worksheet['!cols'] = [{ wch: 20 }, { wch: 50 }, { wch: 10 }, { wch: 15 }, { wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Materiais por Poste');

  const segmentWorksheet = XLSX.utils.aoa_to_sheet(buildSegmentRows(posts));
  segmentWorksheet['!cols'] = [{ wch: 20 }, { wch: 50 }, { wch: 10 }, { wch: 15 }, { wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(workbook, segmentWorksheet, 'Por Segmento');

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
