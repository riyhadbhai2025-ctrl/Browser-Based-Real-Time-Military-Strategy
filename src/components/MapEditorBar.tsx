import React, { useState } from 'react';
import { Paintbrush, TreePine, Shield, Eye, Trash2, X, Check, Layers, Sliders } from 'lucide-react';
import { EnvObjectType, TerrainType } from '../types/game';

interface MapEditorBarProps {
  activeMode: 'none' | 'paint_terrain' | 'place_object' | 'erase_object' | 'inspect';
  selectedTerrain: TerrainType;
  selectedObject: EnvObjectType;
  brushSize: number;
  onSetMode: (mode: 'none' | 'paint_terrain' | 'place_object' | 'erase_object' | 'inspect') => void;
  onSelectTerrain: (t: TerrainType) => void;
  onSelectObject: (o: EnvObjectType) => void;
  onSetBrushSize: (size: number) => void;
  onClose: () => void;
  inspectedCellInfo?: { x: number; y: number; terrain: TerrainType; groundPassable: boolean; cost: number } | null;
}

export const MapEditorBar: React.FC<MapEditorBarProps> = ({
  activeMode,
  selectedTerrain,
  selectedObject,
  brushSize,
  onSetMode,
  onSelectTerrain,
  onSelectObject,
  onSetBrushSize,
  onClose,
  inspectedCellInfo,
}) => {
  const [activeTab, setActiveTab] = useState<'terrain' | 'vegetation' | 'structures'>('terrain');

  const terrainOptions: { type: TerrainType; label: string; color: string }[] = [
    { type: 'grass', label: 'Grassland', color: '#2d5a27' },
    { type: 'plains', label: 'Plains', color: '#4c5c2d' },
    { type: 'forest', label: 'Deciduous Forest', color: '#183317' },
    { type: 'pine_forest', label: 'Pine Forest', color: '#142918' },
    { type: 'dirt', label: 'Dirt & Mud', color: '#5c4833' },
    { type: 'sand', label: 'Sand Beach', color: '#cbb17b' },
    { type: 'rock', label: 'Rock Ground', color: '#5a626a' },
    { type: 'mountain', label: 'Mountain', color: '#3c434a' },
    { type: 'snow', label: 'Alpine Snow', color: '#e2e8f0' },
    { type: 'water', label: 'Shallow Water', color: '#0f5279' },
    { type: 'deep_water', label: 'Deep Water', color: '#082b42' },
    { type: 'swamp', label: 'Swamp Marsh', color: '#263820' },
    { type: 'farmland', label: 'Farmland', color: '#4f3c2b' },
    { type: 'road', label: 'Highway Road', color: '#272b30' },
    { type: 'dirt_road', label: 'Dirt Road', color: '#52412c' },
    { type: 'railway', label: 'Railway Track', color: '#3f4247' },
    { type: 'bridge_road', label: 'Road Bridge', color: '#3b82f6' },
    { type: 'bridge_rail', label: 'Rail Bridge', color: '#8b5cf6' },
  ];

  const objectOptions: { type: EnvObjectType; label: string; category: 'vegetation' | 'structures' }[] = [
    { type: 'tree_oak', label: 'Oak Tree', category: 'vegetation' },
    { type: 'tree_pine', label: 'Pine Conifer', category: 'vegetation' },
    { type: 'tree_birch', label: 'Birch Tree', category: 'vegetation' },
    { type: 'bush', label: 'Undergrowth Bush', category: 'vegetation' },
    { type: 'boulder', label: 'Granite Boulder', category: 'vegetation' },
    { type: 'fallen_log', label: 'Fallen Log', category: 'vegetation' },
    { type: 'bunker', label: 'Concrete Bunker', category: 'structures' },
    { type: 'watchtower', label: 'Observation Tower', category: 'structures' },
    { type: 'sandbags', label: 'Sandbag Wall', category: 'structures' },
    { type: 'barricade', label: 'Anti-Tank Hedgehogs', category: 'structures' },
    { type: 'ruined_tank', label: 'Scorched Tank Wreck', category: 'structures' },
  ];

  return (
    <div className="absolute top-12 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-1.5 select-none pointer-events-auto max-w-2xl w-full px-2">
      <div className="w-full rounded-xl bg-slate-950/95 backdrop-blur-md border border-amber-600/50 shadow-2xl overflow-hidden p-2.5 text-xs font-mono">
        {/* Top Control Bar */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold text-[10px] uppercase border border-amber-500/40">
              TACTICAL WORLD MAP DESIGNER
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onSetMode('paint_terrain')}
                className={`px-2 py-1 rounded flex items-center gap-1 transition ${
                  activeMode === 'paint_terrain' ? 'bg-amber-600 text-white font-bold' : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Paintbrush className="w-3.5 h-3.5" />
                <span>Paint</span>
              </button>

              <button
                onClick={() => onSetMode('place_object')}
                className={`px-2 py-1 rounded flex items-center gap-1 transition ${
                  activeMode === 'place_object' ? 'bg-amber-600 text-white font-bold' : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                <TreePine className="w-3.5 h-3.5" />
                <span>Props</span>
              </button>

              <button
                onClick={() => onSetMode('erase_object')}
                className={`px-2 py-1 rounded flex items-center gap-1 transition ${
                  activeMode === 'erase_object' ? 'bg-rose-600 text-white font-bold' : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Erase</span>
              </button>

              <button
                onClick={() => onSetMode('inspect')}
                className={`px-2 py-1 rounded flex items-center gap-1 transition ${
                  activeMode === 'inspect' ? 'bg-cyan-600 text-white font-bold' : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Inspect</span>
              </button>
            </div>
          </div>

          {/* Brush Size */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <span>BRUSH:</span>
              {[1, 3, 5].map((s) => (
                <button
                  key={s}
                  onClick={() => onSetBrushSize(s)}
                  className={`px-1.5 py-0.5 rounded ${
                    brushSize === s ? 'bg-blue-600 text-white font-bold' : 'bg-slate-900 text-slate-400'
                  }`}
                >
                  {s}x{s}
                </button>
              ))}
            </div>

            <button onClick={onClose} className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Palette Tabs */}
        <div className="flex items-center gap-2 pt-2 pb-1 text-[11px]">
          <button
            onClick={() => setActiveTab('terrain')}
            className={`px-2.5 py-0.5 rounded transition ${
              activeTab === 'terrain' ? 'bg-slate-800 text-amber-300 font-bold' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            TERRAIN BIOMES
          </button>
          <button
            onClick={() => setActiveTab('vegetation')}
            className={`px-2.5 py-0.5 rounded transition ${
              activeTab === 'vegetation' ? 'bg-slate-800 text-amber-300 font-bold' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            TREES & VEGETATION
          </button>
          <button
            onClick={() => setActiveTab('structures')}
            className={`px-2.5 py-0.5 rounded transition ${
              activeTab === 'structures' ? 'bg-slate-800 text-amber-300 font-bold' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            FORTIFICATIONS & STRUCTURES
          </button>
        </div>

        {/* Palette Content */}
        <div className="max-h-24 overflow-y-auto pt-1">
          {activeTab === 'terrain' && (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
              {terrainOptions.map((t) => (
                <button
                  key={t.type}
                  onClick={() => {
                    onSelectTerrain(t.type);
                    onSetMode('paint_terrain');
                  }}
                  className={`p-1 rounded text-left flex items-center gap-1.5 border transition ${
                    selectedTerrain === t.type && activeMode === 'paint_terrain'
                      ? 'border-amber-400 bg-amber-950/40 text-amber-200'
                      : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                  <span className="truncate text-[10px]">{t.label}</span>
                </button>
              ))}
            </div>
          )}

          {(activeTab === 'vegetation' || activeTab === 'structures') && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
              {objectOptions
                .filter((o) => o.category === activeTab)
                .map((o) => (
                  <button
                    key={o.type}
                    onClick={() => {
                      onSelectObject(o.type);
                      onSetMode('place_object');
                    }}
                    className={`p-1.5 rounded text-left border transition ${
                      selectedObject === o.type && activeMode === 'place_object'
                        ? 'border-amber-400 bg-amber-950/40 text-amber-200'
                        : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span className="truncate text-[11px] block">{o.label}</span>
                  </button>
                ))}
            </div>
          )}
        </div>

        {/* Inspected Cell HUD */}
        {activeMode === 'inspect' && inspectedCellInfo && (
          <div className="mt-2 pt-2 border-t border-slate-800 text-[11px] flex items-center justify-between text-slate-300">
            <div>
              CELL [{inspectedCellInfo.x}, {inspectedCellInfo.y}]:{' '}
              <span className="text-amber-400 font-bold uppercase">{inspectedCellInfo.terrain}</span>
            </div>
            <div>
              GROUND PASSABLE:{' '}
              <span className={inspectedCellInfo.groundPassable ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                {inspectedCellInfo.groundPassable ? 'YES' : 'NO'}
              </span>
            </div>
            <div>
              SPEED MULTIPLIER:{' '}
              <span className="text-cyan-400 font-bold">{(1 / inspectedCellInfo.cost).toFixed(2)}x</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
