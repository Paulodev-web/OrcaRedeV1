/**
 * Tipos gerados do Postgres (Supabase CLI).
 * Regenerar após migrations:
 *   npm run gen:supabase-types
 * (requer `supabase link` e CLI instalada)
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = Record<string, never>;
