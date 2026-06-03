/**
 * PostgreSQL client singleton.
 *
 * Uses the `postgres` package (tagged template literals, not an ORM). Import
 * this `sql` instance everywhere — never construct a second connection pool.
 * Query parameters MUST be interpolated via the tagged template (`${value}`),
 * which parameterises safely; never build SQL by string concatenation.
 */
import postgres from 'postgres';
import { env } from '../config/env.js';

export const sql = postgres(env.DATABASE_URL, {
  // Conservative pool for a single API instance; raise for production scale.
  max: 10,
  idle_timeout: 20,
  // Map snake_case DB columns <-> camelCase JS keys automatically, so query
  // results line up with the shared TypeScript domain types. NOTE: numeric
  // columns still come back as strings — cast to ::float in SELECTs where a
  // JS number is required (cost_usd, confidence, similarity, etc.).
  transform: postgres.camel,
  onnotice: () => {
    // Suppress NOTICE chatter (e.g. "extension already exists") from logs.
  },
});

export type Sql = typeof sql;
