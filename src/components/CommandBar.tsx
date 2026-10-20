import React from 'react';
import { Crosshair, Navigation, ShieldAlert, Square, CornerDownLeft, RotateCcw } from 'lucide-react';
import { Unit } from '../types/game';
import { UNIT_CATALOG } from '../game/catalog';

interface CommandBarProps {
  selectedUnits: Unit[];
  activeCommand: string;
  onSetCommand: (command: 'move' | 'attack' | 'hold' | 'patrol' | 'retreat' | 'stop') => void;
  onSelectSingleUnit: (id: string) => void;
  controlGroups: Record<number, string[]>;
  onRecallGroup: (groupNum: number) => void;
  onAssignGroup: (groupNum: number) => void;
}

export const CommandBar: React.FC<CommandBarProps> = ({
  selectedUnits,
  activeCommand,
  onSetCommand,
  onSelectSingleUnit,
  controlGroups,
  onRecallGroup,
  onAssignGroup,
}) => {
  if (selectedUnits.length === 0) return null;

  // Group selected units by type
  const unitCountsByType: Record<string, { count: number; units: Unit[] }> = {};
  selectedUnits.forEach((u) => {
    if (!unitCountsByType[u.type]) {
      unitCountsByType[u.type] = { count: 0, units: [] };
    }
    unitCountsByType[u.type].count++;
    unitCountsByType[u.type].units.push(u);
  });

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5 select-none pointer-events-auto">
      {/* Control Groups bar */}
      <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-950/80 backdrop-blur border border-slate-800 text-[10px] font-mono text-slate-300">
        <span className="text-slate-500 mr-1">GROUPS:</span>
        {[1, 2, 3, 4, 5].map((g) => {
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
                  ? 'bg-blue-900/60 text-blue-300 border border-blue-600/50 hover:bg-blue-800'
                  : 'bg-slate-900 text-slate-500 hover:text-slate-300'
              }`}
              title={`Left-click to recall Group ${g}, Right-click to assign selected`}
            >
              G{g}
            </button>
          );
        })}
      </div>

      {/* Main Command & Unit Panel */}
      <div className="flex items-center gap-2 p-1.5 rounded-lg bg-slate-950/95 backdrop-blur-md border border-slate-800 shadow-2xl">
        {/* Selected Units Rosters */}
        <div className="flex items-center gap-1.5 max-w-sm overflow-x-auto pr-2 border-r border-slate-800">
          {Object.entries(unitCountsByType).map(([type, data]) => {
            const def = UNIT_CATALOG[type as keyof typeof UNIT_CATALOG];
            const avgHp = Math.round(data.units.reduce((acc, u) => acc + u.health, 0) / data.count);
            const maxHp = def?.maxHealth || 1000;
            const hpPct = Math.max(0, avgHp / maxHp);

            return (
              <button
                key={type}
                onClick={() => onSelectSingleUnit(data.units[0].id)}
                className="flex items-center gap-2 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700/60 transition text-left"
              >
                <div className="w-7 h-7 rounded bg-blue-950/80 border border-blue-500/40 flex items-center justify-center font-mono font-bold text-xs text-blue-300">
                  {data.count}x
                </div>
                <div className="text-left">
                  <div className="text-[11px] font-bold text-slate-200 truncate max-w-[110px]">
                    {def?.name || type}
                  </div>
                  <div className="w-16 h-1.5 bg-slate-800 rounded overflow-hidden mt-0.5">
                    <div
                      className={`h-full ${hpPct > 0.5 ? 'bg-emerald-500' : hpPct > 0.25 ? 'bg-amber-500' : 'bg-rose-500'}`}
                      style={{ width: `${hpPct * 100}%` }}
                    />
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Tactical Command Action Buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onSetCommand('move')}
            className={`flex flex-col items-center justify-center w-12 h-11 rounded text-[10px] font-mono font-semibold transition border ${
              activeCommand === 'move'
                ? 'bg-blue-600 text-white border-blue-400 shadow-blue-500/30 shadow'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
            }`}
            title="Move order (Right-Click ground or press M)"
          >
            <Navigation className="w-4 h-4 mb-0.5 text-blue-400" />
            <span>MOVE</span>
          </button>

          <button
            onClick={() => onSetCommand('attack')}
            className={`flex flex-col items-center justify-center w-12 h-11 rounded text-[10px] font-mono font-semibold transition border ${
              activeCommand === 'attack'
                ? 'bg-rose-600 text-white border-rose-400 shadow-rose-500/30 shadow'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
            }`}
            title="Attack / Attack-Move (Right-Click target or press A)"
          >
            <Crosshair className="w-4 h-4 mb-0.5 text-rose-400" />
            <span>ATTACK</span>
          </button>

          <button
            onClick={() => onSetCommand('hold')}
            className={`flex flex-col items-center justify-center w-12 h-11 rounded text-[10px] font-mono font-semibold transition border ${
              activeCommand === 'hold'
                ? 'bg-amber-600 text-white border-amber-400 shadow-amber-500/30 shadow'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
            }`}
            title="Hold position (Press H)"
          >
            <ShieldAlert className="w-4 h-4 mb-0.5 text-amber-400" />
            <span>HOLD</span>
          </button>

          <button
            onClick={() => onSetCommand('patrol')}
            className={`flex flex-col items-center justify-center w-12 h-11 rounded text-[10px] font-mono font-semibold transition border ${
              activeCommand === 'patrol'
                ? 'bg-emerald-600 text-white border-emerald-400 shadow'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
            }`}
            title="Patrol (Press P)"
          >
            <RotateCcw className="w-4 h-4 mb-0.5 text-emerald-400" />
            <span>PATROL</span>
          </button>

          <button
            onClick={() => onSetCommand('retreat')}
            className="flex flex-col items-center justify-center w-12 h-11 rounded text-[10px] font-mono font-semibold transition bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700"
            title="Retreat to friendly Home Base (Press R)"
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
    </div>
  );
};
