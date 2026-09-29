import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { PluginRuntime } from './src/pluginRuntime';
import { authenticate, createTask, listTasks, getTask, addTaskEvent, listTaskEvents, updateTask } from './src/server/persistence';
import { bootstrapOwner, requireWebSession } from './src/server/webAuth';
import { configureTaskWorker, enqueueTask } from './src/server/taskWorker';
import { FridayPlugin } from './src/types';
import { PermissionLevel, TaskContext, Tool, ToolResult } from './src/brain/types';
import { 
  FridayBrain, 
  GeminiModelProvider, 
  OllamaModelProvider, 
  MultiModelProvider,
  N8nMcpClient,
  N8nMcpToolProvider,
  resolveN8nMcpToken,
  RemoteManager,
  AuthManager,
} from './src/brain/index';

dotenv.config();

const serverStartTime = Date.now();
const HOST = process.env.FRIDAY_HOST || process.env.HOST || '0.0.0.0';
const PORT = process.env.FRIDAY_PORT ? parseInt(process.env.FRIDAY_PORT, 10) : (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000);

const authManager = new AuthManager(process.env.FRIDAY_GATEWAY_TOKEN);
bootstrapOwner();
const remoteManager = new RemoteManager(serverStartTime);

// Shared Server-Side Settings Persistence (ensures mobile clients inherit PC webhook configuration)
interface SharedServerSettings {
  activeNodeId: string;
  nodes: Array<{
    id: string;
    name: string;
    url: string;
    method?: 'POST' | 'GET' | 'PUT';
    authType?: 'none' | 'bearer' | 'custom_header';
    authToken?: string;
    customHeaderKey?: string;
    customHeaderValue?: string;
  }>;
  systemPrompt?: string;
  synthesizeWithAi?: boolean;
}

const SETTINGS_FILE = path.join(process.cwd(), 'scratch', 'server-settings.json');

function loadServerSettings(): SharedServerSettings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.nodes)) return data;
    }
  } catch (err) {
    console.warn('[ServerSettings] Failed to load server-settings.json:', err);
  }

  const defaultUrl = process.env.N8N_WEBHOOK_URL || '';
  return {
    activeNodeId: 'node-primary',
    nodes: [
      {
        id: 'node-primary',
        name: 'Primary n8n Webhook',
        url: defaultUrl,
        method: 'POST',
        authType: 'none',
        authToken: '',
        customHeaderKey: '',
        customHeaderValue: '',
      },
    ],
  };
}

let sharedSettings = loadServerSettings();
const pluginRuntime = new PluginRuntime();

function sanitizePlugin(plugin: FridayPlugin): FridayPlugin {
  return { ...plugin, config: undefined };
}

