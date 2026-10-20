import React, { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Shield, Crosshair, Flag, Hammer, Navigation } from 'lucide-react';

interface TutorialModalProps {
  onClose: () => void;
  onDeploy: () => void;
}

export const TutorialModal: React.FC<TutorialModalProps> = ({ onClose, onDeploy }) => {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: 'OPERATIONAL BRIEFING: WELCOME TO FRONTLINE DOMINION',
      icon: <Flag className="w-6 h-6 text-blue-400" />,
      content: (
        <div className="space-y-3 text-xs leading-relaxed text-slate-300">
          <p>
            Commander, welcome to the Frontline Dominion theater. You command tactical military operations across a persistent, real-time shared battlefield.
          </p>
          <div className="p-3 rounded bg-slate-900 border border-slate-800">
            <h4 className="font-bold text-slate-100 font-mono mb-1 text-xs">PRIMARY DIRECTIVES:</h4>
            <ul className="list-disc list-inside space-y-1 text-slate-400">
              <li>Fortify your home base and expand into neutral & hostile territory.</li>
              <li>Extract concrete, steel, aluminum, and petrochemical fuel over time.</li>
              <li>Manufacture balanced land, air, naval, and armored rail units.</li>
              <li>Deploy conquest vehicles to seize contested enemy facilities.</li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      title: 'TACTICAL CONTROLS & CAMERA NAVIGATION',
      icon: <Navigation className="w-6 h-6 text-cyan-400" />,
      content: (
        <div className="space-y-3 text-xs leading-relaxed text-slate-300">
          <p>Control the battlefield using standard real-time strategy controls:</p>
          <div className="grid grid-cols-2 gap-2 text-slate-300 font-mono text-[11px]">
            <div className="p-2 rounded bg-slate-900 border border-slate-800">
              <span className="text-amber-400 font-bold block mb-0.5">CAMERA PAN</span>
              <span>W, A, S, D or Arrow Keys or Click & Drag Radar</span>
            </div>
            <div className="p-2 rounded bg-slate-900 border border-slate-800">
              <span className="text-amber-400 font-bold block mb-0.5">ZOOM LEVEL</span>
              <span>Mouse Scroll Wheel or +/- buttons</span>
            </div>
            <div className="p-2 rounded bg-slate-900 border border-slate-800">
              <span className="text-amber-400 font-bold block mb-0.5">SELECT FORCES</span>
              <span>Left-Click unit or Drag Box over multiple units</span>
            </div>
            <div className="p-2 rounded bg-slate-900 border border-slate-800">
              <span className="text-amber-400 font-bold block mb-0.5">ORDERS & ATTACK</span>
              <span>Right-Click ground to move, right-click target to attack</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'BASE LOGISTICS & INDUSTRIAL PRODUCTION',
      icon: <Hammer className="w-6 h-6 text-amber-400" />,
      content: (
        <div className="space-y-3 text-xs leading-relaxed text-slate-300">
          <p>
            Click any friendly base on the map to open the <strong className="text-slate-100">Base Drawer</strong>. Bases generate four essential materials:
          </p>
          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
            <div className="p-2 rounded bg-slate-900 border border-slate-800">
              <span className="text-stone-300 font-bold">CONCRETE</span>: Fortifications & Turrets
            </div>
            <div className="p-2 rounded bg-slate-900 border border-slate-800">
              <span className="text-blue-300 font-bold">STEEL</span>: Tank Armor & Armored Trains
            </div>
            <div className="p-2 rounded bg-slate-900 border border-slate-800">
              <span className="text-cyan-300 font-bold">ALUMINUM</span>: Aircraft, Jets & Radars
            </div>
            <div className="p-2 rounded bg-slate-900 border border-slate-800">
              <span className="text-amber-300 font-bold">FUEL</span>: Engine Propulsion & Bombers
            </div>
          </div>
          <p className="text-[11px] text-slate-400">
            Resource and construction queues continue progressing even while you are logged off!
          </p>
        </div>
      ),
    },
    {
      title: 'UNIT COUNTERS & AIR-GROUND-NAVAL DOCTRINE',
      icon: <Crosshair className="w-6 h-6 text-rose-400" />,
      content: (
        <div className="space-y-2.5 text-xs leading-relaxed text-slate-300">
          <p>Every combat unit fills a specialized tactical role:</p>
          <div className="space-y-1.5 text-[11px] font-mono">
            <div className="p-2 rounded bg-slate-900 border border-slate-800 flex items-center justify-between">
              <span>Skyguard Vulcan Flak</span>
              <span className="text-rose-400 font-bold">Counter to Helicopters & Bombers (2.4x)</span>
            </div>
            <div className="p-2 rounded bg-slate-900 border border-slate-800 flex items-center justify-between">
              <span>Titan Main Battle Tank</span>
              <span className="text-blue-400 font-bold">Heavy direct ground assault & armor</span>
            </div>
            <div className="p-2 rounded bg-slate-900 border border-slate-800 flex items-center justify-between">
              <span>Goliath Howitzer</span>
              <span className="text-amber-400 font-bold">Extreme standoff range base bombardment</span>
            </div>
            <div className="p-2 rounded bg-slate-900 border border-slate-800 flex items-center justify-between">
              <span>Iron Dreadnought Train</span>
              <span className="text-purple-400 font-bold">Railway corridor siege fortress</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'TERRITORIAL CONQUEST & BASE CAPTURE',
      icon: <Shield className="w-6 h-6 text-emerald-400" />,
      content: (
        <div className="space-y-3 text-xs leading-relaxed text-slate-300">
          <p>
            To expand your faction across the theater, you must capture neutral and enemy bases:
          </p>
          <ol className="list-decimal list-inside space-y-1.5 text-slate-400 text-xs font-mono p-3 rounded bg-slate-900 border border-slate-800">
            <li>Bombard and eliminate the base's defense turrets and shield.</li>
            <li>Produce a <span className="text-rose-400 font-bold">Dominator Command Vehicle</span> from your vehicle assembly.</li>
            <li>Move the Dominator within the target base perimeter.</li>
            <li>Wait for the electromagnetic capture uplink to reach 100%.</li>
            <li>The base transfers to your command, unlocking its production queues and resources!</li>
          </ol>
        </div>
      ),
    },
  ];

  const current = steps[step];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm select-none">
      <div className="w-full max-w-lg rounded-xl bg-slate-950 border border-slate-800 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800">
          <div className="flex items-center gap-2">
            {current.icon}
            <h2 className="font-bold text-xs text-slate-100 font-mono tracking-wider">
              {current.title}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-800 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">{current.content}</div>

        {/* Footer controls */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-t border-slate-800">
          <div className="flex gap-1">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`w-2 h-2 rounded-full transition-all ${
                  step === i ? 'w-5 bg-blue-500' : 'bg-slate-700'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300 flex items-center gap-1 transition"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Previous</span>
              </button>
            )}

            {step < steps.length - 1 ? (
              <button
                onClick={() => setStep(step + 1)}
                className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-xs font-mono font-semibold text-white flex items-center gap-1 transition shadow-sm"
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => {
                  onDeploy();
                  onClose();
                }}
                className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-xs font-mono font-bold text-white flex items-center gap-1 transition shadow-sm"
              >
                <span>Deploy Commander</span>
                <Flag className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
