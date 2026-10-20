import React from 'react';
import { X, Keyboard, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, MousePointer, MessageSquare, Maximize, Target, Zap, Map as MapIcon } from 'lucide-react';

interface ShortcutsModalProps {
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ onClose }) => {
  const shortcuts = [
    { key: 'ENTER', desc: 'Open / Focus Tactical Chat', icon: <MessageSquare className="w-3.5 h-3.5" /> },
    { key: 'W, A, S, D', desc: 'Scroll Camera (Arrow Keys supported)', icon: <ArrowUp className="w-3.5 h-3.5" /> },
    { key: 'R', desc: 'Toggle Repair Crane Visuals', icon: <Zap className="w-3.5 h-3.5 text-amber-400" /> },
    { key: 'F11', desc: 'Toggle Fullscreen Mode', icon: <Maximize className="w-3.5 h-3.5" /> },
    { key: 'HOME', desc: 'Select All Mobile Units', icon: <MousePointer className="w-3.5 h-3.5 text-blue-400" /> },
    { key: 'END', desc: 'Emergency Stop Selected Units', icon: <Target className="w-3.5 h-3.5 text-rose-500" /> },
    { key: 'PAGE UP', desc: 'Flash Units on Minimap', icon: <MapIcon className="w-3.5 h-3.5 text-emerald-400" /> },
    { key: 'PAGE DOWN', desc: 'Post Cursor Coordinates to Chat', icon: <MessageSquare className="w-3.5 h-3.5 text-cyan-400" /> },
    { key: '1 - 5', desc: 'Recall Control Group', icon: <Keyboard className="w-3.5 h-3.5" /> },
    { key: 'CTRL + 1 - 5', desc: 'Assign Selection to Control Group', icon: <Keyboard className="w-3.5 h-3.5" /> },
    { key: 'SPACE', desc: 'Jump Camera to Home Base', icon: <Zap className="w-3.5 h-3.5 text-blue-500" /> },
    { key: 'ESC', desc: 'Clear Selection / Close Modals', icon: <X className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-800/50 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-blue-400" />
            <h2 className="text-sm font-bold text-slate-100 font-mono tracking-wider uppercase">Tactical Hotkeys</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-700 text-slate-400 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-2 max-h-[70vh] overflow-y-auto">
          {shortcuts.map((s, i) => (
            <div key={i} className="flex items-center justify-between p-2 rounded bg-slate-950/50 border border-slate-800/50 hover:bg-slate-800/40 transition group">
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded bg-slate-800 border border-slate-700 group-hover:border-blue-500/50 transition">
                  {s.icon}
                </div>
                <span className="text-[11px] text-slate-300 font-medium">{s.desc}</span>
              </div>
              <div className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono text-cyan-400 font-bold shadow-sm">
                {s.key}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-slate-950/40 border-t border-slate-800 text-center">
          <p className="text-[10px] text-slate-500 font-mono italic">
            Commanders: Efficient hotkey usage increases operational success rates.
          </p>
        </div>
      </div>
    </div>
  );
};
