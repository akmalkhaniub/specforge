CREATE TABLE IF NOT EXISTS extraction_jobs (
  id                uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  document_id       uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  status            text NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'processing', 'complete', 'failed')),
  progress          int NOT NULL DEFAULT 0,
  stage             text,
  model             text,
  prompt_tokens     int NOT NULL DEFAULT 0,
  completion_tokens int NOT NULL DEFAULT 0,
  cache_read_tokens int NOT NULL DEFAULT 0,
  cache_write_tokens int NOT NULL DEFAULT 0,
  cost_usd          numeric(10, 6) NOT NULL DEFAULT 0,
  latency_ms        int,
  error             text,
  started_at        timestamptz,
  completed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS extraction_jobs_document_id_idx ON extraction_jobs (document_id);
CREATE INDEX IF NOT EXISTS extraction_jobs_status_idx ON extraction_jobs (status);
