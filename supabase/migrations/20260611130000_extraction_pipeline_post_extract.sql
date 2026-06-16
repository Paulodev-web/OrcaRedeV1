-- Edge + Vercel usam pipeline_phase 'post_extract' após Gemini+persist (antes de L1/L2)
ALTER TABLE extraction_jobs
  DROP CONSTRAINT IF EXISTS extraction_jobs_pipeline_phase_check;

ALTER TABLE extraction_jobs
  ADD CONSTRAINT extraction_jobs_pipeline_phase_check
  CHECK (pipeline_phase IS NULL OR pipeline_phase IN ('extract', 'post_extract', 'match', 'finalize'));
