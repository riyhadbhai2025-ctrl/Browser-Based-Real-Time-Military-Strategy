import React, { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { TacticalRenderer } from './game/renderer';
import { soundEngine } from './game/audio';
import { Base, ChatMessage, CombatEvent, PlayerProfile, TerrainType, Unit, UnitType, BuildingType } from './types/game';
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

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<TacticalRenderer | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Auth & Profile
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('frontline_token'));
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [connected, setConnected] = useState<boolean>(false);

  // World State
  const [terrain, setTerrain] = useState<TerrainType[][]>([]);
  const [bases, setBases] = useState<Base[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [alliances, setAlliances] = useState<any[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [combatLogs, setCombatLogs] = useState<CombatEvent[]>([]);

  // Selection & Commands
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(new Set());
  const [selectedBaseId, setSelectedBaseId] = useState<string | null>(null);
  const [activeCommand, setActiveCommand] = useState<'move' | 'attack' | 'hold' | 'patrol' | 'retreat' | 'stop'>('move');
  const [controlGroups, setControlGroups] = useState<Record<number, string[]>>({});

  // Modals & UI States
  const [muted, setMuted] = useState<boolean>(false);
  const [fogEnabled, setFogEnabled] = useState<boolean>(true);
  const [cameraCoords, setCameraCoords] = useState<{ x: number; y: number }>({ x: 18, y: 30 });
  const [showAdmin, setShowAdmin] = useState<boolean>(false);
  const [showAlliance, setShowAlliance] = useState<boolean>(false);
  const [showIntel, setShowIntel] = useState<boolean>(false);
  const [showTutorial, setShowTutorial] = useState<boolean>(false);
  const [notificationToast, setNotificationToast] = useState<{ title: string; message: string } | null>(null);

  // Keys held tracking for camera pan
  const keysHeld = useRef<Set<string>>(new Set());

  // 1. Initial Profile Check
  useEffect(() => {
    fetch('/api/auth/me', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.profile) {
          setProfile(data.profile);
        } else {
          setShowAuthModal(true);
        }
      })
      .catch(() => setShowAuthModal(true));
  }, [token]);

  // 2. Fetch World Terrain
  useEffect(() => {
    fetch('/api/world/terrain')
      .then((res) => res.json())
      .then((data) => {
        if (data.terrain) {
          setTerrain(data.terrain);
          if (rendererRef.current) {
            rendererRef.current.setTerrain(data.terrain);
          }
        }
      })
      .catch((err) => console.error('Failed to fetch terrain:', err));
  }, []);

  // 3. Initialize Socket.IO connection
  useEffect(() => {
    const socket = io('/', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('world:join', { token });
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('world:state', (state) => {
      setBases(state.bases || []);
      setUnits(state.units || []);
      setAlliances(state.alliances || []);
      setChatMessages(state.chat || []);
    });

    socket.on('world:sync', (sync) => {
      if (sync.bases) setBases(sync.bases);
      if (sync.units) setUnits(sync.units);
    });

    socket.on('combat:event', (evt: CombatEvent) => {
      setCombatLogs((prev) => [...prev.slice(-40), evt]);
      if (rendererRef.current) {
        rendererRef.current.addCombatEvent(evt);
      }

      // Audio feedback based on attacker type
      if (evt.attackerType.includes('mbt') || evt.attackerType.includes('howitzer')) {
        soundEngine.playCannonShot();
      } else if (evt.attackerType.includes('sam') || evt.attackerType.includes('cobra') || evt.attackerType.includes('jet')) {
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

    socket.on('base:captured', (data) => {
      soundEngine.playCaptureSuccess();
      setNotificationToast({
        title: 'BASE CAPTURED!',
        message: `${data.newOwnerName} has seized control of sector base!`,
      });
      setTimeout(() => setNotificationToast(null), 5000);
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
    };
  }, [token]);

  // 4. Initialize Canvas Renderer
  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const renderer = new TacticalRenderer(canvas);
    rendererRef.current = renderer;
    renderer.startRenderLoop();

    if (terrain.length > 0) {
      renderer.setTerrain(terrain);
    }

    return () => {
      window.removeEventListener('resize', resize);
      renderer.stopRenderLoop();
    };
  }, []);

  // Update renderer state when bases/units/profile change
  useEffect(() => {
    if (!rendererRef.current) return;
    rendererRef.current.updateWorld(
      bases,
      units,
      profile?.id || 'player_default',
      profile?.allianceId
    );
    rendererRef.current.selectedUnitIds = selectedUnitIds;
    rendererRef.current.selectedBaseId = selectedBaseId;
    rendererRef.current.fogEnabled = fogEnabled;
  }, [bases, units, profile, selectedUnitIds, selectedBaseId, fogEnabled]);

  // 5. Continuous Keyboard Camera Pan Loop
  useEffect(() => {
    let animId: number;
    const panLoop = () => {
      const renderer = rendererRef.current;
      if (renderer && keysHeld.current.size > 0) {
        const speed = 0.45 / renderer.zoom;
        if (keysHeld.current.has('KeyW') || keysHeld.current.has('ArrowUp')) renderer.cameraY -= speed;
        if (keysHeld.current.has('KeyS') || keysHeld.current.has('ArrowDown')) renderer.cameraY += speed;
        if (keysHeld.current.has('KeyA') || keysHeld.current.has('ArrowLeft')) renderer.cameraX -= speed;
        if (keysHeld.current.has('KeyD') || keysHeld.current.has('ArrowRight')) renderer.cameraX += speed;

        // Clamp
        renderer.cameraX = Math.max(0, Math.min(100, renderer.cameraX));
        renderer.cameraY = Math.max(0, Math.min(75, renderer.cameraY));
        setCameraCoords({ x: renderer.cameraX, y: renderer.cameraY });
      }
      animId = requestAnimationFrame(panLoop);
    };
    animId = requestAnimationFrame(panLoop);

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing in an input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

      keysHeld.current.add(e.code);

      // Number keys for control groups
      if (e.key >= '1' && e.key <= '5') {
        const groupNum = parseInt(e.key, 10);
        if (e.ctrlKey || e.metaKey) {
          // Assign selected units to group
          e.preventDefault();
          setControlGroups((prev) => ({
            ...prev,
            [groupNum]: Array.from(selectedUnitIds),
          }));
          soundEngine.playCommandAck();
        } else {
          // Recall group
          const unitIds = controlGroups[groupNum] || [];
          if (unitIds.length > 0) {
            setSelectedUnitIds(new Set(unitIds));
            setSelectedBaseId(null);
            soundEngine.playCommandAck();
          }
        }
      }

      // Hotkey shortcuts
      if (e.code === 'KeyM') setActiveCommand('move');
      if (e.code === 'KeyA') setActiveCommand('attack');
      if (e.code === 'KeyH') {
        setActiveCommand('hold');
        issueUnitCommand('hold');
      }
      if (e.code === 'KeyS') {
        setActiveCommand('stop');
        issueUnitCommand('stop');
      }
      if (e.code === 'KeyR') {
        setActiveCommand('retreat');
        issueUnitCommand('retreat');
      }
      if (e.code === 'Space') {
        // Jump camera to home base
        e.preventDefault();
        jumpToHome();
      }
      if (e.code === 'Escape') {
        setSelectedUnitIds(new Set());
        setSelectedBaseId(null);
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
  }, [selectedUnitIds, controlGroups]);

  // Jump camera to Home Base
  const jumpToHome = useCallback(() => {
    const homeBase = bases.find((b) => b.ownerId === (profile?.id || 'player_default') && b.type === 'home');
    if (homeBase && rendererRef.current) {
      rendererRef.current.cameraX = homeBase.x;
      rendererRef.current.cameraY = homeBase.y;
      setCameraCoords({ x: homeBase.x, y: homeBase.y });
      soundEngine.playCommandAck();
    }
  }, [bases, profile]);

  // Jump camera to arbitrary coordinates
  const jumpToCoords = (x: number, y: number) => {
    if (rendererRef.current) {
      rendererRef.current.cameraX = x;
      rendererRef.current.cameraY = y;
      setCameraCoords({ x, y });
      soundEngine.playCommandAck();
    }
  };

  // Issue command to selected units
  const issueUnitCommand = (
    command: 'move' | 'attack' | 'hold' | 'patrol' | 'retreat' | 'stop',
    targetX?: number,
    targetY?: number,
    targetUnitId?: string,
    targetBaseId?: string
  ) => {
    if (selectedUnitIds.size === 0 || !socketRef.current) return;

    socketRef.current.emit('unit:command', {
      unitIds: Array.from(selectedUnitIds),
      command,
      targetX,
      targetY,
      targetUnitId,
      targetBaseId,
    });
    soundEngine.playCommandAck();
  };

  // 6. Canvas Mouse & Pointer Event Handlers
  const isBoxSelecting = useRef(false);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button === 0) {
      // Left click
      dragStartPos.current = { x: e.clientX, y: e.clientY };
      isBoxSelecting.current = false;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!rendererRef.current) return;

    if (dragStartPos.current && e.buttons === 1) {
      const dist = Math.hypot(e.clientX - dragStartPos.current.x, e.clientY - dragStartPos.current.y);
      if (dist > 8) {
        isBoxSelecting.current = true;
        rendererRef.current.selectionBox = {
          startX: dragStartPos.current.x,
          startY: dragStartPos.current.y,
          currentX: e.clientX,
          currentY: e.clientY,
        };
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    if (e.button === 0) {
      // Finished left click or box select
      if (isBoxSelecting.current && dragStartPos.current) {
        // Find units inside rectangle
        const p1 = renderer.screenToWorld(
          Math.min(dragStartPos.current.x, e.clientX),
          Math.min(dragStartPos.current.y, e.clientY)
        );
        const p2 = renderer.screenToWorld(
          Math.max(dragStartPos.current.x, e.clientX),
          Math.max(dragStartPos.current.y, e.clientY)
        );

        const currentUserId = profile?.id || 'player_default';
        const insideUnits = units.filter(
          (u) =>
            u.ownerId === currentUserId &&
            u.x >= p1.x &&
            u.x <= p2.x &&
            u.y >= p1.y &&
            u.y <= p2.y
        );

        if (insideUnits.length > 0) {
          setSelectedUnitIds(new Set(insideUnits.map((u) => u.id)));
          setSelectedBaseId(null);
          soundEngine.playCommandAck();
        }
      } else {
        // Single click select: check unit or base under cursor
        const worldPos = renderer.screenToWorld(e.clientX, e.clientY);
        const clickedUnit = units.find(
          (u) => Math.hypot(u.x - worldPos.x, u.y - worldPos.y) <= 0.85
        );

        if (clickedUnit) {
          if (e.shiftKey) {
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
        } else {
          // Check base
          const clickedBase = bases.find(
            (b) => Math.hypot(b.x - worldPos.x, b.y - worldPos.y) <= b.radius
          );

          if (clickedBase) {
            setSelectedBaseId(clickedBase.id);
            setSelectedUnitIds(new Set());
            soundEngine.playCommandAck();
          } else {
            // Clicked empty ground
            if (!e.shiftKey) {
              setSelectedUnitIds(new Set());
              setSelectedBaseId(null);
            }
          }
        }
      }

      renderer.selectionBox = null;
      isBoxSelecting.current = false;
      dragStartPos.current = null;
    }
  };

  const handleContextMenu = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const renderer = rendererRef.current;
    if (!renderer || selectedUnitIds.size === 0) return;

    const worldPos = renderer.screenToWorld(e.clientX, e.clientY);

    // Check if right-clicked on an enemy unit
    const currentUserId = profile?.id || 'player_default';
    const targetUnit = units.find(
      (u) =>
        u.ownerId !== currentUserId &&
        Math.hypot(u.x - worldPos.x, u.y - worldPos.y) <= 1.2
    );

    if (targetUnit) {
      issueUnitCommand('attack', undefined, undefined, targetUnit.id);
      return;
    }

    // Check if right-clicked on an enemy base
    const targetBase = bases.find(
      (b) =>
        b.ownerId !== currentUserId &&
        Math.hypot(b.x - worldPos.x, b.y - worldPos.y) <= b.radius
    );

    if (targetBase) {
      issueUnitCommand('attack', undefined, undefined, undefined, targetBase.id);
      return;
    }

    // Right clicked ground -> Move or Attack-Move
    issueUnitCommand(activeCommand === 'attack' ? 'attack' : 'move', worldPos.x, worldPos.y);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    renderer.zoom = Math.max(0.5, Math.min(2.0, renderer.zoom + delta));
  };

  // Base actions
  const handleBuild = (baseId: string, buildingType: BuildingType) => {
    socketRef.current?.emit('base:build', { baseId, buildingType }, (res: any) => {
      if (res?.success) soundEngine.playBuildComplete();
    });
  };

  const handleProduceUnit = (baseId: string, unitType: UnitType) => {
    socketRef.current?.emit('base:produce_unit', { baseId, unitType }, (res: any) => {
      if (res?.success) soundEngine.playBuildComplete();
    });
  };

  const handleRepairBase = (baseId: string) => {
    socketRef.current?.emit('base:repair', { baseId }, (res: any) => {
      if (res?.success) soundEngine.playBuildComplete();
    });
  };

  // Alliance actions
  const handleCreateAlliance = (name: string, tag: string, description: string) => {
    socketRef.current?.emit('alliance:create', { name, tag, description }, (res: any) => {
      if (res?.success && profile) {
        setProfile({ ...profile, allianceId: res.alliance.id, allianceRole: 'leader' });
      }
    });
  };

  const handleJoinAlliance = (allianceId: string) => {
    socketRef.current?.emit('alliance:join', { allianceId }, (res: any) => {
      if (res?.success && profile) {
        setProfile({ ...profile, allianceId, allianceRole: 'member' });
      }
    });
  };

  // Admin Sandbox tools
  const handleAdminSpawn = (unitType: UnitType, isHostile: boolean) => {
    const renderer = rendererRef.current;
    const targetX = Math.round(renderer ? renderer.cameraX + (Math.random() * 4 - 2) : 20);
    const targetY = Math.round(renderer ? renderer.cameraY + (Math.random() * 4 - 2) : 28);
    const ownerId = isHostile ? 'enemy_insurgent' : profile?.id || 'player_default';

    fetch('/api/admin/spawn_unit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unitType, x: targetX, y: targetY, ownerId }),
    }).catch(console.error);
  };

  const handleAdminBoost = (amount: number) => {
    const homeBase = bases.find((b) => b.ownerId === (profile?.id || 'player_default'));
    fetch('/api/admin/boost_resources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseId: homeBase?.id, amount }),
    }).catch(console.error);
  };

  const handleAdminRepairAll = () => {
    bases.forEach((b) => {
      if (b.ownerId === (profile?.id || 'player_default')) {
        handleRepairBase(b.id);
      }
    });
  };

  const activeHomeBase = bases.find(
    (b) => b.ownerId === (profile?.id || 'player_default') && b.type === 'home'
  ) || bases[0];

  const selectedBase = bases.find((b) => b.id === selectedBaseId);
  const selectedUnitsList = units.filter((u) => selectedUnitIds.has(u.id));

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans select-none">
      {/* 1. Tactical RTS Canvas */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onContextMenu={handleContextMenu}
        onWheel={handleWheel}
        className="w-full h-full block cursor-crosshair"
      />

      {/* 2. Top Navigation & Resource Bar */}
      {profile && (
        <TopBar
          profile={profile}
          activeBase={activeHomeBase}
          connected={connected}
          muted={muted}
          onToggleMute={() => {
            const nextMuted = !muted;
            setMuted(nextMuted);
            soundEngine.setMuted(nextMuted);
          }}
          onOpenAdmin={() => setShowAdmin(true)}
          onOpenAlliance={() => setShowAlliance(true)}
          onOpenIntel={() => setShowIntel(true)}
          onOpenTutorial={() => setShowTutorial(true)}
          alliedTag={alliances.find((a) => a.id === profile.allianceId)?.tag}
          totalUnitsCount={units.filter((u) => u.ownerId === profile.id).length}
        />
      )}

      {/* 3. Radar Minimap (Bottom Left) */}
      <Minimap
        renderer={rendererRef.current}
        cameraCoords={cameraCoords}
        onJumpToHome={jumpToHome}
        fogEnabled={fogEnabled}
        onToggleFog={() => setFogEnabled(!fogEnabled)}
      />

      {/* 4. Unit Command Bar (Bottom Center) */}
      <CommandBar
        selectedUnits={selectedUnitsList}
        activeCommand={activeCommand}
        onSetCommand={(cmd) => {
          setActiveCommand(cmd);
          if (cmd === 'hold' || cmd === 'stop' || cmd === 'retreat') {
            issueUnitCommand(cmd);
          }
        }}
        onSelectSingleUnit={(id) => setSelectedUnitIds(new Set([id]))}
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
      />

      {/* 5. Base Management Drawer (Right Side) */}
      {selectedBase && (
        <BaseDrawer
          base={selectedBase}
          currentUserId={profile?.id || 'player_default'}
          onClose={() => setSelectedBaseId(null)}
          onBuild={handleBuild}
          onProduceUnit={handleProduceUnit}
          onRepairBase={handleRepairBase}
        />
      )}

      {/* 6. Tactical Comms & Combat Logs (Bottom Right) */}
      <TacticalChat
        messages={chatMessages}
        combatLogs={combatLogs}
        onSendMessage={(content, channel, coords) => {
          socketRef.current?.emit('chat:send', { content, channel, coords });
        }}
        onJumpToCoords={jumpToCoords}
        currentCoords={cameraCoords}
        allianceTag={alliances.find((a) => a.id === profile?.allianceId)?.tag}
      />

      {/* 7. Notification Toast */}
      {notificationToast && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-lg bg-slate-900/95 border border-cyan-500/60 shadow-2xl text-center pointer-events-none animate-bounce">
          <div className="text-xs font-bold font-mono text-cyan-300">{notificationToast.title}</div>
          <div className="text-[11px] text-slate-300">{notificationToast.message}</div>
        </div>
      )}

      {/* 8. Modals */}
      {showAuthModal && (
        <AuthModal
          onSuccess={(newToken, newProfile) => {
            setToken(newToken);
            localStorage.setItem('frontline_token', newToken);
            setProfile(newProfile);
            setShowAuthModal(false);
            socketRef.current?.emit('world:join', { token: newToken });
            jumpToHome();
          }}
        />
      )}

      {showAlliance && profile && (
        <AllianceModal
          alliances={alliances}
          profile={profile}
          onClose={() => setShowAlliance(false)}
          onCreateAlliance={handleCreateAlliance}
          onJoinAlliance={handleJoinAlliance}
        />
      )}

      {showIntel && <IntelModal onClose={() => setShowIntel(false)} />}

      {showAdmin && (
        <AdminModal
          onClose={() => setShowAdmin(false)}
          onSpawnUnit={handleAdminSpawn}
          onBoostResources={handleAdminBoost}
          onRepairAllBases={handleAdminRepairAll}
        />
      )}

      {showTutorial && (
        <TutorialModal
          onClose={() => setShowTutorial(false)}
          onDeploy={() => {
            setShowTutorial(false);
            jumpToHome();
          }}
        />
      )}
    </div>
  );
}
