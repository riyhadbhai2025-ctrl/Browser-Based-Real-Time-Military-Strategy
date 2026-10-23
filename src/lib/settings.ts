import { AIDifficulty, AtmospherePreset, GraphicsQuality } from '../types/game';

export type UIScalePreset = 'small' | 'normal' | 'large';
export type MinimapSizePreset = 'compact' | 'normal' | 'large';

export type ShortcutActionId =
  | 'moveCommand'
  | 'attackCommand'
  | 'holdCommand'
  | 'patrolCommand'
  | 'stopCommand'
  | 'jumpHome'
  | 'strategicOverview'
  | 'toggleFog'
  | 'resetNorth'
  | 'focusUnit'
  | 'toggleRepair';

export interface ShortcutDefinition {
  id: ShortcutActionId;
  label: string;
  description: string;
  defaultKey: string;
}

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  { id: 'moveCommand', label: 'Move Order', description: 'Set active unit order to Move', defaultKey: 'KeyM' },
  { id: 'attackCommand', label: 'Attack Order', description: 'Set active unit order to Attack', defaultKey: 'KeyA' },
  { id: 'holdCommand', label: 'Hold Position', description: 'Order selected units to hold position', defaultKey: 'KeyH' },
  { id: 'patrolCommand', label: 'Patrol Sector', description: 'Set active unit order to Patrol', defaultKey: 'KeyP' },
  { id: 'stopCommand', label: 'Stop Units', description: 'Immediately halt selected units', defaultKey: 'KeyS' },
  { id: 'jumpHome', label: 'Jump to Home HQ', description: 'Center 3D camera on your Home Base', defaultKey: 'Space' },
  { id: 'strategicOverview', label: 'Strategic Overview', description: 'Toggle high-altitude theater camera angle', defaultKey: 'KeyV' },
  { id: 'toggleFog', label: 'Toggle Fog of War', description: 'Toggle tactical visibility overlay', defaultKey: 'KeyF' },
  { id: 'resetNorth', label: 'Reset Camera North', description: 'Align 3D camera heading due North', defaultKey: 'KeyN' },
  { id: 'focusUnit', label: 'Focus Selected Unit', description: 'Center camera on primary selected unit', defaultKey: 'KeyC' },
  { id: 'toggleRepair', label: 'Toggle Repair Visuals', description: 'Show or hide base repair indicators', defaultKey: 'KeyR' },
];

export interface GameSettings {
  version: number;
  // A. Display & Interface
  uiScale: UIScalePreset;
  compactHud: boolean;
  showSubHeader: boolean;
  showMinimap: boolean;
  minimapSize: MinimapSizePreset;
  showChat: boolean;
  showSquadBar: boolean;
  showUnitLabels: boolean;
  uiAnimations: boolean;

  // B. Graphics & Performance
  graphicsQuality: GraphicsQuality;
  atmospherePreset: AtmospherePreset;
  renderScale: number; // 0.5, 0.75, 1.0
  shadowsEnabled: boolean;
  particlesEnabled: boolean;
  fogEnabled: boolean;
  repairVisualsActive: boolean;
  showFpsCounter: boolean;

  // C. Audio
  muted: boolean;
  masterVolume: number; // 0..100
  sfxVolume: number; // 0..100
  uiAudioVolume: number; // 0..100
  alertAudioEnabled: boolean;

  // D. Gameplay
  cameraPanSpeed: number; // 0.4..2.0
  cameraZoomSensitivity: number; // 0.4..2.0
  invertScrollZoom: boolean;
  edgeScrollEnabled: boolean;
  touchTapToOrder: boolean;
  strategicOverviewDefault: boolean;
  aiDifficulty: AIDifficulty;

  // E. Controls & Keybindings
  keybindings: Record<ShortcutActionId, string>;

  // F. Accessibility
  reducedMotion: boolean;
  highContrastHud: boolean;
  reducedFlashes: boolean;
  largerTouchTargets: boolean;
}

export const SETTINGS_STORAGE_KEY = 'frontline_dominion_settings_v1';
export const CURRENT_SETTINGS_VERSION = 1;

export function getDefaultKeybindings(): Record<ShortcutActionId, string> {
  return {
    moveCommand: 'KeyM',
    attackCommand: 'KeyA',
    holdCommand: 'KeyH',
    patrolCommand: 'KeyP',
    stopCommand: 'KeyS',
    jumpHome: 'Space',
    strategicOverview: 'KeyV',
    toggleFog: 'KeyF',
    resetNorth: 'KeyN',
    focusUnit: 'KeyC',
    toggleRepair: 'KeyR',
  };
}

