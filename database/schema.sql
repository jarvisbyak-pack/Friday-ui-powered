CREATE TABLE IF NOT EXISTS friday_users(id UUID PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN('owner','admin','user')),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS friday_sessions(token_hash TEXT PRIMARY KEY,user_id UUID NOT NULL REFERENCES friday_users(id) ON DELETE CASCADE,expires_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS friday_tasks(id UUID PRIMARY KEY,user_id UUID NOT NULL REFERENCES friday_users(id) ON DELETE CASCADE,command TEXT NOT NULL,status TEXT NOT NULL,payload JSONB,result JSONB,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX IF NOT EXISTS friday_tasks_user_created_idx ON friday_tasks(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS friday_task_events(id UUID PRIMARY KEY,task_id UUID NOT NULL REFERENCES friday_tasks(id) ON DELETE CASCADE,at TIMESTAMPTZ NOT NULL DEFAULT NOW(),phase TEXT NOT NULL,message TEXT NOT NULL,details JSONB);
CREATE INDEX IF NOT EXISTS friday_task_events_task_at_idx ON friday_task_events(task_id,at);