function saveServerSettings(newSettings: Partial<SharedServerSettings>): SharedServerSettings {
  try {
    sharedSettings = {
      ...sharedSettings,
      ...newSettings,
      nodes: newSettings.nodes || sharedSettings.nodes,
    };
    const dir = path.dirname(SETTINGS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(sharedSettings, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[ServerSettings] Failed to save server-settings.json:', err);
  }
  return sharedSettings;
}

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Gateway Token Authorization Middleware
app.use(authManager.middleware());

// Local Token Bootstrap endpoint (restricted strictly to local loopback 127.0.0.1 / ::1)
app.get('/api/auth/local-token', (req, res) => {
  authManager.handleLocalTokenBootstrap(req, res);
});

// Token Verification endpoint (for remote devices / mobile phones)
app.post('/api/auth/verify', (req, res) => {
  authManager.handleVerifyToken(req, res);
});

// Web identity/session API. Provider credentials never leave the server.
app.post('/api/web-auth/login', (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const result = authenticate(email, password);
  if (!result) { res.status(401).json({ ok: false, error: 'Invalid Friday credentials.' }); return; }
  res.json({ ok: true, token: result.token, user: { id: result.user.id, email: result.user.email, role: result.user.role } });
});

app.get('/api/web-auth/me', requireWebSession, (req, res) => {
  res.json({ ok: true, user: { id: req.fridayUser!.id, email: req.fridayUser!.email, role: req.fridayUser!.role } });
});

app.get('/api/tasks', requireWebSession, (req, res) => {
  res.json({ ok: true, tasks: listTasks(req.fridayUser!.id) });
});

app.post('/api/tasks', requireWebSession, (req, res) => {
  const command = typeof req.body?.command === 'string' ? req.body.command.trim() : '';
  if (!command) { res.status(400).json({ ok: false, error: 'Task command is required.' }); return; }
  const task = createTask(req.fridayUser!.id, command, req.body?.payload);
  addTaskEvent(task.id, 'QUEUED', 'Task accepted by the Friday web gateway.');
  enqueueTask({ id: task.id, userId: req.fridayUser!.id, command, payload: req.body?.payload });
  res.status(202).json({ ok: true, task });
});

app.get('/api/tasks/:id/events/stream', requireWebSession, (req, res) => {
  const task = getTask(req.params.id, req.fridayUser!.id);
  if (!task) { res.status(404).json({ ok: false, error: 'Task not found.' }); return; }
  res.setHeader('Content-Type', 'text/event-stream'); res.setHeader('Cache-Control', 'no-cache'); res.setHeader('Connection', 'keep-alive');
  let sent = 0;
  const send = () => { const events = listTaskEvents(task.id); for (const event of events.slice(sent)) { res.write('data: ' + JSON.stringify(event) + '\\n\\n'); sent++; } };
  send(); const timer = setInterval(() => { send(); const latest = getTask(task.id, req.fridayUser!.id); if (latest && ['COMPLETED','FAILED','WAITING_FOR_PERMISSION'].includes(latest.status)) { res.write('event: done\\ndata: ' + JSON.stringify(latest) + '\\n\\n'); clearInterval(timer); res.end(); } }, 1000);
  req.on('close', () => clearInterval(timer));
});

app.get('/api/tasks/:id', requireWebSession, (req, res) => {
  const task = getTask(req.params.id, req.fridayUser!.id);
  if (!task) { res.status(404).json({ ok: false, error: 'Task not found.' }); return; }
  res.json({ ok: true, task, events: listTaskEvents(task.id) });
});

app.post('/api/tasks/:id/events', requireWebSession, (req, res) => {
  const task = getTask(req.params.id, req.fridayUser!.id);
  if (!task) { res.status(404).json({ ok: false, error: 'Task not found.' }); return; }
  const phase = typeof req.body?.phase === 'string' ? req.body.phase : 'INSPECT';
  const message = typeof req.body?.message === 'string' ? req.body.message : '';
  if (!message) { res.status(400).json({ ok: false, error: 'Event message is required.' }); return; }
  const event = addTaskEvent(task.id, phase, message, req.body?.details);
  if (req.body?.status) updateTask(task.id, { status: String(req.body.status), result: req.body?.result });
  res.status(201).json({ ok: true, event, task: getTask(task.id, req.fridayUser!.id) });
});

// Shared Server Settings endpoints (GET/POST)
app.get('/api/settings', (_req, res) => {
  res.json({
    ok: true,
    settings: sharedSettings,
  });
});

app.post('/api/settings', (req, res) => {
  const { settings } = req.body;
  if (settings && typeof settings === 'object') {
    const updated = saveServerSettings(settings);
    res.json({ ok: true, settings: updated });
  } else {
    res.status(400).json({ ok: false, error: 'Invalid settings payload' });
  }
});

// Plugin runtime: credentials remain server-side and are never returned to clients.
app.get('/api/plugins', (_req, res) => {
  res.json({ ok: true, plugins: pluginRuntime.list().map((record) => sanitizePlugin(record.plugin)) });
});

app.post('/api/plugins/register', (req, res) => {
  try {
    const plugin = req.body?.plugin as FridayPlugin;
    const credential = typeof req.body?.credential === 'string' ? req.body.credential : undefined;
    if (!plugin?.id || !plugin?.name || !plugin?.endpoint) {
      res.status(400).json({ ok: false, error: 'Plugin id, name, and endpoint are required.' });
      return;
    }
    const registered = pluginRuntime.register({ plugin: { ...plugin, config: undefined }, credential });
    res.json({ ok: true, plugin: sanitizePlugin(registered.plugin) });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message || 'Plugin registration failed.' });
  }
});

