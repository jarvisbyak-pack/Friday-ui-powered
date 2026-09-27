# FRIDAY Web UI

A browser-only React/Vite interface for FRIDAY. The production UI is a static website and communicates with the configured n8n workflow over HTTP/HTTPS.

## Architecture

```
Browser
  ↓ HTTPS
FRIDAY Web UI
  ↓ HTTPS POST/GET
n8n Webhook
  ↓
FRIDAY — Main Orchestrator
```

There is **no production local server, Express API, Gemini proxy, Ollama service, filesystem service, or desktop runtime** in this project.

## Web-only behavior

- The UI is built as static HTML/CSS/JavaScript.
- Chat and hands-free voice requests call the configured n8n Webhook URL directly from the browser.
- Webhook responses are parsed in the browser and shown in the conversation/payload inspector.
- Webhook connectivity tests also run directly from the browser.
- No `/api/*` application backend is required.
- No `localhost` or `127.0.0.1` endpoint is used by the production UI.
- No server-side Gemini API key is required by the UI.
- Configure the n8n HTTPS Webhook URL in **n8n Settings**.

## n8n requirements

Because the browser calls n8n directly, the n8n endpoint must be reachable over HTTPS and permit browser CORS requests from the deployed UI origin. The n8n workflow remains responsible for authentication, authorization, Gemini usage, tool execution, and verified execution reporting.

The UI sends a payload containing:

- `message`
- `query`
- `sessionId`
- `nodeEndpointId`
- `inputMode`
- `timestamp`
- any optional custom JSON fields configured in the UI

For POST requests the payload is sent as JSON. GET/HEAD requests do not receive a request body.

## Development

The repository contains only the Vite/React web application and its build configuration.

```bash
npm install
npm run build
```

The production deployment is performed by GitHub Actions and GitHub Pages.

## GitHub Pages

GitHub Pages hosts the generated static `dist` directory. GitHub's recommended Actions-based Pages flow builds the site, uploads the static artifact, and deploys it to the Pages environment. 

The workflow is:

1. Checkout `main`
2. Install web dependencies
3. Build with Vite
4. Upload `dist`
5. Deploy to GitHub Pages

No Node/Express process is started by the deployed site.

## Voice

Hands-free voice recognition and speech synthesis run in the browser using the browser's Web Speech APIs. The voice turn is sent to n8n only after the browser turn detector accepts it.

## Important security note

The browser is not a safe place for long-lived privileged secrets. Prefer protecting the n8n webhook with an appropriate short-lived/session mechanism or an n8n-side access-control strategy rather than exposing an n8n API key in the UI.

## Current FRIDAY UI features

- Chat and hands-free voice
- n8n Webhook URL configuration
- HTTP method selection
- Optional browser-sent authentication headers
- Direct webhook connectivity testing
- Payload inspector
- Night/Bright appearance
- FRIDAY accent color selection
- Browser speech feedback and controlled hands-free turn-taking
- Mobile-friendly responsive interface
