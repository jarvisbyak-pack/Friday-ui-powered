# n8n AI Voice & Chat Interface

A two-way real-time voice and text conversational AI interface designed to communicate with n8n webhook nodes and workflow automations. Powered by Google Gemini AI, Web Speech API, and Express/Vite.

---

## Features

- **Hands-Free Duplex Voice Mode**: Automatic speech recognition, turn-taking, and speech synthesis with configurable silence thresholds and sound effects.
- **n8n Webhook Integration**: Configure multiple n8n webhook endpoints, authentication headers (Bearer, Custom Header, None), and test connection latency.
- **AI Response Synthesis**: Gemini AI synthesizes complex n8n JSON responses into natural conversational speech.
- **Payload Inspector**: Real-time inspection of outgoing and incoming webhook payloads, response codes, and roundtrip latency.
- **Persistent Local Configuration**: Endpoint credentials and chat logs persist safely in your browser's local storage.

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
