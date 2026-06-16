import type { GeneratePdfRequest, TableData } from '@/types/pdfExport';

export function validateGeneratePdfRequest(body: unknown):
  | { ok: true; data: GeneratePdfRequest }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Corpo da requisição inválido.' };
  }

  const raw = body as Record<string, unknown>;
  if (!Array.isArray(raw.tables) || raw.tables.length === 0) {
    return { ok: false, error: 'É necessário informar ao menos uma tabela.' };
  }

  const tables: TableData[] = [];
  for (let i = 0; i < raw.tables.length; i++) {
    const t = raw.tables[i];
    if (!t || typeof t !== 'object') {
      return { ok: false, error: `Tabela ${i + 1} inválida.` };
    }
    const table = t as Record<string, unknown>;
    if (!Array.isArray(table.columns) || table.columns.length === 0) {
      return { ok: false, error: `Tabela ${i + 1}: defina ao menos uma coluna.` };
    }
    const columns: TableData['columns'] = [];
    for (let j = 0; j < table.columns.length; j++) {
      const c = table.columns[j];
      if (!c || typeof c !== 'object') {
        return { ok: false, error: `Tabela ${i + 1}, coluna ${j + 1} inválida.` };
      }
      const col = c as Record<string, unknown>;
      if (typeof col.header !== 'string' || !col.header.trim()) {
        return {
          ok: false,
          error: `Tabela ${i + 1}, coluna ${j + 1}: cabeçalho obrigatório.`,
        };
      }
      const weight = col.weight != null ? Number(col.weight) : undefined;
      columns.push({
        header: col.header.trim(),
        weight: weight != null && !Number.isNaN(weight) ? weight : undefined,
      });
    }

    if (!Array.isArray(table.rows)) {
      return { ok: false, error: `Tabela ${i + 1}: linhas inválidas.` };
    }

    for (const row of table.rows) {
      if (!Array.isArray(row)) {
        return { ok: false, error: `Tabela ${i + 1}: cada linha deve ser um array.` };
      }
      if (row.length !== columns.length) {
        return {
          ok: false,
          error: `Tabela ${i + 1}: todas as linhas devem ter ${columns.length} células.`,
        };
      }
    }

    tables.push({
      title: typeof table.title === 'string' ? table.title : undefined,
      columns,
      rows: table.rows.map((row) =>
        (row as unknown[]).map((cell) => String(cell ?? ''))
      ),
    });
  }

  const supplierRaw = raw.supplier;
  let supplier: GeneratePdfRequest['supplier'];
  if (supplierRaw && typeof supplierRaw === 'object') {
    const s = supplierRaw as Record<string, unknown>;
    if (typeof s.name === 'string' && s.name.trim()) {
      supplier = {
        name: s.name.trim(),
        cnpj: optionalString(s.cnpj),
        phone: optionalString(s.phone),
        email: optionalString(s.email),
        address: optionalString(s.address),
        salesContact: optionalString(s.salesContact),
        paymentTerms: optionalString(s.paymentTerms),
      };
    }
  }

  const metaRaw = raw.meta;
  let meta: GeneratePdfRequest['meta'];
  if (metaRaw && typeof metaRaw === 'object') {
    const m = metaRaw as Record<string, unknown>;
    meta = {
      sessionTitle: optionalMetaString(m.sessionTitle),
      budgetLabel: optionalMetaString(m.budgetLabel),
      exportedAt: optionalMetaString(m.exportedAt),
    };
  }

  return { ok: true, data: { tables, supplier, meta } };
}

function optionalString(v: unknown): string | null | undefined {
  if (v == null) return undefined;
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

function optionalMetaString(v: unknown): string | undefined {
  const s = optionalString(v);
  return s ?? undefined;
}
