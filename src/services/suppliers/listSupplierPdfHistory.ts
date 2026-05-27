import type { SupabaseClient } from '@supabase/supabase-js';
import { getQuoteLabel } from '@/lib/quoteDisplay';

export type SupplierPdfHistoryStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'error'
  | 'quote_only';

export interface SupplierPdfHistoryItem {
  id: string;
  extraction_job_id: string | null;
  quote_id: string | null;
  session_id: string | null;
  file_path: string;
  label: string;
  uploaded_at: string;
  quote_date: string | null;
  job_status: SupplierPdfHistoryStatus;
  quote_status: string | null;
  error_message: string | null;
  item_count: number;
  quote_total: number;
  extraction_validated_at: string | null;
}

type JobRow = {
  id: string;
  session_id: string;
  file_path: string;
  status: string;
  error_message: string | null;
  quote_id: string | null;
  created_at: string;
  supplier_quotes: QuoteNested | QuoteNested[] | null;
};

type QuoteNested = {
  id: string;
  display_name: string | null;
  pdf_path: string;
  quote_date: string | null;
  status: string;
  session_id: string | null;
  extraction_validated_at: string | null;
  supplier_quote_items: { id: string; total_item: number }[] | null;
};

type QuoteOnlyRow = {
  id: string;
  session_id: string | null;
  pdf_path: string;
  display_name: string | null;
  quote_date: string | null;
  status: string;
  created_at: string;
  extraction_validated_at: string | null;
  supplier_quote_items: { id: string; total_item: number }[] | null;
};

function unwrapQuote(raw: QuoteNested | QuoteNested[] | null): QuoteNested | null {
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] ?? null : raw;
}

function summarizeQuote(quote: QuoteNested | null): {
  item_count: number;
  quote_total: number;
} {
  const items = quote?.supplier_quote_items ?? [];
  return {
    item_count: items.length,
    quote_total: items.reduce((sum, it) => sum + Number(it.total_item), 0),
  };
}

function mapJobStatus(status: string): SupplierPdfHistoryStatus {
  if (status === 'pending' || status === 'processing' || status === 'completed' || status === 'error') {
    return status;
  }
  return 'error';
}

function jobToHistoryItem(job: JobRow): SupplierPdfHistoryItem {
  const quote = unwrapQuote(job.supplier_quotes);
  const { item_count, quote_total } = summarizeQuote(quote);
  const label = quote
    ? getQuoteLabel(quote)
    : job.file_path.split('/').pop()?.replace(/^\d+_/, '') ?? 'PDF';

  return {
    id: job.id,
    extraction_job_id: job.id,
    quote_id: job.quote_id ?? quote?.id ?? null,
    session_id: job.session_id,
    file_path: job.file_path,
    label,
    uploaded_at: job.created_at,
    quote_date: quote?.quote_date ?? null,
    job_status: mapJobStatus(job.status),
    quote_status: quote?.status ?? null,
    error_message: job.error_message,
    item_count,
    quote_total,
    extraction_validated_at: quote?.extraction_validated_at ?? null,
  };
}

function quoteOnlyToHistoryItem(quote: QuoteOnlyRow): SupplierPdfHistoryItem {
  const { item_count, quote_total } = summarizeQuote(quote);

  return {
    id: quote.id,
    extraction_job_id: null,
    quote_id: quote.id,
    session_id: quote.session_id,
    file_path: quote.pdf_path,
    label: getQuoteLabel(quote),
    uploaded_at: quote.created_at,
    quote_date: quote.quote_date ?? null,
    job_status: 'quote_only',
    quote_status: quote.status,
    error_message: null,
    item_count,
    quote_total,
    extraction_validated_at: quote.extraction_validated_at ?? null,
  };
}

export async function listSupplierPdfHistory(
  supabase: SupabaseClient,
  userId: string,
  supplierId: string
): Promise<SupplierPdfHistoryItem[]> {
  const quoteSelect = `
    id,
    display_name,
    pdf_path,
    quote_date,
    status,
    session_id,
    extraction_validated_at,
    supplier_quote_items ( id, total_item )
  `;

  const { data: jobs, error: jobsError } = await supabase
    .from('extraction_jobs')
    .select(
      `
      id,
      session_id,
      file_path,
      status,
      error_message,
      quote_id,
      created_at,
      supplier_quotes ( ${quoteSelect} )
    `
    )
    .eq('user_id', userId)
    .eq('supplier_id', supplierId)
    .order('created_at', { ascending: false });

  if (jobsError) {
    throw new Error(jobsError.message);
  }

  const jobRows = (jobs ?? []) as JobRow[];
  const linkedQuoteIds = new Set(
    jobRows.map((j) => j.quote_id).filter((id): id is string => Boolean(id))
  );

  const { data: orphanQuotes, error: quotesError } = await supabase
    .from('supplier_quotes')
    .select(quoteSelect)
    .eq('user_id', userId)
    .eq('supplier_id', supplierId)
    .order('created_at', { ascending: false });

  if (quotesError) {
    throw new Error(quotesError.message);
  }

  const quoteOnlyRows = ((orphanQuotes ?? []) as QuoteOnlyRow[]).filter(
    (q) => !linkedQuoteIds.has(q.id)
  );

  const merged = [
    ...jobRows.map(jobToHistoryItem),
    ...quoteOnlyRows.map(quoteOnlyToHistoryItem),
  ];

  merged.sort(
    (a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()
  );

  return merged;
}
