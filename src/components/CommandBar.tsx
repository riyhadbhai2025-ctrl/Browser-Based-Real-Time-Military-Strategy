import React from 'react';
import {
  Crosshair,
  Navigation,
  ShieldAlert,
  Square,
  CornerDownLeft,
  RotateCcw,
  Focus,
  Shield,
  Gauge,
  Zap,
  Users,
  Home,
} from 'lucide-react';
import { Unit } from '../types/game';
import { UNIT_CATALOG } from '../game/catalog';

interface CommandBarProps {
  selectedUnits: Unit[];
  allPlayerUnitsCount?: number;
  activeCommand: string;
  onSetCommand: (command: 'move' | 'attack' | 'hold' | 'patrol' | 'retreat' | 'stop') => void;
  onSelectSingleUnit: (id: string) => void;
  onSelectAllUnits?: () => void;
  onJumpToHome?: () => void;
  onFocusUnit?: (unit: Unit) => void;
  controlGroups: Record<number, string[]>;
  onRecallGroup: (groupNum: number) => void;
  onAssignGroup: (groupNum: number) => void;
}

export const CommandBar: React.FC<CommandBarProps> = ({
  selectedUnits,
  allPlayerUnitsCount = 0,
  activeCommand,
  onSetCommand,
  onSelectSingleUnit,
  onSelectAllUnits,
  onJumpToHome,
  onFocusUnit,
  controlGroups,
  onRecallGroup,
  onAssignGroup,
}) => {
  const unitCountsByType: Record<string, { count: number; units: Unit[] }> = {};
  selectedUnits.forEach((u) => {
    if (!unitCountsByType[u.type]) {
      unitCountsByType[u.type] = { count: 0, units: [] };
    }
    unitCountsByType[u.type].count++;
    unitCountsByType[u.type].units.push(u);
  });

  const firstUnit = selectedUnits[0];
  const firstDef = firstUnit ? UNIT_CATALOG[firstUnit.type] : null;
  const firstHpPct =
    firstUnit && firstDef ? Math.max(0, Math.min(1, firstUnit.health / firstDef.maxHealth)) : 1;

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1 select-none pointer-events-auto">
      {/* Control Groups Bar (Ctrl+1..9) */}
      <div className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-950/95 border border-slate-800 text-[10px] font-mono text-slate-300 shadow-lg">
        <span className="text-slate-500 mr-1">SQUADS (CTRL+1-9):</span>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => {
          const hasUnits = controlGroups[g] && controlGroups[g].length > 0;
          return (
            <button
              key={g}
              onClick={() => onRecallGroup(g)}
              onContextMenu={(e) => {
                e.preventDefault();
                onAssignGroup(g);
              }}
              className={`px-1.5 py-0.5 rounded font-mono transition ${
                hasUnits
                  ? 'bg-blue-900/80 text-blue-200 border border-blue-500/60 hover:bg-blue-800'
                  : 'bg-slate-900 text-slate-500 hover:text-slate-300'
              }`}
              title={`Left-click to recall Squad ${g}, Right-click or Ctrl+${g} to assign selected`}
            >
              #{g}
            </button>
          );
        })}
      </div>

      {/* Main Tactical Command Console */}
      {selectedUnits.length === 0 ? (
        <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-slate-950/95 border border-slate-800 shadow-2xl text-xs font-mono text-slate-300">
          <span className="text-slate-400">
            LEFT-CLICK OR DRAG-BOX UNITS TO ISSUE 3D TACTICAL ORDERS
          </span>
          {onSelectAllUnits && allPlayerUnitsCount > 0 && (
            <button
              onClick={onSelectAllUnits}
              className="px-2.5 py-1 rounded bg-blue-700 hover:bg-blue-600 text-white font-semibold flex items-center gap-1.5 transition"
              title="Select All Active Friendly Forces (Home)"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Select All Forces ({allPlayerUnitsCount})</span>
            </button>
          )}
          {onJumpToHome && (
            <button
              onClick={onJumpToHome}
              className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 flex items-center gap-1.5 transition"
              title="Center Camera on Fortress Alpha HQ (Space)"
            >
              <Home className="w-3.5 h-3.5" />
              <span>Fortress Alpha HQ</span>
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-950/95 border border-slate-800 shadow-2xl">
          {/* Left: Selected Unit Live Telemetry Inspector */}
          {firstUnit && firstDef && (
            <div className="hidden lg:flex items-center gap-3 pr-3 border-r border-slate-800 min-w-[265px]">
              <div className="flex flex-col items-center justify-center w-12 h-12 rounded bg-slate-900 border border-blue-500/50 text-cyan-300 font-mono">
                <span className="text-[9px] text-slate-400 uppercase">{firstDef.category}</span>
                <span className="text-xs font-bold text-blue-300">
                  {selectedUnits.length > 1 ? `${selectedUnits.length}x` : '1x'}
                </span>
              </div>

              <div className="flex-1 text-[10px] font-mono">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-xs text-slate-100 truncate max-w-[150px]">
                    {firstDef.name}
                  </span>
                  <span className="text-cyan-400 uppercase font-semibold">{firstUnit.command}</span>
                </div>
                <div className="text-[10px] text-slate-400 truncate mb-1">{firstDef.role}</div>

                {/* Health Bar */}
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex-1 h-1.5 bg-slate-800 rounded overflow-hidden">
                    <div
                      className={`h-full ${
                        firstHpPct > 0.5
                          ? 'bg-emerald-500'
                          : firstHpPct > 0.25
                          ? 'bg-amber-500'
                          : 'bg-rose-500'
                      }`}
                      style={{ width: `${firstHpPct * 100}%` }}
                    />
                  </div>
                  <span className="text-slate-200 font-semibold">
                    {Math.round(firstUnit.health)}/{firstDef.maxHealth} HP
                  </span>
                </div>

                {/* Live Combat Statistics from Real Game State */}
                <div className="grid grid-cols-4 gap-1.5 text-[9px] text-slate-300 pt-0.5 border-t border-slate-800/80">
                  <div title="Attack Damage">
                    <Zap className="w-2.5 h-2.5 inline text-amber-400 mr-0.5" />
                    <span>DMG {firstDef.attackDamage}</span>
                  </div>
                  <div title="Armor Rating">
                    <Shield className="w-2.5 h-2.5 inline text-blue-400 mr-0.5" />
                    <span>ARM {firstDef.armor}</span>
                  </div>
                  <div title="Weapon Range">
                    <Crosshair className="w-2.5 h-2.5 inline text-rose-400 mr-0.5" />
                    <span>RNG {firstDef.attackRange}m</span>
                  </div>
                  <div title="Movement Speed">
                    <Gauge className="w-2.5 h-2.5 inline text-emerald-400 mr-0.5" />
                    <span>SPD {firstDef.speed}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Center: Selected Units Group Cards */}
          <div className="flex items-center gap-1.5 max-w-md overflow-x-auto pr-2 border-r border-slate-800">
            {Object.entries(unitCountsByType).map(([type, data]) => {
              const def = UNIT_CATALOG[type as keyof typeof UNIT_CATALOG];
              const avgHp = Math.round(data.units.reduce((acc, u) => acc + u.health, 0) / data.count);
              const maxHp = def?.maxHealth || 1000;
              const hpPct = Math.max(0, avgHp / maxHp);

              return (
                <div
                  key={type}
                  onClick={() => onSelectSingleUnit(data.units[0].id)}
                  onDoubleClick={() => onFocusUnit && onFocusUnit(data.units[0])}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700/80 transition cursor-pointer"
                  title="Click to inspect single unit, Double-click to center 3D camera"
                >
                  <div className="w-7 h-7 rounded bg-blue-950 border border-blue-500/50 flex items-center justify-center font-mono font-bold text-xs text-cyan-300">
                    {data.count}x
                  </div>
                  <div className="text-left">
                    <div className="text-[11px] font-bold text-slate-100 truncate max-w-[110px] font-mono">
                      {def?.name || type}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className="w-14 h-1.5 bg-slate-800 rounded overflow-hidden">
                        <div
                          className={`h-full ${
                            hpPct > 0.5 ? 'bg-emerald-500' : hpPct > 0.25 ? 'bg-amber-500' : 'bg-rose-500'
                          }`}
                          style={{ width: `${hpPct * 100}%` }}
                        />
                      </div>
                      <span className="text-[9px] font-mono text-slate-400">{Math.round(hpPct * 100)}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right: Tactical Command Action Buttons */}
          <div className="flex items-center gap-1">
            {onFocusUnit && firstUnit && (
              <button
                onClick={() => onFocusUnit(firstUnit)}
                className="flex flex-col items-center justify-center w-11 h-11 rounded text-[10px] font-mono font-semibold transition bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-700"
                title="Center 3D Camera on Selected Unit (C)"
              >
                <Focus className="w-4 h-4 mb-0.5 text-cyan-400" />
                <span>FOCUS</span>
              </button>
            )}

            <button
              onClick={() => onSetCommand('move')}
              className={`flex flex-col items-center justify-center w-12 h-11 rounded text-[10px] font-mono font-semibold transition border ${
                activeCommand === 'move'
                  ? 'bg-blue-600 text-white border-blue-400 shadow'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
              }`}
              title="Move order (Right-Click ground or press M)"
            >
              <Navigation className="w-4 h-4 mb-0.5 text-blue-300" />
              <span>MOVE</span>
            </button>

            <button
              onClick={() => onSetCommand('attack')}
              className={`flex flex-col items-center justify-center w-12 h-11 rounded text-[10px] font-mono font-semibold transition border ${
                activeCommand === 'attack'
                  ? 'bg-rose-600 text-white border-rose-400 shadow'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
              }`}
              title="Attack / Attack-Move (Right-Click target or press A)"
            >
              <Crosshair className="w-4 h-4 mb-0.5 text-rose-300" />
              <span>ATTACK</span>
            </button>

            <button
              onClick={() => onSetCommand('hold')}
              className={`flex flex-col items-center justify-center w-12 h-11 rounded text-[10px] font-mono font-semibold transition border ${
                activeCommand === 'hold'
                  ? 'bg-amber-600 text-white border-amber-400 shadow'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
              }`}
              title="Hold position (Press H)"
            >
              <ShieldAlert className="w-4 h-4 mb-0.5 text-amber-300" />
              <span>HOLD</span>
            </button>

            <button
              onClick={() => onSetCommand('patrol')}
              className={`flex flex-col items-center justify-center w-12 h-11 rounded text-[10px] font-mono font-semibold transition border ${
                activeCommand === 'patrol'
                  ? 'bg-emerald-600 text-white border-emerald-400 shadow'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
              }`}
              title="Patrol sector (Press P)"
            >
              <RotateCcw className="w-4 h-4 mb-0.5 text-emerald-300" />
              <span>PATROL</span>
            </button>

            <button
              onClick={() => onSetCommand('retreat')}
              className="flex flex-col items-center justify-center w-12 h-11 rounded text-[10px] font-mono font-semibold transition bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700"
              title="Retreat to friendly Home Base"
            >
              <CornerDownLeft className="w-4 h-4 mb-0.5 text-cyan-400" />
              <span>RETREAT</span>
            </button>

            <button
              onClick={() => onSetCommand('stop')}
              className="flex flex-col items-center justify-center w-12 h-11 rounded text-[10px] font-mono font-semibold transition bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700"
              title="Stop all movement and clear path (Press S)"
            >
              <Square className="w-4 h-4 mb-0.5 text-slate-400" />
              <span>STOP</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
