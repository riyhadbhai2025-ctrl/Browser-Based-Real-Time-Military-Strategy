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
  Sun,
  Crosshair,
  Sliders,
} from 'lucide-react';
import { AIDifficulty, AtmospherePreset, Base, GraphicsQuality, PlayerProfile } from '../types/game';

interface TopBarProps {
  profile: PlayerProfile;
  activeBase?: Base;
  bases?: Base[];
  connected: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onOpenAdmin: () => void;
  onOpenAdminConsole?: () => void;
  onOpenAlliance: () => void;
  onOpenIntel: () => void;
  onOpenTutorial: () => void;
  onOpenShortcuts: () => void;
  alliedTag?: string | null;
  totalUnitsCount: number;
  usedPopulation?: number;
  maxPopulation?: number;
  aiDifficulty?: AIDifficulty;
  onChangeAiDifficulty?: (diff: AIDifficulty) => void;
  onResetSkirmish?: () => void;
  graphicsQuality?: GraphicsQuality;
  onChangeGraphicsQuality?: (q: GraphicsQuality) => void;
  atmospherePreset?: AtmospherePreset;
  onChangeAtmospherePreset?: (p: AtmospherePreset) => void;
  onJumpToCoords?: (x: number, y: number) => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  profile,
  activeBase,
  bases = [],
  connected,
  muted,
  onToggleMute,
  onOpenAdmin,
  onOpenAdminConsole,
  onOpenAlliance,
  onOpenIntel,
  onOpenTutorial,
  onOpenShortcuts,
  alliedTag,
  totalUnitsCount,
  usedPopulation = 0,
  maxPopulation = 60,
  aiDifficulty = 'medium',
  onChangeAiDifficulty,
  onResetSkirmish,
  graphicsQuality = 'high',
  onChangeGraphicsQuality,
  atmospherePreset = 'daylight',
  onChangeAtmospherePreset,
  onJumpToCoords,
}) => {
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const res = activeBase?.resources || { concrete: 0, steel: 0, aluminum: 0, fuel: 0 };
  const cap = activeBase?.storageCap || { concrete: 15000, steel: 12000, aluminum: 8000, fuel: 10000 };
  const rates = activeBase?.productionRates || { concrete: 0, steel: 0, aluminum: 0, fuel: 0 };

  const playerBasesCount = bases.filter((b) => b.ownerId === profile.id).length;
  const totalBasesCount = Math.max(1, bases.length);

  return (
    <header className="absolute top-0 left-0 right-0 z-30 flex flex-col select-none pointer-events-auto">
      {/* Main Tactical Top Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-950/95 border-b border-slate-800 text-slate-100 shadow-xl">
        {/* Left: Faction Emblem & Commander Profile */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-blue-700 border border-blue-400 flex items-center justify-center font-bold text-xs text-white uppercase shadow">
              {profile.username.slice(0, 2)}
            </div>
            <div className="leading-tight">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-xs text-slate-100 font-mono tracking-wider">{profile.username}</span>
                {alliedTag && (
                  <span className="text-[10px] font-mono text-cyan-400">[{alliedTag}]</span>
                )}
                <span className="text-[10px] text-slate-500">·</span>
                <span className="text-[10px] text-emerald-400 font-mono">LVL {profile.level}</span>
              </div>
              <div className="text-[10px] text-slate-400 font-sans flex items-center gap-1">
                <span>{profile.rank}</span>
                <span className="text-slate-600">·</span>
                <span className="text-amber-400 font-mono font-medium">{profile.score} PTS</span>
              </div>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-800 font-mono">
            <span
              className={`w-2 h-2 rounded-full ${
                connected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
              }`}
            />
            <span className="text-slate-300">{connected ? 'ONLINE' : 'SYNC'}</span>
          </div>
        </div>

        {/* Center: Real-time Resources & Population Capacity */}
        <div className="hidden lg:flex items-center gap-3 bg-slate-900 px-3 py-1 rounded border border-slate-800">
          {/* Concrete */}
          <div
            className="flex items-center gap-1.5"
            title={`Concrete: ${Math.round(res.concrete)} / ${cap.concrete} (+${rates.concrete}/s)`}
          >
            <Box className="w-3.5 h-3.5 text-stone-400" />
            <div className="text-xs font-mono">
              <span className="font-semibold text-stone-100">{Math.round(res.concrete)}</span>
              <span className="text-[10px] text-emerald-400 ml-1">+{rates.concrete}/s</span>
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
              <span className="font-semibold text-blue-100">{Math.round(res.steel)}</span>
              <span className="text-[10px] text-emerald-400 ml-1">+{rates.steel}/s</span>
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
              <span className="font-semibold text-cyan-100">{Math.round(res.aluminum)}</span>
              <span className="text-[10px] text-emerald-400 ml-1">+{rates.aluminum}/s</span>
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
              <span className="font-semibold text-amber-100">{Math.round(res.fuel)}</span>
              <span className="text-[10px] text-emerald-400 ml-1">+{rates.fuel}/s</span>
            </div>
          </div>

          <div className="w-px h-4 bg-slate-800" />

          {/* Population / Force Capacity */}
          <div
            className="flex items-center gap-1.5 text-xs text-slate-200 font-mono"
            title={`Active Units: ${totalUnitsCount} | Supply Population: ${usedPopulation} / ${maxPopulation}`}
          >
            <Users className="w-3.5 h-3.5 text-indigo-400" />
            <span>
              {usedPopulation}/{maxPopulation} POP
            </span>
            <span className="text-[10px] text-slate-400">({totalUnitsCount} UNITS)</span>
          </div>
        </div>

        {/* Right: Graphics Quality, Atmosphere, AI Difficulty, Actions & Modals */}
        <div className="flex items-center gap-1.5">
          {onChangeAtmospherePreset && (
            <div className="hidden 2xl:flex items-center gap-1 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 text-[10px] font-mono">
              <Sun className="w-3 h-3 text-amber-400" />
              {(['daylight', 'golden_hour', 'overcast'] as AtmospherePreset[]).map((p) => (
                <button
                  key={p}
                  onClick={() => onChangeAtmospherePreset(p)}
                  className={`px-1.5 py-0.5 rounded uppercase transition ${
                    atmospherePreset === p
                      ? 'bg-amber-600 text-white font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title={`Set Battlefield Lighting to ${p.replace('_', ' ').toUpperCase()}`}
                >
                  {p === 'daylight' ? 'DAY' : p === 'golden_hour' ? 'GOLD' : ' DUSK'}
                </button>
              ))}
            </div>
          )}

          {onChangeGraphicsQuality && (
            <div className="hidden xl:flex items-center gap-1 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 text-[10px] font-mono">
              <Sliders className="w-3 h-3 text-cyan-400" />
              <span className="text-slate-400">GFX:</span>
              {(['low', 'medium', 'high', 'ultra'] as GraphicsQuality[]).map((q) => (
                <button
                  key={q}
                  onClick={() => onChangeGraphicsQuality(q)}
                  className={`px-1.5 py-0.5 rounded uppercase transition ${
                    graphicsQuality === q
                      ? 'bg-cyan-600 text-white font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title={`Set 3D Graphics Quality to ${q.toUpperCase()}`}
                >
                  {q === 'medium' ? 'MED' : q.slice(0, 4)}
                </button>
              ))}
            </div>
          )}

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
              <span className="hidden 2xl:inline">New Match</span>
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

          {onOpenAdminConsole && (
            <button
              onClick={onOpenAdminConsole}
              className="px-2.5 py-1 text-xs rounded bg-blue-950/80 hover:bg-blue-900 border border-blue-600/60 text-cyan-200 flex items-center gap-1 font-mono transition"
              title="Open Full Admin Panel (/admin)"
            >
              <Shield className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Admin (/admin)</span>
            </button>
          )}

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
            title={muted ? 'Unmute Tactical Audio' : 'Mute Tactical Audio'}
          >
            {muted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
          </button>

          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 transition"
            title="Toggle Fullscreen (F11)"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Sub-Header: Tactical Mission Objectives & Sector Hotspots */}
      <div className="flex items-center justify-between px-3 py-1 bg-slate-950/85 border-b border-slate-800/80 text-[11px] font-mono text-slate-300">
        <div className="flex items-center gap-2">
          <Crosshair className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-amber-400 font-bold uppercase">OPERATION RIVERFRONT ASSAULT:</span>
          <span className="text-slate-200">
            Secure River Bridges & Seize Kodiak Stronghold ({playerBasesCount}/{totalBasesCount} Sectors Controlled)
          </span>
        </div>

        {onJumpToCoords && (
          <div className="hidden md:flex items-center gap-2 text-[10px]">
            <span className="text-slate-500">QUICK CAMERA JUMP:</span>
            <button
              onClick={() => onJumpToCoords(16.8, 28.2)}
              className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 transition"
            >
              1. Fortress Alpha HQ
            </button>
            <button
              onClick={() => onJumpToCoords(46.0, 21.0)}
              className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-amber-300 transition"
            >
              2. Riverfront Bridgehead
            </button>
            <button
              onClick={() => onJumpToCoords(70.0, 20.0)}
              className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-rose-300 transition"
            >
              3. Kodiak Stronghold
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
