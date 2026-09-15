import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { config } from './src/server/config';
import { FridayOrchestrator } from './src/server/orchestrator';
import { ProviderRegistry } from './src/server/providers';
import { TaskStore } from './src/server/task-store';
import { ToolRegistry } from './src/server/tools';
import { ProfileStore } from './src/server/profile-store';
import { buildFridaySystemPrompt } from './src/server/personality';

dotenv.config();

const app = express();
const PORT = config.port;
const taskStore = new TaskStore(config.dataDir);
const toolRegistry = new ToolRegistry();
const providerRegistry = new ProviderRegistry();
const orchestrator = new FridayOrchestrator(taskStore, toolRegistry);
const profileStore = new ProfileStore(config.dataDir);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// FRIDAY orchestration API. It exposes state and capability metadata, never credentials.
app.get('/api/friday/status', (_req, res) => {
  res.json({ providers: providerRegistry.status(), tools: toolRegistry.status(), taskCount: taskStore.list().length });
});

app.get('/api/friday/tasks', (_req, res) => res.json({ tasks: taskStore.list() }));

app.get('/api/friday/profile', (_req, res) => res.json({ memories: profileStore.listPublic() }));

app.post('/api/friday/profile/memories', (req, res) => {
  try {
    const { scope, key, value, confirmed } = req.body || {};
    const memory = profileStore.save({ scope, key, value }, confirmed === true);
    res.status(201).json({ memory });
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to save memory.' }); }
});

app.delete('/api/friday/profile/memories/:id', (req, res) => {
  if (!profileStore.remove(req.params.id)) return res.status(404).json({ error: 'Memory not found.' });
  res.status(204).end();
});

app.get('/api/friday/tasks/:id', (req, res) => {
  const task = taskStore.get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  res.json({ task });
});

app.post('/api/friday/tasks', async (req, res) => {
  const command = typeof req.body?.command === 'string' ? req.body.command.trim() : '';
  if (!command) return res.status(400).json({ error: 'A command is required.' });
  const task = await orchestrator.submit(command);
  res.status(201).json({ task });
});

app.post('/api/friday/tasks/:id/authorization', async (req, res) => {
  if (typeof req.body?.approved !== 'boolean') return res.status(400).json({ error: 'approved must be a boolean.' });
  const task = await orchestrator.authorize(req.params.id, req.body.approved);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  res.json({ task });
});

// Lazy GoogleGenAI client
let aiClient: GoogleGenAI | null = null;
function getAiClient(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    timestamp: new Date().toISOString(),
  });
});

