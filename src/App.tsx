import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { ChatView } from './components/ChatView';
import { VoiceCallView } from './components/VoiceCallView';
import { SettingsTab } from './components/SettingsTab';
import { PayloadInspectorTab } from './components/PayloadInspectorTab';
import { useVoiceConversation } from './hooks/useVoiceConversation';
import { AppSettings, ChatMessage, N8nNodeConfig } from './types';

const STORAGE_KEY_SETTINGS = 'n8n_ai_interface_settings_v1';
const STORAGE_KEY_MESSAGES = 'n8n_ai_interface_messages_v1';

const DEFAULT_SETTINGS: AppSettings = {
  activeNodeId: 'node-primary',
  nodes: [
    {
      id: 'node-primary',
      name: 'Primary n8n Webhook',
      url: '',
      method: 'POST',
      authType: 'none',
      authToken: '',
      customHeaderKey: '',
      customHeaderValue: '',
      lastTestedAt: null,
      lastStatus: null,
      lastLatencyMs: null,
    },
  ],
  synthesizeWithAi: true,
  systemPrompt:
    'Be FRIDAY: warm, sharp, composed, futuristic, subtly British, and direct. Speak naturally in short conversational turns. Sound like a calm cinematic AI assistant, not a generic chatbot. Celebrate only real progress, and never claim an action worked without evidence.',
  continuousVoiceMode: true,
  voiceSettings: {
    voiceURI: '',
    rate: 0.94,
    pitch: 0.82,
    silenceThresholdMs: 1400,
    autoSpeakReplies: true,
    soundEffects: true,
  },
  sessionId: `n8n-session-${Math.random().toString(36).substring(2, 9)}`,
  customPayloadJson: '{"source": "ai_voice_interface"}',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'chat' | 'voice' | 'settings' | 'inspector'>('chat');
  const [themeMode, setThemeMode] = useState<'bright' | 'night'>(() => {
    if (typeof window === 'undefined') return 'bright';
    return localStorage.getItem('friday-theme') === 'night' ? 'night' : 'bright';
  });
  const [themeColor, setThemeColor] = useState<'orange' | 'blue' | 'violet' | 'emerald' | 'rose'>(() => {
    if (typeof window === 'undefined') return 'orange';
    const saved = localStorage.getItem('friday-theme-color');
    return saved === 'blue' || saved === 'violet' || saved === 'emerald' || saved === 'rose' ? saved : 'orange';
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    status?: number;
    latencyMs?: number;
    data?: any;
    error?: string;
  } | null>(null);

  useEffect(() => {
    localStorage.setItem('friday-theme', themeMode);
    localStorage.setItem('friday-theme-color', themeColor);
    document.documentElement.dataset.fridayTheme = themeMode;
    document.documentElement.dataset.fridayColor = themeColor;
  }, [themeMode, themeColor]);

  // Load settings from localStorage
  const [settings, setSettings] = useState<AppSettings>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY_SETTINGS);
        if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      } catch (e) {
        console.warn('Failed to load settings:', e);
      }
    }
    return DEFAULT_SETTINGS;
  });

  // Load chat messages from localStorage
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY_MESSAGES);
        if (saved) return JSON.parse(saved);
      } catch (e) {
        console.warn('Failed to load messages:', e);
      }
    }
    return [];
  });

  // Save settings whenever changed
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
    } catch (e) {
      console.warn('Failed to save settings:', e);
    }
  }, [settings]);

  // Save messages whenever changed
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(messages));
    } catch (e) {
      console.warn('Failed to save messages:', e);
    }
  }, [messages]);

  const activeNode = settings.nodes.find((n) => n.id === settings.activeNodeId) || settings.nodes[0];

  // Helper to format current time
  const formatTime = () => {
    const d = new Date();
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Dispatch directly from the browser to the configured n8n HTTP webhook.
  // This UI has no local backend/proxy dependency.
  const handleSendMessage = useCallback(
    async (text: string, mode: 'voice' | 'text' = 'text') => {
      if (!text.trim()) return;

      const userMessage: ChatMessage = {
        id: `msg-user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        sender: 'user',
        text: text.trim(),
        timestamp: formatTime(),
        mode,
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsProcessing(true);

      try {
        let parsedCustomBody: Record<string, unknown> = {};
        if (settings.customPayloadJson) {
          try {
            const parsed = JSON.parse(settings.customPayloadJson);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              parsedCustomBody = parsed;
            }
          } catch {
            // Invalid optional custom JSON is ignored; the core message still sends.
          }
        }

        const requestHeaders: Record<string, string> = {
          Accept: 'application/json, text/plain, */*',
        };
        if (activeNode.authType === 'bearer' && activeNode.authToken) {
          requestHeaders.Authorization = `Bearer ${activeNode.authToken}`;
        } else if (
          activeNode.authType === 'custom_header' &&
          activeNode.customHeaderKey &&
          activeNode.customHeaderValue
        ) {
          requestHeaders[activeNode.customHeaderKey] = activeNode.customHeaderValue;
        }

        if (!activeNode.url?.trim()) {
          throw new Error('No n8n Webhook URL is configured.');
        }

        const payload = {
          message: text.trim(),
          query: text.trim(),
          sessionId: settings.sessionId,
          nodeEndpointId: activeNode.id,
          inputMode: mode,
          timestamp: new Date().toISOString(),
          ...parsedCustomBody,
        };

        const startedAt = performance.now();
        const request: RequestInit = {
          method: activeNode.method || 'POST',
          headers: requestHeaders,
        };
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          request.body = JSON.stringify(payload);
          requestHeaders['Content-Type'] = 'application/json';
        }

        const res = await fetch(activeNode.url.trim(), request);
        const latencyMs = Math.round(performance.now() - startedAt);

        const contentType = res.headers.get('content-type') || '';
        let responseData: any = null;
        if (res.status !== 204) {
          const raw = await res.text();
          if (raw) {
            if (contentType.includes('application/json')) {
              try { responseData = JSON.parse(raw); } catch { responseData = raw; }
            } else {
              try { responseData = JSON.parse(raw); } catch { responseData = raw; }
            }
          }
        }

        if (!res.ok) {
          const detail =
            typeof responseData === 'string'
              ? responseData
              : responseData?.message || responseData?.error || `HTTP ${res.status}`;
          throw new Error(`n8n returned ${detail}`);
        }

        const replyText =
          typeof responseData === 'string'
            ? responseData
            : responseData?.reply?.text ||
              responseData?.reply ||
              responseData?.output ||
              responseData?.response ||
              responseData?.message ||
              responseData?.text ||
              (responseData ? JSON.stringify(responseData, null, 2) : 'n8n accepted the request.');

        const assistantMessage: ChatMessage = {
          id: `msg-ai-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          sender: 'assistant',
          text: String(replyText),
          timestamp: formatTime(),
          mode,
          n8nStatus: res.status,
          n8nLatencyMs: latencyMs,
          n8nRawData: responseData,
          aiEnhanced: false,
          nodeName: activeNode.name,
        };

        setMessages((prev) => [...prev, assistantMessage]);

        if (settings.voiceSettings.autoSpeakReplies || mode === 'voice') {
          await voiceManager.speakText(String(replyText));
          voiceManager.onAiFinishedSpeaking();
        } else {
          voiceManager.setConversationState('idle');
        }
      } catch (err: any) {
        console.error('Direct n8n HTTP dispatch error:', err);
        const message = err?.message || 'Network request failed.';

        const errorMessage: ChatMessage = {
          id: `msg-err-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          sender: 'assistant',
          text: `Unable to reach the n8n Webhook over HTTP: ${message}. Check the Webhook URL and n8n CORS/HTTP access settings.`,
          timestamp: formatTime(),
          mode,
          error: message,
        };
        setMessages((prev) => [...prev, errorMessage]);
        voiceManager.setConversationState('idle');
      } finally {
        setIsProcessing(false);
      }
    },
    [activeNode, settings]
  );

  // Hook for voice and two-way turn-taking
  const voiceManager = useVoiceConversation({
    voiceSettings: settings.voiceSettings,
    continuousMode: settings.continuousVoiceMode,
    onSendMessage: handleSendMessage,
    isAppProcessing: isProcessing,
  });

  // Test the configured n8n endpoint directly from the browser over HTTP.
  const handleTestNode = async (node: N8nNodeConfig) => {
    if (!node.url?.trim()) {
      setTestResult({ ok: false, error: 'Please enter or paste a valid n8n Webhook URL before testing.' });
      return;
    }

    setTestLoading(true);
    setTestResult(null);

    try {
      const headers: Record<string, string> = {
        Accept: 'application/json, text/plain, */*',
      };
      if (node.authType === 'bearer' && node.authToken) {
        headers.Authorization = `Bearer ${node.authToken}`;
      } else if (node.authType === 'custom_header' && node.customHeaderKey && node.customHeaderValue) {
        headers[node.customHeaderKey] = node.customHeaderValue;
      }

      const startedAt = performance.now();
      const request: RequestInit = { method: node.method || 'POST', headers };
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        headers['Content-Type'] = 'application/json';
        request.body = JSON.stringify({
          event: 'test_connection',
          source: 'friday-web-ui',
          timestamp: new Date().toISOString(),
          message: 'HTTP connectivity test from FRIDAY Web UI',
        });
      }

      const response = await fetch(node.url.trim(), request);
      const latencyMs = Math.round(performance.now() - startedAt);
      const contentType = response.headers.get('content-type') || '';
      const raw = response.status === 204 ? '' : await response.text();
      let data: any = raw;
      if (raw && contentType.includes('application/json')) {
        try { data = JSON.parse(raw); } catch { /* keep text */ }
      }

      const result = {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        latencyMs,
        contentType,
        data,
      };
      setTestResult(result);

      setSettings((current) => ({
        ...current,
        nodes: current.nodes.map((n) =>
          n.id === node.id
            ? { ...n, lastTestedAt: new Date().toISOString(), lastStatus: response.status, lastLatencyMs: latencyMs }
            : n
        ),
      }));
    } catch (error: any) {
      const latencyMs = Math.round(performance.now() - performance.now());
      setTestResult({ ok: false, error: error?.message || 'Browser HTTP request failed.', latencyMs });
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 flex flex-col font-sans selection:bg-orange-200 transition-colors duration-300">
      {/* Navigation Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        activeNode={activeNode}
        nodes={settings.nodes}
        onSelectNode={(nodeId) => setSettings((prev) => ({ ...prev, activeNodeId: nodeId }))}
        continuousMode={settings.continuousVoiceMode}
        onToggleContinuousMode={handleToggleContinuousMode}
        conversationState={voiceManager.conversationState}
        onStartListening={voiceManager.startListening}
        onStopListening={voiceManager.stopListening}
        onStopSpeaking={voiceManager.stopSpeaking}
        themeMode={themeMode}
        onToggleTheme={() => setThemeMode((mode) => mode === 'bright' ? 'night' : 'bright')}
        themeColor={themeColor}
        onChangeThemeColor={setThemeColor}
      />

      {/* Main Tab Content Area */}
      <main className="flex-1 flex flex-col">
        {activeTab === 'chat' && (
          <ChatView
            messages={messages}
            onSendMessage={handleSendMessage}
            isProcessing={isProcessing}
            conversationState={voiceManager.conversationState}
            transcript={voiceManager.transcript}
            interimTranscript={voiceManager.interimTranscript}
            onStartListening={voiceManager.startListening}
            onStopListening={voiceManager.stopListening}
            onSpeakText={voiceManager.speakText}
            onStopSpeaking={voiceManager.stopSpeaking}
            continuousMode={settings.continuousVoiceMode}
            onToggleContinuousMode={handleToggleContinuousMode}
            activeNode={activeNode}
            onClearChat={handleClearChat}
            permissionError={voiceManager.permissionError}
            onDismissPermissionError={voiceManager.clearPermissionError}
            voiceActivationRequired={voiceManager.voiceActivationRequired}
            onActivateVoice={voiceManager.activateVoice}
          />
        )}

        {activeTab === 'voice' && (
          <VoiceCallView
            conversationState={voiceManager.conversationState}
            transcript={voiceManager.transcript}
            interimTranscript={voiceManager.interimTranscript}
            lastAiResponse={lastAiMsg?.text || ''}
            onStartListening={voiceManager.startListening}
            onStopListening={voiceManager.stopListening}
            onStopSpeaking={voiceManager.stopSpeaking}
            continuousMode={settings.continuousVoiceMode}
            onToggleContinuousMode={handleToggleContinuousMode}
            activeNode={activeNode}
            onCloseCall={() => setActiveTab('chat')}
            permissionError={voiceManager.permissionError}
            onDismissPermissionError={voiceManager.clearPermissionError}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsTab
            settings={settings}
            onUpdateSettings={setSettings}
            availableVoices={voiceManager.availableVoices}
            onTestNode={handleTestNode}
            testLoading={testLoading}
            testResult={testResult}
          />
        )}

        {activeTab === 'inspector' && (
          <PayloadInspectorTab
            messages={messages}
            onClearLogs={handleClearChat}
          />
        )}
      </main>


      {/* Confirmation Modal for Clearing Chat History */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl border border-stone-200 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-base font-bold text-stone-900">Clear Conversation?</h3>
            <p className="text-xs text-stone-600 mt-2 leading-relaxed">
              This will remove all text messages, audio transcripts, and n8n latency logs from this session.
            </p>
            <div className="flex items-center justify-end gap-2.5 mt-5">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="px-3.5 py-2 text-xs font-medium rounded-xl border border-stone-200 text-stone-700 hover:bg-stone-50 cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmClearChat}
                className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-rose-600 text-white hover:bg-rose-700 cursor-pointer shadow-xs transition-colors"
              >
                Clear History
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