export function getSystemReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function getDefaultSettings(): GameSettings {
  const prefersReducedMotion = getSystemReducedMotion();
  return {
    version: CURRENT_SETTINGS_VERSION,
    // Display & Interface
    uiScale: 'normal',
    compactHud: false,
    showSubHeader: true,
    showMinimap: true,
    minimapSize: 'normal',
    showChat: true,
    showSquadBar: true,
    showUnitLabels: true,
    uiAnimations: !prefersReducedMotion,

    // Graphics & Performance
    graphicsQuality: 'high',
    atmospherePreset: 'daylight',
    renderScale: 1.0,
    shadowsEnabled: true,
    particlesEnabled: true,
    fogEnabled: true,
    repairVisualsActive: true,
    showFpsCounter: false,

    // Audio
    muted: false,
    masterVolume: 80,
    sfxVolume: 85,
    uiAudioVolume: 75,
    alertAudioEnabled: true,

    // Gameplay
    cameraPanSpeed: 1.0,
    cameraZoomSensitivity: 1.0,
    invertScrollZoom: false,
    edgeScrollEnabled: false,
    touchTapToOrder: true,
    strategicOverviewDefault: false,
    aiDifficulty: 'medium',

    // Controls
    keybindings: getDefaultKeybindings(),

    // Accessibility
    reducedMotion: prefersReducedMotion,
    highContrastHud: false,
    reducedFlashes: prefersReducedMotion,
    largerTouchTargets: false,
  };
}

function clampNumber(val: unknown, min: number, max: number, fallback: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return Math.max(min, Math.min(max, val));
}

