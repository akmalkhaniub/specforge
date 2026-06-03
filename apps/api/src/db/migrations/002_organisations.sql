-- Tenants. Everything else is scoped (directly or transitively) to an org.
CREATE TABLE IF NOT EXISTS organisations (
  id         uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  name       text NOT NULL,
  slug       text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
