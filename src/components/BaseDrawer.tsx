import React, { useState } from 'react';
import {
  X,
  Hammer,
  Wrench,
  Shield,
  Clock,
  Crosshair,
  ArrowUpCircle,
  MapPin,
  AlertTriangle,
  Database,
  Compass,
  XCircle,
  CheckCircle2,
  Zap,
  Award,
  Target,
} from 'lucide-react';
import { Alliance, Base, BuildingDefinition, BuildingType, MapSectorConfig, PlayerProfile, UnitType } from '../types/game';
import { BUILDING_CATALOG, UNIT_CATALOG } from '../game/catalog';
import { assetManager } from '../game/assets/assetManager';

type BuildingCategory = BuildingDefinition['category'];

const PERSISTENT_HQ_BUILDING_TYPES = new Set<BuildingType>([
  'command_center',
  'command_bunker',
  'operations_center',
  'comms_tower',
  'radar_station',
  'storage_depot',
  'military_gate',
]);

interface BaseDrawerProps {
  base: Base;
  currentUserId: string;
  profile?: PlayerProfile | null;
  maps?: MapSectorConfig[];
  alliances?: Alliance[];
  onClose: () => void;
  onBuild: (baseId: string, buildingType: BuildingType) => void;
  onCancelBuild?: (baseId: string, orderId: string) => void;
  onStartPlaceBuilding3D?: (baseId: string, buildingType: BuildingType) => void;
  onProduceUnit: (baseId: string, unitType: UnitType) => void;
  onCancelUnit?: (baseId: string, orderId: string) => void;
  onRepairBase: (baseId: string) => void;
  onRepairBuilding?: (baseId: string, buildingId?: string) => void;
  onChangeHomeMap?: (targetMapId: string) => void;
}

