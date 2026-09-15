import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { 
  Send, 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  ChevronDown, 
  ChevronRight, 
  Sparkles, 
  Radio, 
  Bot, 
  User, 
  RotateCw,
  Zap,
  Clock,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { ChatMessage, ConversationState, N8nNodeConfig } from '../types';

interface ChatViewProps {
  messages: ChatMessage[];
  onSendMessage: (text: string, mode: 'voice' | 'text') => Promise<void>;
  isProcessing: boolean;
  conversationState: ConversationState;
  transcript: string;
  interimTranscript: string;
  onStartListening: () => void;
  onStopListening: () => void;
  onSpeakText: (text: string) => void;
  onStopSpeaking: () => void;
  continuousMode: boolean;
  onToggleContinuousMode: () => void;
  activeNode: N8nNodeConfig | undefined;
  onClearChat: () => void;
  permissionError?: string | null;
  onDismissPermissionError?: () => void;
}

export const ChatView: React.FC<ChatViewProps> = ({
  messages,
  onSendMessage,
  isProcessing,
  conversationState,
  transcript,
  interimTranscript,
  onStartListening,
  onStopListening,
  onSpeakText,
  onStopSpeaking,
  continuousMode,
  onToggleContinuousMode,
  activeNode,
  onClearChat,
  permissionError,
  onDismissPermissionError,
}) => {
  const [inputText, setInputText] = useState('');
  const [expandedPayloads, setExpandedPayloads] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const isListening = conversationState === 'listening';
  const isSpeaking = conversationState === 'speaking';

  // Auto-scroll to bottom on new messages or interim transcripts
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, interimTranscript, transcript, isProcessing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isProcessing) return;
    const text = inputText.trim();
    setInputText('');
    await onSendMessage(text, 'text');
  };

  const togglePayload = (id: string) => {
    setExpandedPayloads((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const samplePrompts = [
    'Execute current n8n webhook workflow',
    'Fetch latest workflow status and metrics',
    'Trigger automated notification test',
    'What data did the n8n node return?',
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-5xl mx-auto w-full px-4 sm:px-6 py-4">
      {/* Permission Warning Banner if any */}
      {permissionError && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs mb-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
            <span>{permissionError}</span>
          </div>
          {onDismissPermissionError && (
            <button
              type="button"
              onClick={onDismissPermissionError}
              className="text-amber-700 hover:text-amber-900 font-semibold text-xs shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      {/* Top Banner / Quick Info */}
      <div className="flex items-center justify-between py-2 px-3 rounded-xl bg-stone-100/80 border border-stone-200 text-xs text-stone-600 mb-3 shrink-0">
        <div className="flex items-center gap-2 truncate">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-semibold text-stone-900 truncate">
            Target: {activeNode?.name || 'n8n Node'}
          </span>
          <span className="font-mono text-stone-500 truncate hidden sm:inline max-w-xs">
            ({activeNode?.url ? activeNode.url : 'No Webhook URL configured'})
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onToggleContinuousMode}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
              continuousMode
                ? 'bg-orange-600 text-white'
                : 'bg-white border border-stone-200 text-stone-700 hover:bg-stone-50'
            }`}
          >
            <Radio className="w-3 h-3" />
            <span>Two-Way Voice: {continuousMode ? 'ON' : 'OFF'}</span>
          </button>

          {messages.length > 0 && (
            <button
              type="button"
              onClick={onClearChat}
              className="text-stone-400 hover:text-stone-700 transition-colors"
              title="Clear chat history"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 scroll-smooth">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center shadow-xs">
              <Bot className="w-8 h-8" />
            </div>
            <div className="max-w-md space-y-1">
              <h3 className="text-lg font-bold text-stone-900">
                Ready for Two-Way Voice & Chat
              </h3>
              <p className="text-xs text-stone-500">
                Start speaking or typing. Messages are dispatched to your active n8n webhook node and spoken back in real time.
              </p>
            </div>

            {/* Quick Prompt Chips */}
            <div className="pt-2 flex flex-wrap gap-2 justify-center max-w-lg">
              {samplePrompts.map((prompt, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onSendMessage(prompt, 'text')}
                  className="px-3 py-1.5 rounded-full text-xs bg-white hover:bg-orange-50 border border-stone-200 hover:border-orange-300 text-stone-700 hover:text-orange-700 shadow-2xs transition-all text-left"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.sender === 'user';
            const isExpanded = Boolean(expandedPayloads[msg.id]);

            return (
              <div
                key={msg.id}
                className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className="w-8 h-8 rounded-lg bg-orange-500 text-white flex items-center justify-center shrink-0 mt-1 shadow-xs">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] sm:max-w-2xl rounded-2xl p-4 shadow-2xs text-sm leading-relaxed ${
                    isUser
                      ? 'bg-stone-900 text-stone-100 rounded-br-xs'
                      : 'bg-white border border-stone-200 text-stone-800 rounded-bl-xs'
                  }`}
                >
                  {/* Message Meta Header */}
                  <div className="flex items-center justify-between gap-2 mb-1.5 text-[11px] opacity-75">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold">
                        {isUser ? 'You' : msg.nodeName || 'n8n Assistant'}
                      </span>
                      {msg.mode === 'voice' && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white/20 text-[10px]">
                          <Mic className="w-2.5 h-2.5" />
                          Voice
                        </span>
                      )}
                      {msg.aiEnhanced && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-medium">
                          <Sparkles className="w-2.5 h-2.5" />
                          Gemini Synthesized
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {msg.n8nLatencyMs && (
                        <span className="text-[10px] font-mono text-stone-400">
                          {msg.n8nLatencyMs}ms
                        </span>
                      )}
                      {msg.n8nStatus && (
                        <span
                          className={`text-[10px] font-mono px-1 rounded ${
                            msg.n8nStatus >= 200 && msg.n8nStatus < 300
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          HTTP {msg.n8nStatus}
                        </span>
                      )}
                      <span className="text-[10px]">{msg.timestamp}</span>
                    </div>
                  </div>

                  {/* Body Text */}
                  <div className={`break-words text-sm leading-relaxed ${isUser ? 'text-stone-100' : 'text-stone-800'}`}>
                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                  </div>

                  {/* Action Bar for Assistant Messages */}
                  {!isUser && (
                    <div className="mt-3 pt-2 border-t border-stone-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                      {/* Read Aloud Button */}
                      <button
                        type="button"
                        onClick={() => onSpeakText(msg.text)}
                        className="inline-flex items-center gap-1 text-stone-500 hover:text-orange-600 font-medium transition-colors"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>Speak aloud</span>
                      </button>

                      {/* Expandable n8n raw payload viewer */}
                      {msg.n8nRawData && (
                        <button
                          type="button"
                          onClick={() => togglePayload(msg.id)}
                          className="inline-flex items-center gap-1 text-stone-500 hover:text-stone-800 font-mono text-[11px] transition-colors"
                        >
                          {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          <span>Raw n8n Payload</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Collapsible Raw n8n Payload Drawer */}
                  {isExpanded && msg.n8nRawData && (
                    <div className="mt-2 p-2.5 rounded-lg bg-stone-900 text-emerald-400 font-mono text-[11px] overflow-x-auto max-h-56">
                      <pre>
                        {typeof msg.n8nRawData === 'object'
                          ? JSON.stringify(msg.n8nRawData, null, 2)
                          : String(msg.n8nRawData)}
                      </pre>
                    </div>
                  )}
                </div>

                {isUser && (
                  <div className="w-8 h-8 rounded-lg bg-stone-800 text-stone-200 flex items-center justify-center shrink-0 mt-1 shadow-xs">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Live Speech Recognition Transcript Floating Indicator */}
        {(isListening || transcript || interimTranscript) && (
          <div className="flex items-start gap-3 justify-end animate-in fade-in duration-200">
            <div className="max-w-md rounded-2xl p-4 bg-orange-50 border border-orange-200 text-stone-900 shadow-sm text-sm">
              <div className="flex items-center gap-2 text-xs font-semibold text-orange-700 mb-1">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                <span>Listening to your voice...</span>
              </div>
              <p className="italic text-stone-800">
                {transcript} <span className="text-stone-400">{interimTranscript}</span>
              </p>
              <div className="text-[10px] text-stone-500 mt-1">
                Stop talking to automatically dispatch to n8n
              </div>
            </div>
          </div>
        )}

        {/* Processing Indicator */}
        {isProcessing && (
          <div className="flex items-center gap-2 text-xs text-stone-500 bg-white border border-stone-200 p-3 rounded-xl max-w-xs shadow-2xs">
            <RotateCw className="w-3.5 h-3.5 animate-spin text-orange-600" />
            <span>Communicating with n8n node...</span>
          </div>
        )}

        {/* AI Speaking Visualizer Card */}
        {isSpeaking && (
          <div className="flex items-center justify-between gap-3 text-xs text-orange-800 bg-orange-50 border border-orange-200 p-3 rounded-xl max-w-sm shadow-2xs">
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-orange-600 animate-bounce" />
              <span className="font-semibold">AI is speaking...</span>
            </div>
            <button
              type="button"
              onClick={onStopSpeaking}
              className="px-2 py-1 rounded bg-orange-200 hover:bg-orange-300 text-orange-900 font-medium text-[11px]"
            >
              Stop
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Interactive Input Bar */}
      <div className="mt-3 pt-2 shrink-0">
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 bg-white border border-stone-300 rounded-2xl p-2 shadow-xs focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-200 transition-all"
        >
          {/* Microphone Button */}
          <button
            type="button"
            onClick={isListening ? onStopListening : onStartListening}
            className={`p-3 rounded-xl transition-all shrink-0 ${
              isListening
                ? 'bg-rose-600 text-white shadow-md animate-pulse ring-4 ring-rose-200'
                : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
            }`}
            title={isListening ? 'Click to pause mic' : 'Click to speak'}
          >
            {isListening ? <Mic className="w-5 h-5" /> : <Mic className="w-5 h-5 text-stone-600" />}
          </button>

          {/* Text Input */}
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={
              isListening
                ? 'Listening to you speak...'
                : 'Type a message or click the mic to talk with n8n...'
            }
            className="flex-1 bg-transparent px-2 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-hidden"
          />

          {/* Submit / Send Button */}
          <button
            type="submit"
            disabled={!inputText.trim() || isProcessing}
            className="p-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-40 disabled:hover:bg-orange-600 transition-colors shadow-xs shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>

        <div className="flex items-center justify-between text-[11px] text-stone-500 px-2 mt-2">
          <span>
            Two-Way Mode: <strong>{continuousMode ? 'Hands-Free (Turn-Taking)' : 'Push-to-Talk'}</strong>
          </span>
          <span>Target: {activeNode?.name || 'Default Webhook'}</span>
        </div>
      </div>
    </div>
  );
};
