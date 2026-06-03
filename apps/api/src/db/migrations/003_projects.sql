CREATE TABLE IF NOT EXISTS projects (
  id             uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  org_id         uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name           text NOT NULL,
  description    text,
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  document_count int NOT NULL DEFAULT 0,
  epic_count     int NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);

CREATE INDEX IF NOT EXISTS projects_org_id_idx ON projects (org_id);
