import React, { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { TacticalRenderer } from './game/renderer';
import { soundEngine } from './game/audio';
import {
  AIDifficulty,
  AtmospherePreset,
  Base,
  BuildingType,
  ChatMessage,
  CombatEvent,
  EnvironmentObject,
  GraphicsQuality,
  HighwayExit,
  MapSectorConfig,
  PlayerProfile,
  TerrainType,
  Unit,
  UnitType,
} from './types/game';
import { UNIT_CATALOG } from './game/catalog';
import { TopBar } from './components/TopBar';
import { Minimap } from './components/Minimap';
import { CommandBar } from './components/CommandBar';
import { BaseDrawer } from './components/BaseDrawer';
import { TacticalChat } from './components/TacticalChat';
import { AllianceModal } from './components/AllianceModal';
import { IntelModal } from './components/IntelModal';
import { AdminModal } from './components/AdminModal';
import { TutorialModal } from './components/TutorialModal';
import { AuthModal } from './components/AuthModal';
import { ShortcutsModal } from './components/ShortcutsModal';
import { ProgressionModal } from './components/ProgressionModal';
import { SettingsModal } from './components/SettingsModal';
import { AdminPanel } from './components/admin/AdminPanel';
import {
  clearStoredSettings,
  GameSettings,
  getDefaultSettings,
  loadSettings,
  saveSettings,
} from './lib/settings';

export default function App() {
  const [isAdminRoute, setIsAdminRoute] = useState<boolean>(() =>
    window.location.pathname.startsWith('/admin')
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<TacticalRenderer | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const needsHomeFocusRef = useRef<boolean>(true);

  // Sync /admin URL navigation
  useEffect(() => {
    const handlePopState = () => {
      setIsAdminRoute(window.location.pathname.startsWith('/admin'));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const openAdminConsole = useCallback(() => {
    window.history.pushState({}, '', '/admin');
    setIsAdminRoute(true);
  }, []);

  const returnToBattlefield = useCallback(() => {
    window.history.pushState({}, '', '/');
    setIsAdminRoute(false);
  }, []);

  // Auth & Session Lifecycle ('checking' -> 'authenticated' | 'unauthenticated')
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('frontline_token'));
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [authStatus, setAuthStatus] = useState<'checking' | 'unauthenticated' | 'authenticated'>(() =>
    localStorage.getItem('frontline_token') ? 'checking' : 'unauthenticated'
  );
  const [connected, setConnected] = useState<boolean>(false);

  const isAuthenticated = authStatus === 'authenticated' && Boolean(token && profile);

  // World State (populated only when authenticated)
  const [maps, setMaps] = useState<MapSectorConfig[]>([]);
  const [currentMapId, setCurrentMapId] = useState<string>('map_riverfront_assault');
  const [highwayExits, setHighwayExits] = useState<HighwayExit[]>([]);
  const [terrain, setTerrain] = useState<TerrainType[][]>([]);
  const [bases, setBases] = useState<Base[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [envObjects, setEnvObjects] = useState<EnvironmentObject[]>([]);
  const [alliances, setAlliances] = useState<any[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [combatLogs, setCombatLogs] = useState<CombatEvent[]>([]);

  // Central Persistent Game Settings
  const [settings, setSettings] = useState<GameSettings>(() => loadSettings());
  const [showSettings, setShowSettings] = useState<boolean>(false);

  const updateSettings = useCallback((updater: (prev: GameSettings) => GameSettings) => {
    setSettings((prev) => {
      const next = updater(prev);
      saveSettings(next);
      return next;
    });
  }, []);

  const resetAllSettings = useCallback(() => {
    const defaults = clearStoredSettings();
    saveSettings(defaults);
    setSettings(defaults);
    setIsStrategicOverview(defaults.strategicOverviewDefault);
  }, []);

  const resetLayoutOnly = useCallback(() => {
    const defaults = getDefaultSettings();
    updateSettings((prev) => ({
      ...prev,
      uiScale: defaults.uiScale,
      compactHud: defaults.compactHud,
      showSubHeader: defaults.showSubHeader,
      showMinimap: defaults.showMinimap,
      minimapSize: defaults.minimapSize,
      showChat: defaults.showChat,
      showSquadBar: defaults.showSquadBar,
      showUnitLabels: defaults.showUnitLabels,
      uiAnimations: defaults.uiAnimations,
    }));
  }, [updateSettings]);

  // Selection, Commands & 3D Placement
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(new Set());
  const [selectedBaseId, setSelectedBaseId] = useState<string | null>(null);
  const [activeCommand, setActiveCommand] = useState<'move' | 'attack' | 'hold' | 'patrol' | 'retreat' | 'stop'>('move');
  const [controlGroups, setControlGroups] = useState<Record<number, string[]>>({});
  const [placingBuilding, setPlacingBuilding] = useState<{ baseId: string; buildingType: BuildingType } | null>(null);

  // Derived aliases synced with central settings
  const aiDifficulty = settings.aiDifficulty;
  const graphicsQuality = settings.graphicsQuality;
  const atmospherePreset = settings.atmospherePreset;
  const muted = settings.muted;
  const fogEnabled = settings.fogEnabled;
  const repairVisualsActive = settings.repairVisualsActive;

  // Modals & UI States
  const [isStrategicOverview, setIsStrategicOverview] = useState<boolean>(() => settings.strategicOverviewDefault);
  const [cameraCoords, setCameraCoords] = useState<{ x: number; y: number }>({ x: 16.8, y: 28.2 });
  const [showAdmin, setShowAdmin] = useState<boolean>(false);
  const [showAlliance, setShowAlliance] = useState<boolean>(false);
  const [showProgression, setShowProgression] = useState<boolean>(false);
  const [showIntel, setShowIntel] = useState<boolean>(false);
  const [showTutorial, setShowTutorial] = useState<boolean>(false);
  const [showShortcuts, setShowShortcuts] = useState<boolean>(false);
  const [notificationToast, setNotificationToast] = useState<{ title: string; message: string } | null>(null);

  // Apply root DOM attributes & soundEngine settings whenever settings change
  useEffect(() => {
    document.documentElement.dataset.uiScale = settings.uiScale;
    document.documentElement.dataset.reducedMotion = String(settings.reducedMotion);
    soundEngine.applySettings(settings);

    const r = rendererRef.current;
    if (r) {
      if (r.graphicsQuality !== settings.graphicsQuality) {
        r.setGraphicsQuality(settings.graphicsQuality);
      }
      if (r.atmospherePreset !== settings.atmospherePreset) {
        r.setAtmospherePreset(settings.atmospherePreset);
      }
      if (Math.abs(r.renderScale - settings.renderScale) > 0.01) {
        r.setRenderScale(settings.renderScale);
      }
      if (r.shadowsEnabled !== settings.shadowsEnabled) {
        r.setShadowsEnabled(settings.shadowsEnabled);
      }
      if (r.particlesEnabled !== settings.particlesEnabled) {
        r.setParticlesEnabled(settings.particlesEnabled);
      }
      r.fogEnabled = settings.fogEnabled;
      r.showRepairCranes = settings.repairVisualsActive;
      r.showUnitLabels = settings.showUnitLabels;
      r.reducedMotion = settings.reducedMotion;
      r.reducedFlashes = settings.reducedFlashes;
      r.showFpsCounter = settings.showFpsCounter;
    }
  }, [settings]);

  // Keys & Mouse tracking for 3D Camera
  const keysHeld = useRef<Set<string>>(new Set());
  const mousePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isRightDragging = useRef(false);
  const isMiddleRotating = useRef(false);
  const lastDragPos = useRef<{ x: number; y: number } | null>(null);
  const rightDragDistance = useRef(0);
  const lastClickTimeRef = useRef<number>(0);
  const lastClickedUnitTypeRef = useRef<UnitType | null>(null);

  // Helper: Clear all private gameplay state and return cleanly to 3D Battlefield Preview
  const clearSessionAndReturnToPreview = useCallback(() => {
    localStorage.removeItem('frontline_token');
    localStorage.removeItem('frontline_admin_token');
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setConnected(false);
    setToken(null);
    setProfile(null);
    setAuthStatus('unauthenticated');
    setBases([]);
    setUnits([]);
    setAlliances([]);
    setChatMessages([]);
    setCombatLogs([]);
    setSelectedUnitIds(new Set());
    setSelectedBaseId(null);
    setPlacingBuilding(null);
    setShowAdmin(false);
    setShowAlliance(false);
    setShowIntel(false);
    setShowTutorial(false);
    setShowShortcuts(false);
    keysHeld.current.clear();

    if (rendererRef.current) {
      rendererRef.current.setPreviewMode(true);
    }
  }, []);

  // 1. Verify Stored Token on Initial Load / Refresh (Never falls back to player_default)
  useEffect(() => {
    if (!token) {
      setProfile(null);
      setAuthStatus('unauthenticated');
      if (rendererRef.current) {
        rendererRef.current.setPreviewMode(true);
      }
      return;
    }

    // If profile is already verified for this session (e.g. from Login / Register / Guest), skip redundant check
    if (profile && authStatus === 'authenticated') {
      return;
    }

    let cancelled = false;
    setAuthStatus('checking');

    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) {
          if (!cancelled) {
            clearSessionAndReturnToPreview();
          }
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (data?.profile) {
          needsHomeFocusRef.current = true;
          setProfile(data.profile);
          setAuthStatus('authenticated');
        } else {
          clearSessionAndReturnToPreview();
        }
      })
      .catch(() => {
        if (!cancelled) {
          clearSessionAndReturnToPreview();
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token, profile, authStatus, clearSessionAndReturnToPreview]);

  // 2. Fetch World Terrain for 3D Battlefield (used by both 3D Preview and Gameplay)
  useEffect(() => {
    fetch('/api/world/terrain')
      .then((res) => res.json())
      .then((data) => {
        if (data.envObjects) {
          setEnvObjects(data.envObjects);
          if (rendererRef.current) {
            rendererRef.current.envObjects = data.envObjects;
          }
        }
        if (data.terrain) {
          setTerrain(data.terrain);
          if (rendererRef.current) {
            rendererRef.current.setTerrain(data.terrain);
          }
        }
      })
      .catch((err) => console.error('Failed to fetch terrain:', err));
  }, []);

  // 3. Connect Socket.IO ONLY When Authenticated
  useEffect(() => {
    if (!isAuthenticated || !token || !profile) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setConnected(false);
      return;
    }

    const socket = io('/', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      auth: { token },
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('world:join', { token });
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('auth:error', () => {
      clearSessionAndReturnToPreview();
    });

    socket.on('account:moderated', (payload?: { reason?: string }) => {
      clearSessionAndReturnToPreview();
      if (payload?.reason) {
        setNotificationToast({
          title: 'ACCOUNT ACCESS RESTRICTED',
          message: payload.reason,
        });
        setTimeout(() => setNotificationToast(null), 6000);
      }
    });

    socket.on('world:state', (state) => {
      const incomingBases: Base[] = state.bases || [];
      const incomingUnits: Unit[] = state.units || [];
      if (state.mapId) setCurrentMapId(state.mapId);
      if (state.maps) setMaps(state.maps);
      if (state.highwayExits) setHighwayExits(state.highwayExits);
      setBases(incomingBases);
      setUnits(incomingUnits);
      if (state.envObjects) {
        setEnvObjects(state.envObjects);
        if (rendererRef.current) {
          rendererRef.current.envObjects = state.envObjects;
        }
      }
      if (state.terrain) {
        setTerrain(state.terrain);
        if (rendererRef.current) {
          rendererRef.current.setTerrain(state.terrain);
        }
      }
      setAlliances(state.alliances || []);
      setChatMessages(state.chat || []);

      // Smoothly focus 3D camera onto the authenticated player's home base upon entering theater
      if (needsHomeFocusRef.current && rendererRef.current) {
        const homeBase =
          incomingBases.find((b) => b.id === profile.homeBaseId) ||
          incomingBases.find((b) => b.ownerId === profile.id && b.type === 'home') ||
          incomingBases.find((b) => b.ownerId === profile.id);
        const firstPlayerUnit = incomingUnits.find((u) => u.ownerId === profile.id);
        if (homeBase) {
          rendererRef.current.setPreviewMode(false);
          rendererRef.current.focusOn(homeBase.x, homeBase.y);
          setCameraCoords({ x: homeBase.x, y: homeBase.y });
          needsHomeFocusRef.current = false;
        } else if (firstPlayerUnit) {
          rendererRef.current.setPreviewMode(false);
          rendererRef.current.focusOn(firstPlayerUnit.x, firstPlayerUnit.y);
          setCameraCoords({ x: firstPlayerUnit.x, y: firstPlayerUnit.y });
          needsHomeFocusRef.current = false;
        }
      }
    });

    socket.on('world:sync', (sync) => {
      if (sync.bases) setBases(sync.bases);
      if (sync.units) setUnits(sync.units);
      if (sync.highwayExits) setHighwayExits(sync.highwayExits);
    });

    socket.on('combat:event', (evt: CombatEvent) => {
      setCombatLogs((prev) => [...prev.slice(-40), evt]);
      if (rendererRef.current) {
        rendererRef.current.addCombatEvent(evt);
      }

      if (evt.attackerType.includes('mbt') || evt.attackerType.includes('howitzer')) {
        soundEngine.playCannonShot();
      } else if (
        evt.attackerType.includes('sam') ||
        evt.attackerType.includes('cobra') ||
        evt.attackerType.includes('jet')
      ) {
        soundEngine.playMissileLaunch();
      } else {
        soundEngine.playMachineGun();
      }
      if (evt.isFatal) {
        soundEngine.playExplosion();
      }
    });

    socket.on('unit:spawn', (newUnit: Unit) => {
      setUnits((prev) => [...prev, newUnit]);
      soundEngine.playBuildComplete();
    });

    socket.on('base:neutralized', (data: { baseId: string; baseName?: string; previousOwnerName?: string }) => {
      soundEngine.playExplosion();
      setNotificationToast({
        title: 'BASE NEUTRALIZED!',
        message: `${data.baseName || 'Sector Base'} defenses have collapsed and is now OPEN FOR CONQUEST!`,
      });
      setTimeout(() => setNotificationToast(null), 5000);
      setBases((prev) =>
        prev.map((b) =>
          b.id === data.baseId
            ? {
                ...b,
                ownerId: 'neutral',
                ownerName: 'Neutral Territory',
                previousOwnerName: data.previousOwnerName || b.ownerName,
                lifecycleState: 'neutralized',
                health: 0,
                defenseShield: 0,
                activeTurretsCount: 0,
                captureProgress: 0,
                capturingPlayerId: null,
              }
            : b
        )
      );
    });

    socket.on('base:captured', (data: { baseId: string; baseName?: string; newOwnerId: string; newOwnerName: string }) => {
      soundEngine.playCaptureSuccess();
      setNotificationToast({
        title: 'BASE CAPTURED!',
        message: `${data.newOwnerName} has seized control of ${data.baseName || 'sector base'}!`,
      });
      setTimeout(() => setNotificationToast(null), 5000);
      setBases((prev) =>
        prev.map((b) =>
          b.id === data.baseId
            ? {
                ...b,
                ownerId: data.newOwnerId,
                ownerName: data.newOwnerName,
                lifecycleState: 'active',
                health: Math.round(b.maxHealth * 0.5),
                defenseShield: Math.round(b.maxShield * 0.25),
                captureProgress: 0,
                capturingPlayerId: null,
                captureBlockedReason: undefined,
              }
            : b
        )
      );
    });

    socket.on('notification:new', (notif) => {
      setNotificationToast({ title: notif.title, message: notif.message });
      setTimeout(() => setNotificationToast(null), 5000);
    });

    socket.on('chat:message', (msg: ChatMessage) => {
      setChatMessages((prev) => [...prev.slice(-60), msg]);
    });

    socket.on('alliance:update', (alliance) => {
      setAlliances((prev) => {
        const idx = prev.findIndex((a) => a.id === alliance.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = alliance;
          return updated;
        }
        return [...prev, alliance];
      });
    });

    return () => {
      socket.disconnect();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [isAuthenticated, token, profile?.id, profile?.homeBaseId, clearSessionAndReturnToPreview]);

  // --- COMMAND HELPERS ---

  const jumpToHome = useCallback(() => {
    if (!isAuthenticated || !profile?.id) return;
    const homeBase =
      bases.find((b) => b.id === profile.homeBaseId) ||
      bases.find((b) => b.ownerId === profile.id && b.type === 'home') ||
      bases.find((b) => b.ownerId === profile.id);
    if (homeBase && rendererRef.current) {
      rendererRef.current.focusOn(homeBase.x, homeBase.y);
      setCameraCoords({ x: homeBase.x, y: homeBase.y });
      soundEngine.playCommandAck();
    }
  }, [isAuthenticated, bases, profile]);

  const jumpToCoords = useCallback(
    (x: number, y: number) => {
      if (!isAuthenticated || !rendererRef.current) return;
      rendererRef.current.focusOn(x, y);
      setCameraCoords({ x, y });
      soundEngine.playCommandAck();
    },
    [isAuthenticated]
  );

  const issueUnitCommand = useCallback(
    (
      command: 'move' | 'attack' | 'hold' | 'patrol' | 'retreat' | 'stop',
      targetX?: number,
      targetY?: number,
      targetUnitId?: string,
      targetBaseId?: string
    ) => {
      if (!isAuthenticated || selectedUnitIds.size === 0 || !socketRef.current) return;

      socketRef.current.emit('unit:command', {
        unitIds: Array.from(selectedUnitIds),
        command,
        targetX,
        targetY,
        targetUnitId,
        targetBaseId,
      });
      soundEngine.playCommandAck();
    },
    [isAuthenticated, selectedUnitIds]
  );

  // 4. Initialize Single Three.js 3D Tactical Renderer Instance (shared across Preview & Gameplay)
  useEffect(() => {
    if (isAdminRoute || !canvasRef.current) return;
    const canvas = canvasRef.current;

    const renderer = new TacticalRenderer(canvas);
    rendererRef.current = renderer;

    // Apply initial persisted settings
    renderer.renderScale = settings.renderScale;
    renderer.shadowsEnabled = settings.shadowsEnabled;
    renderer.particlesEnabled = settings.particlesEnabled;
    renderer.fogEnabled = settings.fogEnabled;
    renderer.showRepairCranes = settings.repairVisualsActive;
    renderer.showUnitLabels = settings.showUnitLabels;
    renderer.reducedMotion = settings.reducedMotion;
    renderer.reducedFlashes = settings.reducedFlashes;
    renderer.showFpsCounter = settings.showFpsCounter;
    renderer.setGraphicsQuality(settings.graphicsQuality);
    renderer.setAtmospherePreset(settings.atmospherePreset);

    renderer.setPreviewMode(!isAuthenticated);
    renderer.startRenderLoop();

    if (terrain.length > 0) {
      renderer.setTerrain(terrain);
    }

    const handleResize = () => {
      if (rendererRef.current && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        rendererRef.current.resize(
          rect.width || window.innerWidth,
          rect.height || window.innerHeight
        );
      }
    };

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        handleResize();
      });
      resizeObserver.observe(canvas);
    }
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      renderer.stopRenderLoop();
      rendererRef.current = null;
    };
  }, [isAdminRoute]);

  // Synchronize Renderer Mode & World State on Auth / World Updates
  useEffect(() => {
    if (isAdminRoute || !rendererRef.current) return;

    if (!isAuthenticated || !profile) {
      rendererRef.current.setPreviewMode(true);
      return;
    }

    rendererRef.current.setPreviewMode(false);
    rendererRef.current.updateWorld(
      bases,
      units,
      profile.id,
      profile.allianceId,
      envObjects,
      highwayExits
    );
    rendererRef.current.selectedUnitIds = selectedUnitIds;
    rendererRef.current.selectedBaseId = selectedBaseId;
    rendererRef.current.fogEnabled = fogEnabled;
    rendererRef.current.showRepairCranes = repairVisualsActive;
    rendererRef.current.isStrategicOverview = isStrategicOverview;
  }, [
    isAdminRoute,
    isAuthenticated,
    bases,
    units,
    profile,
    selectedUnitIds,
    selectedBaseId,
    fogEnabled,
    envObjects,
    highwayExits,
    repairVisualsActive,
    isStrategicOverview,
  ]);

  // 5. Continuous Keyboard Camera Pan & Rotation Loop ( strictly disabled while unauthenticated )
  useEffect(() => {
    if (!isAuthenticated) {
      keysHeld.current.clear();
      return;
    }

    let animId: number;
    let lastTime = performance.now();

    const panLoop = (time: number) => {
      const dt = Math.min(2.0, (time - lastTime) / 16.67);
      lastTime = time;

      const renderer = rendererRef.current;
      if (renderer && !renderer.isPreviewMode) {
        let forward = 0;
        let strafe = 0;
        if (keysHeld.current.has('KeyW') || keysHeld.current.has('ArrowUp')) forward -= 1;
        if (keysHeld.current.has('KeyS') || keysHeld.current.has('ArrowDown')) forward += 1;
        if (keysHeld.current.has('KeyA') || keysHeld.current.has('ArrowLeft')) strafe -= 1;
        if (keysHeld.current.has('KeyD') || keysHeld.current.has('ArrowRight')) strafe += 1;

        // Optional Desktop Screen-Edge Panning
        if (
          settings.edgeScrollEnabled &&
          !showSettings &&
          mousePos.current.x > 0 &&
          mousePos.current.y > 0
        ) {
          const edgeThreshold = 22;
          if (mousePos.current.x <= edgeThreshold) strafe -= 0.7;
          else if (mousePos.current.x >= window.innerWidth - edgeThreshold) strafe += 0.7;
          if (mousePos.current.y <= edgeThreshold) forward -= 0.7;
          else if (mousePos.current.y >= window.innerHeight - edgeThreshold) forward += 0.7;
        }

        if (keysHeld.current.has('KeyQ')) renderer.cameraYaw -= 0.028 * dt;
        if (keysHeld.current.has('KeyE')) renderer.cameraYaw += 0.028 * dt;

        if (forward !== 0 || strafe !== 0) {
          const mag = Math.hypot(forward, strafe);
          const speed = ((0.52 * settings.cameraPanSpeed * dt) / Math.max(0.5, renderer.zoom));
          const nf = forward / mag;
          const ns = strafe / mag;

          const cosY = Math.cos(renderer.cameraYaw);
          const sinY = Math.sin(renderer.cameraYaw);

          renderer.cameraX += (ns * cosY + nf * sinY) * speed;
          renderer.cameraY += (nf * cosY - ns * sinY) * speed;

          renderer.cameraX = Math.max(0, Math.min(100, renderer.cameraX));
          renderer.cameraY = Math.max(0, Math.min(75, renderer.cameraY));
          setCameraCoords({ x: renderer.cameraX, y: renderer.cameraY });
        }
      }
      animId = requestAnimationFrame(panLoop);
    };
    animId = requestAnimationFrame(panLoop);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (showSettings) return;
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

      if (
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'PageUp', 'PageDown', 'Home', 'End'].includes(
          e.code
        )
      ) {
        e.preventDefault();
      }

      keysHeld.current.add(e.code);

      // Number keys 1-9 for Squad Control Groups
      if (e.key >= '1' && e.key <= '9') {
        const groupNum = parseInt(e.key, 10);
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          setControlGroups((prev) => ({
            ...prev,
            [groupNum]: Array.from(selectedUnitIds),
          }));
          soundEngine.playCommandAck();
        } else {
          const unitIds = controlGroups[groupNum] || [];
          if (unitIds.length > 0) {
            setSelectedUnitIds(new Set(unitIds));
            setSelectedBaseId(null);
            soundEngine.playCommandAck();
          }
        }
      }

      const kb = settings.keybindings;

      // Customizable Hotkey Shortcuts
      if (e.code === kb.moveCommand) setActiveCommand('move');
      if (e.code === kb.attackCommand) setActiveCommand('attack');
      if (e.code === kb.holdCommand) {
        setActiveCommand('hold');
        issueUnitCommand('hold');
      }
      if (e.code === kb.patrolCommand) setActiveCommand('patrol');
      if (e.code === kb.stopCommand) {
        setActiveCommand('stop');
        issueUnitCommand('stop');
      }
      if (e.code === kb.resetNorth && rendererRef.current) {
        rendererRef.current.cameraYaw = 0;
        rendererRef.current.cameraPitch = 0.92;
      }
      if (e.code === kb.strategicOverview) {
        setIsStrategicOverview((prev) => !prev);
      }
      if (e.code === kb.toggleFog) {
        updateSettings((prev) => ({ ...prev, fogEnabled: !prev.fogEnabled }));
      }
      if (e.code === kb.focusUnit) {
        const firstId = Array.from(selectedUnitIds)[0];
        const u = units.find((unit) => unit.id === firstId);
        if (u) jumpToCoords(u.x, u.y);
      }
      if (e.code === kb.toggleRepair) {
        const nextState = !repairVisualsActive;
        updateSettings((prev) => ({ ...prev, repairVisualsActive: nextState }));
        setNotificationToast({
          title: 'REPAIR VISUALS',
          message: nextState ? 'Repair activity ENABLED' : 'Repair activity HIDDEN',
        });
        setTimeout(() => setNotificationToast(null), 2000);
      }
      if (e.code === kb.jumpHome) {
        e.preventDefault();
        jumpToHome();
      }

      if (e.code === 'Enter') {
        const chatInput = document.getElementById('tactical-chat-input');
        if (chatInput) chatInput.focus();
      }
      if (e.code === 'F11') {
        e.preventDefault();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      }
      if (e.code === 'Home') {
        if (!profile?.id) return;
        const myUnits = units.filter((u) => u.ownerId === profile.id);
        setSelectedUnitIds(new Set(myUnits.map((u) => u.id)));
        setSelectedBaseId(null);
        soundEngine.playCommandAck();
      }
      if (e.code === 'End') {
        setActiveCommand('stop');
        issueUnitCommand('stop');
      }
      if (e.code === 'PageUp') {
        if (rendererRef.current) {
          rendererRef.current.flashUnitsUntil = Date.now() + 3500;
        }
      }
      if (e.code === 'PageDown') {
        if (rendererRef.current && socketRef.current) {
          const worldPos = rendererRef.current.screenToWorld(mousePos.current.x, mousePos.current.y);
          const x = Math.round(worldPos.x);
          const y = Math.round(worldPos.y);
          socketRef.current.emit('chat:send', {
            content: `Tactical Coordinates: X ${x}, Y ${y}`,
            channel: 'global',
            coords: { x, y },
          });
        }
      }
      if (e.code === 'Escape') {
        if (placingBuilding) {
          setPlacingBuilding(null);
          if (rendererRef.current) rendererRef.current.placementGhost = null;
        } else {
          setSelectedUnitIds(new Set());
          setSelectedBaseId(null);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysHeld.current.delete(e.code);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [
    isAuthenticated,
    selectedUnitIds,
    controlGroups,
    repairVisualsActive,
    profile,
    units,
    jumpToHome,
    jumpToCoords,
    issueUnitCommand,
    placingBuilding,
    settings.cameraPanSpeed,
    settings.edgeScrollEnabled,
    settings.keybindings,
    showSettings,
    updateSettings,
  ]);

  // 6. Canvas Mouse & Pointer Event Handlers (strictly blocked in unauthenticated preview mode)
  const isBoxSelecting = useRef(false);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isAuthenticated) return;

    // Middle-click or Alt+Left-click orbits 3D camera
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      isMiddleRotating.current = true;
      lastDragPos.current = { x: e.clientX, y: e.clientY };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    if (e.button === 0) {
      // Check if in 3D Building Placement Mode
      if (placingBuilding && rendererRef.current) {
        const ghost = rendererRef.current.placementGhost;
        const base = bases.find((b) => b.id === placingBuilding.baseId);
        if (ghost && ghost.isValid && base) {
          const offsetX = Math.round((ghost.worldX - base.x) * 10) / 10;
          const offsetY = Math.round((ghost.worldY - base.y) * 10) / 10;
          handleBuild(base.id, placingBuilding.buildingType, offsetX, offsetY);
          setPlacingBuilding(null);
          rendererRef.current.placementGhost = null;
        } else {
          soundEngine.playExplosion();
        }
        return;
      }

      dragStartPos.current = { x: e.clientX, y: e.clientY };
      isBoxSelecting.current = false;
    } else if (e.button === 2) {
      if (placingBuilding && rendererRef.current) {
        setPlacingBuilding(null);
        rendererRef.current.placementGhost = null;
        return;
      }
      isRightDragging.current = true;
      lastDragPos.current = { x: e.clientX, y: e.clientY };
      rightDragDistance.current = 0;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isAuthenticated) return;
    const renderer = rendererRef.current;
    if (!renderer) return;
    mousePos.current = { x: e.clientX, y: e.clientY };

    // Update 3D Building Placement Ghost if active
    if (placingBuilding) {
      const worldPos = renderer.screenToWorld(e.clientX, e.clientY);
      const base = bases.find((b) => b.id === placingBuilding.baseId);
      if (base) {
        const validation = renderer.validateBuildingPlacement(
          base,
          placingBuilding.buildingType,
          worldPos.x,
          worldPos.y
        );
        renderer.placementGhost = {
          baseId: base.id,
          buildingType: placingBuilding.buildingType,
          worldX: worldPos.x,
          worldY: worldPos.y,
          isValid: validation.isValid,
          reason: validation.reason,
        };
      }
      return;
    }

    // 1. Middle-Mouse / Alt-Drag 3D Camera Orbit & Pitch
    if (isMiddleRotating.current && lastDragPos.current) {
      const dx = e.clientX - lastDragPos.current.x;
      const dy = e.clientY - lastDragPos.current.y;
      renderer.cameraYaw += dx * 0.0065;
      renderer.cameraPitch = Math.max(0.52, Math.min(1.42, renderer.cameraPitch + dy * 0.005));
      lastDragPos.current = { x: e.clientX, y: e.clientY };
      return;
    }

    // 2. Right-Click Camera Panning
    if (isRightDragging.current && lastDragPos.current) {
      const dx = e.clientX - lastDragPos.current.x;
      const dy = e.clientY - lastDragPos.current.y;
      rightDragDistance.current += Math.hypot(dx, dy);

      const scale = (38 * renderer.zoom) / Math.max(0.4, settings.cameraPanSpeed);
      const cosY = Math.cos(renderer.cameraYaw);
      const sinY = Math.sin(renderer.cameraYaw);

      const moveX = -dx / scale;
      const moveZ = -dy / scale;

      renderer.cameraX += moveX * cosY + moveZ * sinY;
      renderer.cameraY += moveZ * cosY - moveX * sinY;

      renderer.cameraX = Math.max(0, Math.min(100, renderer.cameraX));
      renderer.cameraY = Math.max(0, Math.min(75, renderer.cameraY));
      setCameraCoords({ x: renderer.cameraX, y: renderer.cameraY });

      lastDragPos.current = { x: e.clientX, y: e.clientY };
      return;
    }

    // 3. Left-Click Box Selection
    if (dragStartPos.current && e.buttons === 1) {
      const dist = Math.hypot(e.clientX - dragStartPos.current.x, e.clientY - dragStartPos.current.y);
      if (dist > 8) {
        isBoxSelecting.current = true;
        renderer.selectionBox = {
          startX: dragStartPos.current.x,
          startY: dragStartPos.current.y,
          currentX: e.clientX,
          currentY: e.clientY,
        };
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isAuthenticated) return;
    const renderer = rendererRef.current;
    if (!renderer) return;

    if (isMiddleRotating.current) {
      isMiddleRotating.current = false;
      lastDragPos.current = null;
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      return;
    }

    if (e.button === 0) {
      if (placingBuilding) return;

      const currentUserId = profile?.id || '';

      if (isBoxSelecting.current && dragStartPos.current) {
        const insideUnits = renderer.getUnitsInScreenBox(
          dragStartPos.current.x,
          dragStartPos.current.y,
          e.clientX,
          e.clientY,
          currentUserId
        );

        if (insideUnits.length > 0) {
          setSelectedUnitIds(new Set(insideUnits.map((u) => u.id)));
          setSelectedBaseId(null);
          soundEngine.playCommandAck();
        }
      } else {
        // Single or Double click selection in 3D space
        const picked = renderer.pickEntityAtScreen(e.clientX, e.clientY);

        if (picked && picked.kind === 'unit') {
          const clickedUnit = picked.unit;
          // On touch devices with Touch Tap-to-Order enabled, tapping a hostile unit attacks it
          if (
            e.pointerType === 'touch' &&
            settings.touchTapToOrder &&
            selectedUnitIds.size > 0 &&
            clickedUnit.ownerId !== currentUserId
          ) {
            issueUnitCommand('attack', undefined, undefined, clickedUnit.id);
          } else {
            const now = Date.now();
            const isDoubleClick =
              now - lastClickTimeRef.current < 320 && lastClickedUnitTypeRef.current === clickedUnit.type;
            lastClickTimeRef.current = now;
            lastClickedUnitTypeRef.current = clickedUnit.type;

            if (isDoubleClick && clickedUnit.ownerId === currentUserId) {
              const sameTypeUnits = units.filter(
                (u) => u.ownerId === currentUserId && u.type === clickedUnit.type
              );
              setSelectedUnitIds(new Set(sameTypeUnits.map((u) => u.id)));
              setSelectedBaseId(null);
            } else if (e.shiftKey) {
              setSelectedUnitIds((prev) => {
                const next = new Set(prev);
                if (next.has(clickedUnit.id)) next.delete(clickedUnit.id);
                else next.add(clickedUnit.id);
                return next;
              });
            } else {
              setSelectedUnitIds(new Set([clickedUnit.id]));
              setSelectedBaseId(null);
            }
            soundEngine.playCommandAck();
          }
        } else if (picked && picked.kind === 'base') {
          if (
            e.pointerType === 'touch' &&
            settings.touchTapToOrder &&
            selectedUnitIds.size > 0 &&
            picked.base.ownerId !== currentUserId
          ) {
            if (picked.base.lifecycleState === 'neutralized' || picked.base.ownerId === 'neutral') {
              issueUnitCommand('move', picked.base.x, picked.base.y);
            } else {
              issueUnitCommand('attack', undefined, undefined, undefined, picked.base.id);
            }
          } else {
            setSelectedBaseId(picked.base.id);
            setSelectedUnitIds(new Set());
            soundEngine.playCommandAck();
          }
        } else {
          if (e.pointerType === 'touch' && settings.touchTapToOrder && selectedUnitIds.size > 0) {
            const worldPos = renderer.screenToWorld(e.clientX, e.clientY);
            issueUnitCommand(
              activeCommand === 'attack' ? 'attack' : activeCommand === 'patrol' ? 'patrol' : 'move',
              worldPos.x,
              worldPos.y
            );
          } else if (!e.shiftKey) {
            setSelectedUnitIds(new Set());
            setSelectedBaseId(null);
          }
        }
      }

      renderer.selectionBox = null;
      isBoxSelecting.current = false;
      dragStartPos.current = null;
    } else if (e.button === 2) {
      isRightDragging.current = false;
      lastDragPos.current = null;
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    }
  };

  const handleContextMenu = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isAuthenticated) return;
    const renderer = rendererRef.current;
    if (!renderer) return;

    if (rightDragDistance.current > 12) return;
    if (selectedUnitIds.size === 0) return;

    const currentUserId = profile?.id;
    if (!currentUserId) return;
    const picked = renderer.pickEntityAtScreen(e.clientX, e.clientY);

    if (picked && picked.kind === 'unit' && picked.unit.ownerId !== currentUserId) {
      issueUnitCommand('attack', undefined, undefined, picked.unit.id);
      return;
    }

    if (picked && picked.kind === 'base' && picked.base.ownerId !== currentUserId) {
      if (picked.base.lifecycleState === 'neutralized' || picked.base.ownerId === 'neutral') {
        issueUnitCommand('move', picked.base.x, picked.base.y);
      } else {
        issueUnitCommand('attack', undefined, undefined, undefined, picked.base.id);
      }
      return;
    }

    const worldPos = renderer.screenToWorld(e.clientX, e.clientY);
    issueUnitCommand(
      activeCommand === 'attack' ? 'attack' : activeCommand === 'patrol' ? 'patrol' : 'move',
      worldPos.x,
      worldPos.y
    );
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (!isAuthenticated) return;
    const renderer = rendererRef.current;
    if (!renderer) return;
    const rawDir = e.deltaY < 0 ? 1 : -1;
    const dir = settings.invertScrollZoom ? -rawDir : rawDir;
    const delta = dir * 0.12 * settings.cameraZoomSensitivity;
    renderer.zoom = Math.max(0.45, Math.min(2.4, renderer.zoom + delta));
  };

  // Base actions
  const handleBuild = (baseId: string, buildingType: BuildingType, offsetX?: number, offsetY?: number) => {
    if (!isAuthenticated) return;
    socketRef.current?.emit('base:build', { baseId, buildingType, offsetX, offsetY }, (res: any) => {
      if (res?.success) soundEngine.playBuildComplete();
    });
  };

  const handleStartPlaceBuilding3D = (baseId: string, buildingType: BuildingType) => {
    if (!isAuthenticated) return;
    const base = bases.find((b) => b.id === baseId);
    if (base && rendererRef.current) {
      rendererRef.current.focusOn(base.x, base.y);
      setCameraCoords({ x: base.x, y: base.y });
    }
    setPlacingBuilding({ baseId, buildingType });
    setNotificationToast({
      title: '3D FACILITY PLACEMENT',
      message: 'Left-click inside base perimeter to construct, Right-click or Esc to cancel.',
    });
    setTimeout(() => setNotificationToast(null), 4000);
  };

  const handleProduceUnit = (baseId: string, unitType: UnitType) => {
    if (!isAuthenticated) return;
    socketRef.current?.emit('base:produce_unit', { baseId, unitType }, (res: any) => {
      if (res?.success) soundEngine.playBuildComplete();
    });
  };

  const handleRepairBase = (baseId: string) => {
    if (!isAuthenticated) return;
    socketRef.current?.emit('base:repair', { baseId }, (res: any) => {
      if (res?.success) soundEngine.playBuildComplete();
    });
  };

  const handleCancelBuild = (baseId: string, orderId: string) => {
    if (!isAuthenticated) return;
    socketRef.current?.emit('base:cancel_build', { baseId, orderId }, (res: any) => {
      if (res?.success) {
        soundEngine.playCommandAck();
        setNotificationToast({
          title: 'CONSTRUCTION CANCELLED',
          message: 'Construction order cancelled and 100% resources refunded.',
        });
        setTimeout(() => setNotificationToast(null), 3000);
      }
    });
  };

  const handleCancelUnit = (baseId: string, orderId: string) => {
    if (!isAuthenticated) return;
    socketRef.current?.emit('base:cancel_unit', { baseId, orderId }, (res: any) => {
      if (res?.success) {
        soundEngine.playCommandAck();
        setNotificationToast({
          title: 'UNIT PRODUCTION CANCELLED',
          message: 'Unit training cancelled and 100% resources refunded.',
        });
        setTimeout(() => setNotificationToast(null), 3000);
      }
    });
  };

  const handleRepairBuilding = (baseId: string, buildingId?: string) => {
    if (!isAuthenticated) return;
    socketRef.current?.emit('base:repair_building', { baseId, buildingId }, (res: any) => {
      if (res?.success) {
        soundEngine.playBuildComplete();
      } else if (res?.error) {
        setNotificationToast({
          title: 'REPAIR BLOCKED',
          message: res.error,
        });
        setTimeout(() => setNotificationToast(null), 3500);
      }
    });
  };

  const handleChangeHomeMap = (targetMapId: string) => {
    if (!isAuthenticated || !socketRef.current) return;
    socketRef.current.emit('base:change_home_map', { targetMapId }, (res: any) => {
      if (res?.success) {
        soundEngine.playCommandAck();
        needsHomeFocusRef.current = true;
        setCurrentMapId(targetMapId);
        if (profile) {
          setProfile({
            ...profile,
            currentMapId: targetMapId,
            homeMapId: targetMapId,
            homeBaseCoords: res.base ? { x: res.base.x, y: res.base.y } : profile.homeBaseCoords,
            homeMapChangeCooldownUntil: Date.now() + 5 * 60 * 1000,
          });
        }
        setNotificationToast({
          title: 'HOME BASE RELOCATED',
          message: res.message || 'Command Headquarters relocated to target sector.',
        });
        setTimeout(() => setNotificationToast(null), 4500);
      } else if (res?.error) {
        setNotificationToast({
          title: 'HQ RELOCATION BLOCKED',
          message: res.error,
        });
        setTimeout(() => setNotificationToast(null), 4500);
      }
    });
  };

  const handleChangeAiDifficulty = (difficulty: AIDifficulty) => {
    if (!isAuthenticated) return;
    updateSettings((prev) => ({ ...prev, aiDifficulty: difficulty }));
    socketRef.current?.emit('ai:difficulty', { difficulty });
    setNotificationToast({
      title: 'AI COMMANDER UPDATED',
      message: `Kodiak PMC tactical AI set to ${difficulty.toUpperCase()} difficulty.`,
    });
    setTimeout(() => setNotificationToast(null), 3000);
  };

  const handleResetSkirmish = () => {
    if (!isAuthenticated) return;
    socketRef.current?.emit('world:reset_skirmish', {}, () => {
      setSelectedUnitIds(new Set());
      setSelectedBaseId(null);
      jumpToHome();
      setNotificationToast({
        title: 'NEW SKIRMISH INITIALIZED',
        message: 'All sectors, bases, and forces reset to starting frontline positions.',
      });
      setTimeout(() => setNotificationToast(null), 3500);
    });
  };

  // Multi-Sector Map Switcher & Highway Redeployment
  const handleSwitchMap = useCallback(
    (targetMapId: string) => {
      if (!isAuthenticated || !socketRef.current) return;
      needsHomeFocusRef.current = true;
      setSelectedUnitIds(new Set());
      setSelectedBaseId(null);
      setCurrentMapId(targetMapId);
      if (profile) {
        setProfile({ ...profile, currentMapId: targetMapId });
      }
      socketRef.current.emit('world:switch_map', { mapId: targetMapId }, (res: any) => {
        if (res?.success) {
          soundEngine.playCommandAck();
          const mapName = maps.find((m) => m.id === targetMapId)?.name || targetMapId;
          setNotificationToast({
            title: 'SECTOR TELEMETRY SWITCHED',
            message: `Now viewing ${mapName}.`,
          });
          setTimeout(() => setNotificationToast(null), 3000);
        }
      });
    },
    [isAuthenticated, profile, maps]
  );

  const handleHighwayTransfer = useCallback(
    (targetMapId: string) => {
      if (!isAuthenticated || selectedUnitIds.size === 0 || !socketRef.current) return;
      const unitIds = Array.from(selectedUnitIds);
      socketRef.current.emit('unit:transfer_map', { unitIds, targetMapId }, (res: any) => {
        if (res?.success) {
          soundEngine.playCommandAck();
          setSelectedUnitIds(new Set());
          setNotificationToast({
            title: 'HIGHWAY TRANSIT COMPLETE',
            message: res.message || `Transferred ${res.transferredCount} unit(s) to destination sector.`,
          });
          setTimeout(() => setNotificationToast(null), 4500);
          handleSwitchMap(targetMapId);
        } else if (res?.error) {
          const exit = highwayExits.find((ex) => ex.targetMapId === targetMapId);
          if (exit && res.error.includes('Move selected units')) {
            issueUnitCommand('move', exit.x, exit.y);
            setNotificationToast({
              title: 'EN ROUTE TO HIGHWAY CHECKPOINT',
              message: `Marching selected convoy to ${exit.name} (X:${exit.x}, Y:${exit.y}). Click transfer again on arrival.`,
            });
          } else {
            setNotificationToast({
              title: 'HIGHWAY TRANSIT BLOCKED',
              message: res.error,
            });
          }
          setTimeout(() => setNotificationToast(null), 5000);
        }
      });
    },
    [isAuthenticated, selectedUnitIds, handleSwitchMap, highwayExits, issueUnitCommand]
  );

  // Alliance actions
  const handleCreateAlliance = (name: string, tag: string, description: string) => {
    if (!isAuthenticated) return;
    socketRef.current?.emit('alliance:create', { name, tag, description }, (res: any) => {
      if (res?.success && profile) {
        setProfile({ ...profile, allianceId: res.alliance.id, allianceRole: 'leader' });
      }
    });
  };

  const handleJoinAlliance = (allianceId: string) => {
    if (!isAuthenticated) return;
    socketRef.current?.emit('alliance:join', { allianceId }, (res: any) => {
      if (res?.success && profile) {
        setProfile({ ...profile, allianceId, allianceRole: 'member' });
      } else if (res?.requested) {
        setNotificationToast({
          title: 'JOIN REQUEST DISPATCHED',
          message: res.message || 'Alliance officers notified.',
        });
        setTimeout(() => setNotificationToast(null), 3500);
      } else if (res?.error) {
        setNotificationToast({
          title: 'ALLIANCE OPERATION FAILED',
          message: res.error,
        });
        setTimeout(() => setNotificationToast(null), 3500);
      }
    });
  };

  const handleLeaveAlliance = () => {
    if (!isAuthenticated || !profile) return;
    socketRef.current?.emit('alliance:leave', {}, (res: any) => {
      if (res?.success) {
        setProfile({ ...profile, allianceId: undefined, allianceRole: undefined });
        setNotificationToast({
          title: 'ALLIANCE DEPARTURE',
          message: res.message || 'You have left the alliance.',
        });
        setTimeout(() => setNotificationToast(null), 3500);
      }
    });
  };

  const handleLogout = useCallback(() => {
    if (token) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    clearSessionAndReturnToPreview();
  }, [token, clearSessionAndReturnToPreview]);

  // Admin Sandbox tools
  const handleAdminSpawn = (unitType: UnitType, isHostile: boolean) => {
    if (!isAuthenticated || !profile?.id) return;
    const renderer = rendererRef.current;
    const targetX = Math.round(renderer ? renderer.cameraX + (Math.random() * 4 - 2) : 20);
    const targetY = Math.round(renderer ? renderer.cameraY + (Math.random() * 4 - 2) : 28);
    const ownerId = isHostile ? 'enemy_insurgent' : profile.id;
    const authToken = localStorage.getItem('frontline_admin_token') || token || '';
    if (!authToken) return;

    fetch('/api/admin/spawn_unit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ unitType, x: targetX, y: targetY, ownerId }),
    }).catch(console.error);
  };

  const handleAdminBoost = (amount: number) => {
    if (!isAuthenticated || !profile?.id) return;
    const homeBase = bases.find((b) => b.ownerId === profile.id);
    const authToken = localStorage.getItem('frontline_admin_token') || token || '';
    if (!authToken || !homeBase) return;
    fetch('/api/admin/boost_resources', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ baseId: homeBase.id, amount }),
    }).catch(console.error);
  };

  const handleAdminRepairAll = () => {
    if (!isAuthenticated || !profile?.id) return;
    bases.forEach((b) => {
      if (b.ownerId === profile.id) {
        handleRepairBase(b.id);
      }
    });
  };

  const currentUserId = isAuthenticated && profile ? profile.id : '';
  const activeHomeBase = currentUserId
    ? bases.find((b) => b.id === profile?.homeBaseId) ||
      bases.find((b) => b.ownerId === currentUserId && b.type === 'home') ||
      bases.find((b) => b.ownerId === currentUserId)
    : undefined;

  const selectedBase = isAuthenticated ? bases.find((b) => b.id === selectedBaseId) : undefined;
  const selectedUnitsList = isAuthenticated ? units.filter((u) => selectedUnitIds.has(u.id)) : [];
  const playerUnits = currentUserId ? units.filter((u) => u.ownerId === currentUserId) : [];
  const usedPopulation = playerUnits.reduce((sum, u) => sum + (UNIT_CATALOG[u.type]?.populationCost || 1), 0);
  const maxPopulation = Math.max(
    40,
    (currentUserId ? bases.filter((b) => b.ownerId === currentUserId).length : 1) * 30
  );

  if (isAdminRoute) {
    return <AdminPanel onReturnToGame={returnToBattlefield} />;
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans select-none">
      {/* 1. Three.js 3D Tactical RTS Canvas (runs in Strategic Preview Mode before login, and Gameplay Mode when authenticated) */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onContextMenu={handleContextMenu}
        onWheel={handleWheel}
        className={`w-full h-full block ${isAuthenticated ? 'cursor-crosshair' : 'cursor-default'}`}
      />

      {/* 2. Authenticated Gameplay HUD & Drawers (strictly hidden while unauthenticated) */}
      {isAuthenticated && profile && (
        <>
          <TopBar
            profile={profile}
            activeBase={activeHomeBase}
            bases={bases}
            maps={maps}
            currentMapId={currentMapId}
            onSwitchMap={handleSwitchMap}
            connected={connected}
            muted={muted}
            onToggleMute={() => {
              const nextMuted = !muted;
              updateSettings((prev) => ({ ...prev, muted: nextMuted }));
              soundEngine.setMuted(nextMuted);
            }}
            onOpenSettings={() => setShowSettings(true)}
            onOpenAdmin={() => setShowAdmin(true)}
            onOpenAdminConsole={openAdminConsole}
            onOpenAlliance={() => setShowAlliance(true)}
            onOpenProgression={() => setShowProgression(true)}
            onOpenIntel={() => setShowIntel(true)}
            onOpenTutorial={() => setShowTutorial(true)}
            onOpenShortcuts={() => setShowShortcuts(true)}
            alliedTag={alliances.find((a) => a.id === profile.allianceId)?.tag}
            totalUnitsCount={playerUnits.length}
            usedPopulation={usedPopulation}
            maxPopulation={maxPopulation}
            aiDifficulty={aiDifficulty}
            onChangeAiDifficulty={handleChangeAiDifficulty}
            onResetSkirmish={handleResetSkirmish}
            graphicsQuality={graphicsQuality}
            onChangeGraphicsQuality={(q) => {
              updateSettings((prev) => ({ ...prev, graphicsQuality: q }));
              rendererRef.current?.setGraphicsQuality(q);
            }}
            atmospherePreset={atmospherePreset}
            onChangeAtmospherePreset={(p) => {
              updateSettings((prev) => ({ ...prev, atmospherePreset: p }));
              rendererRef.current?.setAtmospherePreset(p);
            }}
            onJumpToCoords={jumpToCoords}
            onLogout={handleLogout}
            compactHud={settings.compactHud}
            showSubHeader={settings.showSubHeader}
            highContrastHud={settings.highContrastHud}
            largerTouchTargets={settings.largerTouchTargets}
          />

          {/* 3. Radar Minimap & 3D Camera Controls (Bottom Left) */}
          {settings.showMinimap && (
            <Minimap
              renderer={rendererRef.current}
              cameraCoords={cameraCoords}
              onJumpToHome={jumpToHome}
              fogEnabled={fogEnabled}
              onToggleFog={() => updateSettings((prev) => ({ ...prev, fogEnabled: !prev.fogEnabled }))}
              showRepairCranes={repairVisualsActive}
              onToggleRepair={() =>
                updateSettings((prev) => ({ ...prev, repairVisualsActive: !prev.repairVisualsActive }))
              }
              isStrategicOverview={isStrategicOverview}
              onToggleStrategicOverview={() => setIsStrategicOverview(!isStrategicOverview)}
              sizePreset={settings.minimapSize}
              highContrastHud={settings.highContrastHud}
              largerTouchTargets={settings.largerTouchTargets}
            />
          )}

          {/* 4. Unit Command Bar & Squad Inspector (Bottom Center) */}
          <CommandBar
            selectedUnits={selectedUnitsList}
            allPlayerUnitsCount={playerUnits.length}
            activeCommand={activeCommand}
            onSetCommand={(cmd) => {
              setActiveCommand(cmd);
              if (cmd === 'hold' || cmd === 'stop' || cmd === 'retreat') {
                issueUnitCommand(cmd);
              }
            }}
            onSelectSingleUnit={(id) => setSelectedUnitIds(new Set([id]))}
            onSelectAllUnits={() => {
              setSelectedUnitIds(new Set(playerUnits.map((u) => u.id)));
              setSelectedBaseId(null);
              soundEngine.playCommandAck();
            }}
            onClearSelection={() => {
              setSelectedUnitIds(new Set());
              setSelectedBaseId(null);
            }}
            onJumpToHome={jumpToHome}
            onFocusUnit={(u) => jumpToCoords(u.x, u.y)}
            controlGroups={controlGroups}
            onRecallGroup={(g) => {
              const ids = controlGroups[g];
              if (ids && ids.length > 0) {
                setSelectedUnitIds(new Set(ids));
                setSelectedBaseId(null);
                soundEngine.playCommandAck();
              }
            }}
            onAssignGroup={(g) => {
              setControlGroups((prev) => ({ ...prev, [g]: Array.from(selectedUnitIds) }));
              soundEngine.playCommandAck();
            }}
            highwayExits={highwayExits}
            onHighwayTransfer={handleHighwayTransfer}
            showSquadBar={settings.showSquadBar}
            compactHud={settings.compactHud}
            highContrastHud={settings.highContrastHud}
            largerTouchTargets={settings.largerTouchTargets}
          />

          {/* 5. Base Management Drawer (Right Side) */}
          {selectedBase && !placingBuilding && (
            <BaseDrawer
              base={selectedBase}
              currentUserId={currentUserId}
              profile={profile}
              maps={maps}
              onClose={() => setSelectedBaseId(null)}
              onBuild={handleBuild}
              onCancelBuild={handleCancelBuild}
              onStartPlaceBuilding3D={handleStartPlaceBuilding3D}
              onProduceUnit={handleProduceUnit}
              onCancelUnit={handleCancelUnit}
              onRepairBase={handleRepairBase}
              onRepairBuilding={handleRepairBuilding}
              onChangeHomeMap={handleChangeHomeMap}
            />
          )}

          {/* 6. Tactical Comms & Combat Logs (Bottom Right) */}
          {settings.showChat && (
            <TacticalChat
              messages={chatMessages}
              combatLogs={combatLogs}
              onSendMessage={(content, channel, coords) => {
                socketRef.current?.emit('chat:send', { content, channel, coords });
              }}
              onJumpToCoords={jumpToCoords}
              currentCoords={cameraCoords}
              allianceTag={alliances.find((a) => a.id === profile.allianceId)?.tag}
              highContrastHud={settings.highContrastHud}
              uiAnimations={settings.uiAnimations}
            />
          )}
        </>
      )}

      {/* 7. Notification Toast */}
      {notificationToast && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-lg bg-slate-900 border border-cyan-500/60 shadow-2xl text-center pointer-events-none">
          <div className="text-xs font-bold font-mono text-cyan-300">{notificationToast.title}</div>
          <div className="text-[11px] text-slate-300">{notificationToast.message}</div>
        </div>
      )}

      {/* 8. Unauthenticated Full-Screen 3D Battlefield Login Preview Overlay */}
      {!isAuthenticated && (
        <AuthModal
          isRestoringSession={authStatus === 'checking'}
          onSuccess={(newToken, newProfile) => {
            needsHomeFocusRef.current = true;
            localStorage.setItem('frontline_token', newToken);
            setToken(newToken);
            setProfile(newProfile);
            setAuthStatus('authenticated');
            if (rendererRef.current) {
              rendererRef.current.setPreviewMode(false);
            }
          }}
        />
      )}

      {/* 9. Authenticated Gameplay Modals */}
      {isAuthenticated && showAlliance && profile && (
        <AllianceModal
          alliances={alliances}
          profile={profile}
          token={token}
          onClose={() => setShowAlliance(false)}
          onCreateAlliance={handleCreateAlliance}
          onJoinAlliance={handleJoinAlliance}
          onLeaveAlliance={handleLeaveAlliance}
        />
      )}

      {isAuthenticated && showProgression && profile && (
        <ProgressionModal
          profile={profile}
          token={token}
          onClose={() => setShowProgression(false)}
          onProfileUpdate={setProfile}
        />
      )}

      {isAuthenticated && showIntel && <IntelModal onClose={() => setShowIntel(false)} />}
      {isAuthenticated && showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}

      {isAuthenticated && showAdmin && (
        <AdminModal
          onClose={() => setShowAdmin(false)}
          onSpawnUnit={handleAdminSpawn}
          onBoostResources={handleAdminBoost}
          onRepairAllBases={handleAdminRepairAll}
        />
      )}

      {isAuthenticated && showTutorial && (
        <TutorialModal
          onClose={() => setShowTutorial(false)}
          onDeploy={() => {
            setShowTutorial(false);
            jumpToHome();
          }}
        />
      )}

      {/* 10. Complete In-Game Settings Modal */}
      {showSettings && (
        <SettingsModal
          settings={settings}
          onUpdateSettings={updateSettings}
          onResetAllSettings={resetAllSettings}
          onResetLayoutOnly={resetLayoutOnly}
          onClearControlGroups={() => setControlGroups({})}
          isStrategicOverview={isStrategicOverview}
          onToggleStrategicOverview={setIsStrategicOverview}
          onChangeAiDifficulty={isAuthenticated ? handleChangeAiDifficulty : undefined}
          onResetSkirmish={isAuthenticated ? handleResetSkirmish : undefined}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