// Test/Ping n8n Webhook Node endpoint
app.post('/api/n8n/test', async (req, res) => {
  const { webhookUrl, method = 'POST', headers = {} } = req.body;

  if (!webhookUrl || typeof webhookUrl !== 'string') {
    res.status(400).json({
      ok: false,
      error: 'A valid n8n Webhook URL is required to test connectivity.',
    });
    return;
  }

  const startTime = Date.now();
  try {
    const fetchOptions: RequestInit = {
      method: method.toUpperCase(),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/plain, */*',
        'User-Agent': 'n8n-AI-Voice-Interface/1.0',
        ...headers,
      },
    };

    if (fetchOptions.method !== 'GET' && fetchOptions.method !== 'HEAD') {
      fetchOptions.body = JSON.stringify({
        event: 'test_connection',
        source: 'n8n_ai_voice_interface',
        timestamp: new Date().toISOString(),
        message: 'Ping from AI Voice & Chat Interface',
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    fetchOptions.signal = controller.signal;

    const response = await fetch(webhookUrl, fetchOptions);
    clearTimeout(timeout);

    const latencyMs = Date.now() - startTime;
    const contentType = response.headers.get('content-type') || '';
    let responseData: any = null;

    if (contentType.includes('application/json')) {
      try {
        responseData = await response.json();
      } catch {
        responseData = await response.text();
      }
    } else {
      responseData = await response.text();
    }

    res.json({
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      latencyMs,
      contentType,
      data: responseData,
    });
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    res.status(502).json({
      ok: false,
      error: error.message || 'Failed to connect to n8n webhook',
      latencyMs,
      isTimeout: error.name === 'AbortError',
    });
  }
});

// Dispatch message to n8n Webhook node and optionally synthesize conversational reply
app.post('/api/n8n/dispatch', async (req, res) => {
  const {
    webhookUrl,
    method = 'POST',
    headers = {},
    customBody = {},
    userMessage = '',
    inputMode = 'text',
    sessionId = 'session-default',
    nodeEndpointId = '',
    synthesizeWithAi = true,
    systemPrompt = '',
    conversationHistory = [],
  } = req.body;

  let n8nResponseData: any = null;
  let n8nStatus: number | null = null;
  let n8nLatencyMs: number | null = null;
  let n8nError: string | null = null;
  let n8nReachable = false;

  const startTime = Date.now();

  // If a webhook URL is configured, forward to n8n
  if (webhookUrl && typeof webhookUrl === 'string' && webhookUrl.trim().length > 0) {
    try {
      const parsedUrl = webhookUrl.trim();
      const fetchHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/plain, */*',
        'User-Agent': 'n8n-AI-Voice-Interface/1.0',
        ...headers,
      };

      const payload = {
        message: userMessage,
        query: userMessage,
        sessionId,
        nodeEndpointId,
        inputMode, // 'voice' | 'text'
        timestamp: new Date().toISOString(),
        ...customBody,
      };

      const fetchOptions: RequestInit = {
        method: method.toUpperCase(),
        headers: fetchHeaders,
      };

      if (fetchOptions.method !== 'GET' && fetchOptions.method !== 'HEAD') {
        fetchOptions.body = JSON.stringify(payload);
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      fetchOptions.signal = controller.signal;

      const response = await fetch(parsedUrl, fetchOptions);
      clearTimeout(timeout);

      n8nLatencyMs = Date.now() - startTime;
      n8nStatus = response.status;
      n8nReachable = true;

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          n8nResponseData = await response.json();
        } catch {
          n8nResponseData = await response.text();
        }
      } else {
        n8nResponseData = await response.text();
      }
    } catch (err: any) {
      n8nLatencyMs = Date.now() - startTime;
      n8nError = err.message || 'Unable to connect to n8n webhook';
    }
  }

  // Determine what spoken / readable text response to produce
  let extractedReplyText = '';

  if (n8nResponseData !== null) {
    if (typeof n8nResponseData === 'string') {
      extractedReplyText = n8nResponseData;
    } else if (typeof n8nResponseData === 'object') {
      // Check common n8n AI response fields or webhook response fields
      if (typeof n8nResponseData.output === 'string') {
        extractedReplyText = n8nResponseData.output;
      } else if (typeof n8nResponseData.reply === 'string') {
        extractedReplyText = n8nResponseData.reply;
      } else if (typeof n8nResponseData.response === 'string') {
        extractedReplyText = n8nResponseData.response;
      } else if (typeof n8nResponseData.message === 'string') {
        extractedReplyText = n8nResponseData.message;
      } else if (typeof n8nResponseData.text === 'string') {
        extractedReplyText = n8nResponseData.text;
      } else if (Array.isArray(n8nResponseData) && n8nResponseData.length > 0) {
        // e.g. [{ json: { ... } }] standard n8n array format
        const first = n8nResponseData[0];
        if (first?.json && typeof first.json === 'object') {
          extractedReplyText =
            first.json.output ||
            first.json.reply ||
            first.json.message ||
            first.json.text ||
            JSON.stringify(first.json, null, 2);
        } else if (typeof first === 'string') {
          extractedReplyText = first;
        } else {
          extractedReplyText = JSON.stringify(n8nResponseData, null, 2);
        }
      } else {
        extractedReplyText = JSON.stringify(n8nResponseData, null, 2);
      }
    }
  }

  // Check if AI synthesis is requested or if Gemini should assist (especially for voice spoken clarity or workflow co-pilot)
  let aiSynthesizedText = extractedReplyText;
  let aiUsed = false;

  const ai = getAiClient();

  if (synthesizeWithAi && ai) {
    try {
      const finalInstruction = buildFridaySystemPrompt(profileStore.contextForPrompt(), systemPrompt);

      const promptContext = [
        `User Input (${inputMode === 'voice' ? 'spoken voice' : 'text'}): "${userMessage}"`,
        n8nReachable
          ? `n8n Webhook Node Status: HTTP ${n8nStatus}\nn8n Webhook Raw Output:\n${typeof n8nResponseData === 'object' ? JSON.stringify(n8nResponseData) : String(n8nResponseData)}`
          : n8nError
            ? `n8n Webhook Note: The n8n webhook could not be reached (${n8nError}). Provide a helpful conversational answer to the user while politely noting the n8n status.`
            : 'n8n Webhook Note: No webhook URL configured yet. Act as the conversational AI guide assisting the user.',
        'Now respond directly to the user in a natural, conversational manner suitable for two-way voice and text interaction.',
      ].join('\n\n');

      let response: any = null;
      const candidateModels = ['gemini-3.1-flash-lite', 'gemini-3.8-flash'];
      
      for (const modelName of candidateModels) {
        try {
          response = await ai.models.generateContent({
            model: modelName,
            contents: promptContext,
            config: {
              systemInstruction: finalInstruction,
              temperature: 0.7,
            },
          });
          if (response?.text) break;
        } catch (modelErr: any) {
          console.warn(`Model ${modelName} failed or unavailable:`, modelErr?.message);
        }
      }

      if (response && response.text) {
        aiSynthesizedText = response.text.trim();
        aiUsed = true;
      }
    } catch (aiErr: any) {
      console.error('Gemini synthesis error:', aiErr);
      // Fallback to the extracted reply text if AI synthesis encounters an issue
      if (!aiSynthesizedText) {
        aiSynthesizedText =
          n8nResponseData !== null
            ? typeof n8nResponseData === 'object'
              ? JSON.stringify(n8nResponseData, null, 2)
              : String(n8nResponseData)
            : 'I heard you, but could not reach the n8n webhook or AI synthesizer.';
      }
    }
  } else if (!aiSynthesizedText) {
    aiSynthesizedText = n8nReachable
      ? 'Workflow executed successfully.'
      : n8nError
        ? `Error contacting n8n node: ${n8nError}`
        : 'Webhook received.';
  }

  res.json({
    ok: n8nReachable || aiUsed,
    n8n: {
      reachable: n8nReachable,
      status: n8nStatus,
      latencyMs: n8nLatencyMs,
      error: n8nError,
      data: n8nResponseData,
    },
    reply: {
      text: aiSynthesizedText,
      rawOutput: extractedReplyText,
      aiEnhanced: aiUsed,
    },
  });
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
