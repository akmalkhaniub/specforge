CREATE TABLE IF NOT EXISTS documents (
  id         uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  filename   text NOT NULL,
  mime_type  text NOT NULL,
  minio_key  text NOT NULL,
  size_bytes int NOT NULL,
  status     text NOT NULL DEFAULT 'pending'
             CHECK (status IN ('pending', 'processing', 'extracted', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS documents_project_id_idx ON documents (project_id);
