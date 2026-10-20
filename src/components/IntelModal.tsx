import React, { useState } from 'react';
import { X, Shield, Crosshair, Zap, Compass, Anchor, Train } from 'lucide-react';
import { UNIT_CATALOG } from '../game/catalog';
import { UnitCategory } from '../types/game';

interface IntelModalProps {
  onClose: () => void;
}

export const IntelModal: React.FC<IntelModalProps> = ({ onClose }) => {
  const [activeCategory, setActiveCategory] = useState<UnitCategory>('ground');
  const units = Object.values(UNIT_CATALOG).filter((u) => u.category === activeCategory);
  const [selectedUnit, setSelectedUnit] = useState(units[0] || Object.values(UNIT_CATALOG)[0]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none">
      <div className="w-full max-w-4xl rounded-xl bg-slate-950 border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber-400" />
            <h2 className="font-bold text-sm text-slate-100 font-mono tracking-wider">
              FRONTLINE DOMINION MILITARY INTEL & ARMORY
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-800 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Categories Bar */}
        <div className="flex items-center gap-2 px-4 py-2 bg-slate-900/60 border-b border-slate-800/80 text-xs font-mono">
          <button
            onClick={() => {
              setActiveCategory('ground');
              const g = Object.values(UNIT_CATALOG).filter((u) => u.category === 'ground');
              if (g.length > 0) setSelectedUnit(g[0]);
            }}
            className={`px-3 py-1 rounded flex items-center gap-1.5 transition ${
              activeCategory === 'ground'
                ? 'bg-blue-600 text-white font-bold'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>GROUND FORCES (6)</span>
          </button>

          <button
            onClick={() => {
              setActiveCategory('air');
              const a = Object.values(UNIT_CATALOG).filter((u) => u.category === 'air');
              if (a.length > 0) setSelectedUnit(a[0]);
            }}
            className={`px-3 py-1 rounded flex items-center gap-1.5 transition ${
              activeCategory === 'air'
                ? 'bg-blue-600 text-white font-bold'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>AIR WING (4)</span>
          </button>

          <button
            onClick={() => {
              setActiveCategory('naval');
              const n = Object.values(UNIT_CATALOG).filter((u) => u.category === 'naval');
              if (n.length > 0) setSelectedUnit(n[0]);
            }}
            className={`px-3 py-1 rounded flex items-center gap-1.5 transition ${
              activeCategory === 'naval'
                ? 'bg-blue-600 text-white font-bold'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Anchor className="w-3.5 h-3.5" />
            <span>NAVAL FLEET (2)</span>
          </button>

          <button
            onClick={() => {
              setActiveCategory('rail');
              const r = Object.values(UNIT_CATALOG).filter((u) => u.category === 'rail');
              if (r.length > 0) setSelectedUnit(r[0]);
            }}
            className={`px-3 py-1 rounded flex items-center gap-1.5 transition ${
              activeCategory === 'rail'
                ? 'bg-blue-600 text-white font-bold'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Train className="w-3.5 h-3.5" />
            <span>ARMORED RAIL (1)</span>
          </button>
        </div>

        {/* Content: Unit List on Left, Detailed Dossier on Right */}
        <div className="flex-1 flex overflow-hidden">
          {/* Unit List */}
          <div className="w-64 border-r border-slate-800 overflow-y-auto p-2 space-y-1.5">
            {units.map((u) => {
              const isSelected = selectedUnit.type === u.type;
              return (
                <button
                  key={u.type}
                  onClick={() => setSelectedUnit(u)}
                  className={`w-full text-left p-2 rounded transition flex flex-col gap-0.5 ${
                    isSelected
                      ? 'bg-blue-950/70 border border-blue-500/60 text-white'
                      : 'bg-slate-900/60 hover:bg-slate-900 border border-slate-800/80 text-slate-300'
                  }`}
                >
                  <span className="font-bold text-xs font-mono">{u.name}</span>
                  <span className="text-[10px] text-slate-400">{u.role}</span>
                </button>
              );
            })}
          </div>

          {/* Dossier Card */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-100 font-mono tracking-wider">{selectedUnit.name}</h3>
                <div className="flex items-center gap-2 text-xs text-cyan-400 font-mono mt-0.5">
                  <span className="uppercase">{selectedUnit.category} DIVISION</span>
                  <span>•</span>
                  <span>{selectedUnit.role}</span>
                  {selectedUnit.canCaptureBase && (
                    <>
                      <span>•</span>
                      <span className="text-rose-400 font-bold">BASE CONQUEST CAPABLE</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/50 p-3 rounded border border-slate-800/80">
              {selectedUnit.description}
            </p>

            {/* Combat Specifications Matrix */}
            <div>
              <h4 className="text-xs font-mono font-bold text-slate-400 uppercase mb-2">Tactical Specifications</h4>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 text-xs font-mono">
                <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-500">MAX HITPOINTS</div>
                  <div className="text-emerald-400 font-bold text-sm">{selectedUnit.maxHealth} HP</div>
                </div>

                <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-500">ARMOR MITIGATION</div>
                  <div className="text-blue-400 font-bold text-sm">{selectedUnit.armor}%</div>
                </div>

                <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-500">CRUISING SPEED</div>
                  <div className="text-cyan-400 font-bold text-sm">{selectedUnit.speed} M/S</div>
                </div>

                <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-500">EFFECTIVE RANGE</div>
                  <div className="text-amber-400 font-bold text-sm">{selectedUnit.attackRange} CELLS</div>
                </div>

                <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-500">ATTACK DAMAGE</div>
                  <div className="text-rose-400 font-bold text-sm">{selectedUnit.attackDamage} DMG</div>
                </div>

                <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-500">RATE OF FIRE</div>
                  <div className="text-slate-200 font-bold text-sm">{(1 / selectedUnit.cooldownSec).toFixed(1)}/SEC</div>
                </div>

                <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-500">RADAR SIGHT</div>
                  <div className="text-indigo-400 font-bold text-sm">{selectedUnit.visionRadius} CELLS</div>
                </div>

                <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-500">FUEL CONSUMPTION</div>
                  <div className="text-orange-400 font-bold text-sm">{selectedUnit.fuelBurnPerSec}/SEC</div>
                </div>
              </div>
            </div>

            {/* Target engagement capabilities */}
            <div className="p-3 rounded bg-slate-900/40 border border-slate-800/80 text-xs font-mono">
              <span className="text-slate-400 mr-2">AUTHORIZED TARGET CATEGORIES:</span>
              <span className="text-amber-300 font-semibold uppercase">
                {selectedUnit.targets.join(', ')}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
