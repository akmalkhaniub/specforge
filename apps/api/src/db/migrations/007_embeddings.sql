-- Unified embeddings table for semantic search across epics, stories, and
-- documents. Always queried with an org_id (and usually project_id) filter
-- BEFORE the vector distance, so the tenant scope is an index, not an afterthought.
CREATE TABLE IF NOT EXISTS embeddings (
  id          uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  org_id      uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('epic', 'story', 'document')),
  source_id   uuid NOT NULL,
  content     text NOT NULL,
  embedding   vector(1536) NOT NULL,
  metadata    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS embeddings_embedding_hnsw_idx
  ON embeddings USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS embeddings_org_project_idx
  ON embeddings (org_id, project_id);
