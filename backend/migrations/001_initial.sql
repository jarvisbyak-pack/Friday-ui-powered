CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  input JSONB,
  state TEXT NOT NULL DEFAULT 'queued'
    CHECK (state IN ('queued', 'running', 'waiting', 'completed', 'failed', 'retrying')),
  error TEXT,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tasks_state_created_idx
  ON tasks (state, created_at);
