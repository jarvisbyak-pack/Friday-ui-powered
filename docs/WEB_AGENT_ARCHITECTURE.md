# Friday Web Agent — Next Foundation

The existing Brain, gateway, MCP and n8n integrations remain the execution layer. This layer adds server-side web identity and durable task/event records.

## Added
- User/session persistence.
- Owner bootstrap via FRIDAY_OWNER_EMAIL and FRIDAY_OWNER_PASSWORD.
- Task and task-event persistence.
- PostgreSQL production schema.
- Local JSON fallback for immediate development.

## Security boundary
Browser clients receive a session token. Gemini, n8n MCP and other privileged provider credentials remain server-side.

## Task lifecycle
QUEUED -> UNDERSTAND -> PLAN -> AUTHORIZE -> BUILD -> EXECUTE -> INSPECT -> VERIFY -> FIX -> RE_TEST -> COMPLETE

## Next
Connect DATABASE_URL/PostgreSQL, move task execution to a durable worker/queue, and stream task events to the UI.
