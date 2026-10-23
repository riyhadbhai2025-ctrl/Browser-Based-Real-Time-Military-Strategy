import React, { useEffect, useState } from 'react';
import {
  X,
  Settings,
  Monitor,
  Cpu,
  Volume2,
  VolumeX,
  Gamepad2,
  Keyboard,
  Accessibility,
  RotateCcw,
  Maximize2,
  Minimize2,
  Check,
  AlertTriangle,
  Sparkles,
  Sun,
  Eye,
  Play,
  Shield,
} from 'lucide-react';
import {
  formatKeyCode,
  GameSettings,
  getDefaultKeybindings,
  getDefaultSettings,
  MinimapSizePreset,
  SHORTCUT_DEFINITIONS,
  ShortcutActionId,
  UIScalePreset,
} from '../lib/settings';
import { soundEngine } from '../game/audio';
import { AIDifficulty, AtmospherePreset, GraphicsQuality } from '../types/game';

export type SettingsTabId =
  | 'display'
  | 'graphics'
  | 'audio'
  | 'gameplay'
  | 'controls'
  | 'accessibility'
  | 'reset';

interface SettingsModalProps {
  settings: GameSettings;
  onUpdateSettings: (updater: (prev: GameSettings) => GameSettings) => void;
  onResetAllSettings: () => void;
  onResetLayoutOnly: () => void;
  onClearControlGroups?: () => void;
  isStrategicOverview: boolean;
  onToggleStrategicOverview: (val: boolean) => void;
  onChangeAiDifficulty?: (diff: AIDifficulty) => void;
  onResetSkirmish?: () => void;
  onClose: () => void;
  initialTab?: SettingsTabId;
}

