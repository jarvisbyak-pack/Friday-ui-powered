# Friday Web Backend

This branch introduces the hosted backend path without removing the existing browser-to-n8n path.

## Runtime modes

- Local/current mode: browser can continue using the configured n8n webhook.
- Hosted mode: set VITE_FRIDAY_BACKEND_MODE=api; the UI sends chat requests to /api/chat.
- The Gemini credential stays server-side in GEMINI_API_KEY.
- GEMINI_MODEL selects the configured Gemini model.

## Current foundation

- /api/health — deployment/runtime health check.
- /api/chat — server-side Gemini request boundary.

## Next backend layers

The next stages are persistent authentication, PostgreSQL-backed conversations/tasks, a durable queue/worker system, file storage, GitHub tool execution, browser tools, and streaming task events.

The existing localhost implementation remains untouched on this branch.
