import React, { useState, useMemo } from 'react';
import { 
  Copy, 
  ClipboardPaste, 
  Check, 
  Play, 
  Plus, 
  Trash2, 
  Sparkles, 
  Volume2, 
  Key, 
  Info, 
  Radio,
  Clock,
  ShieldCheck,
  Zap,
  Sliders,
  AlertTriangle,
  AlertCircle,
  Code,
  RotateCcw
} from 'lucide-react';
import { AppSettings, N8nNodeConfig, VoiceSettings } from '../types';

// Common webhook payload size thresholds
const RECOMMENDED_PAYLOAD_LIMIT_BYTES = 32 * 1024; // 32 KB: Recommended safe size for low-latency webhooks & voice turns
const COMMON_WEBHOOK_LIMIT_BYTES = 100 * 1024; // 100 KB: Common payload threshold across webhook providers & proxies
const HARD_WEBHOOK_LIMIT_BYTES = 256 * 1024; // 256 KB: Extreme limit before hard gateway rejection

interface SettingsTabProps {
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
  availableVoices: SpeechSynthesisVoice[];
  onTestNode: (node: N8nNodeConfig) => Promise<void>;
  testLoading: boolean;
  testResult: {
    ok: boolean;
    status?: number;
    latencyMs?: number;
    data?: any;
    error?: string;
  } | null;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  settings,
  onUpdateSettings,
  availableVoices,
  onTestNode,
  testLoading,
  testResult,
}) => {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedBlueprint, setCopiedBlueprint] = useState(false);
  const [showAddNodeModal, setShowAddNodeModal] = useState(false);

  // New node form state
  const [newNodeName, setNewNodeName] = useState('');
  const [newNodeUrl, setNewNodeUrl] = useState('');
  const [newNodeMethod, setNewNodeMethod] = useState<'POST' | 'GET' | 'PUT'>('POST');
  const [formatFeedback, setFormatFeedback] = useState<string | null>(null);

  // Format bytes into human-readable representation
  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Real-time metrics for the custom payload JSON
  const payloadRaw = settings.customPayloadJson ?? '';
  const payloadCharCount = payloadRaw.length;
  const payloadByteCount = useMemo(() => {
    return new TextEncoder().encode(payloadRaw).length;
  }, [payloadRaw]);

  // Webhook payload limit thresholds
  const isExceedingCommonLimit = payloadByteCount > COMMON_WEBHOOK_LIMIT_BYTES;
  const isApproachingLimit = payloadByteCount > RECOMMENDED_PAYLOAD_LIMIT_BYTES && !isExceedingCommonLimit;
  const payloadPercentage = Math.min(100, Math.round((payloadByteCount / COMMON_WEBHOOK_LIMIT_BYTES) * 100));

  // JSON validity check
  const jsonValidation = useMemo(() => {
    const trimmed = payloadRaw.trim();
    if (!trimmed) {
      return { isValid: true, error: null, isEmpty: true };
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return {
          isValid: false,
          error: 'Payload must be a JSON object (e.g. {"key": "value"}).',
          isEmpty: false,
        };
      }
      return { isValid: true, error: null, isEmpty: false };
    } catch (err: any) {
      return { isValid: false, error: err.message, isEmpty: false };
    }
  }, [payloadRaw]);

  // Format / prettify JSON
  const handleFormatPayloadJson = () => {
    if (!payloadRaw.trim()) return;
    try {
      const parsed = JSON.parse(payloadRaw);
      onUpdateSettings({
        ...settings,
        customPayloadJson: JSON.stringify(parsed, null, 2),
      });
      setFormatFeedback('Formatted');
      setTimeout(() => setFormatFeedback(null), 2000);
    } catch {
      setFormatFeedback('Invalid syntax');
      setTimeout(() => setFormatFeedback(null), 2500);
    }
  };

  // Reset to default sample JSON
  const handleResetSamplePayload = () => {
    const sample = JSON.stringify({ source: 'ai_voice_interface', channel: 'webhook' }, null, 2);
    onUpdateSettings({ ...settings, customPayloadJson: sample });
  };

  const activeNode = settings.nodes.find((n) => n.id === settings.activeNodeId) || settings.nodes[0];

  // Update active node fields directly
  const updateActiveNode = (patch: Partial<N8nNodeConfig>) => {
    const updatedNodes = settings.nodes.map((n) => {
      if (n.id === settings.activeNodeId) {
        return { ...n, ...patch };
      }
      return n;
    });
    onUpdateSettings({ ...settings, nodes: updatedNodes });
  };

  // Paste from clipboard helper
  const handlePasteUrl = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim().startsWith('http')) {
          updateActiveNode({ url: text.trim() });
        } else if (text) {
          updateActiveNode({ url: text.trim() });
        }
      }
    } catch (err) {
      console.warn('Clipboard read error:', err);
    }
  };

  // Copy to clipboard helper
  const handleCopyUrl = () => {
    if (!activeNode?.url) return;
    navigator.clipboard.writeText(activeNode.url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  // Add a new node
  const handleAddNewNode = () => {
    if (!newNodeName.trim()) return;
    const newNode: N8nNodeConfig = {
      id: `node-${Date.now()}`,
      name: newNodeName.trim(),
      url: newNodeUrl.trim(),
      method: newNodeMethod,
      authType: 'none',
      authToken: '',
      customHeaderKey: '',
      customHeaderValue: '',
      lastTestedAt: null,
      lastStatus: null,
      lastLatencyMs: null,
    };

    const newNodes = [...settings.nodes, newNode];
    onUpdateSettings({
      ...settings,
      nodes: newNodes,
      activeNodeId: newNode.id,
    });

    setNewNodeName('');
    setNewNodeUrl('');
    setShowAddNodeModal(false);
  };

  // Delete a node
  const handleDeleteNode = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (settings.nodes.length <= 1) {
      return;
    }
    const newNodes = settings.nodes.filter((n) => n.id !== nodeId);
    const newActiveId = settings.activeNodeId === nodeId ? newNodes[0].id : settings.activeNodeId;
    onUpdateSettings({
      ...settings,
      nodes: newNodes,
      activeNodeId: newActiveId,
    });
  };

  // Sample n8n workflow configuration code
  const n8nBlueprintJson = JSON.stringify(
    {
      name: 'AI Voice & Chat Webhook Flow',
      nodes: [
        {
          parameters: {
            httpMethod: 'POST',
            path: 'ai-voice-agent',
            responseMode: 'responseNode',
            options: {},
          },
          name: 'Webhook Node',
          type: 'n8n-nodes-base.webhook',
          typeVersion: 1,
        },
        {
          parameters: {
            respondWith: 'json',
            responseBody: '={\n  "output": "Workflow received: " + $json.body.message,\n  "status": "success"\n}',
          },
          name: 'Respond to Webhook',
          type: 'n8n-nodes-base.respondToWebhook',
          typeVersion: 1,
        },
      ],
      connections: {
        'Webhook Node': {
          main: [[{ node: 'Respond to Webhook', type: 'main', index: 0 }]],
        },
      },
    },
    null,
    2
  );

  const handleCopyBlueprint = () => {
    navigator.clipboard.writeText(n8nBlueprintJson);
    setCopiedBlueprint(true);
    setTimeout(() => setCopiedBlueprint(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-8">
      {/* Top Banner */}
      <div className="bg-stone-50 border border-stone-200 rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-stone-900 tracking-tight flex items-center gap-2">
              <Zap className="w-5 h-5 text-orange-600" />
              n8n Node Connectivity & Settings
            </h2>
            <p className="text-stone-600 text-sm mt-1">
              Configure webhook URLs from your n8n workspace for seamless two-way voice and text communication.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onTestNode(activeNode)}
            disabled={testLoading || !activeNode?.url}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-600 text-white font-medium text-sm hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs transition-all"
          >
            <Play className={`w-4 h-4 ${testLoading ? 'animate-spin' : ''}`} />
            <span>{testLoading ? 'Pinging Node...' : 'Test Active Webhook'}</span>
          </button>
        </div>

        {/* Live Test Status Alert if available */}
        {testResult && (
          <div
            className={`mt-4 p-4 rounded-xl text-xs font-mono border ${
              testResult.ok
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}
          >
            <div className="flex items-center justify-between font-sans font-semibold mb-1">
              <span>{testResult.ok ? '✓ n8n Webhook Node Responded Successfully' : '✗ n8n Connection Failed'}</span>
              <span>{testResult.latencyMs}ms Latency</span>
            </div>
            {testResult.status && <div>HTTP Status: {testResult.status}</div>}
            {testResult.error && <div className="mt-1 font-sans">{testResult.error}</div>}
            {testResult.data && (
              <pre className="mt-2 p-2 bg-white/70 rounded overflow-x-auto max-h-32 text-[11px]">
                {typeof testResult.data === 'object'
                  ? JSON.stringify(testResult.data, null, 2)
                  : String(testResult.data)}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* Primary Active Node URL Input (The Core Field Requested) */}
      <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xs space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-stone-900">
              Primary n8n Webhook Node URL
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Copy and paste the URL from your n8n Webhook node (Test URL or Production URL).
            </p>
          </div>
          <span className="text-xs font-medium px-2.5 py-1 bg-stone-100 rounded-md text-stone-700">
            Node: {activeNode?.name}
          </span>
        </div>

        {/* URL Input Box with Copy / Paste Actions */}
        <div>
          <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-2">
            Webhook URL Endpoint
          </label>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1">
              <input
                type="url"
                value={activeNode?.url || ''}
                onChange={(e) => updateActiveNode({ url: e.target.value })}
                placeholder="https://your-n8n-instance.com/webhook/..."
                className="w-full pl-3.5 pr-20 py-2.5 text-sm font-mono bg-stone-50 border border-stone-300 rounded-xl text-stone-900 placeholder:text-stone-400 focus:outline-hidden focus:ring-2 focus:ring-orange-500 focus:bg-white transition-all"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {activeNode?.url && (
                  <button
                    type="button"
                    onClick={() => updateActiveNode({ url: '' })}
                    className="text-xs text-stone-400 hover:text-stone-600 px-1.5 py-0.5 rounded"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Paste Button */}
            <button
              type="button"
              onClick={handlePasteUrl}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-stone-300 bg-stone-50 hover:bg-stone-100 text-stone-700 font-medium text-xs shadow-xs transition-colors shrink-0"
              title="Paste URL from your clipboard"
            >
              <ClipboardPaste className="w-4 h-4 text-stone-600" />
              <span>Paste URL</span>
            </button>

            {/* Copy Button */}
            <button
              type="button"
              onClick={handleCopyUrl}
              disabled={!activeNode?.url}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-stone-300 bg-stone-50 hover:bg-stone-100 text-stone-700 font-medium text-xs shadow-xs transition-colors shrink-0 disabled:opacity-40"
              title="Copy current webhook URL"
            >
              {copiedUrl ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-stone-600" />}
              <span>{copiedUrl ? 'Copied!' : 'Copy URL'}</span>
            </button>
          </div>
          <p className="text-[11px] text-stone-500 mt-2">
            Tip: In n8n, open your <strong>Webhook Node</strong> and copy either the <em>Production URL</em> or <em>Test URL</em> (for active listening during workflow building).
          </p>
        </div>

        {/* HTTP Method & Node Label */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-stone-100">
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1.5">
              Node Display Name
            </label>
            <input
              type="text"
              value={activeNode?.name || ''}
              onChange={(e) => updateActiveNode({ name: e.target.value })}
              placeholder="e.g. Primary Webhook Flow"
              className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-lg text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1.5">
              HTTP Request Method
            </label>
            <div className="flex gap-2">
              {(['POST', 'GET', 'PUT'] as const).map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => updateActiveNode({ method })}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${
                    activeNode?.method === method
                      ? 'bg-orange-50 text-orange-700 border-orange-300 ring-1 ring-orange-400'
                      : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                  }`}
                >
                  {method}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Authentication Headers */}
        <div className="pt-2 border-t border-stone-100 space-y-3">
          <label className="block text-xs font-semibold text-stone-700 flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5 text-stone-500" />
            <span>Authentication / Headers (Optional)</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => updateActiveNode({ authType: 'none' })}
              className={`py-1.5 px-3 text-xs rounded-lg border text-left ${
                activeNode?.authType === 'none'
                  ? 'bg-stone-900 text-white border-stone-900 font-medium'
                  : 'bg-stone-50 text-stone-600 border-stone-200'
              }`}
            >
              No Auth (Default)
            </button>
            <button
              type="button"
              onClick={() => updateActiveNode({ authType: 'bearer' })}
              className={`py-1.5 px-3 text-xs rounded-lg border text-left ${
                activeNode?.authType === 'bearer'
                  ? 'bg-stone-900 text-white border-stone-900 font-medium'
                  : 'bg-stone-50 text-stone-600 border-stone-200'
              }`}
            >
              Bearer Token
            </button>
            <button
              type="button"
              onClick={() => updateActiveNode({ authType: 'custom_header' })}
              className={`py-1.5 px-3 text-xs rounded-lg border text-left ${
                activeNode?.authType === 'custom_header'
                  ? 'bg-stone-900 text-white border-stone-900 font-medium'
                  : 'bg-stone-50 text-stone-600 border-stone-200'
              }`}
            >
              Custom Header
            </button>
          </div>

          {activeNode?.authType === 'bearer' && (
            <div>
              <input
                type="password"
                value={activeNode?.authToken || ''}
                onChange={(e) => updateActiveNode({ authToken: e.target.value })}
                placeholder="Paste Bearer Token"
                className="w-full px-3 py-2 text-xs font-mono bg-stone-50 border border-stone-300 rounded-lg text-stone-900"
              />
            </div>
          )}

          {activeNode?.authType === 'custom_header' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                value={activeNode?.customHeaderKey || ''}
                onChange={(e) => updateActiveNode({ customHeaderKey: e.target.value })}
                placeholder="Header Name (e.g. X-N8N-API-KEY)"
                className="px-3 py-2 text-xs font-mono bg-stone-50 border border-stone-300 rounded-lg text-stone-900"
              />
              <input
                type="password"
                value={activeNode?.customHeaderValue || ''}
                onChange={(e) => updateActiveNode({ customHeaderValue: e.target.value })}
                placeholder="Header Value / Secret Key"
                className="px-3 py-2 text-xs font-mono bg-stone-50 border border-stone-300 rounded-lg text-stone-900"
              />
            </div>
          )}
        </div>
      </div>

      {/* Multi-Node Directory Manager */}
      <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-stone-900">
              Configured n8n Workspace Nodes
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Switch between different webhook endpoints or workflow branches.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddNodeModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Node</span>
          </button>
        </div>

        <div className="space-y-2">
          {settings.nodes.map((node) => {
            const isCurrent = node.id === settings.activeNodeId;
            return (
              <div
                key={node.id}
                onClick={() => onUpdateSettings({ ...settings, activeNodeId: node.id })}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                  isCurrent
                    ? 'border-orange-500 bg-orange-50/50 shadow-xs'
                    : 'border-stone-200 bg-stone-50/60 hover:bg-stone-100/70'
                }`}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      isCurrent ? 'border-orange-600 bg-orange-600' : 'border-stone-300'
                    }`}
                  >
                    {isCurrent && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-stone-900 truncate">
                        {node.name}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider font-mono font-bold px-1.5 py-0.5 rounded bg-stone-200 text-stone-700">
                        {node.method}
                      </span>
                      {node.lastLatencyMs && (
                        <span className="text-[11px] text-emerald-600 font-medium">
                          {node.lastLatencyMs}ms
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-mono text-stone-500 truncate mt-0.5 max-w-md">
                      {node.url || 'No URL specified yet'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTestNode(node);
                    }}
                    className="px-2.5 py-1 text-xs rounded-md bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 font-medium"
                  >
                    Test
                  </button>
                  {settings.nodes.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => handleDeleteNode(node.id, e)}
                      className="p-1.5 text-stone-400 hover:text-red-600 rounded-md transition-colors"
                      title="Delete node"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Conversational Voice & Turn-Taking Settings */}
      <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xs space-y-6">
        <div>
          <h3 className="text-base font-semibold text-stone-900 flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-orange-600" />
            Two-Way Voice & Conversation Engine
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            Settings for natural turn-taking duplex speech without touching manual switches.
          </p>
        </div>

        {/* Continuous Voice Toggle */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-orange-50/60 border border-orange-200">
          <div>
            <div className="text-sm font-semibold text-stone-900 flex items-center gap-2">
              <Radio className="w-4 h-4 text-orange-600 animate-pulse" />
              Continuous Hands-Free Conversation Mode
            </div>
            <p className="text-xs text-stone-600 mt-1 max-w-lg">
              When enabled, the AI speaks its answer, and when it finishes, the microphone automatically opens so you can reply. Two-way communication without touching any buttons.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              onUpdateSettings({
                ...settings,
                continuousVoiceMode: !settings.continuousVoiceMode,
              })
            }
            className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors ${
              settings.continuousVoiceMode ? 'bg-orange-600' : 'bg-stone-300'
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                settings.continuousVoiceMode ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Voice Selectors & Parameters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1.5">
              Spoken Voice Output
            </label>
            <select
              value={settings.voiceSettings.voiceURI}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  voiceSettings: {
                    ...settings.voiceSettings,
                    voiceURI: e.target.value,
                  },
                })
              }
              className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-lg text-stone-900 focus:ring-2 focus:ring-orange-500 outline-hidden"
            >
              <option value="">Default System Voice</option>
              {availableVoices.map((voice, index) => (
                <option
                  key={`${voice.voiceURI || voice.name}__${voice.lang}__${index}`}
                  value={voice.voiceURI}
                >
                  {voice.name} {voice.lang ? `(${voice.lang})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1.5 flex items-center justify-between">
              <span>Speech Rate (Speed)</span>
              <span className="text-stone-500 font-mono">{settings.voiceSettings.rate}x</span>
            </label>
            <input
              type="range"
              min="0.7"
              max="1.5"
              step="0.1"
              value={settings.voiceSettings.rate}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  voiceSettings: {
                    ...settings.voiceSettings,
                    rate: parseFloat(e.target.value),
                  },
                })
              }
              className="w-full accent-orange-600 cursor-pointer"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1.5 flex items-center justify-between">
              <span>Silence Auto-Send Threshold</span>
              <span className="text-stone-500 font-mono">
                {(settings.voiceSettings.silenceThresholdMs / 1000).toFixed(1)}s
              </span>
            </label>
            <select
              value={settings.voiceSettings.silenceThresholdMs}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  voiceSettings: {
                    ...settings.voiceSettings,
                    silenceThresholdMs: parseInt(e.target.value, 10),
                  },
                })
              }
              className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-lg text-stone-900 focus:ring-2 focus:ring-orange-500"
            >
              <option value={1000}>1.0 second (Fast reply)</option>
              <option value={1400}>1.4 seconds (Balanced)</option>
              <option value={1800}>1.8 seconds (Relaxed pace)</option>
              <option value={2400}>2.4 seconds (Deliberate speaker)</option>
            </select>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-stone-50 border border-stone-200">
            <div>
              <span className="text-xs font-semibold text-stone-800">Acoustic Chimes</span>
              <p className="text-[11px] text-stone-500">Play soft chime on mic state change</p>
            </div>
            <input
              type="checkbox"
              checked={settings.voiceSettings.soundEffects}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  voiceSettings: {
                    ...settings.voiceSettings,
                    soundEffects: e.target.checked,
                  },
                })
              }
              className="accent-orange-600 w-4 h-4 cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* AI Synthesis & Workflow Co-pilot */}
      <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-stone-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              AI Voice Co-pilot & Synthesis (Gemini 3.8 Flash)
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Turn raw n8n data into fluent spoken conversation.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              onUpdateSettings({
                ...settings,
                synthesizeWithAi: !settings.synthesizeWithAi,
              })
            }
            className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors ${
              settings.synthesizeWithAi ? 'bg-orange-600' : 'bg-stone-300'
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                settings.synthesizeWithAi ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1.5">
            Custom Assistant Persona & Instructions
          </label>
          <textarea
            rows={3}
            value={settings.systemPrompt}
            onChange={(e) => onUpdateSettings({ ...settings, systemPrompt: e.target.value })}
            placeholder="e.g. You are a helpful operations assistant. Summarize the n8n execution output conversationally for voice playback..."
            className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-lg text-stone-900 focus:ring-2 focus:ring-orange-500"
          />
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="session-id-input" className="block text-xs font-semibold text-stone-700 mb-1.5">
              Session Identifier
            </label>
            <input
              id="session-id-input"
              type="text"
              value={settings.sessionId}
              onChange={(e) => onUpdateSettings({ ...settings, sessionId: e.target.value })}
              className="w-full px-3 py-2 text-xs font-mono bg-stone-50 border border-stone-300 rounded-lg text-stone-900 focus:ring-2 focus:ring-orange-500 focus:bg-white outline-hidden"
            />
          </div>

          {/* Custom Webhook JSON Payload Textarea with Character Counter & Size Limit Warnings */}
          <div className="pt-3 border-t border-stone-100 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <label 
                  htmlFor="custom-payload-json-textarea" 
                  className="text-xs font-semibold text-stone-800 flex items-center gap-1.5"
                >
                  <Code className="w-3.5 h-3.5 text-orange-600" />
                  <span>Custom Webhook JSON Payload Fields</span>
                </label>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  Merged into the JSON request body sent to your n8n webhook node with every message.
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  id="btn-format-payload-json"
                  type="button"
                  onClick={handleFormatPayloadJson}
                  disabled={!payloadRaw.trim()}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 disabled:opacity-40 transition-colors"
                  title="Format and prettify JSON indentation"
                >
                  {formatFeedback ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-600" />
                      <span className="text-emerald-700 font-semibold">{formatFeedback}</span>
                    </>
                  ) : (
                    <>
                      <Sliders className="w-3 h-3 text-stone-500" />
                      <span>Format JSON</span>
                    </>
                  )}
                </button>

                <button
                  id="btn-sample-payload-json"
                  type="button"
                  onClick={handleResetSamplePayload}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 transition-colors"
                  title="Reset to default sample JSON structure"
                >
                  <RotateCcw className="w-3 h-3 text-stone-500" />
                  <span>Reset Sample</span>
                </button>
              </div>
            </div>

            {/* Custom JSON Payload Text Area */}
            <div className="relative">
              <textarea
                id="custom-payload-json-textarea"
                rows={5}
                value={settings.customPayloadJson}
                onChange={(e) => onUpdateSettings({ ...settings, customPayloadJson: e.target.value })}
                placeholder='{\n  "source": "ai_voice_interface",\n  "department": "operations"\n}'
                className={`w-full p-3 text-xs font-mono rounded-xl bg-stone-50 text-stone-900 border transition-all focus:outline-hidden focus:bg-white ${
                  isExceedingCommonLimit
                    ? 'border-rose-400 focus:ring-2 focus:ring-rose-500'
                    : isApproachingLimit
                    ? 'border-amber-400 focus:ring-2 focus:ring-amber-500'
                    : !jsonValidation.isValid && !jsonValidation.isEmpty
                    ? 'border-rose-300 focus:ring-2 focus:ring-rose-400'
                    : 'border-stone-300 focus:ring-2 focus:ring-orange-500'
                }`}
              />
            </div>

            {/* Real-time Character Counter & Payload Size Capacity Indicator */}
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                {/* JSON validity status & Limit reference */}
                <div className="flex items-center gap-2">
                  {payloadRaw.trim() ? (
                    jsonValidation.isValid ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[11px] font-medium border border-emerald-200">
                        <Check className="w-3 h-3 text-emerald-600" />
                        Valid JSON
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 text-[11px] font-medium border border-rose-200">
                        <AlertCircle className="w-3 h-3 text-rose-600" />
                        Invalid JSON syntax
                      </span>
                    )
                  ) : (
                    <span className="text-[11px] text-stone-400 font-mono">Empty (optional)</span>
                  )}

                  <span className="text-[11px] text-stone-300">|</span>

                  <span className="text-[11px] text-stone-500">
                    Common limit: <strong className="font-mono text-stone-700">100 KB</strong>
                  </span>
                </div>

                {/* Character Counter & Metric readout */}
                <div 
                  id="payload-character-counter" 
                  className="flex items-center gap-2 font-mono text-xs"
                >
                  <span 
                    className={`font-semibold ${
                      isExceedingCommonLimit
                        ? 'text-rose-600'
                        : isApproachingLimit
                        ? 'text-amber-600'
                        : 'text-stone-700'
                    }`}
                  >
                    {payloadCharCount.toLocaleString()} chars
                  </span>
                  <span className="text-stone-300">/</span>
                  <span className="text-stone-500">
                    {formatBytes(payloadByteCount)}
                  </span>
                  <span 
                    className={`text-[11px] px-1.5 py-0.5 rounded font-mono ${
                      isExceedingCommonLimit
                        ? 'bg-rose-100 text-rose-800 font-bold'
                        : isApproachingLimit
                        ? 'bg-amber-100 text-amber-800 font-medium'
                        : 'bg-stone-100 text-stone-600'
                    }`}
                  >
                    {payloadPercentage}%
                  </span>
                </div>
              </div>

              {/* Progress bar visual capacity indicator */}
              <div 
                id="payload-size-progress-bar"
                className="w-full bg-stone-200/80 rounded-full h-1.5 overflow-hidden"
                title={`${payloadCharCount.toLocaleString()} characters (${formatBytes(payloadByteCount)}) of 100 KB common limit`}
              >
                <div
                  className={`h-full transition-all duration-300 ${
                    isExceedingCommonLimit
                      ? 'bg-rose-600'
                      : isApproachingLimit
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${payloadPercentage}%` }}
                />
              </div>
            </div>

            {/* Warning Banner: Exceeded Common Webhook Payload Size Limit (100 KB) */}
            {isExceedingCommonLimit && (
              <div 
                id="payload-limit-warning-exceeded"
                className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5 animate-in fade-in duration-200"
              >
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-semibold text-rose-900 flex items-center gap-1.5">
                    <span>Exceeds Common Webhook Payload Limit (100 KB)</span>
                    <span className="font-mono text-[10px] bg-rose-200 text-rose-900 px-1.5 py-0.5 rounded font-bold">
                      {formatBytes(payloadByteCount)} / 100 KB
                    </span>
                  </div>
                  <p className="text-[11px] text-rose-700 leading-relaxed">
                    Most standard webhook listeners, API gateways, and reverse proxies (including n8n instances, AWS API Gateway, and Cloud Run) reject payloads exceeding 100 KB with <strong>HTTP 413 (Payload Too Large)</strong>. Trim or compress your payload fields to prevent dispatch failures.
                  </p>
                </div>
              </div>
            )}

            {/* Warning Banner: Approaching Webhook Payload Size Limit (> 32 KB) */}
            {isApproachingLimit && (
              <div 
                id="payload-limit-warning-caution"
                className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2.5 animate-in fade-in duration-200"
              >
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-semibold text-amber-900 flex items-center gap-1.5">
                    <span>Approaching Webhook Payload Size Limit (&gt;32 KB)</span>
                    <span className="font-mono text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-bold">
                      {formatBytes(payloadByteCount)}
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-700 leading-relaxed">
                    Payloads over 32 KB may introduce latency in continuous two-way voice conversations and can trigger gateway timeouts in resource-constrained environments.
                  </p>
                </div>
              </div>
            )}

            {/* Syntax error feedback if invalid JSON */}
            {!jsonValidation.isValid && !jsonValidation.isEmpty && (
              <div 
                id="payload-json-syntax-error"
                className="p-2.5 rounded-lg bg-rose-50/70 border border-rose-200/80 text-[11px] text-rose-800 flex items-center gap-2"
              >
                <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <span className="font-mono">{jsonValidation.error}</span>
              </div>
            )}

            {/* Common payload threshold reference cards */}
            <div className="grid grid-cols-3 gap-2 pt-1 text-[10px] text-stone-500 font-mono">
              <div className="p-2 rounded-lg bg-stone-50 border border-stone-200/70 text-center">
                <span className="text-stone-400 block font-sans text-[9px] uppercase tracking-wider">Optimal</span>
                <span className="text-emerald-700 font-semibold">&lt; 32 KB</span>
              </div>
              <div className="p-2 rounded-lg bg-stone-50 border border-stone-200/70 text-center">
                <span className="text-stone-400 block font-sans text-[9px] uppercase tracking-wider">Common Limit</span>
                <span className="text-amber-700 font-semibold">100 KB</span>
              </div>
              <div className="p-2 rounded-lg bg-stone-50 border border-stone-200/70 text-center">
                <span className="text-stone-400 block font-sans text-[9px] uppercase tracking-wider">Hard Max</span>
                <span className="text-rose-700 font-semibold">256 KB</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* n8n Setup Blueprint & Quick Workflow Importer */}
      <div className="bg-stone-900 text-stone-100 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Info className="w-5 h-5 text-orange-400" />
            <h3 className="text-sm font-semibold text-white">
              n8n Workspace Workflow Blueprint
            </h3>
          </div>
          <button
            type="button"
            onClick={handleCopyBlueprint}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-xs font-medium text-stone-200 transition-colors"
          >
            {copiedBlueprint ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedBlueprint ? 'Blueprint Copied!' : 'Copy n8n Workflow JSON'}</span>
          </button>
        </div>

        <p className="text-xs text-stone-300 leading-relaxed">
          In your n8n workspace, press <kbd className="px-1.5 py-0.5 bg-stone-800 rounded font-mono text-[11px] text-orange-300">Ctrl+V</kbd> or <kbd className="px-1.5 py-0.5 bg-stone-800 rounded font-mono text-[11px] text-orange-300">Cmd+V</kbd> on an empty canvas to paste this working template:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="p-3 bg-stone-800/80 rounded-xl border border-stone-700/60">
            <div className="font-bold text-orange-400 mb-1">1. Webhook Node</div>
            <p className="text-stone-300 text-[11px]">
              Set HTTP Method to <strong>POST</strong> and Respond to <strong>Using Respond to Webhook Node</strong>.
            </p>
          </div>
          <div className="p-3 bg-stone-800/80 rounded-xl border border-stone-700/60">
            <div className="font-bold text-orange-400 mb-1">2. AI Agent or Flow</div>
            <p className="text-stone-300 text-[11px]">
              Connect an n8n AI Agent, LangChain node, or custom HTTP action receiving <code className="text-amber-300">$json.body.message</code>.
            </p>
          </div>
          <div className="p-3 bg-stone-800/80 rounded-xl border border-stone-700/60">
            <div className="font-bold text-orange-400 mb-1">3. Respond to Webhook</div>
            <p className="text-stone-300 text-[11px]">
              Return JSON with key <code className="text-amber-300">output</code> or <code className="text-amber-300">reply</code> containing the answer.
            </p>
          </div>
        </div>
      </div>

      {/* Add Node Modal */}
      {showAddNodeModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h4 className="text-base font-bold text-stone-900">Add New n8n Node Endpoint</h4>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Node Name</label>
              <input
                type="text"
                value={newNodeName}
                onChange={(e) => setNewNodeName(e.target.value)}
                placeholder="e.g. Slack Dispatcher Node"
                className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Webhook URL</label>
              <input
                type="url"
                value={newNodeUrl}
                onChange={(e) => setNewNodeUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 text-sm font-mono bg-stone-50 border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Method</label>
              <select
                value={newNodeMethod}
                onChange={(e) => setNewNodeMethod(e.target.value as any)}
                className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-lg"
              >
                <option value="POST">POST</option>
                <option value="GET">GET</option>
                <option value="PUT">PUT</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddNodeModal(false)}
                className="px-4 py-2 text-xs font-medium text-stone-600 hover:text-stone-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddNewNode}
                disabled={!newNodeName.trim()}
                className="px-4 py-2 text-xs font-medium bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
              >
                Save Node
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
