import React from 'react';
import {
  Shield,
  Battery,
  Box,
  Droplets,
  Volume2,
  VolumeX,
  Maximize2,
  Terminal,
  Users,
  Flag,
  Keyboard,
  Cpu,
  RotateCcw,
} from 'lucide-react';
import { AIDifficulty, Base, PlayerProfile } from '../types/game';

interface TopBarProps {
  profile: PlayerProfile;
  activeBase?: Base;
  connected: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onOpenAdmin: () => void;
  onOpenAlliance: () => void;
  onOpenIntel: () => void;
  onOpenTutorial: () => void;
  onOpenShortcuts: () => void;
  alliedTag?: string | null;
  totalUnitsCount: number;
  aiDifficulty?: AIDifficulty;
  onChangeAiDifficulty?: (diff: AIDifficulty) => void;
  onResetSkirmish?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  profile,
  activeBase,
  connected,
  muted,
  onToggleMute,
  onOpenAdmin,
  onOpenAlliance,
  onOpenIntel,
  onOpenTutorial,
  onOpenShortcuts,
  alliedTag,
  totalUnitsCount,
  aiDifficulty = 'medium',
  onChangeAiDifficulty,
  onResetSkirmish,
}) => {
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const res = activeBase?.resources || { concrete: 0, steel: 0, aluminum: 0, fuel: 0 };
  const cap = activeBase?.storageCap || { concrete: 10000, steel: 10000, aluminum: 10000, fuel: 10000 };
  const rates = activeBase?.productionRates || { concrete: 0, steel: 0, aluminum: 0, fuel: 0 };

  return (
    <header className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-3 py-1.5 bg-slate-950/95 border-b border-slate-800 text-slate-100 select-none shadow-lg">
      {/* Left: Player Profile & Rank */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-gradient-to-br from-blue-600 to-indigo-900 border border-blue-400/50 flex items-center justify-center font-bold text-xs text-white uppercase shadow-inner">
            {profile.username.slice(0, 2)}
          </div>
          <div className="leading-tight">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-xs text-slate-100 font-mono tracking-wider">{profile.username}</span>
              {alliedTag && (
                <span className="px-1 py-0.2 rounded text-[10px] font-semibold bg-blue-950 border border-blue-600 text-blue-400">
                  [{alliedTag}]
                </span>
              )}
              <span className="text-[10px] px-1 rounded bg-slate-800 text-emerald-400 border border-emerald-500/30 font-mono">
                LVL {profile.level}
              </span>
            </div>
            <div className="text-[10px] text-slate-400 font-sans flex items-center gap-1">
              <span>{profile.rank}</span>
              <span className="text-slate-600">•</span>
              <span className="text-amber-400 font-mono font-medium">{profile.score} PTS</span>
            </div>
          </div>
        </div>

        {/* Connection status */}
        <div className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
          <span
            className={`w-2 h-2 rounded-full ${
              connected ? 'bg-emerald-500 shadow-emerald-500/50 shadow-sm animate-pulse' : 'bg-rose-500'
            }`}
          />
          <span className="text-slate-400 text-[10px] font-mono">{connected ? '3D LIVE' : 'SYNCING'}</span>
        </div>
      </div>

      {/* Center: Real-time Resources from active base */}
      <div className="hidden lg:flex items-center gap-3 bg-slate-900 px-3 py-1 rounded border border-slate-800">
        {/* Concrete */}
        <div
          className="flex items-center gap-1.5"
          title={`Concrete: ${Math.round(res.concrete)} / ${cap.concrete} (+${rates.concrete}/s)`}
        >
          <Box className="w-3.5 h-3.5 text-stone-400" />
          <div className="text-xs font-mono">
            <span className="font-semibold text-stone-200">{Math.round(res.concrete)}</span>
            <span className="text-[10px] text-stone-500 ml-1">+{rates.concrete}/s</span>
          </div>
        </div>

        <div className="w-px h-4 bg-slate-800" />

        {/* Steel */}
        <div
          className="flex items-center gap-1.5"
          title={`Steel: ${Math.round(res.steel)} / ${cap.steel} (+${rates.steel}/s)`}
        >
          <Shield className="w-3.5 h-3.5 text-blue-400" />
          <div className="text-xs font-mono">
            <span className="font-semibold text-blue-200">{Math.round(res.steel)}</span>
            <span className="text-[10px] text-blue-500 ml-1">+{rates.steel}/s</span>
          </div>
        </div>

        <div className="w-px h-4 bg-slate-800" />

        {/* Aluminum */}
        <div
          className="flex items-center gap-1.5"
          title={`Aluminum: ${Math.round(res.aluminum)} / ${cap.aluminum} (+${rates.aluminum}/s)`}
        >
          <Battery className="w-3.5 h-3.5 text-cyan-400" />
          <div className="text-xs font-mono">
            <span className="font-semibold text-cyan-200">{Math.round(res.aluminum)}</span>
            <span className="text-[10px] text-cyan-500 ml-1">+{rates.aluminum}/s</span>
          </div>
        </div>

        <div className="w-px h-4 bg-slate-800" />

        {/* Fuel */}
        <div
          className="flex items-center gap-1.5"
          title={`Fuel: ${Math.round(res.fuel)} / ${cap.fuel} (+${rates.fuel}/s)`}
        >
          <Droplets className="w-3.5 h-3.5 text-amber-400" />
          <div className="text-xs font-mono">
            <span className="font-semibold text-amber-200">{Math.round(res.fuel)}</span>
            <span className="text-[10px] text-amber-500 ml-1">+{rates.fuel}/s</span>
          </div>
        </div>

        <div className="w-px h-4 bg-slate-800" />

        {/* Forces / Army Count */}
        <div
          className="flex items-center gap-1.5 text-xs text-slate-300 font-mono"
          title="Total active units in field"
        >
          <Users className="w-3.5 h-3.5 text-indigo-400" />
          <span>{totalUnitsCount} UNITS</span>
        </div>
      </div>

      {/* Right: AI Difficulty, Actions, Briefing, Admin Sandbox & Audio */}
      <div className="flex items-center gap-1.5">
        {onChangeAiDifficulty && (
          <div className="hidden xl:flex items-center gap-1 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 text-[10px] font-mono">
            <Cpu className="w-3 h-3 text-rose-400" />
            <span className="text-slate-400">AI:</span>
            {(['easy', 'medium', 'hard'] as AIDifficulty[]).map((d) => (
              <button
                key={d}
                onClick={() => onChangeAiDifficulty(d)}
                className={`px-1.5 py-0.5 rounded uppercase transition ${
                  aiDifficulty === d
                    ? 'bg-rose-600 text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title={`Set Kodiak PMC AI Difficulty to ${d.toUpperCase()}`}
              >
                {d.slice(0, 3)}
              </button>
            ))}
          </div>
        )}

        {onResetSkirmish && (
          <button
            onClick={onResetSkirmish}
            className="px-2 py-1 text-xs rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 flex items-center gap-1 transition"
            title="Reset 3D Skirmish Battlefield"
          >
            <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden xl:inline">New Match</span>
          </button>
        )}

        <button
          onClick={onOpenTutorial}
          className="px-2.5 py-1 text-xs rounded bg-blue-900/60 hover:bg-blue-800 border border-blue-700/60 text-blue-200 flex items-center gap-1 transition"
        >
          <Flag className="w-3.5 h-3.5 text-blue-400" />
          <span className="hidden sm:inline">Briefing</span>
        </button>

        <button
          onClick={onOpenAlliance}
          className="px-2.5 py-1 text-xs rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 flex items-center gap-1 transition"
        >
          <Users className="w-3.5 h-3.5 text-indigo-400" />
          <span className="hidden sm:inline">Alliance</span>
        </button>

        <button
          onClick={onOpenIntel}
          className="px-2.5 py-1 text-xs rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 flex items-center gap-1 transition"
        >
          <Shield className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden sm:inline">Armory</span>
        </button>

        <button
          onClick={onOpenAdmin}
          className="px-2 py-1 text-xs rounded bg-amber-950/60 hover:bg-amber-900/70 border border-amber-700/50 text-amber-300 flex items-center gap-1 transition"
          title="Admin Sandbox & Test Spawner"
        >
          <Terminal className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Sandbox</span>
        </button>

        <button
          onClick={onOpenShortcuts}
          className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 transition"
          title="Keyboard Shortcuts"
        >
          <Keyboard className="w-3.5 h-3.5 text-blue-400" />
        </button>

        <button
          onClick={onToggleMute}
          className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 transition"
          title={muted ? 'Unmute Audio' : 'Mute Audio'}
        >
          {muted ? (
            <VolumeX className="w-3.5 h-3.5 text-rose-400" />
          ) : (
            <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
          )}
        </button>

        <button
          onClick={toggleFullscreen}
          className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 transition"
          title="Toggle Fullscreen (F11)"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
