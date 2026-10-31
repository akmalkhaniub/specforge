-- Application users. Each user belongs to exactly one organisation; all data
-- access is scoped to that org (enforced in the auth middleware + queries).
CREATE TABLE IF NOT EXISTS users (
  id            uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  org_id        uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  email         text UNIQUE NOT NULL,
  name          text NOT NULL,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_org_id_idx ON users (org_id);