app.post('/api/plugins/:id/discover', async (req, res) => {
  try {
    const plugin = await pluginRuntime.discover(req.params.id, req.body?.manifestUrl);
    registerPluginBrainTools(plugin);
    res.json({ ok: true, plugin: sanitizePlugin(plugin) });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message || 'Plugin discovery failed.' });
  }
});

app.post('/api/plugins/:id/invoke', async (req, res) => {
  try {
    const toolId = typeof req.body?.toolId === 'string' ? req.body.toolId : '';
    const runtimeRecord = pluginRuntime.get(req.params.id);
    const runtimeTool = runtimeRecord?.plugin.tools.find((tool) => tool.id === toolId);
    if (runtimeTool && runtimeTool.method !== 'GET' && req.body?.confirmed !== true) {
      res.status(403).json({ ok: false, error: 'Explicit confirmation is required for mutating or external plugin actions.' });
      return;
    }
    if (!toolId) {
      res.status(400).json({ ok: false, error: 'toolId is required.' });
      return;
    }
    const result = await pluginRuntime.invoke(req.params.id, toolId, req.body?.input || {});
    res.status(result.status >= 400 ? 502 : 200).json({ ok: result.status < 400, ...result });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message || 'Plugin invocation failed.' });
  }
});

app.delete('/api/plugins/:id', (req, res) => {
  res.json({ ok: pluginRuntime.remove(req.params.id) });
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

// Extended Health check endpoint (safe telemetry, zero secrets)
app.get('/api/health', async (_req, res) => {
  try {
    const status = await remoteManager.getStatus(HOST, PORT, true);
    res.json({
      status: 'ok',
      server: 'friday',
      version: '2.0-gateway-core',
      host: HOST,
      port: PORT,
      uptimeSec: Math.floor((Date.now() - serverStartTime) / 1000),
      mode: status.status === 'ready' ? 'tailscale' : 'local',
      tailscaleAvailable: status.tailscale.running || status.tailscale.installed,
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.json({
      status: 'ok',
      server: 'friday',
      version: '2.0-gateway-core',
      host: HOST,
      port: PORT,
      uptimeSec: Math.floor((Date.now() - serverStartTime) / 1000),
      mode: 'local',
      tailscaleAvailable: false,
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
      timestamp: new Date().toISOString(),
    });
  }
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
    const rawText = await response.text();
    if (rawText && rawText.trim().length > 0) {
      try {
        responseData = JSON.parse(rawText);
      } catch {
        responseData = rawText;
      }
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

  const fallbackUrl = (
    sharedSettings.nodes.find((n) => n.id === sharedSettings.activeNodeId)?.url ||
    sharedSettings.nodes[0]?.url ||
    process.env.N8N_WEBHOOK_URL ||
    ''
  ).trim();

  const effectiveWebhookUrl = (
    (typeof webhookUrl === 'string' && webhookUrl.trim().length > 0)
      ? webhookUrl.trim()
      : fallbackUrl
  ).trim();

  // If a webhook URL is configured, forward to n8n
  if (effectiveWebhookUrl.length > 0) {
    try {
      const parsedUrl = effectiveWebhookUrl;
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
      const rawText = await response.text();
      if (rawText && rawText.trim().length > 0) {
        try {
          n8nResponseData = JSON.parse(rawText);
        } catch {
          n8nResponseData = rawText;
        }
      } else {
        n8nResponseData = null;
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
      const defaultInstruction =
        'You are an intelligent voice and chat conversational AI assistant integrated into an n8n automation workflow. ' +
        'Your goal is to communicate with the user naturally in two-way conversation, both in text and spoken voice. ' +
        'Keep voice replies natural, concise, conversational, and direct without robotic greetings or excessive markup. ' +
        'If n8n returned structured data or action results, speak the key highlights clearly and explain what occurred.';

      const finalInstruction = systemPrompt ? `${defaultInstruction}\n\nCustom instructions: ${systemPrompt}` : defaultInstruction;

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

// Initialize Friday Brain with Multi-Model Orchestration (Cloud Gemini + Local Ollama)
const geminiProvider = new GeminiModelProvider(process.env.GEMINI_API_KEY);
const ollamaProvider = new OllamaModelProvider();
const multiModelProvider = new MultiModelProvider({
  providers: [geminiProvider, ollamaProvider],
  enableFallback: true,
});

// Initialize n8n Instance-Level MCP Client & Tool Provider
const n8nMcpToken = resolveN8nMcpToken();
const n8nMcpClient = new N8nMcpClient({
  serverUrl: process.env.N8N_MCP_SERVER_URL || 'http://localhost:5678/mcp-server/http',
  accessToken: n8nMcpToken,
  enabled: process.env.N8N_MCP_ENABLED !== 'false',
});
const n8nMcpProvider = new N8nMcpToolProvider(n8nMcpClient);

const fridayBrain = new FridayBrain({
  modelProvider: multiModelProvider,
  defaultPermissions: ['READ'], // Enforces PLAN -> APPROVE -> EXECUTE gate for mutating operations
  mcpProvider: n8nMcpProvider,
});
configureTaskWorker(fridayBrain);

function registerPluginBrainTools(plugin: FridayPlugin): void {
  for (const tool of plugin.tools) {
    const id = `plugin:${plugin.id}:${tool.id}`;
    if (fridayBrain.toolRegistry.getTool(id)) continue;
    const permissionLevel: PermissionLevel = tool.method === 'GET' ? 'READ' : tool.method === 'POST' ? 'EXTERNAL_ACTION' : 'WRITE';
    const adapter: Tool = {
      id,
      name: `${plugin.name}: ${tool.name}`,
      description: tool.description,
      permissionLevel,
      inputSchema: { type: 'object', properties: {} },
      async execute(input: Record<string, any>, _context: TaskContext): Promise<ToolResult> {
        const result = await pluginRuntime.invoke(plugin.id, tool.id, input);
        return {
          ok: result.status >= 200 && result.status < 300,
          data: result.data,
          error: result.status >= 400 ? `Plugin returned HTTP ${result.status}` : undefined,
          evidence: { httpStatus: result.status, latencyMs: result.latencyMs, endpointUrl: plugin.endpoint },
        };
      },
    };
    fridayBrain.toolRegistry.registerTool(adapter);
  }
}

// MCP Status & Health endpoint
app.get('/api/mcp/status', async (_req, res) => {
  try {
    const health = await n8nMcpClient.checkHealth();
    res.json({
      ok: health.connected,
      ...health,
    });
  } catch (err: any) {
    res.status(500).json({
      ok: false,
      connected: false,
      status: 'DISCONNECTED',
      error: n8nMcpClient.sanitize(err.message),
    });
  }
});

// MCP Tool Refresh endpoint
app.post('/api/mcp/refresh', async (_req, res) => {
  try {
    const tools = await n8nMcpProvider.createTools();
    for (const tool of tools) {
      fridayBrain.toolRegistry.registerTool(tool);
    }
    const health = await n8nMcpClient.checkHealth();
    res.json({
      ok: health.connected,
      ...health,
    });
  } catch (err: any) {
    res.status(500).json({
      ok: false,
      error: n8nMcpClient.sanitize(err.message),
    });
  }
});

// Brain Status & Health endpoint
app.get('/api/brain/status', async (_req, res) => {
  const modelAvailable = await multiModelProvider.isAvailable();
  const activeProviders = await multiModelProvider.getActiveProviders();
  const mcpHealth = await n8nMcpClient.checkHealth();

  res.json({
    status: 'ok',
    version: 'phase-4-n8n-mcp-orchestrator',
    modelProvider: multiModelProvider.providerName,
    modelAvailable,
    activeProviders,
    mcp: {
      enabled: mcpHealth.enabled,
      connected: mcpHealth.connected,
      status: mcpHealth.status,
      serverUrl: mcpHealth.serverUrl,
      toolsCount: mcpHealth.toolsCount,
      tools: mcpHealth.tools,
      error: mcpHealth.error,
    },
    registeredTools: fridayBrain.toolRegistry.listTools().map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      permissionLevel: t.permissionLevel,
    })),
    defaultPermissions: fridayBrain.permissionManager.getDefaultPermissions(),
    recentTasksCount: fridayBrain.taskManager.listTasks().length,
  });
});

// Brain Execute endpoint
app.post('/api/brain/execute', async (req, res) => {
  const {
    userMessage = '',
    sessionId = 'session-default',
    inputMode = 'text',
    activeNodeConfig,
    webhookUrl,
    customBody = {},
    systemPrompt = '',
    conversationHistory = [],
    permissionsGranted = [],
    maxReplans = 3,
  } = req.body;

  if (!userMessage || typeof userMessage !== 'string' || !userMessage.trim()) {
    res.status(400).json({
      ok: false,
      error: 'A userMessage is required to execute a task in Friday Brain.',
    });
    return;
  }

  const fallbackUrl = (
    sharedSettings.nodes.find((n) => n.id === sharedSettings.activeNodeId)?.url ||
    sharedSettings.nodes[0]?.url ||
    process.env.N8N_WEBHOOK_URL ||
    ''
  ).trim();

  // Normalize activeNodeConfig with webhookUrl fallback (ensures parity with legacy /api/n8n/dispatch)
  const effectiveUrl = (
    activeNodeConfig?.url ||
    webhookUrl ||
    fallbackUrl
  ).trim();

  const effectiveNodeConfig = {
    ...(activeNodeConfig || { id: 'node-primary', name: 'Primary n8n Webhook' }),
    url: effectiveUrl,
  };

  try {
    const task = await fridayBrain.execute({
      sessionId,
      userInput: userMessage.trim(),
      inputMode,
      activeNodeConfig: effectiveNodeConfig,
      customPayload: customBody,
      systemPrompt,
      conversationHistory,
      permissionsGranted,
      maxReplans,
    });

    const isSuccess = task.status === 'COMPLETED';
    const lastObservation = task.observations[task.observations.length - 1];

    res.json({
      ok: isSuccess,
      taskId: task.taskId,
      status: task.status,
      reply: {
        text: task.finalResponse?.text || '',
        rawOutput: task.finalResponse?.rawOutput || lastObservation?.output,
        aiEnhanced: task.finalResponse?.aiEnhanced || false,
      },
      n8n: {
        reachable: lastObservation?.evidence?.httpStatus !== undefined,
        status: lastObservation?.evidence?.httpStatus || null,
        latencyMs: lastObservation?.latencyMs || null,
        error: lastObservation?.error || null,
        data: lastObservation?.output || null,
      },
      intent: task.interpretedIntent,
      plan: task.plan,
      observations: task.observations,
      evaluation: task.evaluation,
      pendingPermission: task.pendingPermission,
      replanCount: task.replanCount,
      events: task.events,
    });
  } catch (err: any) {
    console.error('Brain execute error:', err);
    res.status(500).json({
      ok: false,
      error: err.message || 'Internal Brain execution error',
    });
  }
});

// Brain Permission Approval endpoint
app.post('/api/brain/permission', async (req, res) => {
  const { taskId, level } = req.body;

  if (!taskId || !level) {
    res.status(400).json({
      ok: false,
      error: 'taskId and level are required to grant permission.',
    });
    return;
  }

  try {
    const task = await fridayBrain.grantPermissionAndResume(taskId, level);
    const lastObservation = task.observations[task.observations.length - 1];

    res.json({
      ok: task.status === 'COMPLETED',
      taskId: task.taskId,
      status: task.status,
      reply: {
        text: task.finalResponse?.text || '',
        rawOutput: task.finalResponse?.rawOutput || lastObservation?.output,
        aiEnhanced: task.finalResponse?.aiEnhanced || false,
      },
      pendingPermission: task.pendingPermission,
      observations: task.observations,
      events: task.events,
    });
  } catch (err: any) {
    res.status(400).json({
      ok: false,
      error: err.message,
    });
  }
});

// Brain Plan Approval endpoint (PLAN → APPROVE → EXECUTE gate)
app.post('/api/brain/plans/:planId/approve', async (req, res) => {
  const { planId } = req.params;
  const { taskId } = req.body;

  if (!taskId) {
    res.status(400).json({
      ok: false,
      error: 'taskId is required in request body.',
    });
    return;
  }

  try {
    const task = await fridayBrain.approvePlanAndResume(taskId, planId);
    const lastObservation = task.observations[task.observations.length - 1];

    res.json({
      ok: task.status === 'COMPLETED',
      taskId: task.taskId,
      planId,
      status: task.status,
      plan: task.plan,
      reply: {
        text: task.finalResponse?.text || '',
        rawOutput: task.finalResponse?.rawOutput || lastObservation?.output,
        aiEnhanced: task.finalResponse?.aiEnhanced || false,
      },
      pendingPermission: task.pendingPermission,
      observations: task.observations,
      events: task.events,
    });
  } catch (err: any) {
    res.status(400).json({
      ok: false,
      error: err.message,
    });
  }
});

// Brain Inspect Task endpoint
app.get('/api/brain/tasks/:taskId', (req, res) => {
  const task = fridayBrain.taskManager.getTask(req.params.taskId);
  if (!task) {
    res.status(404).json({ ok: false, error: `Task ${req.params.taskId} not found` });
    return;
  }
  res.json({ ok: true, task });
});

// Remote Status endpoint & Gateway Status endpoint
app.get(['/api/remote/status', '/api/gateway/status'], async (_req, res) => {
  try {
    const mcpHealth = await n8nMcpClient.checkHealth();
    const activeProviders = await multiModelProvider.getActiveProviders();
    const hasGemini = Boolean(process.env.GEMINI_API_KEY);
    const hasOllama = activeProviders.some((p) => p.name.toLowerCase().includes('ollama') && p.available);

    const remoteStatus = await remoteManager.getStatus(HOST, PORT, true);

    res.json({
      ...remoteStatus,
      // Backward compatibility fields for gateway UI
      remote: {
        ...remoteStatus.remote,
        method: remoteStatus.method,
        status: remoteStatus.status === 'ready' ? 'private_remote' : remoteStatus.status,
        authRequired: true,
        remoteHostname: remoteStatus.remote.hostname || '',
      },
      providers: {
        gemini: hasGemini,
        ollama: hasOllama,
        active: activeProviders.filter((p) => p.available).map((p) => p.name),
        current: multiModelProvider.providerName,
      },
      mcp: {
        connected: mcpHealth.connected,
        status: mcpHealth.status,
        toolsCount: mcpHealth.toolsCount,
      },
      n8n: {
        webhookConfigured: Boolean(process.env.N8N_WEBHOOK_URL),
        reachable: mcpHealth.connected,
        lastLatencyMs: mcpHealth.latencyMs || null,
      },
    });
  } catch (err: any) {
    res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
});

// Gateway Ping endpoint (lightweight round-trip latency benchmarking)
app.post('/api/gateway/ping', (req, res) => {
  const clientTimestamp = typeof req.body?.timestamp === 'number' ? req.body.timestamp : Date.now();
  const serverTime = Date.now();
  res.json({
    ok: true,
    serverTime,
    clientTimestamp,
    latencyMs: Math.max(0, serverTime - clientTimestamp),
    status: 'online',
  });
});

// Remote Test / Diagnostic Probe endpoint
app.post(['/api/remote/test', '/api/gateway/test-remote'], async (req, res) => {
  const { remoteUrl, token } = req.body;
  const result = await remoteManager.probeTarget(remoteUrl, token);
  const httpStatus = result.ok ? 200 : (result.category === 'AUTHENTICATION_FAILED' ? 401 : 502);
  res.status(httpStatus).json(result);
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

  app.listen(PORT, HOST, () => {
    console.log(`Friday Gateway running on http://${HOST}:${PORT}`);
    console.log(`Local Access:  http://localhost:${PORT}`);
    if (authManager.isGenerated()) {
      console.log(`[Friday Gateway] Auto-generated Access Token: ${authManager.getToken()}`);
      console.log(`(Set FRIDAY_GATEWAY_TOKEN in .env to specify a fixed token)`);
    }
  });
}

startServer();
