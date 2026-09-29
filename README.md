# FRIDAY Web UI

A browser-first React/Vite interface for FRIDAY. This repository now supports a hosted Friday backend path while preserving the existing localhost/n8n-compatible development path.

## Architecture

Hosted direction:

Browser
  ↓ HTTPS
FRIDAY Web UI
  ↓ /api
FRIDAY Web Backend
  ↓
AI provider / future tools
  ↓
Persistent database + task workers (next phases)

Local compatibility remains available:

Browser
  ↓
Existing local/development configuration
  ↓
Configured n8n webhook

## Runtime modes

The UI keeps the existing n8n webhook integration for compatibility.

For the hosted Friday path, configure:

VITE_FRIDAY_BACKEND_MODE=api

In hosted mode, chat requests go to /api/chat and the Gemini credential stays server-side.

## Web backend foundation

- /api/health — deployment/runtime health check.
- /api/chat — server-side Gemini request boundary.
- GEMINI_API_KEY — server-only provider credential.
- GEMINI_MODEL — configured Gemini model name.

Do not expose GEMINI_API_KEY through VITE_ variables or browser code.

## Deployment

The project remains a Vite application and can be deployed as a web application. vercel.json defines the Vite build/output configuration.

The current migration is intentionally incremental. The localhost implementation is not deleted or replaced.

## Next Friday layers

1. Authentication
2. PostgreSQL persistence
3. Conversation and memory storage
4. Durable task queue and background workers
5. Streaming task events
6. File storage and processing
7. GitHub tool execution
8. Browser/web tools
9. Code execution/testing
10. Deployment and verification controls
11. Voice backend capabilities

The target architecture is a real web-based AI agent rather than a browser UI permanently dependent on n8n.
