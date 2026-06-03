-- Convenience view joining extraction jobs to their document and project, plus
-- per-document epic/story counts. Powers the analytics "recent jobs" table.
CREATE OR REPLACE VIEW extraction_analytics AS
SELECT
  ej.id,
  ej.document_id,
  ej.status,
  ej.model,
  ej.prompt_tokens,
  ej.completion_tokens,
  ej.cache_read_tokens,
  ej.cache_write_tokens,
  ej.cost_usd,
  ej.latency_ms,
  ej.error,
  ej.created_at,
  ej.completed_at,
  d.filename,
  d.mime_type,
  d.size_bytes,
  p.id   AS project_id,
  p.name AS project_name,
  p.org_id,
  (SELECT COUNT(*) FROM epics e WHERE e.document_id = d.id AND e.deleted_at IS NULL) AS epic_count,
  (SELECT COUNT(*) FROM stories s
     JOIN epics e ON s.epic_id = e.id
     WHERE e.document_id = d.id AND s.deleted_at IS NULL) AS story_count
FROM extraction_jobs ej
JOIN documents d ON ej.document_id = d.id
JOIN projects p ON d.project_id = p.id;
