import React from 'react';
import { 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  Bot, 
  Radio, 
  Activity, 
  X, 
  Sparkles, 
  RotateCw,
  Workflow
} from 'lucide-react';
import { ConversationState, N8nNodeConfig } from '../types';

interface VoiceCallViewProps {
  conversationState: ConversationState;
  transcript: string;
  interimTranscript: string;
  lastAiResponse: string;
  onStartListening: () => void;
  onStopListening: () => void;
  onStopSpeaking: () => void;
  continuousMode: boolean;
  onToggleContinuousMode: () => void;
  activeNode: N8nNodeConfig | undefined;
  onCloseCall: () => void;
  permissionError?: string | null;
  onDismissPermissionError?: () => void;
}

export const VoiceCallView: React.FC<VoiceCallViewProps> = ({
  conversationState,
  transcript,
  interimTranscript,
  lastAiResponse,
  onStartListening,
  onStopListening,
  onStopSpeaking,
  continuousMode,
  onToggleContinuousMode,
  activeNode,
  onCloseCall,
  permissionError,
  onDismissPermissionError,
}) => {
  const isListening = conversationState === 'listening';
  const isSpeaking = conversationState === 'speaking';
  const isProcessing = conversationState === 'processing';

  return (
    <div className="flex flex-col items-center justify-between min-h-[calc(100vh-5rem)] max-w-4xl mx-auto w-full px-4 py-8 select-none">
      {/* Permission Warning Banner if any */}
      {permissionError && (
        <div className="w-full flex items-center justify-between gap-3 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs mb-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
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

      {/* Top Controls & Status */}
      <div className="w-full flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-stone-100 border border-stone-200 text-xs font-medium text-stone-800">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isListening
                  ? 'bg-emerald-500 animate-ping'
                  : isSpeaking
                  ? 'bg-orange-500 animate-pulse'
                  : isProcessing
                  ? 'bg-amber-500 animate-spin'
                  : 'bg-stone-400'
              }`}
            />
            <span className="font-semibold">
              {isListening
                ? 'Listening to you...'
                : isSpeaking
                ? 'AI is speaking...'
                : isProcessing
                ? 'n8n workflow executing...'
                : 'Standby / Paused'}
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-xs text-stone-500">
            <Workflow className="w-3.5 h-3.5 text-orange-600" />
            <span>Node: {activeNode?.name}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleContinuousMode}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors flex items-center gap-1.5 ${
              continuousMode
                ? 'bg-orange-50 text-orange-700 border-orange-200'
                : 'bg-white text-stone-600 border-stone-200'
            }`}
            title="Continuous two-way conversation mode without pressing switches"
          >
            <Radio className="w-3 h-3" />
            <span>Hands-Free Loop: {continuousMode ? 'ON' : 'OFF'}</span>
          </button>

          <button
            type="button"
            onClick={onCloseCall}
            className="p-2 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
            title="Return to chat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Orb / Visualizer Center */}
      <div className="my-auto flex flex-col items-center justify-center text-center space-y-8 w-full max-w-lg">
        {/* Dynamic Concentric Orb Visualizer */}
        <div className="relative flex items-center justify-center">
          {/* Outermost Pulsing Wave */}
          <div
            className={`absolute rounded-full transition-all duration-700 ${
              isListening
                ? 'w-72 h-72 bg-emerald-100/60 animate-ping'
                : isSpeaking
                ? 'w-72 h-72 bg-orange-100/70 animate-pulse'
                : 'w-56 h-56 bg-stone-100'
            }`}
          />

          {/* Middle Wave */}
          <div
            className={`absolute rounded-full transition-all duration-500 ${
              isListening
                ? 'w-56 h-56 bg-emerald-200/50'
                : isSpeaking
                ? 'w-56 h-56 bg-orange-200/50'
                : isProcessing
                ? 'w-56 h-56 bg-amber-200/40 animate-spin'
                : 'w-48 h-48 bg-stone-200/50'
            }`}
          />

          {/* Core Interactive Center Circle */}
          <button
            type="button"
            onClick={isListening ? onStopListening : onStartListening}
            className={`relative z-10 w-36 h-36 rounded-full flex flex-col items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95 ${
              isListening
                ? 'bg-gradient-to-tr from-emerald-600 to-teal-500 text-white ring-4 ring-emerald-300 ring-offset-2'
                : isSpeaking
                ? 'bg-gradient-to-tr from-orange-600 to-amber-500 text-white ring-4 ring-orange-300 ring-offset-2'
                : isProcessing
                ? 'bg-gradient-to-tr from-amber-500 to-yellow-400 text-white ring-4 ring-amber-300'
                : 'bg-stone-900 text-white hover:bg-stone-800'
            }`}
          >
            {isListening && <Mic className="w-10 h-10 animate-pulse" />}
            {isSpeaking && <Volume2 className="w-10 h-10 animate-bounce" />}
            {isProcessing && <RotateCw className="w-10 h-10 animate-spin" />}
            {!isListening && !isSpeaking && !isProcessing && <Mic className="w-10 h-10" />}

            <span className="text-[11px] font-medium tracking-wide mt-2">
              {isListening
                ? 'Listening...'
                : isSpeaking
                ? 'AI Talking'
                : isProcessing
                ? 'Processing...'
                : 'Tap to Talk'}
            </span>
          </button>
        </div>

        {/* Live Conversation Transcript Display */}
        <div className="space-y-4 w-full">
          {/* User's spoken words in real-time */}
          {(isListening || transcript || interimTranscript) ? (
            <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 text-stone-900 max-w-md mx-auto shadow-2xs">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-orange-600 block mb-1">
                You Spoke:
              </span>
              <p className="text-base font-medium leading-relaxed">
                {transcript || interimTranscript || 'Say something... the AI will listen.'}
              </p>
            </div>
          ) : lastAiResponse ? (
            <div className="p-4 rounded-2xl bg-white border border-stone-200 text-stone-800 max-w-md mx-auto shadow-2xs">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 block mb-1">
                n8n AI Response:
              </span>
              <p className="text-sm leading-relaxed max-h-36 overflow-y-auto">
                {lastAiResponse}
              </p>
            </div>
          ) : (
            <p className="text-sm text-stone-400 max-w-xs mx-auto">
              {continuousMode
                ? 'Continuous hands-free conversation is active. Speak anytime without pressing switches.'
                : 'Click the central button or toggle hands-free mode to begin conversational voice.'}
            </p>
          )}
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="w-full flex items-center justify-center gap-4 pt-4 border-t border-stone-200">
        {/* Mute/Unmute Mic */}
        <button
          type="button"
          onClick={isListening ? onStopListening : onStartListening}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-semibold shadow-xs transition-all ${
            isListening
              ? 'bg-rose-600 text-white hover:bg-rose-700'
              : 'bg-stone-100 hover:bg-stone-200 text-stone-800'
          }`}
        >
          {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          <span>{isListening ? 'Mute Microphone' : 'Start Speaking'}</span>
        </button>

        {/* If AI is speaking, interrupt */}
        {isSpeaking && (
          <button
            type="button"
            onClick={onStopSpeaking}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
          >
            <VolumeX className="w-4 h-4" />
            <span>Interrupt AI</span>
          </button>
        )}
      </div>
    </div>
  );
};
