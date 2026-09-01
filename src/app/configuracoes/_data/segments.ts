import "server-only";
import { createSupabaseServerClient, requireAuthUserId } from "@/lib/supabaseServer";
import { listWorkSegments, type WorkSegment } from "@/services/segments/workSegments";

/**
 * Leitura do catálogo de segmentos de obra para `/configuracoes/segmentos`.
 *
 * Reaproveita `listWorkSegments` — a mesma função que o workspace do orçamento
 * usa — para que a ordem exibida aqui seja exatamente a que aparece nos
 * seletores do orçamento e nas tabelas da proposta.
 */
export async function listWorkSegmentsForSettings(): Promise<WorkSegment[]> {
  const supabase = await createSupabaseServerClient();
  const userId = await requireAuthUserId(supabase);
  return listWorkSegments(supabase, userId);
}
