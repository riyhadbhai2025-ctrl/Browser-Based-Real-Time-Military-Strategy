import React from 'react';
import { X, Terminal, Plus, Shield, Battery, Droplets, RefreshCw } from 'lucide-react';
import { UnitType } from '../types/game';
import { UNIT_CATALOG } from '../game/catalog';

interface AdminModalProps {
  onClose: () => void;
  onSpawnUnit: (unitType: UnitType, isHostile: boolean) => void;
  onBoostResources: (amount: number) => void;
  onRepairAllBases: () => void;
}

export const AdminModal: React.FC<AdminModalProps> = ({
  onClose,
  onSpawnUnit,
  onBoostResources,
  onRepairAllBases,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none">
      <div className="w-full max-w-lg rounded-xl bg-slate-950 border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-amber-400" />
            <h2 className="font-bold text-sm text-slate-100 font-mono tracking-wider">
              COMMANDER SANDBOX & SIMULATION CONTROLS
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-800 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto text-xs">
          {/* Quick Resource Boost */}
          <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
            <h3 className="font-bold text-xs font-mono text-slate-300 uppercase mb-2">Resource Logistics</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onBoostResources(5000)}
                className="flex-1 py-1.5 px-3 rounded bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-600/50 text-emerald-300 font-mono font-semibold transition text-center"
              >
                +5,000 All Resources
              </button>
              <button
                onClick={() => onBoostResources(20000)}
                className="flex-1 py-1.5 px-3 rounded bg-blue-950/60 hover:bg-blue-900/80 border border-blue-600/50 text-blue-300 font-mono font-semibold transition text-center"
              >
                +20,000 All Resources
              </button>
            </div>
          </div>

          {/* Quick Spawn Friendly Forces */}
          <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
            <h3 className="font-bold text-xs font-mono text-slate-300 uppercase mb-2">
              Spawn Friendly Unit (at camera center)
            </h3>
            <div className="grid grid-cols-2 gap-1.5 font-mono">
              {Object.values(UNIT_CATALOG).map((u) => (
                <button
                  key={u.type}
                  onClick={() => onSpawnUnit(u.type, false)}
                  className="py-1 px-2 rounded bg-slate-800 hover:bg-blue-600 text-slate-300 hover:text-white border border-slate-700/60 text-left transition flex items-center justify-between"
                >
                  <span className="truncate">{u.name}</span>
                  <Plus className="w-3 h-3 shrink-0 ml-1" />
                </button>
              ))}
            </div>
          </div>

          {/* Quick Spawn Hostile Forces */}
          <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-900/40">
            <h3 className="font-bold text-xs font-mono text-rose-300 uppercase mb-2">
              Spawn Hostile Insurgents (Kodiak PMC)
            </h3>
            <div className="grid grid-cols-3 gap-1.5 font-mono">
              <button
                onClick={() => onSpawnUnit('titan_mbt', true)}
                className="py-1 px-2 rounded bg-rose-900/40 hover:bg-rose-700 text-rose-200 border border-rose-600/50 text-center transition"
              >
                Enemy MBT
              </button>
              <button
                onClick={() => onSpawnUnit('cobra_gunship', true)}
                className="py-1 px-2 rounded bg-rose-900/40 hover:bg-rose-700 text-rose-200 border border-rose-600/50 text-center transition"
              >
                Enemy Gunship
              </button>
              <button
                onClick={() => onSpawnUnit('thunderbolt_bomber', true)}
                className="py-1 px-2 rounded bg-rose-900/40 hover:bg-rose-700 text-rose-200 border border-rose-600/50 text-center transition"
              >
                Enemy Bomber
              </button>
            </div>
          </div>

          {/* Defense & State Actions */}
          <div className="flex gap-2">
            <button
              onClick={onRepairAllBases}
              className="flex-1 py-2 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 font-mono font-semibold transition"
            >
              Restore All Base Shields & HP
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
