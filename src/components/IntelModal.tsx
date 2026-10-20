import React, { useState } from 'react';
import { X, Shield, Crosshair, Zap, Compass, Anchor, Train } from 'lucide-react';
import { BUILDING_CATALOG, UNIT_CATALOG } from '../game/catalog';
import { assetManager } from '../game/assets/assetManager';
import { BuildingType, UnitCategory } from '../types/game';

interface IntelModalProps {
  onClose: () => void;
}

export const IntelModal: React.FC<IntelModalProps> = ({ onClose }) => {
  const [activeCategory, setActiveCategory] = useState<UnitCategory | 'recon' | 'facilities'>('ground');
  const units = Object.values(UNIT_CATALOG).filter((u) => u.category === activeCategory);
  const buildings = Object.values(BUILDING_CATALOG);
  const [selectedUnit, setSelectedUnit] = useState(units[0] || Object.values(UNIT_CATALOG)[0]);
  const [selectedBuildingType, setSelectedBuildingType] = useState<BuildingType>('command_center');
  const [selectedReconId, setSelectedReconId] = useState<'valley' | 'kodiak' | 'naval' | 'airfield'>('valley');

  const reconFeeds = [
    {
      id: 'valley' as const,
      title: 'Central River Valley & Delta Basin',
      img: '/assets/aistudio/cI6wQTlzfGZXAIf5dpnk13jWyN3OpURvwt1DEq8v-GpgYo0AvbfjJTLBjh5eR1snAYDAeq8I12dkh3SAJq5b_9EwyPg2qWOpknxasVnVhIJqCEmBfKSLTY6WT9ySYLCR-8EWn7XhUJ1O2pKlXWraXQtH-GB3TkZzNgO947NAXicxEipj__DbRwcLlqghOmsX_04e15e49.jfif',
      sector: 'SECTOR BRAVO-4',
      threat: 'ELEVATED - KEY RIVER CROSSINGS',
      desc: 'Winding deep-water river network cutting through lush agricultural plains and forest basins. Ground units must utilize concrete road bridges or rail girder crossings. High-speed highway connects Sector Alpha to Sector Delta.',
      doctrine: 'Armor columns gain a +45% speed bonus along paved highways. Mud tracks through swamps slow vehicles by 40%. Direct water crossing is strictly prohibited for ground vehicles.',
    },
    {
      id: 'kodiak' as const,
      title: 'Kodiak PMC Headquarters & Heavy Citadel',
      img: '/assets/aistudio/Fw5BLLDDwLESOCprFgjWyOrO3iW7ODA4kBiqrcvvpEa-sfZcdyOSvpUqb0Oztv21RjeTVt8uAymaAR7vKCAnjBGdYi0Lqbc_DgjMmIH_b0h4Q0pt5PH9dLMC4QhO_-PbUi98d2ZT4RbY-qrmJxHDCphLhadzqPlNG_93CCJvbFVqHNMkZ2cpaFhY_jLvtcSS_2ef97afb.jfif',
      sector: 'SECTOR DELTA-8',
      threat: 'SEVERE - RED FORCE STRONGHOLD',
      desc: 'Reinforced concrete bastion with automated gun emplacements, armored motor pool, radar array, and surrounding anti-tank obstacle belt. Heavily defended by insurgent Titan MBTs and SAM sites.',
      doctrine: 'Direct frontal assault with light infantry is suicidal. Deploy long-range Paladin SPGs to soften defensive bunkers before rushing the perimeter with heavy armor.',
    },
    {
      id: 'naval' as const,
      title: 'East Coast Deep-Water Bastion & Naval Quay',
      img: '/assets/aistudio/fCepRZYn_2xfC_oeZGl3DbmG6Jc3nbWZ2vPUo8iLMCzWT-HmucP9eU-1_Y4dqPOIvQRHPLPTb42TH8O_8chE27y_sw1grBsWTmRM1UcPI7nW9c1gW1xQvyHfwnDyXkMWCrRBXFKrwiA5dB-2N-K3lLvgHtQ3catcXnSHnmDlVj8a3f16gpHddgBpOzWBMvnH_6e199dd8.jfif',
      sector: 'SECTOR CHARLIE-2',
      threat: 'STRATEGIC - MARITIME SUPREMACY',
      desc: 'Deep oceanic gulf protected by barrier beaches and sandbars. Accommodates sovereign Naval Shipyards capable of launching Leviathan Battleships and Riverine Gunboats.',
      doctrine: 'Naval artillery can project long-range shore bombardment deep inland along coastal rivers and deltas. Protect harbor mouths with coastal SAM batteries against airborne strike jets.',
    },
    {
      id: 'airfield' as const,
      title: 'Forward Airbase & Tactical Strike Runways',
      img: '/assets/aistudio/7kxgVxTj12aaGQnz6Di07mv5tlqjfNQXjYBNzUd-UvDem-SyyNXis7yU3Du970X-dKtQWAnOnsbfXX40lRwqhdezZdYLDS-Qe6Yn7HNpL5ok7Yyj2tY9qpVa-fZzZweKvmdvGD0lRBLwe080CIaqBxVwiV5JA05gslWLYZg8fi-0SjlUyxWpoIHos2VzZ9Gi_24db5c9a.jfif',
      sector: 'SECTOR ECHO-1',
      threat: 'TACTICAL - AIR SUPERIORITY HUB',
      desc: 'Dual dual-direction asphalt runways, hardened aircraft shelters, radar control tower, and rapid-turnaround jet refueling revetments.',
      doctrine: 'Reaper Strike Jets and Cobra Gunships ignore all ground terrain barriers (mountains, rivers, swamps). Intercept hostile air wings using mobile Thor Mobile SAM launchers.',
    },
  ];

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

          <button
            onClick={() => {
              setActiveCategory('facilities');
            }}
            className={`px-3 py-1 rounded flex items-center gap-1.5 transition ${
              activeCategory === 'facilities'
                ? 'bg-blue-600 text-white font-bold'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>BASE FACILITIES (27)</span>
          </button>

          <button
            onClick={() => setActiveCategory('recon')}
            className={`px-3 py-1 rounded flex items-center gap-1.5 transition ml-auto ${
              activeCategory === 'recon'
                ? 'bg-amber-600 text-white font-bold shadow-md shadow-amber-600/30'
                : 'bg-slate-900 text-amber-400 hover:text-amber-200 border border-amber-600/30'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>THEATER RECON & TOPOGRAPHY</span>
          </button>
        </div>

        {/* Content: Unit List on Left or Recon Feeds or Building List */}
        {activeCategory === 'recon' ? (
          <div className="flex-1 flex overflow-hidden">
            {/* ... Recon Protocols View (Existing) ... */}
            <div className="w-72 border-r border-slate-800 overflow-y-auto p-2 space-y-2 bg-slate-950/60">
              <div className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider px-1">
                SATELLITE RECON PROTOCOLS
              </div>
              {reconFeeds.map((feed) => {
                const isSelected = selectedReconId === feed.id;
                return (
                  <button
                    key={feed.id}
                    onClick={() => setSelectedReconId(feed.id)}
                    className={`w-full text-left p-2.5 rounded-lg border transition flex flex-col gap-1 ${
                      isSelected
                        ? 'border-amber-500 bg-amber-950/40 text-white'
                        : 'border-slate-800/80 bg-slate-900/50 hover:bg-slate-900 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs font-mono">{feed.sector}</span>
                      <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800 text-amber-400 font-mono">
                        SURVEILLANCE
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-slate-200 leading-tight">{feed.title}</span>
                  </button>
                );
              })}

              <div className="pt-2 border-t border-slate-800 px-1 space-y-1.5 text-[11px] font-mono text-slate-400">
                <div className="font-bold text-slate-300">TERRAIN MOBILITY DOCTRINE:</div>
                <div className="flex justify-between text-emerald-400">
                  <span>Highways & Roads:</span>
                  <span>+45% Speed</span>
                </div>
                <div className="flex justify-between text-cyan-400">
                  <span>Dirt Roads:</span>
                  <span>+20% Speed</span>
                </div>
                <div className="flex justify-between text-yellow-400">
                  <span>Forest & Grass:</span>
                  <span>Baseline Speed</span>
                </div>
                <div className="flex justify-between text-rose-400">
                  <span>Mud & Marshes:</span>
                  <span>-40% Slow Crawl</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Deep Water:</span>
                  <span>Naval Only</span>
                </div>
              </div>
            </div>

            {/* Selected Recon Feed Details */}
            {(() => {
              const currentFeed = reconFeeds.find((f) => f.id === selectedReconId) || reconFeeds[0];
              return (
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-xs text-amber-400 font-mono font-bold tracking-wider">
                        {currentFeed.sector} // RECONNAISSANCE INTEL
                      </div>
                      <h3 className="text-lg font-bold text-slate-100 font-mono mt-0.5">
                        {currentFeed.title}
                      </h3>
                      <div className="text-[11px] text-rose-400 font-mono mt-0.5 font-semibold">
                        STATUS: {currentFeed.threat}
                      </div>
                    </div>
                  </div>

                  {/* Satellite Aerial Imagery */}
                  <div className="relative rounded-xl border border-slate-800 overflow-hidden shadow-2xl bg-black">
                    <img
                      src={currentFeed.img}
                      alt={currentFeed.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-64 object-cover object-center brightness-90 hover:brightness-100 transition duration-300"
                    />
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/75 backdrop-blur text-[10px] font-mono text-cyan-400 border border-cyan-500/30">
                      SATELLITE RECON FEED // REAL-TIME ORBITAL SCAN
                    </div>
                    <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/75 backdrop-blur text-[10px] font-mono text-emerald-400 border border-emerald-500/30">
                      RESOLUTION: 0.5M TOPOGRAPHIC GIS
                    </div>
                  </div>

                  {/* Recon Briefing */}
                  <div className="space-y-3 font-mono text-xs">
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                      <div className="text-slate-400 font-bold uppercase text-[10px]">Strategic Geography & Infrastructure:</div>
                      <p className="text-slate-200 leading-relaxed font-sans">{currentFeed.desc}</p>
                    </div>

                    <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-600/40 space-y-1">
                      <div className="text-amber-400 font-bold uppercase text-[10px]">Tactical Doctrine & Mobility Guidance:</div>
                      <p className="text-amber-200/90 leading-relaxed font-sans">{currentFeed.doctrine}</p>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        ) : activeCategory === 'facilities' ? (
          <div className="flex-1 flex overflow-hidden">
            {/* Facility List */}
            <div className="w-64 border-r border-slate-800 overflow-y-auto p-2 space-y-1.5 bg-slate-950/40">
              {Object.values(BUILDING_CATALOG).map((b) => {
                const isSelected = selectedBuildingType === b.type;
                return (
                  <button
                    key={b.type}
                    onClick={() => setSelectedBuildingType(b.type)}
                    className={`w-full text-left p-2 rounded transition flex flex-col gap-0.5 ${
                      isSelected
                        ? 'bg-blue-950/70 border border-blue-500/60 text-white shadow-lg'
                        : 'bg-slate-900/60 hover:bg-slate-900 border border-slate-800/80 text-slate-300'
                    }`}
                  >
                    <span className="font-bold text-xs font-mono">{b.name}</span>
                    <span className="text-[9px] uppercase text-slate-500">{b.category} FACILITY</span>
                  </button>
                );
              })}
            </div>

            {/* Building Dossier */}
            {(() => {
              const bDef = BUILDING_CATALOG[selectedBuildingType];
              return (
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="w-24 h-24 shrink-0 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center p-1">
                       <BuildingPreview type={bDef.type} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-slate-100 font-mono tracking-wider">{bDef.name}</h3>
                      <div className="flex items-center gap-2 text-xs text-cyan-400 font-mono mt-1">
                        <span className="uppercase text-blue-400 font-bold">{bDef.category} TIER</span>
                        <span>•</span>
                        <span>MAX LEVEL {bDef.maxLevel}</span>
                        <span>•</span>
                        <span>BUILD TIME: {bDef.buildTimeSec}S</span>
                      </div>
                    </div>
                  </div>

                  <p className="text-sm text-slate-300 leading-relaxed bg-slate-900/50 p-4 rounded border border-slate-800/80 italic font-serif">
                    "{bDef.description}"
                  </p>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Build Costs */}
                    <div className="space-y-2">
                       <h4 className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest px-1">Resource Requirements</h4>
                       <div className="grid grid-cols-2 gap-2">
                         <div className="p-2 rounded bg-slate-900/80 border border-slate-800 flex justify-between items-center">
                            <span className="text-[10px] text-slate-500 font-mono">CONCRETE</span>
                            <span className="text-emerald-400 font-bold font-mono">{bDef.cost.concrete}</span>
                         </div>
                         <div className="p-2 rounded bg-slate-900/80 border border-slate-800 flex justify-between items-center">
                            <span className="text-[10px] text-slate-500 font-mono">STEEL</span>
                            <span className="text-blue-400 font-bold font-mono">{bDef.cost.steel}</span>
                         </div>
                         <div className="p-2 rounded bg-slate-900/80 border border-slate-800 flex justify-between items-center">
                            <span className="text-[10px] text-slate-500 font-mono">ALUMINUM</span>
                            <span className="text-cyan-400 font-bold font-mono">{bDef.cost.aluminum}</span>
                         </div>
                         <div className="p-2 rounded bg-slate-900/80 border border-slate-800 flex justify-between items-center">
                            <span className="text-[10px] text-slate-500 font-mono">FUEL</span>
                            <span className="text-amber-400 font-bold font-mono">{bDef.cost.fuel}</span>
                         </div>
                       </div>
                    </div>

                    {/* Operational Capability */}
                    <div className="space-y-2">
                       <h4 className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest px-1">Tactical Capability</h4>
                       <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2">
                         <div className="flex justify-between text-xs font-mono">
                           <span className="text-slate-400">DEPLOYMENT THEATERS:</span>
                           <span className="text-slate-100 uppercase">{bDef.baseTypesAllowed.join(', ')}</span>
                         </div>
                         {bDef.productionBonus && (
                           <div className="flex justify-between text-xs font-mono">
                             <span className="text-slate-400">PRODUCTION YIELD:</span>
                             <span className="text-emerald-400">+{Object.values(bDef.productionBonus)[0]}/SEC</span>
                           </div>
                         )}
                         {bDef.storageBonus && (
                           <div className="flex justify-between text-xs font-mono text-[11px]">
                             <span className="text-slate-400">STORAGE EXPANSION:</span>
                             <span className="text-cyan-400">+{Object.values(bDef.storageBonus)[0]} CAPACITY</span>
                           </div>
                         )}
                         {bDef.defenseStats && (
                           <div className="space-y-1">
                             <div className="flex justify-between text-xs font-mono">
                               <span className="text-slate-400">ATTACK RADIUS:</span>
                               <span className="text-amber-400">{bDef.defenseStats.range} CELLS</span>
                             </div>
                             <div className="flex justify-between text-xs font-mono">
                               <span className="text-slate-400">DEVASTATION:</span>
                               <span className="text-rose-400">{bDef.defenseStats.damage} DMG</span>
                             </div>
                           </div>
                         )}
                       </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        ) : (
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

    ctx.clearRect(0, 0, 96, 96);
    const scale = Math.min(88 / sprite.width, 88 / sprite.height);
    const w = sprite.width * scale;
    const h = sprite.height * scale;
    
    ctx.drawImage(sprite, 48 - w/2, 48 - h/2, w, h);
  }, [type]);

  return <canvas ref={canvasRef} width={96} height={96} className="w-full h-full object-contain" />;
};
