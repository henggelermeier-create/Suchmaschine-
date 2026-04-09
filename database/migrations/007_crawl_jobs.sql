CREATE TABLE IF NOT EXISTS crawl_jobs (
  id BIGSERIAL PRIMARY KEY,
  source_name TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'fast',
  status TEXT NOT NULL DEFAULT 'pending',
  requested_by TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_crawl_jobs_status_requested_at
  ON crawl_jobs(status, requested_at DESC);
