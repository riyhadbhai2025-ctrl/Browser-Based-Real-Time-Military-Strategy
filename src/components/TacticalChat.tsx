import React, { useState } from 'react';
import { Send, Crosshair, ChevronDown, ChevronUp, MapPin } from 'lucide-react';
import { ChatMessage, CombatEvent } from '../types/game';

interface TacticalChatProps {
  messages: ChatMessage[];
  combatLogs: CombatEvent[];
  onSendMessage: (content: string, channel: 'global' | 'alliance', coords?: { x: number; y: number }) => void;
  onJumpToCoords: (x: number, y: number) => void;
  currentCoords: { x: number; y: number };
  allianceTag?: string | null;
  highContrastHud?: boolean;
  uiAnimations?: boolean;
}

export const TacticalChat: React.FC<TacticalChatProps> = ({
  messages,
  combatLogs,
  onSendMessage,
  onJumpToCoords,
  currentCoords,
  allianceTag,
  highContrastHud = false,
  uiAnimations = true,
}) => {
  const [activeTab, setActiveTab] = useState<'global' | 'alliance' | 'combat'>('global');
  const [inputText, setInputText] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 1024 : false
  );
  const [includeCoords, setIncludeCoords] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const coords = includeCoords
      ? { x: Math.round(currentCoords.x), y: Math.round(currentCoords.y) }
      : undefined;

    onSendMessage(inputText.trim(), activeTab === 'alliance' ? 'alliance' : 'global', coords);
    setInputText('');
  };

  const filteredMessages = messages.filter((m) => {
    if (activeTab === 'global') return m.channel === 'global' || m.channel === 'system';
    if (activeTab === 'alliance') return m.channel === 'alliance' || m.channel === 'system';
    return false;
  });

  return (
    <div
      className={`absolute bottom-24 sm:bottom-3 right-2 sm:right-3 z-20 flex flex-col rounded-lg ${
        highContrastHud
          ? 'bg-slate-950 border-2 border-cyan-500/80'
          : 'bg-slate-950/95 border border-slate-800'
      } shadow-2xl ${
        uiAnimations ? 'transition-all duration-200' : ''
      } select-none pointer-events-auto ${
        isCollapsed ? 'w-52 sm:w-64 h-9' : 'w-[calc(100vw-16px)] sm:w-80 md:w-96 h-64 sm:h-72'
      }`}
    >
      {/* Header & Tabs */}
      <div className="flex items-center justify-between px-2 py-1 bg-slate-900 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto">
          <button
            onClick={() => {
              setActiveTab('global');
              if (isCollapsed) setIsCollapsed(false);
            }}
            className={`px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-mono transition shrink-0 ${
              activeTab === 'global'
                ? 'bg-blue-600 text-white font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            GLOBAL
          </button>
          <button
            onClick={() => {
              setActiveTab('alliance');
              if (isCollapsed) setIsCollapsed(false);
            }}
            className={`px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-mono transition shrink-0 ${
              activeTab === 'alliance'
                ? 'bg-indigo-600 text-white font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            ALLIANCE {allianceTag && `[${allianceTag}]`}
          </button>
          <button
            onClick={() => {
              setActiveTab('combat');
              if (isCollapsed) setIsCollapsed(false);
            }}
            className={`px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-mono transition shrink-0 ${
              activeTab === 'combat'
                ? 'bg-rose-600 text-white font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            COMBAT
          </button>
        </div>

        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 rounded hover:bg-slate-800 text-slate-400 shrink-0"
          title={isCollapsed ? 'Expand Tactical Comms' : 'Collapse Tactical Comms'}
        >
          {isCollapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {!isCollapsed && (
        <>
          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5 text-xs font-mono">
            {activeTab === 'combat' ? (
              combatLogs.length === 0 ? (
                <div className="text-slate-600 text-[11px] italic p-2">No active combat engagements detected.</div>
              ) : (
                combatLogs.slice(-30).map((log) => (
                  <div
                    key={log.id}
                    className="p-1 rounded bg-slate-900/60 border border-slate-800/80 flex items-center justify-between text-[11px]"
                  >
                    <div className="flex items-center gap-1.5 text-slate-300 truncate">
                      <Crosshair className="w-3 h-3 text-rose-400 shrink-0" />
                      <span className="truncate">
                        <span className="text-slate-200 font-bold">{log.attackerType}</span> hit{' '}
                        <span className="text-amber-400">{log.targetType}</span> for{' '}
                        <span className="text-rose-400 font-bold">{log.damage} DMG</span>
                      </span>
                    </div>
                    <button
                      onClick={() => onJumpToCoords(log.x, log.y)}
                      className="text-[10px] text-blue-400 hover:underline flex items-center gap-0.5 ml-2 shrink-0"
                    >
                      <MapPin className="w-3 h-3" />
                      [{Math.round(log.x)}, {Math.round(log.y)}]
                    </button>
                  </div>
                ))
              )
            ) : filteredMessages.length === 0 ? (
              <div className="text-slate-600 text-[11px] italic p-2">
                Comms channel clear. Transmit your orders.
              </div>
            ) : (
              filteredMessages.slice(-40).map((msg) => (
                <div key={msg.id} className="leading-snug break-words">
                  <span className="text-slate-500 text-[10px] mr-1.5">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>

                  {msg.allianceTag && (
                    <span className="text-[10px] text-blue-400 font-bold mr-1">[{msg.allianceTag}]</span>
                  )}

                  <span
                    className={`font-semibold mr-1.5 ${
                      msg.channel === 'system' ? 'text-amber-400 font-bold' : 'text-slate-300'
                    }`}
                  >
                    {msg.senderName}:
                  </span>

                  <span className={msg.channel === 'system' ? 'text-amber-200/90' : 'text-slate-200'}>
                    {msg.content}
                  </span>

                  {msg.coords && (
                    <button
                      onClick={() => onJumpToCoords(msg.coords!.x, msg.coords!.y)}
                      className="inline-flex items-center gap-0.5 ml-2 px-1 rounded bg-blue-950/80 border border-blue-600/40 text-[10px] text-blue-300 hover:bg-blue-900 transition"
                      title="Jump Camera"
                    >
                      <MapPin className="w-2.5 h-2.5" />
                      [{msg.coords.x}, {msg.coords.y}]
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Chat Input Bar */}
          {activeTab !== 'combat' && (
            <form
              onSubmit={handleSubmit}
              className="flex items-center gap-1.5 p-1.5 bg-slate-900 border-t border-slate-800 shrink-0"
            >
              <button
                type="button"
                onClick={() => setIncludeCoords(!includeCoords)}
                className={`p-1.5 rounded text-[10px] font-mono flex items-center gap-1 transition shrink-0 ${
                  includeCoords
                    ? 'bg-blue-950 text-blue-300 border border-blue-500'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
                title="Attach current camera coordinates"
              >
                <MapPin className="w-3 h-3" />
                <span className="hidden sm:inline">
                  [{Math.round(currentCoords.x)}, {Math.round(currentCoords.y)}]
                </span>
              </button>

              <input
                id="tactical-chat-input"
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={activeTab === 'alliance' ? 'Transmit to alliance...' : 'Broadcast to all commanders...'}
                maxLength={250}
                className="flex-1 min-w-0 bg-slate-950 px-2 py-1 rounded border border-slate-800 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 font-mono"
              />

              <button
                type="submit"
                className="px-2.5 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white transition flex items-center justify-center shadow-sm shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
};
