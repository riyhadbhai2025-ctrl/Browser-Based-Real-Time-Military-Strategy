import React, { useState } from 'react';
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
  LogOut,
  Trophy,
  Globe,
  Settings,
  Menu,
  X,
} from 'lucide-react';
import { AIDifficulty, AtmospherePreset, Base, GraphicsQuality, MapSectorConfig, PlayerProfile } from '../types/game';

interface TopBarProps {
  profile: PlayerProfile;
  activeBase?: Base;
  bases?: Base[];
  connected: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onOpenSettings: () => void;
  onOpenAdmin: () => void;
  onOpenAdminConsole?: () => void;
  onOpenAlliance: () => void;
  onOpenIntel: () => void;
  onOpenProgression?: () => void;
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
  onLogout?: () => void;
  maps?: MapSectorConfig[];
  currentMapId?: string;
  onSwitchMap?: (mapId: string) => void;
  compactHud?: boolean;
  showSubHeader?: boolean;
  highContrastHud?: boolean;
  largerTouchTargets?: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  profile,
  activeBase,
  bases = [],
  connected,
  muted,
  onToggleMute,
  onOpenSettings,
  onOpenAdmin,
  onOpenAdminConsole,
  onOpenAlliance,
  onOpenIntel,
  onOpenProgression,
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
  onLogout,
  maps = [],
  currentMapId = 'map_riverfront_assault',
  onSwitchMap,
  compactHud = false,
  showSubHeader = true,
  highContrastHud = false,
  largerTouchTargets = false,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
  const currentMapObj = maps.find((m) => m.id === currentMapId);
  const isBeginnerProtected = Boolean(profile.beginnerProtectionUntil && profile.beginnerProtectionUntil > Date.now());

  const btnPadding = largerTouchTargets ? 'px-3 py-2 min-h-[40px]' : compactHud ? 'px-2 py-0.5' : 'px-2.5 py-1';
  const iconBtnPadding = largerTouchTargets ? 'p-2.5 min-w-[40px] min-h-[40px]' : 'p-1.5';

  return (
    <header className="absolute top-0 left-0 right-0 z-30 flex flex-col select-none pointer-events-auto">
      {/* Main Tactical Top Bar */}
      <div
        className={`flex items-center justify-between px-2.5 sm:px-3 ${
          compactHud ? 'py-1' : 'py-1.5'
        } ${
          highContrastHud
            ? 'bg-slate-950 border-b-2 border-cyan-500/80'
            : 'bg-slate-950/95 border-b border-slate-800'
        } text-slate-100 shadow-xl gap-2`}
      >
        {/* Left: Faction Emblem & Commander Profile */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 shrink-0 rounded bg-blue-700 border border-blue-400 flex items-center justify-center font-bold text-xs text-white uppercase shadow">
              {profile.username.slice(0, 2)}
            </div>
            <div className="leading-tight min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-xs text-slate-100 font-mono tracking-wider truncate max-w-[100px] sm:max-w-[160px]">
                  {profile.username}
                </span>
                {alliedTag && <span className="text-[10px] font-mono text-cyan-400 shrink-0">[{alliedTag}]</span>}
                <span className="hidden xs:inline text-[10px] text-slate-500">·</span>
                <span className="hidden xs:inline text-[10px] text-emerald-400 font-mono shrink-0">
                  LVL {profile.level}
                </span>
                {isBeginnerProtected && !compactHud && (
                  <span
                    className="hidden md:inline-block text-[9px] px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-600/50 font-mono shrink-0"
                    title="Beginner Truce Shield active — hostile forces cannot attack your bases unless you initiate an offensive strike"
                  >
                    TRUCE SHIELD
                  </span>
                )}
              </div>
              {!compactHud && (
                <div className="text-[10px] text-slate-400 font-sans flex items-center gap-1 truncate">
                  <span className="truncate">{profile.rank}</span>
                  <span className="text-slate-600">·</span>
                  <span className="text-amber-400 font-mono font-medium shrink-0">{profile.score} PTS</span>
                </div>
              )}
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-800 font-mono shrink-0">
            <span
              className={`w-2 h-2 rounded-full ${
                connected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
              }`}
            />
            <span className="text-slate-300">{connected ? 'ONLINE' : 'SYNC'}</span>
          </div>
        </div>

        {/* Center (Desktop lg+): Real-time Resources & Population Capacity */}
        <div className="hidden lg:flex items-center gap-2.5 xl:gap-3 bg-slate-900 px-3 py-1 rounded border border-slate-800 shrink-0">
          {/* Concrete */}
          <div
            className="flex items-center gap-1.5"
            title={`Concrete: ${Math.round(res.concrete)} / ${cap.concrete} (+${rates.concrete}/s)`}
          >
            <Box className="w-3.5 h-3.5 text-stone-400" />
            <div className="text-xs font-mono">
              <span className="font-semibold text-stone-100">{Math.round(res.concrete)}</span>
              {!compactHud && <span className="text-[10px] text-emerald-400 ml-1">+{rates.concrete}/s</span>}
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
              {!compactHud && <span className="text-[10px] text-emerald-400 ml-1">+{rates.steel}/s</span>}
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
              {!compactHud && <span className="text-[10px] text-emerald-400 ml-1">+{rates.aluminum}/s</span>}
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
              {!compactHud && <span className="text-[10px] text-emerald-400 ml-1">+{rates.fuel}/s</span>}
            </div>
          </div>

          <div className="w-px h-4 bg-slate-800" />

          {/* Population / Force Capacity */}
          <div
            className="flex items-center gap-1.5 text-xs text-slate-200 font-mono"
            title={`Active Units in Sector: ${totalUnitsCount} | Sector Population: ${usedPopulation} / ${maxPopulation}`}
          >
            <Users className="w-3.5 h-3.5 text-indigo-400" />
            <span>
              {usedPopulation}/{maxPopulation} POP
            </span>
            {!compactHud && <span className="hidden xl:inline text-[10px] text-slate-400">({totalUnitsCount})</span>}
          </div>
        </div>

        {/* Right: Quick Controls, Modals & Settings Gear */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {!compactHud && onChangeAtmospherePreset && (
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
                  {p === 'daylight' ? 'DAY' : p === 'golden_hour' ? 'GOLD' : 'DUSK'}
                </button>
              ))}
            </div>
          )}

