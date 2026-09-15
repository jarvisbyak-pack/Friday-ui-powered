# n8n AI Voice & Chat Interface

A two-way real-time voice and text conversational interface for FRIDAY, an authorization-aware task agent. The React UI talks only to the Express backend; providers, credentials, and tools stay server-side.

---

## Features

- **Hands-Free Duplex Voice Mode**: Automatic speech recognition, turn-taking, and speech synthesis with configurable silence thresholds and sound effects.
- **n8n Webhook Integration**: Configure multiple n8n webhook endpoints, authentication headers (Bearer, Custom Header, None), and test connection latency.
- **AI Response Synthesis**: Gemini AI synthesizes complex n8n JSON responses into natural conversational speech.
- **Payload Inspector**: Real-time inspection of outgoing and incoming webhook payloads, response codes, and roundtrip latency.
- **Persistent Local Configuration**: Endpoint credentials and chat logs persist safely in your browser's local storage.
- **FRIDAY task orchestration**: Server-persisted state transitions, execution history, explicit authorization, and actual-result reporting.
- **Extensible boundaries**: Provider registry, tool registry, n8n integration service, and server-side configuration contracts.

## FRIDAY task flow

`UNDERSTAND → PLAN → AUTHORIZE → BUILD → EXECUTE → INSPECT → VERIFY → FIX → RE-TEST → COMPLETE`

The initial implementation executes only an unambiguous `Run my <workflow> workflow` command. It first performs read-only n8n discovery, stops for explicit authorization, then invokes only a configured workflow webhook. A webhook HTTP response is not reported as a verified workflow completion unless an execution result can be retrieved.

### Current integration boundaries

- `src/server/orchestrator.ts`: command understanding, plan construction, authorization gate, state transitions, inspection, and truthful result reporting.
- `src/server/providers.ts`: provider contract and registry. Gemini is operational when `GEMINI_API_KEY` is present. OpenAI, Anthropic, and Ollama are declared configuration targets but intentionally have no adapter yet.
- `src/server/n8n.ts`: real n8n HTTP API client for health, workflow discovery/retrieval, execution discovery/retrieval, and gated workflow mutation endpoints. Workflow execution uses an explicitly configured, approved webhook mapping.
- `src/server/tools.ts`: registry seam for n8n and future GitHub, files, HTTP, browser, database, MCP, and multi-agent tools.
- `src/server/task-store.ts`: server-side JSON task history. The data directory is ignored by Git and must be replaced with a database for multi-instance production deployments.
- `src/server/profile-store.ts`: explicit, structured user/project memory. Temporary conversation content is not persisted automatically; sensitive memories are withheld from browser responses and model prompts.
- `src/server/personality.ts`: FRIDAY's natural, teammate-like communication policy. It explicitly prioritizes evidence and user authorization over tone.

### n8n safety model

`N8N_BASE_URL` enables read-only API discovery. An execution additionally requires an exact workflow-name or workflow-id mapping in `N8N_WORKFLOW_WEBHOOKS_JSON` and an explicit UI authorization. Creation, updates, activation, and deactivation are implemented behind `FRIDAY_ALLOW_N8N_MUTATIONS=true`; no task planner invokes them automatically.

---

## Getting Started

### Prerequisites

- Node.js 18+ or 20+
- npm or bun or yarn

### 1. Installation

Clone your repository and install dependencies:

```bash
git clone <your-repository-url>
cd <repository-directory>
npm install
```

### 2. Environment Variables

Create a `.env` file in the root directory (or copy from `.env.example`):

```bash
cp .env.example .env
```

Add your Gemini API Key in `.env`:

```env
GEMINI_API_KEY=your_actual_gemini_api_key_here
```

*(You can obtain a Gemini API key free from [Google AI Studio](https://aistudio.google.com/).)*

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Production Build & Deployment

### Running the Full-Stack Application (Recommended)

To build both the frontend and the Express backend:

```bash
npm run build
npm start
```

This starts the Node.js production server on port 3000, serving the optimized static bundle and proxying n8n webhook dispatches and Gemini AI processing.

### Deploying to Cloud Hosts

You can deploy this repository to any Node.js hosting platform:
- **Render / Railway / Fly.io / Heroku**: Set build command to `npm run build` and start command to `npm start`. Set the `GEMINI_API_KEY` in your environment variables.
- **Google Cloud Run**: Build a container or connect directly from GitHub.
- **Docker**: Run `npm run build` and `npm start`.

---

## Troubleshooting: Blank White Screen on GitHub

If you previously experienced a blank white screen after pushing or deploying to GitHub / GitHub Pages:

1. **Relative Asset Paths**: Vite's `base` is now configured to `./` in `vite.config.ts`. On GitHub Pages (`https://username.github.io/repo-name/`), relative paths prevent 404 errors on `/assets/index.js` and `/assets/index.css`.
2. **Static vs. Full-Stack**: GitHub Pages is a **static-only** web host that cannot run backend Node.js code (`server.ts`). For the full application with Gemini AI synthesis and server-side webhook proxying, run the app via Node (`npm run dev` or `npm start`) or deploy to a container / Node platform (e.g. Render, Railway, Cloud Run).
3. **React Error Boundary**: An error boundary has been added to catch any runtime exceptions and display a recovery screen instead of a blank white page.