export function sanitizeSettings(raw: unknown): GameSettings {
  const defaults = getDefaultSettings();
  if (!raw || typeof raw !== 'object') {
    return defaults;
  }

  const obj = raw as Record<string, unknown>;

  const uiScale: UIScalePreset =
    obj.uiScale === 'small' || obj.uiScale === 'normal' || obj.uiScale === 'large'
      ? obj.uiScale
      : defaults.uiScale;

  const minimapSize: MinimapSizePreset =
    obj.minimapSize === 'compact' || obj.minimapSize === 'normal' || obj.minimapSize === 'large'
      ? obj.minimapSize
      : defaults.minimapSize;

  const graphicsQuality: GraphicsQuality =
    obj.graphicsQuality === 'low' ||
    obj.graphicsQuality === 'medium' ||
    obj.graphicsQuality === 'high' ||
    obj.graphicsQuality === 'ultra'
      ? obj.graphicsQuality
      : defaults.graphicsQuality;

  const atmospherePreset: AtmospherePreset =
    obj.atmospherePreset === 'daylight' ||
    obj.atmospherePreset === 'golden_hour' ||
    obj.atmospherePreset === 'overcast'
      ? obj.atmospherePreset
      : defaults.atmospherePreset;

  const aiDifficulty: AIDifficulty =
    obj.aiDifficulty === 'easy' || obj.aiDifficulty === 'medium' || obj.aiDifficulty === 'hard'
      ? obj.aiDifficulty
      : defaults.aiDifficulty;

  const defaultKeys = getDefaultKeybindings();
  const keybindings: Record<ShortcutActionId, string> = { ...defaultKeys };
  if (obj.keybindings && typeof obj.keybindings === 'object') {
    const rawKeys = obj.keybindings as Record<string, unknown>;
    (Object.keys(defaultKeys) as ShortcutActionId[]).forEach((k) => {
      if (typeof rawKeys[k] === 'string' && rawKeys[k].trim().length > 0) {
        keybindings[k] = rawKeys[k].trim();
      }
    });
  }

  return {
    version: CURRENT_SETTINGS_VERSION,
    uiScale,
    compactHud: typeof obj.compactHud === 'boolean' ? obj.compactHud : defaults.compactHud,
    showSubHeader: typeof obj.showSubHeader === 'boolean' ? obj.showSubHeader : defaults.showSubHeader,
    showMinimap: typeof obj.showMinimap === 'boolean' ? obj.showMinimap : defaults.showMinimap,
    minimapSize,
    showChat: typeof obj.showChat === 'boolean' ? obj.showChat : defaults.showChat,
    showSquadBar: typeof obj.showSquadBar === 'boolean' ? obj.showSquadBar : defaults.showSquadBar,
    showUnitLabels: typeof obj.showUnitLabels === 'boolean' ? obj.showUnitLabels : defaults.showUnitLabels,
    uiAnimations: typeof obj.uiAnimations === 'boolean' ? obj.uiAnimations : defaults.uiAnimations,

    graphicsQuality,
    atmospherePreset,
    renderScale: clampNumber(obj.renderScale, 0.5, 1.0, defaults.renderScale),
    shadowsEnabled: typeof obj.shadowsEnabled === 'boolean' ? obj.shadowsEnabled : defaults.shadowsEnabled,
    particlesEnabled: typeof obj.particlesEnabled === 'boolean' ? obj.particlesEnabled : defaults.particlesEnabled,
    fogEnabled: typeof obj.fogEnabled === 'boolean' ? obj.fogEnabled : defaults.fogEnabled,
    repairVisualsActive:
      typeof obj.repairVisualsActive === 'boolean' ? obj.repairVisualsActive : defaults.repairVisualsActive,
    showFpsCounter: typeof obj.showFpsCounter === 'boolean' ? obj.showFpsCounter : defaults.showFpsCounter,

    muted: typeof obj.muted === 'boolean' ? obj.muted : defaults.muted,
    masterVolume: Math.round(clampNumber(obj.masterVolume, 0, 100, defaults.masterVolume)),
    sfxVolume: Math.round(clampNumber(obj.sfxVolume, 0, 100, defaults.sfxVolume)),
    uiAudioVolume: Math.round(clampNumber(obj.uiAudioVolume, 0, 100, defaults.uiAudioVolume)),
    alertAudioEnabled:
      typeof obj.alertAudioEnabled === 'boolean' ? obj.alertAudioEnabled : defaults.alertAudioEnabled,

    cameraPanSpeed: Number(clampNumber(obj.cameraPanSpeed, 0.4, 2.0, defaults.cameraPanSpeed).toFixed(2)),
    cameraZoomSensitivity: Number(
      clampNumber(obj.cameraZoomSensitivity, 0.4, 2.0, defaults.cameraZoomSensitivity).toFixed(2)
    ),
    invertScrollZoom: typeof obj.invertScrollZoom === 'boolean' ? obj.invertScrollZoom : defaults.invertScrollZoom,
    edgeScrollEnabled:
      typeof obj.edgeScrollEnabled === 'boolean' ? obj.edgeScrollEnabled : defaults.edgeScrollEnabled,
    touchTapToOrder: typeof obj.touchTapToOrder === 'boolean' ? obj.touchTapToOrder : defaults.touchTapToOrder,
    strategicOverviewDefault:
      typeof obj.strategicOverviewDefault === 'boolean'
        ? obj.strategicOverviewDefault
        : defaults.strategicOverviewDefault,
    aiDifficulty,

    keybindings,

    reducedMotion: typeof obj.reducedMotion === 'boolean' ? obj.reducedMotion : defaults.reducedMotion,
    highContrastHud: typeof obj.highContrastHud === 'boolean' ? obj.highContrastHud : defaults.highContrastHud,
    reducedFlashes: typeof obj.reducedFlashes === 'boolean' ? obj.reducedFlashes : defaults.reducedFlashes,
    largerTouchTargets:
      typeof obj.largerTouchTargets === 'boolean' ? obj.largerTouchTargets : defaults.largerTouchTargets,
  };
}

export function loadSettings(): GameSettings {
  if (typeof window === 'undefined') {
    return getDefaultSettings();
  }
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return getDefaultSettings();
    const parsed = JSON.parse(raw);
    return sanitizeSettings(parsed);
  } catch (err) {
    console.warn('[Settings] Failed to load settings from localStorage, falling back to defaults:', err);
    return getDefaultSettings();
  }
}

export function saveSettings(settings: GameSettings): void {
  if (typeof window === 'undefined') return;
  try {
    const sanitized = sanitizeSettings(settings);
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(sanitized));
  } catch (err) {
    console.warn('[Settings] Failed to persist settings to localStorage:', err);
  }
}

export function clearStoredSettings(): GameSettings {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(SETTINGS_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
  }
  return getDefaultSettings();
}

export function formatKeyCode(code: string): string {
  if (!code) return 'NONE';
  if (code.startsWith('Key')) return code.slice(3).toUpperCase();
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Space') return 'SPACE';
  if (code === 'Escape') return 'ESC';
  if (code.startsWith('Arrow')) return code.replace('Arrow', '').toUpperCase();
  return code.toUpperCase();
}
