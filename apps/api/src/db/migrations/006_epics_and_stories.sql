CREATE TABLE IF NOT EXISTS epics (
  id          uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text NOT NULL,
  priority    text NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  confidence  numeric(3, 2),
  embedding   vector(1536),
  metadata    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE TABLE IF NOT EXISTS stories (
  id                  uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  epic_id             uuid NOT NULL REFERENCES epics(id) ON DELETE CASCADE,
  title               text NOT NULL,
  description         text NOT NULL,
  persona             text,
  acceptance_criteria jsonb NOT NULL DEFAULT '[]',
  priority            text NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  story_points        int,
  confidence          numeric(3, 2),
  created_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);

CREATE INDEX IF NOT EXISTS epics_project_id_idx ON epics (project_id);
CREATE INDEX IF NOT EXISTS epics_document_id_idx ON epics (document_id);
CREATE INDEX IF NOT EXISTS stories_epic_id_idx ON stories (epic_id);

-- HNSW index for cosine similarity over epic embeddings.
CREATE INDEX IF NOT EXISTS epics_embedding_hnsw_idx
  ON epics USING hnsw (embedding vector_cosine_ops);
