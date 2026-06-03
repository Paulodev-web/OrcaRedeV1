-- Estado do pipeline multi-step (compatível com Vercel Hobby — 1 step por invocação)
ALTER TABLE extraction_jobs
  ADD COLUMN IF NOT EXISTS pipeline_phase TEXT NULL
    CHECK (pipeline_phase IN ('extract', 'match', 'finalize')),
  ADD COLUMN IF NOT EXISTS match_batch_index INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS match_total_batches INTEGER NULL,
  ADD COLUMN IF NOT EXISTS pipeline_context JSONB NULL;