export const BaseDrawer: React.FC<BaseDrawerProps> = ({
  base,
  currentUserId,
  profile,
  maps = [],
  alliances = [],
  onClose,
  onBuild,
  onCancelBuild,
  onStartPlaceBuilding3D,
  onProduceUnit,
  onCancelUnit,
  onRepairBase,
  onRepairBuilding,
  onChangeHomeMap,
}) => {
  const isHomeBase = Boolean(base.isHomeBase || base.type === 'home');
  const [activeTab, setActiveTab] = useState<'overview' | 'resources' | 'buildings' | 'units' | 'defenses'>(
    isHomeBase ? 'overview' : 'buildings'
  );
  const [buildingCategoryFilter, setBuildingCategoryFilter] = useState<'all' | BuildingCategory>('all');
  const [targetRelocateMapId, setTargetRelocateMapId] = useState<string>(base.mapId || 'map_riverfront_assault');

  const isNeutral = base.ownerId === 'neutral' || base.lifecycleState === 'neutralized';
  const isNeutralized = base.lifecycleState === 'neutralized';
  const isOwner = !isNeutral && base.ownerId === currentUserId;
  const now = Date.now();
  const hpPct = Math.max(0, base.health / Math.max(1, base.maxHealth));
  const shieldPct = base.maxShield > 0 ? Math.max(0, base.defenseShield / base.maxShield) : 0;

  // Resolve authoritative alliance name & tag
  const matchingAlliance = base.allianceId
    ? alliances.find((a) => a.id === base.allianceId)
    : null;
  const displayAllianceName = base.allianceName || matchingAlliance?.name || null;
  const displayAllianceTag = base.allianceTag || matchingAlliance?.tag || null;

  const hqLevel =
    base.hqLevel || base.buildings.find((b) => b.type === 'command_center')?.level || 1;
  const armorMultiplier = base.armorMultiplier || (isHomeBase ? 3.0 : 1.0);
  const ownerFaction = isOwner
    ? profile?.faction || '1st Vanguard Coalition'
    : isNeutral
    ? (base.previousOwnerName ? `Former: ${base.previousOwnerName}` : 'Neutral Installation')
    : 'Sector Garrison';
  const currentMapName =
    maps.find((m) => m.id === base.mapId)?.name ||
    (base.mapId === 'map_iron_ridge_corridor'
      ? 'Sector 02: Iron Ridge Corridor'
      : base.mapId === 'map_archipelago_bastion'
      ? 'Sector 03: Littoral Bastion Delta'
      : 'Sector 01: Riverfront Assault');

  const availableBuildings = Object.values(BUILDING_CATALOG).filter((b) => {
    if (!b.baseTypesAllowed.includes(base.type)) return false;
    if (buildingCategoryFilter !== 'all' && b.category !== buildingCategoryFilter) return false;
    return true;
  });

  // Home Base specializes in ground infantry & vehicle production; captured Air/Harbor bases unlock Air/Naval
  const availableUnits = Object.values(UNIT_CATALOG).filter((u) => {
    if (isHomeBase && u.category !== 'ground') return false;
    const hasFacility = base.buildings.some((b) => b.type === u.requiredBuilding && !b.isConstructing);
    return hasFacility;
  });

  const defenseBuildings = base.buildings.filter((b) => {
    const def = BUILDING_CATALOG[b.type];
    return def?.category === 'defense' || b.type === 'military_gate';
  });

  const damagedBuildings = base.buildings.filter((b) => b.health < b.maxHealth);
  const cooldownRemainingSec =
    profile?.homeMapChangeCooldownUntil && profile.homeMapChangeCooldownUntil > now
      ? Math.ceil((profile.homeMapChangeCooldownUntil - now) / 1000)
      : 0;

  const formatEta = (current: number, cap: number, prodRate: number, consRate: number) => {
    if (current >= cap) return 'FULL';
    const netRate = prodRate - consRate;
    if (netRate <= 0.05) return 'STALLED';
    const secs = Math.ceil((cap - current) / netRate);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    const remSec = secs % 60;
    return `${mins}m ${remSec}s`;
  };

  return (
    <div className="absolute inset-x-2 top-16 bottom-2 sm:left-auto sm:top-14 sm:right-3 sm:bottom-3 sm:w-[420px] z-30 flex flex-col rounded-lg bg-slate-950/95 border border-slate-800 shadow-2xl overflow-hidden select-none pointer-events-auto">
      {/* Header */}
      <div
        className={`flex items-center justify-between px-3 py-2.5 border-b ${
          isHomeBase
            ? 'bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-900 border-indigo-500/40'
            : 'bg-slate-900 border-slate-800'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`w-8 h-8 rounded flex items-center justify-center shrink-0 border ${
              isHomeBase
                ? 'bg-purple-950/80 border-purple-400/60 text-purple-300 shadow-inner'
                : 'bg-blue-900/60 border-blue-500/50 text-blue-400'
            }`}
          >
            <Shield className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="font-bold text-xs text-slate-100 font-mono tracking-wider truncate">
                {base.name}
              </h3>
              {isHomeBase && (
                <span className="px-1.5 py-0.5 rounded bg-purple-950 text-purple-200 border border-purple-500/60 text-[9px] font-mono font-bold tracking-wider">
                  ★ COMMAND HQ · LVL {hqLevel}
                </span>
              )}
              {isNeutralized && (
                <span className="px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-500/70 text-[9px] font-mono font-bold tracking-wider animate-pulse">
                  ⚠ NEUTRALIZED · CONQUEST READY
                </span>
              )}
              {base.isNewcomerBase && (
                <span className="px-1 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/50 text-[9px] font-mono font-bold">
                  NEWCOMER
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 truncate flex-wrap mt-0.5">
              <span className="uppercase text-cyan-400 font-semibold">
                {isHomeBase ? 'HQ' : `${base.type.toUpperCase()}`}
              </span>
              <span>•</span>
              <span className="font-mono">
                [{base.x}, {base.y}]
              </span>
              <span>•</span>
              <span
                className={
                  isOwner
                    ? 'text-emerald-400 font-bold'
                    : isNeutral
                    ? 'text-amber-400 font-bold'
                    : 'text-rose-400 font-bold'
                }
              >
                OWNER: {isNeutral ? 'Neutral Territory' : base.ownerName}
              </span>
              {!isNeutral && (
                <>
                  <span>•</span>
                  {displayAllianceTag ? (
                    <span className="px-1.5 py-0.5 rounded bg-blue-950/90 text-blue-300 border border-blue-500/50 text-[9px] font-mono font-bold tracking-wider">
                      [{displayAllianceTag}] {displayAllianceName || ''}
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-700/60 text-[9px] font-mono">
                      Independent
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition shrink-0 ml-1"
          title="Close Base Management Panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Facility Visual Dossier Banner */}
      <div className="relative h-20 overflow-hidden border-b border-slate-800 bg-slate-900 shrink-0">
        <img
          src={
            base.type === 'air'
              ? '/assets/aistudio/7kxgVxTj12aaGQnz6Di07mv5tlqjfNQXjYBNzUd-UvDem-SyyNXis7yU3Du970X-dKtQWAnOnsbfXX40lRwqhdezZdYLDS-Qe6Yn7HNpL5ok7Yyj2tY9qpVa-fZzZweKvmdvGD0lRBLwe080CIaqBxVwiV5JA05gslWLYZg8fi-0SjlUyxWpoIHos2VzZ9Gi_24db5c9a.jfif'
              : base.type === 'harbor'
              ? '/assets/aistudio/fCepRZYn_2xfC_oeZGl3DbmG6Jc3nbWZ2vPUo8iLMCzWT-HmucP9eU-1_Y4dqPOIvQRHPLPTb42TH8O_8chE27y_sw1grBsWTmRM1UcPI7nW9c1gW1xQvyHfwnDyXkMWCrRBXFKrwiA5dB-2N-K3lLvgHtQ3catcXnSHnmDlVj8a3f16gpHddgBpOzWBMvnH_6e199dd8.jfif'
              : base.type === 'rail'
              ? '/assets/aistudio/tXNaVJSFm6tq5eH0LOMsca9t3UCFb09TGtuIxw9HSBmOYvkcBdJoO9pvGRot5OpMjRuJSuLuEHZ2csSAgz7tSu-f27vNq-s-H1C2EdeolyCYJQCYO6UAxjBplGDIKi3LSqJmwJDiAD8mJP88GFYJiAhdMNkaBeep4lDDUfkg2tbJZW4kt6Mtu35w5FPPkT1n_6230bc6d.jfif'
              : isHomeBase
              ? '/assets/aistudio/cI6wQTlzfGZXAIf5dpnk13jWyN3OpURvwt1DEq8v-GpgYo0AvbfjJTLBjh5eR1snAYDAeq8I12dkh3SAJq5b_9EwyPg2qWOpknxasVnVhIJqCEmBfKSLTY6WT9ySYLCR-8EWn7XhUJ1O2pKlXWraXQtH-GB3TkZzNgO947NAXicxEipj__DbRwcLlqghOmsX_04e15e49.jfif'
              : '/assets/aistudio/Fw5BLLDDwLESOCprFgjWyOrO3iW7ODA4kBiqrcvvpEa-sfZcdyOSvpUqb0Oztv21RjeTVt8uAymaAR7vKCAnjBGdYi0Lqbc_DgjMmIH_b0h4Q0pt5PH9dLMC4QhO_-PbUi98d2ZT4RbY-qrmJxHDCphLhadzqPlNG_93CCJvbFVqHNMkZ2cpaFhY_jLvtcSS_2ef97afb.jfif'
          }
          alt={`${base.name} Facility`}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover brightness-80 contrast-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/45 to-transparent flex items-end justify-between px-3 py-1.5">
          <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold truncate">
            {currentMapName} · [{base.x}, {base.y}]
          </span>
          {isHomeBase && (
            <span className="px-1.5 py-0.5 rounded bg-indigo-950/90 border border-indigo-400/50 text-[9px] font-mono text-indigo-200 font-bold shrink-0">
              {armorMultiplier}X HQ ARMOR
            </span>
          )}
        </div>
      </div>

      {/* Structural Integrity, Shield & Status Strip */}
      <div className="px-3 py-2 bg-slate-900/60 border-b border-slate-800 shrink-0">
        <div className="flex items-center justify-between text-[11px] font-mono mb-1">
          <span className="text-slate-400">
            STRUCTURAL INTEGRITY {isHomeBase ? `(${armorMultiplier}x Armor)` : ''}
          </span>
          <span className="text-emerald-400 font-bold">
            {Math.round(base.health)} / {base.maxHealth}
          </span>
        </div>
        <div className="w-full h-2 bg-slate-800 rounded overflow-hidden mb-1.5">
          <div
            className={`h-full transition-all ${
              hpPct > 0.5 ? 'bg-emerald-500' : hpPct > 0.25 ? 'bg-amber-500' : 'bg-rose-500'
            }`}
            style={{ width: `${hpPct * 100}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] font-mono mb-1">
          <span className="text-slate-400">DEFENSE SHIELD</span>
          <span className="text-cyan-400 font-bold">
            {Math.round(base.defenseShield)} / {base.maxShield}
          </span>
        </div>
        <div className="w-full h-1.5 bg-slate-800 rounded overflow-hidden mb-2">
          <div className="h-full bg-cyan-500 transition-all" style={{ width: `${shieldPct * 100}%` }} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] font-mono mb-1.5 px-2 py-1 rounded bg-slate-950 border border-slate-800">
          <div className="flex items-center gap-1">
            <Zap className="w-3 h-3 text-amber-400" />
            <span className="text-slate-400">PWR:</span>
            <span
              className={
                (base.powerUsed || 0) > (base.powerCapacity || 45)
                  ? 'text-rose-400 font-bold'
                  : 'text-amber-300 font-bold'
              }
            >
              {base.powerUsed ?? 20}/{base.powerCapacity ?? 65} MW
            </span>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-slate-400">TURRETS:</span>
            <span className={base.defensesIntact ? 'text-cyan-400 font-bold' : 'text-rose-400 font-bold'}>
              {base.activeTurretsCount !== undefined
                ? `${base.activeTurretsCount} ACTIVE`
                : base.defenseShield > 0
                ? 'SHIELD UP'
                : 'OFFLINE'}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-slate-400">STATE:</span>
            <span
              className={`uppercase font-bold ${
                isNeutralized ? 'text-amber-300 animate-pulse' : 'text-indigo-300'
              }`}
            >
              {base.lifecycleState || 'ACTIVE'}
            </span>
          </div>
        </div>

        {isNeutralized && (
          <div className="mb-2 p-2 rounded bg-amber-950/50 border border-amber-500/60 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-bold text-amber-300 font-mono">
              <span className="flex items-center gap-1">
                <Target className="w-3.5 h-3.5 text-amber-400" />
                <span>CONQUEST UPLINK</span>
              </span>
              <span>{Math.round(base.captureProgress || 0)}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-950 rounded overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-yellow-300 transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, base.captureProgress || 0))}%` }}
              />
            </div>
            <div className="text-[9px] text-slate-300 leading-snug">
              {(base.captureProgress || 0) > 0 ? (
                <span className="text-emerald-400 font-bold">
                  Dominator uplink in progress — transmitting conquest authorization cipher...
                </span>
              ) : (
                <span>
                  Deploy a designated <strong className="text-amber-200">Dominator Command Vehicle</strong> within capture perimeter ({Math.max(6.0, (base.radius || 4) + 2.5).toFixed(1)} tiles) to capture this base.
                </span>
              )}
            </div>
          </div>
        )}

        {base.captureBlockedReason && !isOwner && !isNeutralized && (
          <div className="mb-1.5 px-2.5 py-1.5 rounded bg-amber-950/60 border border-amber-600/40 text-[10px] font-mono text-amber-200 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <div className="leading-tight">
              <span className="font-bold text-amber-300">SIEGE DOCTRINE:</span> {base.captureBlockedReason}
            </div>
          </div>
        )}

        {isOwner && (base.health < base.maxHealth || base.defenseShield < base.maxShield || damagedBuildings.length > 0) && (
          <button
            onClick={() => onRepairBase(base.id)}
            className="w-full py-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-600/30 text-[11px] font-mono font-semibold flex items-center justify-center gap-1.5 transition"
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>REPAIR ALL BASE DEFENSES (200 Concrete, 200 Steel)</span>
          </button>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-800 text-[10px] font-mono bg-slate-950 shrink-0">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex-1 py-2 text-center font-semibold transition border-b-2 ${
            activeTab === 'overview'
              ? 'border-blue-500 text-blue-400 bg-blue-950/30'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          OVERVIEW
        </button>

        <button
          onClick={() => setActiveTab('resources')}
          className={`flex-1 py-2 text-center font-semibold transition border-b-2 ${
            activeTab === 'resources'
              ? 'border-blue-500 text-blue-400 bg-blue-950/30'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          RESOURCES
        </button>

        <button
          onClick={() => setActiveTab('buildings')}
          className={`flex-1 py-2 text-center font-semibold transition border-b-2 ${
            activeTab === 'buildings'
              ? 'border-blue-500 text-blue-400 bg-blue-950/30'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          BUILD ({base.buildings.length})
        </button>

        <button
          onClick={() => setActiveTab('units')}
          className={`flex-1 py-2 text-center font-semibold transition border-b-2 ${
            activeTab === 'units'
              ? 'border-blue-500 text-blue-400 bg-blue-950/30'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          UNITS ({base.productionQueue.length})
        </button>

        <button
          onClick={() => setActiveTab('defenses')}
          className={`flex-1 py-2 text-center font-semibold transition border-b-2 ${
            activeTab === 'defenses'
              ? 'border-blue-500 text-blue-400 bg-blue-950/30'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          DEFENSE
        </button>
      </div>

      {/* Tab Content Area */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 text-xs font-mono">
        {/* ===================================================================
            TAB 1: HEADQUARTERS OVERVIEW
           =================================================================== */}
        {activeTab === 'overview' && (
          <div className="space-y-2.5">
            <div className="p-2.5 rounded bg-slate-900 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <span className="text-[11px] font-bold text-slate-100 uppercase flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-purple-400" />
                  <span>{isHomeBase ? 'Strategic Command Headquarters' : 'Forward Installation Overview'}</span>
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300">
                  CMD LVL {hqLevel}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="p-1.5 rounded bg-slate-950 border border-slate-800/80">
                  <div className="text-slate-500">BASE OWNER</div>
                  <div className="text-slate-100 font-bold truncate">
                    {isNeutral ? 'Neutral Territory' : base.ownerName}
                  </div>
                  <div className="text-cyan-400 truncate">
                    {isNeutral && base.previousOwnerName
                      ? `Former: ${base.previousOwnerName}`
                      : ownerFaction}
                  </div>
                </div>
                <div className="p-1.5 rounded bg-slate-950 border border-slate-800/80">
                  <div className="text-slate-500">ALLIANCE</div>
                  <div className="text-slate-100 font-bold truncate">
                    {isNeutral ? (
                      <span className="text-slate-400">Neutral Territory</span>
                    ) : displayAllianceTag ? (
                      <span className="text-blue-300">
                        {displayAllianceName} [{displayAllianceTag}]
                      </span>
                    ) : (
                      <span className="text-slate-400">Independent</span>
                    )}
                  </div>
                  <div className="text-slate-500 text-[9px] truncate">
                    {isNeutral ? 'Unclaimed Territory' : displayAllianceTag ? 'Coalition Member' : 'No Alliance'}
                  </div>
                </div>
                <div className="p-1.5 rounded bg-slate-950 border border-slate-800/80">
                  <div className="text-slate-500">SECTOR & GRID</div>
                  <div className="text-slate-200 font-bold truncate">{currentMapName}</div>
                  <div className="text-amber-300">
                    Coords: X:{base.x}, Y:{base.y}
                  </div>
                </div>
                <div className="p-1.5 rounded bg-slate-950 border border-slate-800/80">
                  <div className="text-slate-500">ARMOR & PROTECTION</div>
                  <div className="text-indigo-300 font-bold">{armorMultiplier.toFixed(1)}x Reinforced Armor</div>
                  <div className="text-emerald-400">
                    {isHomeBase ? 'Capture Immune (HQ)' : 'Capturable Sector Base'}
                  </div>
                </div>
              </div>

              {/* Tactical Capture Attribution Card */}
              <div className="p-2 rounded bg-slate-950 border border-slate-800/90 text-[10px] space-y-1">
                <div className="flex items-center justify-between border-b border-slate-800/70 pb-1">
                  <span className="text-slate-400 font-bold text-[9px] uppercase tracking-wider flex items-center gap-1">
                    <Target className="w-3 h-3 text-cyan-400" />
                    <span>Tactical Capture Attribution</span>
                  </span>
                  {base.capturedAt && (
                    <span className="text-slate-500 text-[9px]">
                      {new Date(base.capturedAt).toLocaleTimeString()}
                    </span>
                  )}
                </div>

                {isHomeBase ? (
                  <div className="text-slate-300 text-[10px] py-0.5">
                    <span className="text-slate-500">ORIGIN:</span> Permanent Command Headquarters of{' '}
                    <span className="text-purple-300 font-bold">{base.ownerName}</span>
                  </div>
                ) : isNeutral ? (
                  <div className="text-slate-400 text-[10px] py-0.5">
                    {base.previousOwnerName ? (
                      <span>
                        <span className="text-slate-500">STATUS:</span> Neutralized. Former Controller:{' '}
                        <span className="text-amber-300 font-bold">{base.previousOwnerName}</span>
                      </span>
                    ) : (
                      <span>
                        <span className="text-slate-500">STATUS:</span> Unclaimed Sector Base. Ready for conquest.
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="space-y-0.5 py-0.5">
                    <div className="text-[10px] flex items-center gap-1 flex-wrap">
                      <span className="text-slate-500">CAPTURED BY:</span>
                      <span className="text-emerald-400 font-bold text-xs">{base.capturedByName || base.ownerName}</span>
                      {base.capturedAllianceTag && (
                        <span className="px-1 py-0.2 rounded bg-blue-950 border border-blue-500/50 text-blue-300 font-mono text-[9px] font-bold">
                          [{base.capturedAllianceTag}]
                        </span>
                      )}
                    </div>
                    {base.previousOwnerName && (
                      <div className="text-[9px] text-slate-500">
                        Seized from former owner: <span className="text-rose-400">{base.previousOwnerName}</span>
                      </div>
                    )}
                  </div>
                )}

                {base.captureHistory && base.captureHistory.length > 0 && (
                  <div className="mt-1 pt-1 border-t border-slate-900 text-[9px] text-slate-400">
                    <div className="text-slate-500 font-bold mb-0.5">CAPTURE LOG:</div>
                    <div className="space-y-0.5 max-h-20 overflow-y-auto">
                      {base.captureHistory.map((rec) => (
                        <div key={rec.id} className="flex items-center justify-between text-[9px]">
                          <span className="text-slate-300">
                            Captured by <strong className="text-cyan-300">{rec.capturedByName}</strong>
                            {rec.allianceTag ? ` [${rec.allianceTag}]` : ''}
                          </span>
                          <span className="text-slate-500 font-mono">
                            {new Date(rec.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {isHomeBase && (
                <div className="p-2 rounded bg-indigo-950/30 border border-indigo-500/30 text-[10px] text-indigo-200 leading-relaxed">
                  <span className="font-bold text-indigo-300">HOME BASE DOCTRINE:</span> Your Home Base cannot be
                  captured by enemy forces and receives a {armorMultiplier}x structural armor bonus. If destroyed in a
                  siege, it automatically reconstructs at a safe perimeter coordinate while preserving persistent HQ
                  command & storage levels.
                </div>
              )}
            </div>

            {/* Active Construction & Production Activity Summary */}
            <div className="p-2.5 rounded bg-slate-900 border border-slate-800 space-y-2">
              <div className="text-[10px] font-bold uppercase text-slate-300">
                Active Operations ({base.constructionQueue.length} Build / {base.productionQueue.length} Unit)
              </div>

              {base.constructionQueue.length === 0 && base.productionQueue.length === 0 ? (
                <div className="text-[11px] text-slate-500 py-1">
                  All engineering bays and vehicle assembly lines are standing by.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {base.constructionQueue.map((order) => {
                    const bDef = BUILDING_CATALOG[order.buildingType];
                    const remainSec = Math.max(0, Math.round((order.finishTime - now) / 1000));
                    return (
                      <div
                        key={order.id}
                        className="p-1.5 rounded bg-slate-950 border border-slate-800 flex items-center justify-between text-[10px]"
                      >
                        <div>
                          <span className="text-blue-400 font-bold">[BUILD]</span>{' '}
                          <span className="text-slate-200">{bDef?.name}</span>{' '}
                          <span className="text-cyan-400">LVL {order.targetLevel}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-amber-400">{remainSec}s</span>
                          {isOwner && onCancelBuild && (
                            <button
                              onClick={() => onCancelBuild(base.id, order.id)}
                              className="px-1.5 py-0.5 rounded bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-700/60"
                              title="Cancel construction and refund 100% resources"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {base.productionQueue.map((prod) => {
                    const uDef = UNIT_CATALOG[prod.unitType];
                    const remainSec = Math.max(0, Math.round((prod.finishTime - now) / 1000));
                    return (
                      <div
                        key={prod.id}
                        className="p-1.5 rounded bg-slate-950 border border-slate-800 flex items-center justify-between text-[10px]"
                      >
                        <div>
                          <span className="text-emerald-400 font-bold">[UNIT]</span>{' '}
                          <span className="text-slate-200">{uDef?.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-amber-400">{remainSec}s</span>
                          {isOwner && onCancelUnit && (
                            <button
                              onClick={() => onCancelUnit(base.id, prod.id)}
                              className="px-1.5 py-0.5 rounded bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-700/60"
                              title="Cancel unit training and refund 100% resources"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Strategic Home Map Relocation Control (Owner Home Base Only) */}
            {isOwner && isHomeBase && onChangeHomeMap && maps.length > 0 && (
              <div className="p-2.5 rounded bg-slate-900 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase text-cyan-300 flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5" />
                    <span>Home Map Sector Assignment & Relocation</span>
                  </span>
                  {cooldownRemainingSec > 0 && (
                    <span className="text-[9px] text-amber-400">Cooldown: {cooldownRemainingSec}s</span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 leading-tight">
                  Relocate your permanent Command Headquarters to an unobstructed coordinate on another theater map
                  sector. Persistent buildings, resources, and queues transfer automatically.
                </p>
                <div className="flex items-center gap-1.5">
                  <select
                    value={targetRelocateMapId}
                    onChange={(e) => setTargetRelocateMapId(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[10px] text-slate-200"
                  >
                    {maps.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.width}x{m.height})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => onChangeHomeMap(targetRelocateMapId)}
                    disabled={cooldownRemainingSec > 0 || targetRelocateMapId === base.mapId}
                    className="px-2.5 py-1 rounded bg-cyan-700 hover:bg-cyan-600 disabled:bg-slate-800 disabled:text-slate-500 text-white text-[10px] font-bold uppercase transition"
                  >
                    Relocate HQ
                  </button>
                </div>
              </div>
            )}

            {/* Destruction & Reconstruction Log */}
            {isHomeBase && base.destructionHistory && base.destructionHistory.length > 0 && (
              <div className="p-2.5 rounded bg-slate-900 border border-slate-800 space-y-1.5">
                <div className="text-[10px] font-bold uppercase text-amber-300">
                  HQ Reconstruction History ({base.destructionHistory.length})
                </div>
                {base.destructionHistory.slice(-3).map((rec) => (
                  <div
                    key={rec.id}
                    className="p-1.5 rounded bg-slate-950 border border-slate-800 text-[10px] text-slate-300"
                  >
                    <div>
                      Relocated [{rec.previousCoords.x},{rec.previousCoords.y}] → [{rec.newCoords.x},{rec.newCoords.y}]
                    </div>
                    <div className="text-[9px] text-slate-500">
                      Preserved {rec.persistentBuildingsPreserved.length} HQ structures · Reset {rec.resetBuildingsCount} starter
                      facilities
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===================================================================
            TAB 2: RESOURCE MANAGEMENT
           =================================================================== */}
        {activeTab === 'resources' && (
          <div className="space-y-2.5">
            <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase text-slate-200 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Authoritative Logistics & Silo Telemetry</span>
                </span>
                <span className="text-[10px] text-slate-400">
                  Cap: {(base.storageCap?.concrete || 6000).toLocaleString()}
                </span>
              </div>

              <div className="space-y-2.5">
                {(
                  [
                    { key: 'concrete', label: 'CONCRETE', color: 'bg-slate-400', text: 'text-slate-200' },
                    { key: 'steel', label: 'STEEL', color: 'bg-blue-500', text: 'text-blue-300' },
                    { key: 'aluminum', label: 'ALUMINUM', color: 'bg-cyan-400', text: 'text-cyan-300' },
                    { key: 'fuel', label: 'PROMETHIUM FUEL', color: 'bg-amber-500', text: 'text-amber-300' },
                  ] as const
                ).map((res) => {
                  const current = Math.floor(base.resources[res.key] || 0);
                  const cap = base.storageCap?.[res.key] || 6000;
                  const prodRate = Number((base.productionRates?.[res.key] || 0).toFixed(1));
                  const consRate = Number((base.consumptionRates?.[res.key] || 0).toFixed(1));
                  const netRate = Number((prodRate - consRate).toFixed(1));
                  const utilPct = Math.min(100, Math.round((current / Math.max(1, cap)) * 100));
                  const eta = formatEta(current, cap, prodRate, consRate);

                  return (
                    <div key={res.key} className="p-2 rounded bg-slate-950 border border-slate-800 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className={`font-bold text-[11px] ${res.text}`}>{res.label}</span>
                        <span className="font-bold text-white tabular-nums">
                          {current.toLocaleString()} / {cap.toLocaleString()} ({utilPct}%)
                        </span>
                      </div>

                      <div className="w-full h-2 bg-slate-800 rounded overflow-hidden">
                        <div className={`h-full ${res.color} transition-all`} style={{ width: `${utilPct}%` }} />
                      </div>

                      <div className="grid grid-cols-3 gap-1 text-[10px] pt-0.5 text-slate-400">
                        <div>
                          PROD: <span className="text-emerald-400 font-semibold">+{prodRate}/s</span>
                        </div>
                        <div>
                          CONS: <span className="text-rose-400 font-semibold">-{consRate}/s</span>
                        </div>
                        <div className="text-right">
                          ETA CAP:{' '}
                          <span className="text-cyan-300 font-semibold">
                            {eta} ({netRate >= 0 ? `+${netRate}` : netRate}/s)
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 3: CATEGORIZED CONSTRUCTION & UPGRADES
           =================================================================== */}
        {activeTab === 'buildings' && (
          <div className="space-y-2">
            {/* Category Filter Pills */}
            <div className="flex flex-wrap gap-1 pb-1">
              {(
                [
                  { id: 'all', label: 'ALL' },
                  { id: 'hq', label: 'COMMAND' },
                  { id: 'economy', label: 'ECONOMY' },
                  { id: 'production', label: 'MOTOR POOL' },
                  { id: 'defense', label: 'DEFENSE' },
                ] as const
              ).map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setBuildingCategoryFilter(cat.id)}
                  className={`px-2 py-1 rounded text-[9px] font-bold transition border ${
                    buildingCategoryFilter === cat.id
                      ? 'bg-blue-600/30 border-blue-500 text-blue-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {!isOwner && (
              <div className="p-2 rounded bg-slate-900/90 border border-amber-600/40 text-[10px] text-amber-300 font-mono flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>
                  {isNeutralized
                    ? 'Facility engineering offline: installation is NEUTRALIZED. Deploy a Dominator to conquer and assume command.'
                    : 'Facility engineering locked: installation belongs to another commander.'}
                </span>
              </div>
            )}

            {availableBuildings.map((def) => {
              const existing = base.buildings.find((b) => b.type === def.type);
              const currentLevel = existing ? existing.level : 0;
              const isMax = currentLevel >= def.maxLevel;
              const activeOrder = base.constructionQueue.find((o) => o.buildingType === def.type);
              const isUnderConstruction = Boolean(activeOrder);
              const isPersistentOnHq = PERSISTENT_HQ_BUILDING_TYPES.has(def.type);

              const costMult = currentLevel === 0 ? 1 : 1 + currentLevel * 0.5;
              const reqConcrete = Math.round(def.cost.concrete * costMult);
              const reqSteel = Math.round(def.cost.steel * costMult);
              const reqAlum = Math.round(def.cost.aluminum * costMult);
              const reqFuel = Math.round(def.cost.fuel * costMult);

              const canAfford =
                base.resources.concrete >= reqConcrete &&
                base.resources.steel >= reqSteel &&
                base.resources.aluminum >= reqAlum &&
                base.resources.fuel >= reqFuel;

              return (
                <div
                  key={def.type}
                  className="p-2 rounded bg-slate-900 border border-slate-800 text-slate-200 space-y-1.5"
                >
                  <div className="flex gap-2.5">
                    <div className="w-12 h-12 shrink-0 rounded bg-slate-950 border border-slate-800 flex items-center justify-center overflow-hidden">
                      <BuildingPreview type={def.type} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className="font-bold text-slate-100 font-mono text-[11px] truncate">
                          {def.name}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          {isHomeBase && (
                            <span
                              className={`text-[8px] px-1 py-0.5 rounded font-mono ${
                                isPersistentOnHq
                                  ? 'bg-purple-950/90 text-purple-300 border border-purple-600/40'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                              title={
                                isPersistentOnHq
                                  ? 'Persistent HQ structure: retains level if Home Base is rebuilt'
                                  : 'Standard facility: resets to Level 1 if Home Base is rebuilt'
                              }
                            >
                              {isPersistentOnHq ? 'PERSISTENT' : 'STANDARD'}
                            </span>
                          )}
                          <span className="text-[9px] px-1 py-0.5 rounded bg-slate-800 text-cyan-400 font-mono">
                            LVL {currentLevel}
                            {!isMax ? ` → ${currentLevel + 1}` : ` (MAX)`}
                          </span>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-tight line-clamp-2">{def.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[9px] text-slate-400 pt-1 border-t border-slate-800/80">
                    <span>Build Time: {def.buildTimeSec}s</span>
                    <span>Category: {def.category.toUpperCase()}</span>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-[10px] font-mono">
                    <div className="flex items-center gap-1.5 text-slate-300">
                      <span className={base.resources.concrete < reqConcrete ? 'text-rose-400' : ''}>
                        C:{reqConcrete}
                      </span>
                      <span className={base.resources.steel < reqSteel ? 'text-rose-400' : ''}>S:{reqSteel}</span>
                      <span className={base.resources.aluminum < reqAlum ? 'text-rose-400' : ''}>A:{reqAlum}</span>
                      <span className={base.resources.fuel < reqFuel ? 'text-rose-400' : ''}>F:{reqFuel}</span>
                    </div>

                    {isOwner && (
                      <div className="flex items-center gap-1">
                        {isUnderConstruction && activeOrder && onCancelBuild ? (
                          <button
                            onClick={() => onCancelBuild(base.id, activeOrder.id)}
                            className="px-2 py-1 rounded bg-rose-950/90 hover:bg-rose-900 text-rose-200 border border-rose-700/60 font-semibold flex items-center gap-1 transition"
                          >
                            <XCircle className="w-3 h-3" />
                            <span>CANCEL</span>
                          </button>
                        ) : (
                          <>
                            {currentLevel === 0 && !isUnderConstruction && onStartPlaceBuilding3D && (
                              <button
                                onClick={() => onStartPlaceBuilding3D(base.id, def.type)}
                                disabled={!canAfford}
                                className={`px-2 py-1 rounded font-semibold flex items-center gap-1 transition ${
                                  canAfford
                                    ? 'bg-cyan-900/70 hover:bg-cyan-800 text-cyan-200 border border-cyan-600/50'
                                    : 'bg-slate-800 text-slate-600 cursor-not-allowed'
                                }`}
                                title="Interactive 3D Placement Preview on Battlefield"
                              >
                                <MapPin className="w-3 h-3" />
                                <span>3D PLACE</span>
                              </button>
                            )}
                            <button
                              onClick={() => onBuild(base.id, def.type)}
                              disabled={isMax || isUnderConstruction || !canAfford}
                              className={`px-2.5 py-1 rounded font-semibold flex items-center gap-1 transition ${
                                isMax
                                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                  : isUnderConstruction
                                  ? 'bg-amber-950 text-amber-400 border border-amber-800 cursor-not-allowed'
                                  : canAfford
                                  ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-sm'
                                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                              }`}
                            >
                              {currentLevel === 0 ? (
                                <>
                                  <Hammer className="w-3 h-3" />
                                  <span>BUILD</span>
                                </>
                              ) : (
                                <>
                                  <ArrowUpCircle className="w-3 h-3" />
                                  <span>UPGRADE</span>
                                </>
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ===================================================================
            TAB 4: UNIT PRODUCTION & MOTOR POOL QUEUE
           =================================================================== */}
        {activeTab === 'units' && (
          <div className="space-y-2.5">
            {isHomeBase && (
              <div className="p-2 rounded bg-slate-900 border border-slate-800 flex items-center justify-between text-[10px]">
                <div>
                  <div className="font-bold text-cyan-300 uppercase">HQ Ground Motor Pool Specialization</div>
                  <div className="text-slate-400">
                    Spawn Coordinates: [{base.x + 2}, {base.y + 2}] · Queue: {base.productionQueue.length} / 5
                  </div>
                </div>
                <span className="px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-600/40 font-bold">
                  GROUND VEHICLES
                </span>
              </div>
            )}

            {/* Active Production Queue with Progress & Cancel */}
            {base.productionQueue.length > 0 && (
              <div className="p-2 rounded bg-slate-900 border border-slate-800 space-y-1.5">
                <div className="text-[10px] font-bold uppercase text-emerald-400">
                  Active Assembly Queue ({base.productionQueue.length}/5)
                </div>
                {base.productionQueue.map((prod) => {
                  const uDef = UNIT_CATALOG[prod.unitType];
                  const total = Math.max(1, prod.finishTime - prod.startTime);
                  const elapsed = Math.max(0, now - prod.startTime);
                  const pct = Math.min(100, Math.max(0, (elapsed / total) * 100));
                  const remainSec = Math.max(0, Math.round((prod.finishTime - now) / 1000));
                  const isBlocked = prod.status === 'WAITING FOR RAIL ACCESS' || prod.status === 'RAIL SPAWN BLOCKED';

                  return (
                    <div key={prod.id} className={`p-1.5 rounded border ${isBlocked ? 'bg-amber-950/40 border-amber-500/60' : 'bg-slate-950 border-slate-800'}`}>
                      <div className="flex items-center justify-between text-[10px] mb-1">
                        <span className="font-bold text-slate-200">{uDef?.name}</span>
                        <div className="flex items-center gap-2">
                          {isBlocked ? (
                            <span className="text-amber-400 font-bold uppercase tracking-wider text-[9px] animate-pulse">
                              {prod.status}
                            </span>
                          ) : (
                            <span className="text-amber-400">{remainSec}s</span>
                          )}
                          {isOwner && onCancelUnit && (
                            <button
                              onClick={() => onCancelUnit(base.id, prod.id)}
                              className="px-1.5 py-0.5 rounded bg-rose-950 hover:bg-rose-900 text-rose-200 border border-rose-700/60"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                      {isBlocked && prod.blockedReason && (
                        <div className="text-[9px] text-amber-300 font-mono mb-1">
                          ⚠ {prod.blockedReason}
                        </div>
                      )}
                      <div className="w-full h-1.5 bg-slate-800 rounded overflow-hidden">
                        <div className={`h-full transition-all ${isBlocked ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {availableUnits.length === 0 ? (
              <div className="p-4 text-center text-slate-500 text-xs font-mono bg-slate-900 border border-slate-800 rounded">
                No production facilities active. Construct a Vehicle Assembly or Infantry Barracks first!
              </div>
            ) : (
              availableUnits.map((uDef) => {
                const canAfford =
                  base.resources.concrete >= uDef.cost.concrete &&
                  base.resources.steel >= uDef.cost.steel &&
                  base.resources.aluminum >= uDef.cost.aluminum &&
                  base.resources.fuel >= uDef.cost.fuel &&
                  base.productionQueue.length < 5;

                return (
                  <div
                    key={uDef.type}
                    className="p-2 rounded bg-slate-900 border border-slate-800 text-slate-200 text-xs"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-100 font-mono">{uDef.name}</span>
                        <span className="text-[10px] px-1 rounded bg-slate-800 text-indigo-400 uppercase font-mono">
                          {uDef.category}
                        </span>
                      </div>
                      <span className="text-[10px] text-amber-400 font-mono">{uDef.trainTimeSec}s</span>
                    </div>

                    <p className="text-[10px] text-slate-400 mb-2">{uDef.description}</p>

                    <div className="grid grid-cols-4 gap-1 mb-2 text-[10px] font-mono text-center">
                      <div className="p-1 rounded bg-slate-950 border border-slate-800">
                        <div className="text-slate-500">HP</div>
                        <div className="text-emerald-400 font-bold">{uDef.maxHealth}</div>
                      </div>
                      <div className="p-1 rounded bg-slate-950 border border-slate-800">
                        <div className="text-slate-500">ARMOR</div>
                        <div className="text-blue-400 font-bold">{uDef.armor}%</div>
                      </div>
                      <div className="p-1 rounded bg-slate-950 border border-slate-800">
                        <div className="text-slate-500">RANGE</div>
                        <div className="text-amber-400 font-bold">{uDef.attackRange}</div>
                      </div>
                      <div className="p-1 rounded bg-slate-950 border border-slate-800">
                        <div className="text-slate-500">DPS</div>
                        <div className="text-rose-400 font-bold">
                          {Math.round(uDef.attackDamage / uDef.cooldownSec)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-[10px] font-mono">
                      <div className="flex items-center gap-2 text-slate-300">
                        <span>C:{uDef.cost.concrete}</span>
                        <span>S:{uDef.cost.steel}</span>
                        <span>A:{uDef.cost.aluminum}</span>
                        <span>F:{uDef.cost.fuel}</span>
                      </div>

                      {isOwner && (
                        <button
                          onClick={() => onProduceUnit(base.id, uDef.type)}
                          disabled={!canAfford}
                          className={`px-3 py-1 rounded font-semibold flex items-center gap-1 transition ${
                            canAfford
                              ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-sm'
                              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          <Crosshair className="w-3 h-3" />
                          <span>PRODUCE</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ===================================================================
            TAB 5: DEFENSES & STRUCTURAL REPAIR
           =================================================================== */}
        {activeTab === 'defenses' && (
          <div className="space-y-2.5">
            <div className="p-2.5 rounded bg-slate-900 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase text-slate-200">
                  Perimeter Defense Emplacements ({defenseBuildings.length})
                </span>
                <span
                  className={`text-[10px] font-bold ${
                    base.defensesIntact ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {base.defensesIntact ? 'PERIMETER ONLINE' : 'NO ACTIVE TURRETS'}
                </span>
              </div>

              {defenseBuildings.length === 0 ? (
                <div className="text-[11px] text-slate-500 py-2">
                  No defensive turrets or shield generators constructed. Build Automated Turrets or SAM Sites in the
                  BUILD tab!
                </div>
              ) : (
                <div className="space-y-1.5">
                  {defenseBuildings.map((b) => {
                    const def = BUILDING_CATALOG[b.type];
                    const bHpPct = Math.round((b.health / Math.max(1, b.maxHealth)) * 100);
                    return (
                      <div
                        key={b.id}
                        className="p-2 rounded bg-slate-950 border border-slate-800 flex items-center justify-between"
                      >
                        <div>
                          <div className="text-[11px] font-bold text-slate-200">
                            {def?.name || b.type} <span className="text-cyan-400">LVL {b.level}</span>
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Integrity: {Math.round(b.health)}/{b.maxHealth} ({bHpPct}%)
                            {def?.defenseStats
                              ? ` · DMG ${def.defenseStats.damage} · RNG ${def.defenseStats.range}`
                              : ''}
                          </div>
                        </div>

                        {b.health < b.maxHealth ? (
                          isOwner &&
                          onRepairBuilding && (
                            <button
                              onClick={() => onRepairBuilding(base.id, b.id)}
                              className="px-2 py-1 rounded bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-600/50 text-[10px] font-bold flex items-center gap-1"
                            >
                              <Wrench className="w-3 h-3" />
                              <span>Repair</span>
                            </button>
                          )
                        ) : (
                          <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>READY</span>
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Damaged Facilities & Individual Repair Controls */}
            <div className="p-2.5 rounded bg-slate-900 border border-slate-800 space-y-2">
              <div className="text-[11px] font-bold uppercase text-slate-200">
                Facility Damage Control ({damagedBuildings.length} Damaged)
              </div>

              {damagedBuildings.length === 0 ? (
                <div className="text-[11px] text-emerald-400 flex items-center gap-1.5 py-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>All {base.buildings.length} compound structures are at 100% integrity.</span>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {damagedBuildings.map((b) => {
                    const def = BUILDING_CATALOG[b.type];
                    return (
                      <div
                        key={b.id}
                        className="p-2 rounded bg-slate-950 border border-rose-800/50 flex items-center justify-between"
                      >
                        <div>
                          <div className="text-[11px] font-bold text-slate-200">
                            {def?.name || b.type} (LVL {b.level})
                          </div>
                          <div className="text-[10px] text-rose-400">
                            HP: {Math.round(b.health)} / {b.maxHealth}
                          </div>
                        </div>
                        {isOwner && onRepairBuilding && (
                          <button
                            onClick={() => onRepairBuilding(base.id, b.id)}
                            className="px-2 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-[10px] font-bold flex items-center gap-1"
                          >
                            <Wrench className="w-3 h-3" />
                            <span>Repair Structure</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const BuildingPreview: React.FC<{ type: BuildingType }> = ({ type }) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const sprite = assetManager.getSpriteCanvas(type);
    if (!sprite) return;

    ctx.clearRect(0, 0, 64, 64);
    const scale = Math.min(56 / sprite.width, 56 / sprite.height);
    const w = sprite.width * scale;
    const h = sprite.height * scale;

    ctx.drawImage(sprite, 32 - w / 2, 32 - h / 2, w, h);
  }, [type]);

  return <canvas ref={canvasRef} width={64} height={64} className="w-11 h-11 block" />;
};

