import React, { useState } from 'react';
import { X, Hammer, Wrench, Shield, Clock, Crosshair, ArrowUpCircle } from 'lucide-react';
import { Base, BuildingType, UnitType } from '../types/game';
import { BUILDING_CATALOG, UNIT_CATALOG } from '../game/catalog';
import { assetManager } from '../game/assets/assetManager';

interface BaseDrawerProps {
  base: Base;
  currentUserId: string;
  onClose: () => void;
  onBuild: (baseId: string, buildingType: BuildingType) => void;
  onProduceUnit: (baseId: string, unitType: UnitType) => void;
  onRepairBase: (baseId: string) => void;
}

export const BaseDrawer: React.FC<BaseDrawerProps> = ({
  base,
  currentUserId,
  onClose,
  onBuild,
  onProduceUnit,
  onRepairBase,
}) => {
  const [activeTab, setActiveTab] = useState<'buildings' | 'units' | 'queues'>('buildings');
  const isOwner = base.ownerId === currentUserId;

  const now = Date.now();
  const hpPct = Math.max(0, base.health / base.maxHealth);
  const shieldPct = base.maxShield > 0 ? Math.max(0, base.defenseShield / base.maxShield) : 0;

  // Filter available buildings for this base type
  const availableBuildings = Object.values(BUILDING_CATALOG).filter((b) =>
    b.baseTypesAllowed.includes(base.type)
  );

  // Filter available units for this base
  const availableUnits = Object.values(UNIT_CATALOG).filter((u) => {
    // Check if base has the required building
    const hasFacility = base.buildings.some((b) => b.type === u.requiredBuilding);
    return hasFacility;
  });

  return (
    <div className="absolute top-12 right-3 bottom-3 w-84 md:w-96 z-20 flex flex-col rounded-lg bg-slate-950/95 backdrop-blur-md border border-slate-800 shadow-2xl overflow-hidden select-none pointer-events-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-blue-900/60 border border-blue-500/50 flex items-center justify-center text-blue-400">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-xs text-slate-100 font-mono tracking-wider">{base.name}</h3>
            <div className="flex items-center gap-2 text-[10px] text-slate-400">
              <span className="uppercase text-blue-400 font-semibold">{base.type} BASE</span>
              <span>•</span>
              <span className="font-mono">[{base.x}, {base.y}]</span>
              <span>•</span>
              <span className={isOwner ? 'text-emerald-400' : 'text-amber-400'}>
                {isOwner ? 'OWNED' : base.ownerName}
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Facility Visual Dossier Banner */}
      <div className="relative h-24 overflow-hidden border-b border-slate-800 bg-slate-900">
        <img
          src={
            base.type === 'air'
              ? '/assets/aistudio/7kxgVxTj12aaGQnz6Di07mv5tlqjfNQXjYBNzUd-UvDem-SyyNXis7yU3Du970X-dKtQWAnOnsbfXX40lRwqhdezZdYLDS-Qe6Yn7HNpL5ok7Yyj2tY9qpVa-fZzZweKvmdvGD0lRBLwe080CIaqBxVwiV5JA05gslWLYZg8fi-0SjlUyxWpoIHos2VzZ9Gi_24db5c9a.jfif'
              : base.type === 'harbor'
              ? '/assets/aistudio/fCepRZYn_2xfC_oeZGl3DbmG6Jc3nbWZ2vPUo8iLMCzWT-HmucP9eU-1_Y4dqPOIvQRHPLPTb42TH8O_8chE27y_sw1grBsWTmRM1UcPI7nW9c1gW1xQvyHfwnDyXkMWCrRBXFKrwiA5dB-2N-K3lLvgHtQ3catcXnSHnmDlVj8a3f16gpHddgBpOzWBMvnH_6e199dd8.jfif'
              : base.type === 'rail'
              ? '/assets/aistudio/tXNaVJSFm6tq5eH0LOMsca9t3UCFb09TGtuIxw9HSBmOYvkcBdJoO9pvGRot5OpMjRuJSuLuEHZ2csSAgz7tSu-f27vNq-s-H1C2EdeolyCYJQCYO6UAxjBplGDIKi3LSqJmwJDiAD8mJP88GFYJiAhdMNkaBeep4lDDUfkg2tbJZW4kt6Mtu35w5FPPkT1n_6230bc6d.jfif'
              : base.type === 'home'
              ? '/assets/aistudio/cI6wQTlzfGZXAIf5dpnk13jWyN3OpURvwt1DEq8v-GpgYo0AvbfjJTLBjh5eR1snAYDAeq8I12dkh3SAJq5b_9EwyPg2qWOpknxasVnVhIJqCEmBfKSLTY6WT9ySYLCR-8EWn7XhUJ1O2pKlXWraXQtH-GB3TkZzNgO947NAXicxEipj__DbRwcLlqghOmsX_04e15e49.jfif'
              : '/assets/aistudio/Fw5BLLDDwLESOCprFgjWyOrO3iW7ODA4kBiqrcvvpEa-sfZcdyOSvpUqb0Oztv21RjeTVt8uAymaAR7vKCAnjBGdYi0Lqbc_DgjMmIH_b0h4Q0pt5PH9dLMC4QhO_-PbUi98d2ZT4RbY-qrmJxHDCphLhadzqPlNG_93CCJvbFVqHNMkZ2cpaFhY_jLvtcSS_2ef97afb.jfif'
          }
          alt={`${base.name} Facility`}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover brightness-80 contrast-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent flex items-end px-3 py-1.5">
          <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold">
            FACILITY COMPOUND · SECTOR [{base.x}, {base.y}]
          </span>
        </div>
      </div>

      {/* Base Health, Shield & Repair */}
      <div className="px-3 py-2 bg-slate-900/50 border-b border-slate-800/80">
        <div className="flex items-center justify-between text-[11px] font-mono mb-1">
          <span className="text-slate-400">STRUCTURAL INTEGRITY</span>
          <span className="text-emerald-400 font-bold">{Math.round(base.health)} / {base.maxHealth}</span>
        </div>
        <div className="w-full h-2 bg-slate-800 rounded overflow-hidden mb-1.5">
          <div
            className={`h-full transition-all ${hpPct > 0.5 ? 'bg-emerald-500' : hpPct > 0.25 ? 'bg-amber-500' : 'bg-rose-500'}`}
            style={{ width: `${hpPct * 100}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] font-mono mb-1">
          <span className="text-slate-400">DEFENSE SHIELD</span>
          <span className="text-cyan-400 font-bold">{Math.round(base.defenseShield)} / {base.maxShield}</span>
        </div>
        <div className="w-full h-1.5 bg-slate-800 rounded overflow-hidden mb-2">
          <div className="h-full bg-cyan-500 transition-all" style={{ width: `${shieldPct * 100}%` }} />
        </div>

        {isOwner && (base.health < base.maxHealth || base.defenseShield < base.maxShield) && (
          <button
            onClick={() => onRepairBase(base.id)}
            className="w-full py-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-600/30 text-xs font-mono font-semibold flex items-center justify-center gap-1.5 transition"
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>REPAIR DEFENSES (200 Concrete, 200 Steel)</span>
          </button>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-800 text-xs font-mono">
        <button
          onClick={() => setActiveTab('buildings')}
          className={`flex-1 py-1.5 text-center font-semibold transition border-b-2 ${
            activeTab === 'buildings'
              ? 'border-blue-500 text-blue-400 bg-blue-950/20'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          FACILITIES ({base.buildings.length})
        </button>

        <button
          onClick={() => setActiveTab('units')}
          className={`flex-1 py-1.5 text-center font-semibold transition border-b-2 ${
            activeTab === 'units'
              ? 'border-blue-500 text-blue-400 bg-blue-950/20'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          PRODUCTION
        </button>

        <button
          onClick={() => setActiveTab('queues')}
          className={`flex-1 py-1.5 text-center font-semibold transition border-b-2 ${
            activeTab === 'queues'
              ? 'border-blue-500 text-blue-400 bg-blue-950/20'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          QUEUES ({base.constructionQueue.length + base.productionQueue.length})
        </button>
      </div>

      {/* Tab Content Area */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {/* Buildings Tab */}
        {activeTab === 'buildings' && (
          <div className="space-y-2">
            {availableBuildings.map((def) => {
              const existing = base.buildings.find((b) => b.type === def.type);
              const currentLevel = existing ? existing.level : 0;
              const isMax = currentLevel >= def.maxLevel;
              const isUnderConstruction = base.constructionQueue.some((o) => o.buildingType === def.type);

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
                  className="p-2 rounded bg-slate-900/80 border border-slate-800 text-slate-200"
                >
                  <div className="flex gap-2.5 mb-2">
                    <div className="w-14 h-14 shrink-0 rounded bg-slate-950 border border-slate-800 flex items-center justify-center overflow-hidden">
                      <BuildingPreview type={def.type} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-bold text-slate-100 font-mono text-[11px] truncate mr-1">{def.name}</span>
                        <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800 text-cyan-400 font-mono shrink-0">
                          LVL {currentLevel}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-tight line-clamp-2">{def.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[10px] font-mono">
                    <div className="flex items-center gap-2 text-slate-400">
                      <span>C:{reqConcrete}</span>
                      <span>S:{reqSteel}</span>
                      <span>A:{reqAlum}</span>
                      <span>F:{reqFuel}</span>
                    </div>

                    {isOwner && (
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
                        {isUnderConstruction ? (
                          <>
                            <Clock className="w-3 h-3 animate-spin" />
                            <span>BUILDING</span>
                          </>
                        ) : currentLevel === 0 ? (
                          <>
                            <Hammer className="w-3 h-3" />
                            <span>CONSTRUCT</span>
                          </>
                        ) : (
                          <>
                            <ArrowUpCircle className="w-3 h-3" />
                            <span>UPGRADE</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Units Production Tab */}
        {activeTab === 'units' && (
          <div className="space-y-2">
            {availableUnits.length === 0 ? (
              <div className="p-4 text-center text-slate-500 text-xs font-mono">
                No production facilities active. Construct a Vehicle Assembly or Aviation Hangar first!
              </div>
            ) : (
              availableUnits.map((uDef) => {
                const canAfford =
                  base.resources.concrete >= uDef.cost.concrete &&
                  base.resources.steel >= uDef.cost.steel &&
                  base.resources.aluminum >= uDef.cost.aluminum &&
                  base.resources.fuel >= uDef.cost.fuel;

                return (
                  <div
                    key={uDef.type}
                    className="p-2 rounded bg-slate-900/80 border border-slate-800 text-slate-200 text-xs"
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

                    <p className="text-[11px] text-slate-400 mb-2">{uDef.description}</p>

                    {/* Stats badges */}
                    <div className="grid grid-cols-4 gap-1 mb-2 text-[10px] font-mono text-center">
                      <div className="p-1 rounded bg-slate-800/80">
                        <div className="text-slate-500">HP</div>
                        <div className="text-emerald-400 font-bold">{uDef.maxHealth}</div>
                      </div>
                      <div className="p-1 rounded bg-slate-800/80">
                        <div className="text-slate-500">ARMOR</div>
                        <div className="text-blue-400 font-bold">{uDef.armor}%</div>
                      </div>
                      <div className="p-1 rounded bg-slate-800/80">
                        <div className="text-slate-500">RANGE</div>
                        <div className="text-amber-400 font-bold">{uDef.attackRange}</div>
                      </div>
                      <div className="p-1 rounded bg-slate-800/80">
                        <div className="text-slate-500">DPS</div>
                        <div className="text-rose-400 font-bold">
                          {Math.round(uDef.attackDamage / uDef.cooldownSec)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[10px] font-mono">
                      <div className="flex items-center gap-2 text-slate-400">
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

        {/* Queues Tab */}
        {activeTab === 'queues' && (
          <div className="space-y-3">
            <div>
              <h4 className="text-[11px] font-mono text-slate-400 font-bold uppercase mb-1.5 flex items-center gap-1">
                <Hammer className="w-3.5 h-3.5 text-blue-400" />
                <span>Construction Queue</span>
              </h4>
              {base.constructionQueue.length === 0 ? (
                <div className="text-slate-600 text-xs italic font-mono p-2">No active construction orders</div>
              ) : (
                base.constructionQueue.map((order) => {
                  const bDef = BUILDING_CATALOG[order.buildingType];
                  const total = order.finishTime - order.startTime;
                  const elapsed = now - order.startTime;
                  const pct = Math.min(100, Math.max(0, (elapsed / total) * 100));
                  const remainSec = Math.max(0, Math.round((order.finishTime - now) / 1000));

                  return (
                    <div key={order.id} className="p-2 rounded bg-slate-900 border border-slate-800 mb-1.5">
                      <div className="flex items-center justify-between text-xs font-mono mb-1">
                        <span className="font-bold text-slate-200">{bDef?.name}</span>
                        <span className="text-cyan-400">LVL {order.targetLevel}</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-800 rounded overflow-hidden mb-1">
                        <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-[10px] text-right font-mono text-amber-400">{remainSec}s REMAINING</div>
                    </div>
                  );
                })
              )}
            </div>

            <div>
              <h4 className="text-[11px] font-mono text-slate-400 font-bold uppercase mb-1.5 flex items-center gap-1">
                <Crosshair className="w-3.5 h-3.5 text-emerald-400" />
                <span>Unit Production Queue</span>
              </h4>
              {base.productionQueue.length === 0 ? (
                <div className="text-slate-600 text-xs italic font-mono p-2">No active unit production orders</div>
              ) : (
                base.productionQueue.map((prod) => {
                  const uDef = UNIT_CATALOG[prod.unitType];
                  const total = prod.finishTime - prod.startTime;
                  const elapsed = now - prod.startTime;
                  const pct = Math.min(100, Math.max(0, (elapsed / total) * 100));
                  const remainSec = Math.max(0, Math.round((prod.finishTime - now) / 1000));

                  return (
                    <div key={prod.id} className="p-2 rounded bg-slate-900 border border-slate-800 mb-1.5">
                      <div className="flex items-center justify-between text-xs font-mono mb-1">
                        <span className="font-bold text-slate-200">{uDef?.name}</span>
                        <span className="text-emerald-400 uppercase text-[10px]">{uDef?.category}</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-800 rounded overflow-hidden mb-1">
                        <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-[10px] text-right font-mono text-amber-400">{remainSec}s REMAINING</div>
                    </div>
                  );
                })
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
    
    ctx.drawImage(sprite, 32 - w/2, 32 - h/2, w, h);
  }, [type]);

  return <canvas ref={canvasRef} width={64} height={64} className="w-12 h-12 block" />;
};