          {!compactHud && onChangeGraphicsQuality && (
            <div className="hidden 2xl:flex items-center gap-1 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 text-[10px] font-mono">
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

          {!compactHud && onChangeAiDifficulty && (
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

          {onOpenProgression && (
            <button
              onClick={onOpenProgression}
              className={`hidden md:flex ${btnPadding} text-xs rounded bg-amber-950/70 hover:bg-amber-900/80 border border-amber-600/60 text-amber-200 items-center gap-1 transition`}
              title="Missions, Achievements, Leaderboard & Battle Reports"
            >
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden xl:inline">Missions</span>
            </button>
          )}

          <button
            onClick={onOpenTutorial}
            className={`hidden md:flex ${btnPadding} text-xs rounded bg-blue-900/60 hover:bg-blue-800 border border-blue-700/60 text-blue-200 items-center gap-1 transition`}
            title="Tactical Briefing"
          >
            <Flag className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden xl:inline">Briefing</span>
          </button>

          <button
            onClick={onOpenAlliance}
            className={`hidden md:flex ${btnPadding} text-xs rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 items-center gap-1 transition`}
            title="Alliance Command"
          >
            <Users className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden xl:inline">Alliance</span>
          </button>

          <button
            onClick={onOpenIntel}
            className={`hidden md:flex ${btnPadding} text-xs rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 items-center gap-1 transition`}
            title="Armory & Unit Intel"
          >
            <Shield className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden xl:inline">Armory</span>
          </button>

          {(profile.isAdmin || profile.adminRole) && (
            <button
              onClick={onOpenAdmin}
              className={`hidden lg:flex ${btnPadding} text-xs rounded bg-amber-950/60 hover:bg-amber-900/70 border border-amber-700/50 text-amber-300 items-center gap-1 transition`}
              title="Admin Sandbox & Test Spawner"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span className="hidden 2xl:inline">Sandbox</span>
            </button>
          )}

          {onOpenAdminConsole && (profile.isAdmin || profile.adminRole) && (
            <button
              onClick={onOpenAdminConsole}
              className={`hidden lg:flex ${btnPadding} text-xs rounded bg-blue-950/80 hover:bg-blue-900 border border-blue-600/60 text-cyan-200 items-center gap-1 font-mono transition`}
              title="Open Full Admin Panel (/admin)"
            >
              <Shield className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden 2xl:inline">Admin</span>
            </button>
          )}

          {/* Prominent Settings Modal Button (Visible on ALL devices) */}
          <button
            onClick={onOpenSettings}
            aria-label="Open Game Settings"
            title="Game Settings (Display, Graphics, Audio, Controls, Accessibility)"
            className={`${btnPadding} text-xs rounded bg-cyan-950/90 hover:bg-cyan-900 border border-cyan-500/60 text-cyan-200 flex items-center justify-center gap-1.5 font-mono font-semibold transition shadow-sm`}
          >
            <Settings className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline">Settings</span>
          </button>

          <button
            onClick={onToggleMute}
            aria-label={muted ? 'Unmute Audio' : 'Mute Audio'}
            className={`${iconBtnPadding} rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 flex items-center justify-center transition`}
            title={muted ? 'Unmute Tactical Audio' : 'Mute Tactical Audio'}
          >
            {muted ? (
              <VolumeX className="w-4 h-4 text-rose-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-emerald-400" />
            )}
          </button>

          <button
            onClick={toggleFullscreen}
            aria-label="Toggle Fullscreen"
            className={`hidden sm:flex ${iconBtnPadding} rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 items-center justify-center transition`}
            title="Toggle Fullscreen (F11)"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          {onLogout && (
            <button
              onClick={onLogout}
              className={`hidden md:flex ${btnPadding} text-xs rounded bg-slate-900 hover:bg-rose-950/80 border border-slate-700 hover:border-rose-700/60 text-slate-300 hover:text-rose-200 items-center gap-1 transition`}
              title="Sign Out & Switch Account"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-400" />
              <span className="hidden 2xl:inline">Sign Out</span>
            </button>
          )}

          {/* Mobile / Tablet Tactical Menu Drawer Toggle (< md) */}
          <button
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label="Toggle Tactical Menu"
            className={`md:hidden ${iconBtnPadding} rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 flex items-center justify-center transition`}
          >
            {mobileMenuOpen ? <X className="w-4 h-4 text-cyan-400" /> : <Menu className="w-4 h-4 text-cyan-400" />}
          </button>
        </div>
      </div>

      {/* Tablet & Mobile Compact Resource Strip (Visible < lg so resources are never hidden on mobile/tablet) */}
      <div className="lg:hidden flex items-center justify-between gap-2 px-2.5 py-1 bg-slate-950/95 border-b border-slate-800/90 text-[11px] font-mono overflow-x-auto">
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-1" title="Concrete">
            <Box className="w-3 h-3 text-stone-400" />
            <span className="text-stone-100 font-semibold">{Math.round(res.concrete)}</span>
          </div>
          <div className="flex items-center gap-1" title="Steel">
            <Shield className="w-3 h-3 text-blue-400" />
            <span className="text-blue-100 font-semibold">{Math.round(res.steel)}</span>
          </div>
          <div className="flex items-center gap-1" title="Aluminum">
            <Battery className="w-3 h-3 text-cyan-400" />
            <span className="text-cyan-100 font-semibold">{Math.round(res.aluminum)}</span>
          </div>
          <div className="flex items-center gap-1" title="Fuel">
            <Droplets className="w-3 h-3 text-amber-400" />
            <span className="text-amber-100 font-semibold">{Math.round(res.fuel)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 text-slate-300 shrink-0">
          <Users className="w-3 h-3 text-indigo-400" />
          <span>
            {usedPopulation}/{maxPopulation}
          </span>
        </div>
      </div>

      {/* Sub-Header: Multi-Sector Theater Switcher, Tactical Objectives & Sector Hotspots */}
      {showSubHeader && !compactHud && (
        <div className="hidden sm:flex flex-wrap items-center justify-between gap-2 px-3 py-1 bg-slate-950/90 border-b border-slate-800/80 text-[11px] font-mono text-slate-300">
          <div className="flex items-center gap-2 min-w-0">
            {maps.length > 0 && onSwitchMap && (
              <div className="flex items-center gap-1 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 mr-1 shrink-0">
                <Globe className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden md:inline text-[10px] text-slate-400 mr-0.5">SECTOR:</span>
                {maps.map((m, idx) => (
                  <button
                    key={m.id}
                    onClick={() => onSwitchMap(m.id)}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono transition ${
                      currentMapId === m.id
                        ? 'bg-cyan-600 text-white font-bold shadow'
                        : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                    title={m.description}
                  >
                    S0{idx + 1}: {m.name.split(':')[1]?.trim().split(' ')[0] || m.name}
                  </button>
                ))}
              </div>
            )}

            <Crosshair className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-amber-400 font-bold uppercase shrink-0">
              {currentMapObj?.objectiveTitle || 'OPERATION RIVERFRONT ASSAULT'}:
            </span>
            <span className="text-slate-200 truncate">
              {currentMapObj?.objectiveDescription || 'Secure River Bridges & Seize Kodiak Stronghold'} ({playerBasesCount}/{totalBasesCount} Bases)
            </span>
          </div>

          {onJumpToCoords && (
            <div className="hidden xl:flex items-center gap-1.5 text-[10px] shrink-0">
              <span className="text-slate-500">HOTSPOTS:</span>
              <button
                onClick={() => onJumpToCoords(16.8, 28.2)}
                className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 transition"
              >
                1. Allied HQ
              </button>
              <button
                onClick={() => onJumpToCoords(50.0, 6.0)}
                className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-amber-300 transition"
              >
                2. Highway Gate
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
      )}

      {/* Mobile / Tablet Collapsible Action Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-slate-950/98 border-b border-slate-800 p-3 space-y-3 shadow-2xl text-xs font-mono">
          {/* Sector Switcher */}
          {maps.length > 0 && onSwitchMap && (
            <div className="space-y-1">
              <div className="text-[10px] text-slate-400 uppercase">Active Sector Theater</div>
              <div className="grid grid-cols-3 gap-1.5">
                {maps.map((m, idx) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      onSwitchMap(m.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`py-2 px-2 rounded text-[11px] font-mono text-center transition border ${
                      currentMapId === m.id
                        ? 'bg-cyan-600 text-white border-cyan-400 font-bold'
                        : 'bg-slate-900 text-slate-300 border-slate-800'
                    }`}
                  >
                    S0{idx + 1}: {m.name.split(':')[1]?.trim().split(' ')[0] || m.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick Modal & Command Actions */}
          <div className="grid grid-cols-2 gap-2">
            {onOpenProgression && (
              <button
                onClick={() => {
                  onOpenProgression();
                  setMobileMenuOpen(false);
                }}
                className="p-2.5 rounded bg-amber-950/60 border border-amber-600/50 text-amber-200 flex items-center gap-2"
              >
                <Trophy className="w-4 h-4 text-amber-400" />
                <span>Missions & Ranks</span>
              </button>
            )}
            <button
              onClick={() => {
                onOpenAlliance();
                setMobileMenuOpen(false);
              }}
              className="p-2.5 rounded bg-slate-900 border border-slate-800 text-slate-200 flex items-center gap-2"
            >
              <Users className="w-4 h-4 text-indigo-400" />
              <span>Alliance HQ</span>
            </button>
            <button
              onClick={() => {
                onOpenIntel();
                setMobileMenuOpen(false);
              }}
              className="p-2.5 rounded bg-slate-900 border border-slate-800 text-slate-200 flex items-center gap-2"
            >
              <Shield className="w-4 h-4 text-amber-400" />
              <span>Unit Armory</span>
            </button>
            <button
              onClick={() => {
                onOpenTutorial();
                setMobileMenuOpen(false);
              }}
              className="p-2.5 rounded bg-blue-950/60 border border-blue-700/50 text-blue-200 flex items-center gap-2"
            >
              <Flag className="w-4 h-4 text-blue-400" />
              <span>Briefing</span>
            </button>
            <button
              onClick={() => {
                onOpenShortcuts();
                setMobileMenuOpen(false);
              }}
              className="p-2.5 rounded bg-slate-900 border border-slate-800 text-slate-200 flex items-center gap-2"
            >
              <Keyboard className="w-4 h-4 text-cyan-400" />
              <span>Hotkeys</span>
            </button>
            {onResetSkirmish && (
              <button
                onClick={() => {
                  onResetSkirmish();
                  setMobileMenuOpen(false);
                }}
                className="p-2.5 rounded bg-slate-900 border border-slate-800 text-cyan-300 flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4 text-cyan-400" />
                <span>New Match</span>
              </button>
            )}
            {(profile.isAdmin || profile.adminRole) && (
              <button
                onClick={() => {
                  onOpenAdmin();
                  setMobileMenuOpen(false);
                }}
                className="p-2.5 rounded bg-amber-950/60 border border-amber-700/50 text-amber-300 flex items-center gap-2"
              >
                <Terminal className="w-4 h-4" />
                <span>Sandbox</span>
              </button>
            )}
            {onLogout && (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onLogout();
                }}
                className="p-2.5 rounded bg-rose-950/60 border border-rose-700/50 text-rose-200 flex items-center gap-2"
              >
                <LogOut className="w-4 h-4 text-rose-400" />
                <span>Sign Out</span>
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
