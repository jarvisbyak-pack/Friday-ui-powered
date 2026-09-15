import React from 'react';
import { 
  Bot, 
  Settings, 
  Mic, 
  MicOff, 
  Activity, 
  Code2, 
  Radio, 
  Workflow, 
  Sparkles,
  Volume2
} from 'lucide-react';
import { N8nNodeConfig, ConversationState } from '../types';

interface HeaderProps {
  activeTab: 'chat' | 'voice' | 'settings' | 'inspector';
  setActiveTab: (tab: 'chat' | 'voice' | 'settings' | 'inspector') => void;
  activeNode: N8nNodeConfig | undefined;
  nodes: N8nNodeConfig[];
  onSelectNode: (nodeId: string) => void;
  continuousMode: boolean;
  onToggleContinuousMode: () => void;
  conversationState: ConversationState;
  onStartListening: () => void;
  onStopListening: () => void;
  onStopSpeaking: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  activeNode,
  nodes,
  onSelectNode,
  continuousMode,
  onToggleContinuousMode,
  conversationState,
  onStartListening,
  onStopListening,
  onStopSpeaking,
}) => {
  const isListening = conversationState === 'listening';
  const isSpeaking = conversationState === 'speaking';
  const isProcessing = conversationState === 'processing';

  return (
    <header className="border-b border-stone-200 bg-white sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Brand & Node Status */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500 text-white flex items-center justify-center shadow-xs font-semibold">
            <Workflow className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-stone-900 tracking-tight">
                n8n Voice & AI Interface
              </h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                Live Node
              </span>
            </div>
            
            {/* Active Node Dropdown */}
            <div className="flex items-center gap-2 text-xs text-stone-500 mt-0.5">
              <span>Target Node:</span>
              <select
                value={activeNode?.id || ''}
                onChange={(e) => onSelectNode(e.target.value)}
                className="font-medium text-stone-800 bg-stone-100 hover:bg-stone-200 border-none rounded px-2 py-0.5 cursor-pointer focus:ring-1 focus:ring-orange-500 outline-hidden"
              >
                {nodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.name} {node.lastLatencyMs ? `(${node.lastLatencyMs}ms)` : ''}
                  </option>
                ))}
              </select>
              {activeNode?.url ? (
                <span className="hidden sm:inline-block text-emerald-600 font-mono text-[11px] truncate max-w-[140px]">
                  ✓ Connected
                </span>
              ) : (
                <span className="text-amber-600 text-[11px]">No URL</span>
              )}
            </div>
          </div>
        </div>

        {/* Live Voice Status Indicator / Quick Action */}
        <div className="flex items-center gap-2">
          {/* Hands-free Mode Quick Toggle */}
          <button
            type="button"
            onClick={onToggleContinuousMode}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              continuousMode
                ? 'bg-orange-600 text-white shadow-xs hover:bg-orange-700'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200 border border-stone-200'
            }`}
            title="Toggle two-way hands-free conversation without pressing switches"
          >
            <Radio className={`w-3.5 h-3.5 ${continuousMode ? 'animate-pulse' : ''}`} />
            <span>Hands-free Voice: {continuousMode ? 'ON' : 'OFF'}</span>
          </button>

          {/* If AI is speaking, allow immediate stop */}
          {isSpeaking && (
            <button
              type="button"
              onClick={onStopSpeaking}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 animate-pulse transition-colors"
              title="Interrupt and stop AI speaking"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>Stop Speaking</span>
            </button>
          )}

          {/* Quick Mic Action */}
          <button
            type="button"
            onClick={isListening ? onStopListening : onStartListening}
            className={`p-2 rounded-lg transition-all ${
              isListening
                ? 'bg-rose-600 text-white shadow-sm ring-2 ring-rose-300'
                : isProcessing
                ? 'bg-amber-100 text-amber-800 animate-pulse'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
            }`}
            title={isListening ? 'Mute microphone' : 'Start speaking'}
          >
            {isListening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'chat'
                ? 'bg-white text-stone-900 shadow-xs font-semibold'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>Chat & Voice</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('voice')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'voice'
                ? 'bg-white text-orange-600 shadow-xs font-semibold'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Ambient Call</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'settings'
                ? 'bg-white text-stone-900 shadow-xs font-semibold'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>n8n Settings</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('inspector')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'inspector'
                ? 'bg-white text-stone-900 shadow-xs font-semibold'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Payloads</span>
          </button>
        </nav>
      </div>
    </header>
  );
};
