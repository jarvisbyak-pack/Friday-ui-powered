-- Phase 1 persistent project, settings, tool, and agent execution schema.
-- This migration is intentionally forward-only and safe to run once via the migration ledger.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  description TEXT,
  repository_owner TEXT,
  repository_name TEXT,
  repository_url TEXT,
  default_branch TEXT NOT NULL DEFAULT 'main',
  workspace_path TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT projects_repository_pair_unique
    UNIQUE (owner_user_id, repository_owner, repository_name)
);

CREATE INDEX IF NOT EXISTS projects_owner_updated_idx
  ON projects (owner_user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS project_members (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS project_members_user_idx
  ON project_members (user_id, project_id);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  accent_color TEXT NOT NULL DEFAULT 'blue'
    CHECK (accent_color IN ('blue', 'purple', 'red', 'green', 'custom')),
  accent_custom_value TEXT
    CHECK (
      accent_custom_value IS NULL OR
      accent_custom_value ~ '^#[0-9A-Fa-f]{6}$'
    ),
  theme TEXT NOT NULL DEFAULT 'dark'
    CHECK (theme IN ('dark', 'light', 'system')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_settings_custom_accent_check
    CHECK (
      (accent_color = 'custom' AND accent_custom_value IS NOT NULL)
      OR
      (accent_color <> 'custom')
    )
);

CREATE TABLE IF NOT EXISTS project_settings (
  project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  default_branch TEXT NOT NULL DEFAULT 'main',
  deployment_target TEXT,
  deployment_state TEXT NOT NULL DEFAULT 'unknown'
    CHECK (deployment_state IN ('unknown', 'pending', 'building', 'deployed', 'failed')),
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tool_key TEXT NOT NULL
    CHECK (tool_key IN ('github', 'web', 'files', 'sandbox', 'firecrawl', 'browser')),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, tool_key)
);

CREATE INDEX IF NOT EXISTS project_tools_project_enabled_idx
  ON project_tools (project_id, enabled, tool_key);

CREATE TABLE IF NOT EXISTS tool_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  tool_key TEXT NOT NULL
    CHECK (tool_key IN ('github', 'web', 'files', 'sandbox', 'firecrawl', 'browser')),
  credential_type TEXT NOT NULL,
  encrypted_secret TEXT NOT NULL,
  encryption_key_version INTEGER NOT NULL DEFAULT 1
    CHECK (encryption_key_version > 0),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_tested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tool_credentials_owner_tool_idx
  ON tool_credentials (user_id, tool_key, enabled);

CREATE INDEX IF NOT EXISTS tool_credentials_project_tool_idx
  ON tool_credentials (project_id, tool_key, enabled);
CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  input JSONB,
  result JSONB,
  error JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agent_runs_completion_order_check
    CHECK (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at)
);

CREATE INDEX IF NOT EXISTS agent_runs_user_created_idx
  ON agent_runs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_runs_project_created_idx
  ON agent_runs (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_runs_task_idx
  ON agent_runs (task_id);

CREATE TABLE IF NOT EXISTS execution_logs (
  id BIGSERIAL PRIMARY KEY,
  agent_run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  sequence BIGINT NOT NULL CHECK (sequence > 0),
  level TEXT NOT NULL DEFAULT 'info'
    CHECK (level IN ('debug', 'info', 'warn', 'error')),
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agent_run_id, sequence)
);

CREATE INDEX IF NOT EXISTS execution_logs_run_sequence_idx
  ON execution_logs (agent_run_id, sequence);

-- The existing conversations.user_id column predates the users table.
-- Add the missing relationship without rewriting earlier migrations.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'conversations_user_id_fkey'
  ) THEN
    ALTER TABLE conversations
      ADD CONSTRAINT conversations_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;
