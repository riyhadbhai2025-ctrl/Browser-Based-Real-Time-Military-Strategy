import React, { useEffect, useRef } from 'react';
import { ZoomIn, ZoomOut, Home, Eye, Zap } from 'lucide-react';
import { TacticalRenderer } from '../game/renderer';

interface MinimapProps {
  renderer: TacticalRenderer | null;
  cameraCoords: { x: number; y: number };
  onJumpToHome: () => void;
  fogEnabled: boolean;
  onToggleFog: () => void;
  showRepairCranes: boolean;
  onToggleRepair: () => void;
}

export const Minimap: React.FC<MinimapProps> = ({
  renderer,
  cameraCoords,
  onJumpToHome,
  fogEnabled,
  onToggleFog,
  showRepairCranes,
  onToggleRepair,
}) => {
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDraggingRef = useRef<boolean>(false);

  useEffect(() => {
    let animId: number;
    const renderMinimap = () => {
      if (renderer && minimapCanvasRef.current) {
        renderer.drawMinimap(minimapCanvasRef.current);
      }
      animId = requestAnimationFrame(renderMinimap);
    };
    animId = requestAnimationFrame(renderMinimap);

    return () => cancelAnimationFrame(animId);
  }, [renderer]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true;
    handlePointerMove(e);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current || !renderer || !minimapCanvasRef.current) return;
    const rect = minimapCanvasRef.current.getBoundingClientRect();
    const px = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const py = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

    const normX = px / rect.width;
    const normY = py / rect.height;

    // Map dimensions (100 x 75)
    renderer.cameraX = Math.round(normX * 100);
    renderer.cameraY = Math.round(normY * 75);
  };

  const handlePointerUp = () => {
    isDraggingRef.current = false;
  };

  const handleZoom = (delta: number) => {
    if (!renderer) return;
    renderer.zoom = Math.max(0.5, Math.min(2.0, renderer.zoom + delta));
  };

  return (
    <div className="absolute bottom-3 left-3 z-20 flex flex-col items-start gap-1 select-none pointer-events-auto">
      {/* Coordinates & Quick Controls */}
      <div className="flex items-center justify-between w-full px-2 py-1 bg-slate-950/80 backdrop-blur rounded-t border border-b-0 border-slate-800 text-[11px] font-mono text-slate-300">
        <span className="text-cyan-400 font-semibold tracking-wider">
          GRID [{Math.round(cameraCoords.x)}, {Math.round(cameraCoords.y)}]
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleZoom(0.2)}
            className="p-1 rounded hover:bg-slate-800 text-slate-300"
            title="Zoom In (+)"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleZoom(-0.2)}
            className="p-1 rounded hover:bg-slate-800 text-slate-300"
            title="Zoom Out (-)"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onToggleFog}
            className={`p-1 rounded hover:bg-slate-800 ${fogEnabled ? 'text-amber-400' : 'text-slate-500'}`}
            title="Toggle Fog of War"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onToggleRepair}
            className={`p-1 rounded hover:bg-slate-800 ${showRepairCranes ? 'text-amber-400' : 'text-slate-500'}`}
            title="Toggle Repair Crane Visuals (R)"
          >
            <Zap className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onJumpToHome}
            className="p-1 rounded hover:bg-slate-800 text-blue-400"
            title="Jump Camera to Home Base (Space)"
          >
            <Home className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Minimap Display Canvas */}
      <div className="relative border-2 border-slate-800 rounded-b overflow-hidden shadow-2xl bg-slate-950">
        <canvas
          ref={minimapCanvasRef}
          width={220}
          height={165}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="cursor-crosshair block"
        />
        <div className="absolute top-1 left-1.5 px-1 rounded bg-black/60 text-[9px] font-mono text-slate-400 uppercase tracking-widest pointer-events-none">
          WARMAP RADAR
        </div>
      </div>
    </div>
  );
};
