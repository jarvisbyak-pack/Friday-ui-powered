# Friday — Web Platform

Friday is a web-based AI agent platform. This repository is the source of truth for the application.

## Current architecture

- **Frontend:** premium responsive AI chat UI, hosted independently from the backend.
- **Backend:** Express API with authentication, conversations, tasks, agent orchestration, files, GitHub tools, and SSE task events.
- **Database:** PostgreSQL for persistent users, conversations, tasks, events, memory, sessions, and application state.
- **Workers:** background task execution with persisted task state and stale-task recovery.
- **AI:** provider abstraction currently configured for Gemini.
- **GitHub:** repository inspection and controlled mutations, with mutation flags disabled by default.
- **Code execution:** controlled allowlist and disabled by default.
- **Web access:** read-only fetching with SSRF protections.
- **n8n:** optional integration only; it is not Friday's core execution layer.

## Phase 1 frontend

The frontend provides:

- Premium, uncluttered AI chat interface
- Responsive desktop and mobile layouts
- Dark mode with bright-mode option
- Conversation and history surface
- Task progress/status display
- File attachment surface
- Voice interaction surface reserved for the agent layer
- Backend API integration

## Development

Frontend files are served as a lightweight static application.

Backend commands:

```bash
cd backend
npm install
npm run build
npm test
npm start
```

The backend requires PostgreSQL and environment variables from `backend/.env.example`.

## CI

GitHub Actions verifies:

- Frontend JavaScript syntax and required assets
- Backend TypeScript build
- Backend tests against PostgreSQL

Workflows are stored in `.github/workflows/frontend.yml` and `.github/workflows/backend.yml`.

## Deployment

The frontend can be hosted on GitHub Pages. The production frontend must point to a separately deployed HTTPS Friday backend, and the backend must allow the exact GitHub Pages origin through `FRONTEND_ORIGIN`.

The GitHub Pages site cannot execute backend API routes itself; backend deployment is therefore the next deployment step after local runtime verification.
