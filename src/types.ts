export interface N8nNodeConfig {
  id: string;
  name: string;
  url: string;
  method: 'POST' | 'GET' | 'PUT';
  authType: 'none' | 'bearer' | 'custom_header';
  authToken: string;
  customHeaderKey: string;
  customHeaderValue: string;
  description?: string;
  lastTestedAt?: string | null;
  lastStatus?: number | null;
  lastLatencyMs?: number | null;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: string;
  mode: 'voice' | 'text';
  n8nStatus?: number | null;
  n8nLatencyMs?: number | null;
  n8nRawData?: any;
  aiEnhanced?: boolean;
  nodeName?: string;
  error?: string | null;
}

export interface VoiceSettings {
  voiceURI: string;
  rate: number;
  pitch: number;
  silenceThresholdMs: number;
  autoSpeakReplies: boolean;
  soundEffects: boolean;
}

export interface AppSettings {
  activeNodeId: string;
  nodes: N8nNodeConfig[];
  synthesizeWithAi: boolean;
  systemPrompt: string;
  continuousVoiceMode: boolean;
  voiceSettings: VoiceSettings;
  sessionId: string;
  customPayloadJson: string;
}

export type ConversationState = 'idle' | 'listening' | 'processing' | 'speaking' | 'paused';
