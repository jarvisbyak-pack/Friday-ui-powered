import React, { useState } from 'react';
import { 
  Activity, 
  Search, 
  Trash2, 
  Copy, 
  Check, 
  Download, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Clock, 
  Filter
} from 'lucide-react';
import { ChatMessage } from '../types';

interface PayloadInspectorTabProps {
  messages: ChatMessage[];
  onClearLogs: () => void;
}

export const PayloadInspectorTab: React.FC<PayloadInspectorTabProps> = ({
  messages,
  onClearLogs,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filter messages that have n8n data or are assistant replies
  const interactionLogs = messages.filter((m) => m.sender === 'assistant' || m.n8nRawData);

  const filteredLogs = interactionLogs.filter((log) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const textMatch = log.text.toLowerCase().includes(query);
    const nodeMatch = (log.nodeName || '').toLowerCase().includes(query);
    const dataMatch = JSON.stringify(log.n8nRawData || {}).toLowerCase().includes(query);
    return textMatch || nodeMatch || dataMatch;
  });

  const activeLog = filteredLogs.find((l) => l.id === selectedMessageId) || filteredLogs[0];

  const handleCopy = (content: any, id: string) => {
    navigator.clipboard.writeText(
      typeof content === 'object' ? JSON.stringify(content, null, 2) : String(content)
    );
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(messages, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `n8n-ai-interface-logs-${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-stone-900 flex items-center gap-2">
            <Activity className="w-5 h-5 text-orange-600" />
            n8n Webhook Node Payload Inspector
          </h2>
          <p className="text-xs text-stone-500 mt-1">
            Real-time audit log of dispatches, responses, latency, and payloads exchanged with your n8n workspace.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <>
              <button
                type="button"
                onClick={handleExportJson}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 text-xs font-medium shadow-2xs transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export JSON</span>
              </button>

              <button
                type="button"
                onClick={onClearLogs}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 text-stone-500 hover:text-red-600 text-xs font-medium shadow-2xs transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter payloads by node name, message text, or raw JSON content..."
          className="w-full pl-10 pr-4 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl text-stone-900 placeholder:text-stone-400 focus:outline-hidden focus:ring-2 focus:ring-orange-500 focus:bg-white"
        />
      </div>

      {/* Main Split View: Left List, Right Payload Details */}
      {filteredLogs.length === 0 ? (
        <div className="p-12 text-center bg-stone-50 border border-stone-200 rounded-2xl">
          <Activity className="w-10 h-10 text-stone-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-stone-700">No Webhook Dispatches Yet</p>
          <p className="text-xs text-stone-400 mt-1">
            Send a voice or text message in the Chat or Ambient tab to inspect live n8n node exchanges.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Log List */}
          <div className="lg:col-span-5 space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {filteredLogs.map((log) => {
              const isSelected = activeLog?.id === log.id;
              const isSuccess = log.n8nStatus && log.n8nStatus >= 200 && log.n8nStatus < 300;

              return (
                <div
                  key={log.id}
                  onClick={() => setSelectedMessageId(log.id)}
                  className={`p-3.5 rounded-xl border text-xs cursor-pointer transition-all ${
                    isSelected
                      ? 'border-orange-500 bg-orange-50/50 shadow-xs'
                      : 'border-stone-200 bg-white hover:bg-stone-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-1.5 py-0.5 rounded font-mono font-bold text-[10px] ${
                          isSuccess
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {log.n8nStatus ? `HTTP ${log.n8nStatus}` : 'STATUS OK'}
                      </span>
                      <span className="font-semibold text-stone-900 truncate max-w-[130px]">
                        {log.nodeName || 'Webhook Node'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-stone-400 text-[10px] font-mono">
                      {log.n8nLatencyMs && <span>{log.n8nLatencyMs}ms</span>}
                      <span>{log.timestamp}</span>
                    </div>
                  </div>

                  <p className="text-stone-600 line-clamp-2 text-xs leading-relaxed">
                    {log.text}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Right Column: Detailed Payload Inspector */}
          <div className="lg:col-span-7 bg-stone-900 text-stone-100 rounded-2xl p-6 space-y-6 shadow-sm">
            {activeLog ? (
              <div className="space-y-6">
                {/* Meta Top Bar */}
                <div className="flex items-center justify-between pb-4 border-b border-stone-800">
                  <div>
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      Payload Inspector: {activeLog.nodeName || 'n8n Node'}
                    </h3>
                    <p className="text-xs text-stone-400 mt-0.5 font-mono">
                      Timestamp: {activeLog.timestamp} | Mode: {activeLog.mode.toUpperCase()}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {activeLog.n8nLatencyMs && (
                      <span className="px-2 py-1 rounded bg-stone-800 text-orange-400 font-mono text-xs">
                        {activeLog.n8nLatencyMs} ms
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleCopy(activeLog.n8nRawData || activeLog.text, activeLog.id)}
                      className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors"
                      title="Copy payload"
                    >
                      {copiedId === activeLog.id ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* AI / Final Output Section */}
                <div>
                  <h4 className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <ArrowDownLeft className="w-3.5 h-3.5" />
                    Delivered User Output (Voice & Text)
                  </h4>
                  <div className="p-3 bg-stone-800/90 rounded-xl text-xs text-stone-200 leading-relaxed font-sans">
                    {activeLog.text}
                  </div>
                </div>

                {/* Raw n8n Node Webhook Response Section */}
                <div>
                  <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    n8n Webhook Node Raw Response Body
                  </h4>
                  <div className="p-3 bg-stone-950 rounded-xl font-mono text-[11px] text-emerald-400 overflow-x-auto max-h-72 border border-stone-800">
                    <pre>
                      {activeLog.n8nRawData
                        ? typeof activeLog.n8nRawData === 'object'
                          ? JSON.stringify(activeLog.n8nRawData, null, 2)
                          : String(activeLog.n8nRawData)
                        : '// No raw JSON returned or plain text received'}
                    </pre>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-stone-500 text-xs">
                Select an interaction from the list to inspect its payload.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
