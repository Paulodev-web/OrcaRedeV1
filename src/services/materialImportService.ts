import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabaseClient';

export interface ProcessCSVResult {
  success: boolean;
  data?: Record<string, unknown>[];
  message: string;
  stats?: {
    totalProcessed: number;
    totalInserted: number;
    totalSkipped: number;
    totalFailed: number;
  };
}

function sanitizeText(text: string): string {
  if (!text) return '';
  return text
    .trim()
    .replace(/\s+/g, ' ')
    /* eslint-disable-next-line no-control-regex */
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .normalize('NFC');
}

export async function processMaterialCSV(file: File): Promise<ProcessCSVResult> {
  try {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const worksheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[worksheetName];
    const allRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as Array<any[]>;

    if (!allRows || allRows.length === 0) {
      return { success: false, message: 'Planilha vazia ou em formato inválido.' };
    }

    const materialsMap = new Map<string, any>();
    let validRowsCount = 0;
    let skippedRowsCount = 0;

    for (let i = 1; i < allRows.length; i++) {
      const row = allRows[i];
      if (!row || row.length < 2) { skippedRowsCount++; continue; }
      const internalCode = row[0];
      const description = row[1];
      if (internalCode && description && String(description).trim()) {
        const cleanCode = String(internalCode).trim();
        if (!materialsMap.has(cleanCode)) {
          materialsMap.set(cleanCode, {
            code: cleanCode,
            name: sanitizeText(String(description)),
            description: sanitizeText(String(description)),
            price: 0,
            unit: 'un',
          });
          validRowsCount++;
        } else {
          skippedRowsCount++;
        }
      } else {
        skippedRowsCount++;
      }
    }

    const materialsToUpsert = Array.from(materialsMap.values());
    if (materialsToUpsert.length === 0) {
      return { success: false, message: 'Nenhum material válido encontrado.' };
    }

    return {
      success: true,
      data: materialsToUpsert,
      message: `${materialsToUpsert.length} materiais únicos processados com sucesso.`
    };
  } catch (error: any) {
    return { success: false, message: `Falha no processamento: ${error.message}` };
  }
}

async function sendBatchToSupabase(materials: any[]) {
  const { data, error } = await supabase.rpc('import_materials_ignore_duplicates', {
    materials_data: materials,
  });
  if (error) throw new Error(`Falha ao processar um lote: ${error.message}`);
  return data;
}

export async function processAndUploadMaterials(file: File): Promise<ProcessCSVResult> {
  let allMaterials: any[];

  try {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const worksheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[worksheetName];
    const allRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as Array<any[]>;

    if (!allRows || allRows.length === 0) {
      return { success: false, message: 'Planilha vazia ou em formato inválido.' };
    }

    const materialsMap = new Map<string, any>();

    for (let i = 1; i < allRows.length; i++) {
      const row = allRows[i];
      if (!row || row.length < 2) continue;
      const internalCode = row[0];
      const description = row[1];
      if (internalCode && description && String(description).trim()) {
        const cleanCode = String(internalCode).trim();
        if (!materialsMap.has(cleanCode)) {
          materialsMap.set(cleanCode, {
            code: cleanCode,
            name: sanitizeText(String(description)),
            description: sanitizeText(String(description)),
            price: 0,
            unit: 'un',
          });
        }
      }
    }

    allMaterials = Array.from(materialsMap.values());
  } catch (error: any) {
    return { success: false, message: `Erro ao processar o Excel: ${error.message}` };
  }

  if (allMaterials.length === 0) {
    return { success: false, message: 'Nenhum material válido encontrado.' };
  }

  const BATCH_SIZE = 200;
  let totalInserted = 0;
  let totalSkipped = 0;

  try {
    for (let i = 0; i < allMaterials.length; i += BATCH_SIZE) {
      const batch = allMaterials.slice(i, i + BATCH_SIZE);
      const result = await sendBatchToSupabase(batch);
      if (result) {
        totalInserted += result.inserted || 0;
        totalSkipped += result.skipped || 0;
      }
    }

    return {
      success: true,
      message: `✅ ${totalInserted} inseridos, ${totalSkipped} já existentes.`,
      stats: { totalProcessed: allMaterials.length, totalInserted, totalSkipped, totalFailed: 0 },
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Erro ao enviar materiais: ${error.message}`,
      stats: {
        totalProcessed: allMaterials.length,
        totalInserted,
        totalSkipped,
        totalFailed: allMaterials.length - (totalInserted + totalSkipped),
      },
    };
  }
}