const TABS: { id: SettingsTabId; label: string; shortLabel: string; icon: React.ReactNode }[] = [
  { id: 'display', label: 'Display & Interface', shortLabel: 'Display', icon: <Monitor className="w-4 h-4" /> },
  { id: 'graphics', label: 'Graphics & 3D', shortLabel: 'Graphics', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'audio', label: 'Audio & Comms', shortLabel: 'Audio', icon: <Volume2 className="w-4 h-4" /> },
  { id: 'gameplay', label: 'Gameplay & Camera', shortLabel: 'Gameplay', icon: <Gamepad2 className="w-4 h-4" /> },
  { id: 'controls', label: 'Controls & Hotkeys', shortLabel: 'Controls', icon: <Keyboard className="w-4 h-4" /> },
  { id: 'accessibility', label: 'Accessibility', shortLabel: 'Access', icon: <Accessibility className="w-4 h-4" /> },
  { id: 'reset', label: 'Data & Reset', shortLabel: 'Reset', icon: <RotateCcw className="w-4 h-4" /> },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onUpdateSettings,
  onResetAllSettings,
  onResetLayoutOnly,
  onClearControlGroups,
  isStrategicOverview,
  onToggleStrategicOverview,
  onChangeAiDifficulty,
  onResetSkirmish,
  onClose,
  initialTab = 'display',
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => Boolean(document.fullscreenElement));
  const [remappingAction, setRemappingAction] = useState<ShortcutActionId | null>(null);
  const [remapError, setRemapError] = useState<string | null>(null);
  const [confirmResetAll, setConfirmResetAll] = useState<boolean>(false);
  const [confirmClearLocal, setConfirmClearLocal] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // Sync fullscreen state with browser fullscreenchange event
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Handle Escape to close modal or cancel keybinding capture
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (remappingAction) {
        e.preventDefault();
        e.stopPropagation();

        if (e.code === 'Escape') {
          setRemappingAction(null);
          setRemapError(null);
          return;
        }

        // Disallow modifier-only keys
        if (['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(e.code)) {
          return;
        }

        // Disallow reserved movement keys WASD & Arrows
        if (['KeyW', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'F11'].includes(e.code)) {
          setRemapError(`${formatKeyCode(e.code)} is reserved for core camera/chat navigation.`);
          return;
        }

        // Check for duplicate assignment
        const existingEntry = (Object.entries(settings.keybindings) as [ShortcutActionId, string][]).find(
          ([actId, code]) => code === e.code && actId !== remappingAction
        );
        if (existingEntry) {
          const conflictingDef = SHORTCUT_DEFINITIONS.find((d) => d.id === existingEntry[0]);
          setRemapError(
            `${formatKeyCode(e.code)} is already bound to "${conflictingDef?.label || existingEntry[0]}".`
          );
          return;
        }

        onUpdateSettings((prev) => ({
          ...prev,
          keybindings: {
            ...prev.keybindings,
            [remappingAction]: e.code,
          },
        }));
        soundEngine.playCommandAck();
        setRemappingAction(null);
        setRemapError(null);
        showFeedback(`Bound ${formatKeyCode(e.code)} successfully.`);
        return;
      }

      if (e.code === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [remappingAction, settings.keybindings, onUpdateSettings, onClose]);

  const showFeedback = (msg: string) => {
    setStatusBanner(msg);
    setTimeout(() => {
      setStatusBanner((prev) => (prev === msg ? null : prev));
    }, 2800);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const setField = <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => {
    onUpdateSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-2 sm:p-4 select-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !remappingAction) {
          onClose();
        }
      }}
    >
      <div
        className={`w-full max-w-4xl max-h-[92vh] sm:max-h-[86vh] flex flex-col rounded-xl bg-slate-950 border ${
          settings.highContrastHud ? 'border-cyan-400 shadow-cyan-950/50' : 'border-slate-800'
        } shadow-2xl overflow-hidden text-slate-100`}
      >
        {/* Top Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-950 border border-cyan-500/50 flex items-center justify-center text-cyan-400">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h2
                id="settings-modal-title"
                className="text-sm sm:text-base font-bold font-mono tracking-wider uppercase text-slate-100"
              >
                Tactical Command Settings
              </h2>
              <p className="text-[11px] text-slate-400 font-mono hidden sm:block">
                Real-Time 3D Engine, Audio Synthesizer, Interface & Controls Configuration
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {statusBanner && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-950/90 border border-emerald-500/60 text-emerald-300 text-xs font-mono">
                <Check className="w-3.5 h-3.5" />
                <span>{statusBanner}</span>
              </div>
            )}
            <button
              onClick={onClose}
              aria-label="Close Settings"
              className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition focus:outline-none focus:ring-2 focus:ring-cyan-400"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body: Sidebar Navigation (Desktop) / Horizontal Tabs (Mobile) + Active Category Content */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          {/* Category Tabs */}
          <nav
            aria-label="Settings Categories"
            className="flex md:flex-col gap-1 p-2 bg-slate-900/70 border-b md:border-b-0 md:border-r border-slate-800 overflow-x-auto md:overflow-y-auto md:w-56 shrink-0"
          >
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setRemappingAction(null);
                    setRemapError(null);
                  }}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-mono font-semibold whitespace-nowrap transition text-left focus:outline-none focus:ring-2 focus:ring-cyan-400 ${
                    isActive
                      ? 'bg-cyan-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70'
                  }`}
                >
                  <span className={isActive ? 'text-white' : 'text-cyan-400'}>{tab.icon}</span>
                  <span className="hidden md:inline">{tab.label}</span>
                  <span className="md:hidden">{tab.shortLabel}</span>
                </button>
              );
            })}
          </nav>

          {/* Main Scrollable Settings Content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
            {/* A. DISPLAY & INTERFACE */}
            {activeTab === 'display' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-bold font-mono uppercase text-cyan-400 tracking-wider">
                    Display & HUD Interface
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Customize HUD scaling, tactical overlay panels, radar dimensions, and viewport display mode.
                  </p>
                </div>

                {/* HUD / UI Scale */}
                <div className="p-3.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold font-mono text-slate-100">HUD / Interface Scale</div>
                      <div className="text-[11px] text-slate-400">
                        Adjusts command bars, resource readouts, and tactical text legibility.
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {(['small', 'normal', 'large'] as UIScalePreset[]).map((scale) => (
                        <button
                          key={scale}
                          onClick={() => {
                            setField('uiScale', scale);
                            soundEngine.playCommandAck();
                          }}
                          className={`px-3 py-1.5 rounded text-xs font-mono uppercase font-semibold transition border ${
                            settings.uiScale === scale
                              ? 'bg-cyan-600 text-white border-cyan-400'
                              : 'bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800'
                          }`}
                        >
                          {scale}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Minimap Size */}
                <div className="p-3.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold font-mono text-slate-100">3D Tactical Radar Size</div>
                      <div className="text-[11px] text-slate-400">
                        Selects the viewport footprint of the bottom-left sector radar minimap.
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {(['compact', 'normal', 'large'] as MinimapSizePreset[]).map((sz) => (
                        <button
                          key={sz}
                          onClick={() => {
                            setField('minimapSize', sz);
                            soundEngine.playCommandAck();
                          }}
                          className={`px-3 py-1.5 rounded text-xs font-mono uppercase font-semibold transition border ${
                            settings.minimapSize === sz
                              ? 'bg-cyan-600 text-white border-cyan-400'
                              : 'bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800'
                          }`}
                        >
                          {sz}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Toggle Switches */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ToggleCard
                    title="Compact HUD Mode"
                    description="Condenses top command bar and docks for maximum 3D battlefield visibility."
                    checked={settings.compactHud}
                    onChange={(v) => setField('compactHud', v)}
                  />
                  <ToggleCard
                    title="Sector Objective Bar"
                    description="Show the secondary sector switcher, mission objective, and hotspot jump bar."
                    checked={settings.showSubHeader}
                    onChange={(v) => setField('showSubHeader', v)}
                  />
                  <ToggleCard
                    title="Show 3D Radar Minimap"
                    description="Display the interactive sector radar and camera orientation controls."
                    checked={settings.showMinimap}
                    onChange={(v) => setField('showMinimap', v)}
                  />
                  <ToggleCard
                    title="Show Tactical Comms & Feed"
                    description="Display the bottom-right global/alliance chat and live combat log panel."
                    checked={settings.showChat}
                    onChange={(v) => setField('showChat', v)}
                  />
                  <ToggleCard
                    title="Show Squad Control Strip"
                    description="Display the quick #1–#9 control group assignment bar above the command dock."
                    checked={settings.showSquadBar}
                    onChange={(v) => setField('showSquadBar', v)}
                  />
                  <ToggleCard
                    title="Battlefield Health & Base Labels"
                    description="Render floating 2D health bars, shield meters, and base nameplates in 3D space."
                    checked={settings.showUnitLabels}
                    onChange={(v) => setField('showUnitLabels', v)}
                  />
                  <ToggleCard
                    title="Interface Transitions"
                    description="Enable smooth HUD drawer and panel transitions."
                    checked={settings.uiAnimations}
                    onChange={(v) => setField('uiAnimations', v)}
                  />
                </div>

                {/* Fullscreen & Layout Reset Row */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-lg bg-slate-900/90 border border-slate-800">
                  <div>
                    <div className="text-xs font-bold font-mono text-slate-100">Viewport Fullscreen & Layout</div>
                    <div className="text-[11px] text-slate-400">
                      Toggle fullscreen theater mode (F11) or restore default HUD panel visibility.
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={toggleFullscreen}
                      className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-mono font-semibold text-cyan-300 flex items-center gap-1.5 transition"
                    >
                      {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                      <span>{isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}</span>
                    </button>
                    <button
                      onClick={() => {
                        onResetLayoutOnly();
                        soundEngine.playCommandAck();
                        showFeedback('Default HUD layout restored.');
                      }}
                      className="px-3 py-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-700 text-xs font-mono font-semibold text-slate-300 flex items-center gap-1.5 transition"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                      <span>Restore Default Layout</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* B. GRAPHICS & PERFORMANCE */}
            {activeTab === 'graphics' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-bold font-mono uppercase text-cyan-400 tracking-wider">
                    3D Graphics & WebGL Performance
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Real-time Three.js rendering quality, atmospheric lighting, shadow maps, and particle controls.
                  </p>
                </div>

                {/* Graphics Quality Preset */}
                <div className="p-3.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold font-mono text-slate-100">3D Graphics Quality Preset</div>
                      <div className="text-[11px] text-slate-400">
                        Controls shadow map resolution, pixel ratio ceiling, and explosion particle density.
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(['low', 'medium', 'high', 'ultra'] as GraphicsQuality[]).map((q) => (
                        <button
                          key={q}
                          onClick={() => {
                            setField('graphicsQuality', q);
                            soundEngine.playCommandAck();
                          }}
                          className={`px-3 py-1.5 rounded text-xs font-mono uppercase font-semibold transition border ${
                            settings.graphicsQuality === q
                              ? 'bg-cyan-600 text-white border-cyan-400'
                              : 'bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800'
                          }`}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Atmosphere Preset */}
                <div className="p-3.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold font-mono text-slate-100 flex items-center gap-1.5">
                        <Sun className="w-3.5 h-3.5 text-amber-400" />
                        <span>Theater Atmosphere & Lighting</span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Changes directional sun angle, skybox color, and atmospheric distance fog in real time.
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {(
                        [
                          { id: 'daylight', label: 'Daylight' },
                          { id: 'golden_hour', label: 'Golden Hour' },
                          { id: 'overcast', label: 'Overcast Dusk' },
                        ] as { id: AtmospherePreset; label: string }[]
                      ).map((p) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            setField('atmospherePreset', p.id);
                            soundEngine.playCommandAck();
                          }}
                          className={`px-3 py-1.5 rounded text-xs font-mono font-semibold transition border ${
                            settings.atmospherePreset === p.id
                              ? 'bg-amber-600 text-white border-amber-400'
                              : 'bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Render Resolution Scale */}
                <div className="p-3.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold font-mono text-slate-100">WebGL Render Resolution Scale</div>
                      <div className="text-[11px] text-slate-400">
                        Lower values significantly boost frame rate on high-DPI laptops and mobile GPUs.
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {[
                        { val: 0.5, label: '50% (Fast)' },
                        { val: 0.75, label: '75% (Balanced)' },
                        { val: 1.0, label: '100% (Native)' },
                      ].map((opt) => (
                        <button
                          key={opt.val}
                          onClick={() => {
                            setField('renderScale', opt.val);
                            soundEngine.playCommandAck();
                          }}
                          className={`px-2.5 py-1.5 rounded text-xs font-mono font-semibold transition border ${
                            Math.abs(settings.renderScale - opt.val) < 0.05
                              ? 'bg-cyan-600 text-white border-cyan-400'
                              : 'bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Graphics Toggles */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ToggleCard
                    title="Dynamic Sun Shadows"
                    description="Enable real-time directional PCF soft shadows across units, bases, and trees."
                    checked={settings.shadowsEnabled}
                    onChange={(v) => setField('shadowsEnabled', v)}
                  />
                  <ToggleCard
                    title="3D Combat Particles & Plumes"
                    description="Render vehicle dust trails, damage smoke plumes, and multi-puff explosion debris."
                    checked={settings.particlesEnabled}
                    onChange={(v) => setField('particlesEnabled', v)}
                  />
                  <ToggleCard
                    title="Tactical Fog of War (F)"
                    description="Filter visibility of unreconnoitered enemy forces outside allied radar range."
                    checked={settings.fogEnabled}
                    onChange={(v) => setField('fogEnabled', v)}
                  />
                  <ToggleCard
                    title="Base Repair Visuals (R)"
                    description="Display active repair indicators and engineering status on damaged facilities."
                    checked={settings.repairVisualsActive}
                    onChange={(v) => setField('repairVisualsActive', v)}
                  />
                  <ToggleCard
                    title="Show Real-Time FPS Counter"
                    description="Display live WebGL frame rate and resolution scale telemetry in the top-left viewport."
                    checked={settings.showFpsCounter}
                    onChange={(v) => setField('showFpsCounter', v)}
                  />
                </div>
              </div>
            )}

            {/* C. AUDIO */}
            {activeTab === 'audio' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-bold font-mono uppercase text-cyan-400 tracking-wider">
                    Procedural Web Audio Synthesizer
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Configure master output, weapon SFX levels, command telemetry chimes, and test audio channels.
                  </p>
                </div>

                {/* Mute Toggle */}
                <div className="flex items-center justify-between p-3.5 rounded-lg bg-slate-900/90 border border-slate-800">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2.5 rounded-lg border ${
                        settings.muted
                          ? 'bg-rose-950/80 border-rose-500/50 text-rose-400'
                          : 'bg-emerald-950/80 border-emerald-500/50 text-emerald-400'
                      }`}
                    >
                      {settings.muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="text-xs font-bold font-mono text-slate-100">
                        Master Tactical Audio ({settings.muted ? 'MUTED' : 'ACTIVE'})
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Immediately mutes or unmutes all Web Audio synthesizer channels.
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const next = !settings.muted;
                      setField('muted', next);
                      soundEngine.setMuted(next);
                      if (!next) soundEngine.playCommandAck();
                    }}
                    className={`px-4 py-2 rounded-lg text-xs font-mono font-bold transition border ${
                      settings.muted
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400'
                        : 'bg-rose-950/80 hover:bg-rose-900 text-rose-200 border-rose-700'
                    }`}
                  >
                    {settings.muted ? 'UNMUTE AUDIO' : 'MUTE ALL'}
                  </button>
                </div>

                {/* Volume Sliders */}
                <div className="space-y-3 p-4 rounded-lg bg-slate-900/90 border border-slate-800">
                  <SliderControl
                    label="Master Volume"
                    value={settings.masterVolume}
                    min={0}
                    max={100}
                    step={1}
                    suffix="%"
                    disabled={settings.muted}
                    onChange={(v) => {
                      setField('masterVolume', v);
                      soundEngine.setMasterVolume(v);
                    }}
                  />
                  <SliderControl
                    label="Combat & Weapon SFX Volume (Cannons, Missiles, Explosions)"
                    value={settings.sfxVolume}
                    min={0}
                    max={100}
                    step={1}
                    suffix="%"
                    disabled={settings.muted}
                    onChange={(v) => {
                      setField('sfxVolume', v);
                      soundEngine.setSfxVolume(v);
                    }}
                  />
                  <SliderControl
                    label="Command & UI Telemetry Volume (Radio Clicks, Build Chimes)"
                    value={settings.uiAudioVolume}
                    min={0}
                    max={100}
                    step={1}
                    suffix="%"
                    disabled={settings.muted}
                    onChange={(v) => {
                      setField('uiAudioVolume', v);
                      soundEngine.setUiVolume(v);
                    }}
                  />
                </div>

                <ToggleCard
                  title="Base Siege Alarms & Capture Fanfare"
                  description="Play audible warning sirens and fanfare chimes when sector bases are captured."
                  checked={settings.alertAudioEnabled}
                  onChange={(v) => {
                    setField('alertAudioEnabled', v);
                    soundEngine.setAlertAudioEnabled(v);
                  }}
                />

                {/* Test Sound Channels */}
                <div className="p-3.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-2.5">
                  <div className="text-xs font-bold font-mono text-slate-100">Audio Channel Diagnostic Test</div>
                  <div className="text-[11px] text-slate-400">
                    Trigger live procedural audio samples to verify volume balance on your speakers or headset.
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      onClick={() => {
                        if (settings.muted) {
                          setField('muted', false);
                          soundEngine.setMuted(false);
                        }
                        soundEngine.playTestSound('ui');
                      }}
                      className="px-3 py-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-cyan-600/50 text-xs font-mono text-cyan-300 flex items-center gap-1.5 transition"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Test Radio Ack (UI)</span>
                    </button>
                    <button
                      onClick={() => {
                        if (settings.muted) {
                          setField('muted', false);
                          soundEngine.setMuted(false);
                        }
                        soundEngine.playTestSound('combat');
                      }}
                      className="px-3 py-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-amber-600/50 text-xs font-mono text-amber-300 flex items-center gap-1.5 transition"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Test Tank Cannon (SFX)</span>
                    </button>
                    <button
                      onClick={() => {
                        if (settings.muted) {
                          setField('muted', false);
                          soundEngine.setMuted(false);
                        }
                        soundEngine.playTestSound('alert');
                      }}
                      className="px-3 py-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-emerald-600/50 text-xs font-mono text-emerald-300 flex items-center gap-1.5 transition"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Test Capture Fanfare</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* D. GAMEPLAY & CAMERA */}
            {activeTab === 'gameplay' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-bold font-mono uppercase text-cyan-400 tracking-wider">
                    Gameplay, Camera & Skirmish AI
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Fine-tune 3D camera navigation speed, zoom response, touch order behavior, and AI commander aggression.
                  </p>
                </div>

                {/* Camera Sliders */}
                <div className="space-y-3 p-4 rounded-lg bg-slate-900/90 border border-slate-800">
                  <SliderControl
                    label="3D Camera Pan Speed (WASD / Arrow Keys / Drag)"
                    value={Math.round(settings.cameraPanSpeed * 100)}
                    min={40}
                    max={200}
                    step={10}
                    suffix="%"
                    onChange={(v) => setField('cameraPanSpeed', Number((v / 100).toFixed(2)))}
                  />
                  <SliderControl
                    label="Camera Zoom Sensitivity (Scroll Wheel & Pinch)"
                    value={Math.round(settings.cameraZoomSensitivity * 100)}
                    min={40}
                    max={200}
                    step={10}
                    suffix="%"
                    onChange={(v) => setField('cameraZoomSensitivity', Number((v / 100).toFixed(2)))}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ToggleCard
                    title="Invert Scroll-Wheel Zoom"
                    description="Reverse mouse wheel zoom direction (scroll down to zoom in)."
                    checked={settings.invertScrollZoom}
                    onChange={(v) => setField('invertScrollZoom', v)}
                  />
                  <ToggleCard
                    title="Desktop Screen-Edge Panning"
                    description="Automatically pan the 3D battlefield camera when cursor is near viewport edges."
                    checked={settings.edgeScrollEnabled}
                    onChange={(v) => setField('edgeScrollEnabled', v)}
                  />
                  <ToggleCard
                    title="Touch Tap-to-Order Mode"
                    description="On touchscreens, tapping terrain while units are selected issues the active command (Move/Attack)."
                    checked={settings.touchTapToOrder}
                    onChange={(v) => setField('touchTapToOrder', v)}
                  />
                  <ToggleCard
                    title="3D Strategic Overview Camera (V)"
                    description="Switch camera to high-altitude theater command perspective."
                    checked={isStrategicOverview}
                    onChange={(v) => {
                      onToggleStrategicOverview(v);
                      setField('strategicOverviewDefault', v);
                    }}
                  />
                </div>

                {/* AI Difficulty & Skirmish Control */}
                <div className="p-3.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold font-mono text-slate-100 flex items-center gap-1.5">
                        <Cpu className="w-3.5 h-3.5 text-rose-400" />
                        <span>Kodiak PMC Tactical AI Difficulty</span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Synchronizes enemy AI production cadence and assault wave frequency with the match server.
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {(['easy', 'medium', 'hard'] as AIDifficulty[]).map((d) => (
                        <button
                          key={d}
                          onClick={() => {
                            setField('aiDifficulty', d);
                            if (onChangeAiDifficulty) onChangeAiDifficulty(d);
                            soundEngine.playCommandAck();
                          }}
                          className={`px-3 py-1.5 rounded text-xs font-mono uppercase font-semibold transition border ${
                            settings.aiDifficulty === d
                              ? 'bg-rose-600 text-white border-rose-400'
                              : 'bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800'
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>

                  {onResetSkirmish && (
                    <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">
                        Want to restart the current sector skirmish from initial base positions?
                      </span>
                      <button
                        onClick={() => {
                          onResetSkirmish();
                          onClose();
                        }}
                        className="px-3 py-1.5 rounded bg-slate-950 hover:bg-slate-800 border border-slate-700 text-xs font-mono text-cyan-300 flex items-center gap-1.5 transition"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reset Sector Match</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* E. CONTROLS & KEYBOARD SHORTCUTS */}
            {activeTab === 'controls' && (
              <div className="space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold font-mono uppercase text-cyan-400 tracking-wider">
                      Controls & Customizable Hotkeys
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Click any hotkey badge below to rebind it, or review mouse and touch battlefield controls.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setField('keybindings', getDefaultKeybindings());
                      setRemappingAction(null);
                      setRemapError(null);
                      soundEngine.playCommandAck();
                      showFeedback('Default keybindings restored.');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-mono text-amber-300 flex items-center gap-1.5 self-start transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Default Keys</span>
                  </button>
                </div>

                {remapError && (
                  <div className="p-2.5 rounded-lg bg-rose-950/80 border border-rose-500/60 text-xs font-mono text-rose-200 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{remapError}</span>
                  </div>
                )}

                {/* Remappable Tactical Shortcuts */}
                <div className="space-y-2">
                  <div className="text-xs font-bold font-mono text-slate-300 uppercase">
                    Customizable Command Hotkeys
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {SHORTCUT_DEFINITIONS.map((def) => {
                      const currentCode = settings.keybindings[def.id] || def.defaultKey;
                      const isRemapping = remappingAction === def.id;
                      return (
                        <div
                          key={def.id}
                          className={`flex items-center justify-between p-2.5 rounded-lg border transition ${
                            isRemapping
                              ? 'bg-cyan-950/60 border-cyan-400'
                              : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="pr-2">
                            <div className="text-xs font-bold font-mono text-slate-100">{def.label}</div>
                            <div className="text-[10px] text-slate-400">{def.description}</div>
                          </div>
                          <button
                            onClick={() => {
                              setRemapError(null);
                              setRemappingAction(isRemapping ? null : def.id);
                            }}
                            className={`px-2.5 py-1 rounded text-xs font-mono font-bold min-w-[76px] text-center transition border ${
                              isRemapping
                                ? 'bg-amber-500 text-slate-950 border-amber-300 animate-pulse'
                                : 'bg-slate-950 text-cyan-300 border-slate-700 hover:border-cyan-500'
                            }`}
                            title="Click and press a new key to rebind"
                          >
                            {isRemapping ? 'PRESS KEY...' : formatKeyCode(currentCode)}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Core Navigation & Mouse/Touch Reference */}
                <div className="space-y-2 pt-2">
                  <div className="text-xs font-bold font-mono text-slate-300 uppercase">
                    Core Camera, Mouse & Touch Reference
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                    {[
                      { k: 'W, A, S, D / ARROWS', v: 'Pan 3D Camera Across Sector' },
                      { k: 'Q / E or ALT+DRAG', v: 'Orbit / Rotate 3D Camera Heading' },
                      { k: 'MOUSE WHEEL / PINCH', v: 'Zoom Camera In / Out' },
                      { k: 'LEFT-CLICK / TAP', v: 'Select Unit, Base, or Place Facility' },
                      { k: 'LEFT-DRAG BOX', v: 'Marquee Box-Select Multiple Units' },
                      { k: 'DOUBLE-CLICK UNIT', v: 'Select All Friendly Units of Same Type' },
                      { k: 'RIGHT-CLICK', v: 'Issue Move / Attack Order or Drag-Pan' },
                      { k: 'CTRL + 1–9 / 1–9', v: 'Assign / Recall Squad Control Group' },
                      { k: 'HOME / END', v: 'Select All Forces / Emergency Stop' },
                      { k: 'PAGEUP / PAGEDOWN', v: 'Flash Units on Radar / Ping Coords' },
                      { k: 'ENTER / ESC', v: 'Focus Tactical Chat / Clear Selection' },
                    ].map((item) => (
                      <div
                        key={item.k}
                        className="flex items-center justify-between p-2 rounded bg-slate-900/60 border border-slate-800/80"
                      >
                        <span className="text-slate-400 text-[11px]">{item.v}</span>
                        <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-cyan-400 text-[10px] font-bold ml-2 shrink-0">
                          {item.k}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* F. ACCESSIBILITY */}
            {activeTab === 'accessibility' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-bold font-mono uppercase text-cyan-400 tracking-wider">
                    Accessibility & Visual Comfort
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Configure reduced motion, high-contrast HUD borders, flash suppression, and touch target sizing.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ToggleCard
                    title="Reduced Motion Mode"
                    description="Dampens water wave motion, unit hover bobbing, and non-essential UI animations."
                    checked={settings.reducedMotion}
                    onChange={(v) => {
                      setField('reducedMotion', v);
                      if (v) setField('uiAnimations', false);
                    }}
                  />
                  <ToggleCard
                    title="High-Contrast Tactical HUD"
                    description="Increases HUD background opacity, brightens borders, and sharpens text contrast."
                    checked={settings.highContrastHud}
                    onChange={(v) => setField('highContrastHud', v)}
                  />
                  <ToggleCard
                    title="Reduce Visual Flashes & Strobes"
                    description="Suppresses bright point-light explosion flashes and rapid muzzle strobes in 3D combat."
                    checked={settings.reducedFlashes}
                    onChange={(v) => setField('reducedFlashes', v)}
                  />
                  <ToggleCard
                    title="Larger Touch & Action Targets"
                    description="Enlarges command dock buttons and interactive controls (44x44px+) for touch and motor ease."
                    checked={settings.largerTouchTargets}
                    onChange={(v) => setField('largerTouchTargets', v)}
                  />
                </div>

                {/* Quick Text / UI Scale */}
                <div className="p-3.5 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold font-mono text-slate-100">Readable Text & HUD Scale</div>
                    <div className="text-[11px] text-slate-400">
                      Synchronized with Display HUD scale for comfortable reading distance.
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {(['small', 'normal', 'large'] as UIScalePreset[]).map((scale) => (
                      <button
                        key={scale}
                        onClick={() => setField('uiScale', scale)}
                        className={`px-3 py-1.5 rounded text-xs font-mono uppercase font-semibold transition border ${
                          settings.uiScale === scale
                            ? 'bg-cyan-600 text-white border-cyan-400'
                            : 'bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800'
                        }`}
                      >
                        {scale}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* G. DATA & RESET */}
            {activeTab === 'reset' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-bold font-mono uppercase text-cyan-400 tracking-wider">
                    Client Preferences & Reset Controls
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Manage locally stored browser settings without affecting your server-side commander account.
                  </p>
                </div>

                {/* Explanation Card */}
                <div className="p-3.5 rounded-lg bg-slate-900/90 border border-slate-800 flex items-start gap-3">
                  <Shield className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-slate-300 space-y-1 leading-relaxed">
                    <div className="font-bold font-mono text-slate-100">
                      Local Preferences vs. Server-Authoritative Account Data
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Display, graphics, audio, camera sensitivity, and hotkey settings are stored locally in your
                      browser (<code className="text-cyan-300">localStorage</code>). Your Commander profile, bases,
                      units, alliances, and match progression are safely persisted on the central PostgreSQL game
                      server and are never erased by resetting client settings.
                    </p>
                  </div>
                </div>

                {/* Reset All Settings */}
                <div className="p-4 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold font-mono text-slate-100">Restore All Settings to Defaults</div>
                    <div className="text-[11px] text-slate-400">
                      Resets Display, Graphics, Audio, Camera, Hotkeys, and Accessibility to factory defaults.
                    </div>
                  </div>
                  {!confirmResetAll ? (
                    <button
                      onClick={() => setConfirmResetAll(true)}
                      className="px-3.5 py-2 rounded-lg bg-amber-950/80 hover:bg-amber-900 border border-amber-600/60 text-amber-200 text-xs font-mono font-bold flex items-center gap-1.5 shrink-0 transition"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Restore Defaults</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => {
                          onResetAllSettings();
                          setConfirmResetAll(false);
                          soundEngine.playCommandAck();
                          showFeedback('All settings restored to factory defaults.');
                        }}
                        className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-mono font-bold transition"
                      >
                        CONFIRM RESET
                      </button>
                      <button
                        onClick={() => setConfirmResetAll(false)}
                        className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition"
                      >
                        CANCEL
                      </button>
                    </div>
                  )}
                </div>

                {/* Clear Local Client Cache & Squad Groups */}
                <div className="p-4 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold font-mono text-slate-100">
                      Reset Local Client Cache & Control Groups
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Clears saved local preferences and resets #1–#9 squad control group bindings for this browser.
                    </div>
                  </div>
                  {!confirmClearLocal ? (
                    <button
                      onClick={() => setConfirmClearLocal(true)}
                      className="px-3.5 py-2 rounded-lg bg-rose-950/70 hover:bg-rose-900/80 border border-rose-600/50 text-rose-200 text-xs font-mono font-bold flex items-center gap-1.5 shrink-0 transition"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Clear Local Preferences</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => {
                          onResetAllSettings();
                          if (onClearControlGroups) onClearControlGroups();
                          setConfirmClearLocal(false);
                          soundEngine.playCommandAck();
                          showFeedback('Local preferences & squad groups cleared.');
                        }}
                        className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs font-mono font-bold transition"
                      >
                        CONFIRM CLEAR
                      </button>
                      <button
                        onClick={() => setConfirmClearLocal(false)}
                        className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition"
                      >
                        CANCEL
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-t border-slate-800 text-[11px] font-mono text-slate-400 shrink-0">
          <span>Changes are applied immediately and saved automatically.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition focus:outline-none focus:ring-2 focus:ring-cyan-400"
          >
            DONE
          </button>
        </div>
      </div>
    </div>
  );
};

interface ToggleCardProps {
  title: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}

const ToggleCard: React.FC<ToggleCardProps> = ({ title, description, checked, onChange }) => {
  return (
    <div
      onClick={() => {
        onChange(!checked);
        soundEngine.playCommandAck();
      }}
      role="switch"
      aria-checked={checked}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onChange(!checked);
          soundEngine.playCommandAck();
        }
      }}
      className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-900/90 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-cyan-400"
    >
      <div>
        <div className="text-xs font-bold font-mono text-slate-100">{title}</div>
        <div className="text-[11px] text-slate-400 leading-snug mt-0.5">{description}</div>
      </div>
      <div
        className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 ${
          checked ? 'bg-cyan-600' : 'bg-slate-700'
        }`}
      >
        <div
          className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </div>
    </div>
  );
};

interface SliderControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  disabled?: boolean;
  onChange: (val: number) => void;
}

const SliderControl: React.FC<SliderControlProps> = ({
  label,
  value,
  min,
  max,
  step,
  suffix = '',
  disabled = false,
  onChange,
}) => {
  return (
    <div className={`space-y-1.5 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="flex items-center justify-between text-xs font-mono">
        <span className="text-slate-200 font-semibold">{label}</span>
        <span className="text-cyan-400 font-bold">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
      />
    </div>
  );
};
