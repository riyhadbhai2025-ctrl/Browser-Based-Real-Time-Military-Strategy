import React, { useState } from 'react';
import { X, Users, Shield, Plus, Award } from 'lucide-react';
import { Alliance, PlayerProfile } from '../types/game';

interface AllianceModalProps {
  alliances: Alliance[];
  profile: PlayerProfile;
  onClose: () => void;
  onCreateAlliance: (name: string, tag: string, description: string) => void;
  onJoinAlliance: (allianceId: string) => void;
}

export const AllianceModal: React.FC<AllianceModalProps> = ({
  alliances,
  profile,
  onClose,
  onCreateAlliance,
  onJoinAlliance,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [description, setDescription] = useState('');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !tag.trim()) return;
    onCreateAlliance(name.trim(), tag.trim(), description.trim());
    setIsCreating(false);
  };

  const currentAlliance = alliances.find((a) => a.id === profile.allianceId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm select-none">
      <div className="w-full max-w-xl rounded-xl bg-slate-950 border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-400" />
            <h2 className="font-bold text-sm text-slate-100 font-mono tracking-wider">
              ALLIANCE COALITION NETWORK
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-800 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto space-y-4">
          {/* Current Alliance Status */}
          {currentAlliance ? (
            <div className="p-3.5 rounded-lg bg-indigo-950/30 border border-indigo-700/50">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center font-bold text-white font-mono">
                    {currentAlliance.tag}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-100 font-mono">{currentAlliance.name}</h3>
                    <p className="text-[11px] text-indigo-300">
                      Role: <span className="uppercase font-semibold">{profile.allianceRole || 'Member'}</span>
                    </p>
                  </div>
                </div>
                <div className="text-right text-xs font-mono">
                  <div className="text-amber-400 font-bold">{currentAlliance.score} PTS</div>
                  <div className="text-slate-400">{currentAlliance.memberIds.length} COMMANDERS</div>
                </div>
              </div>
              <p className="text-xs text-slate-300 italic">{currentAlliance.description}</p>
            </div>
          ) : (
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-xs">
              <span className="text-slate-400">You are currently independent (no alliance).</span>
              <button
                onClick={() => setIsCreating(!isCreating)}
                className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-1 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Alliance</span>
              </button>
            </div>
          )}

          {/* Create Alliance Form */}
          {isCreating && !currentAlliance && (
            <form onSubmit={handleCreate} className="p-3.5 rounded-lg bg-slate-900 border border-slate-700 space-y-2.5">
              <h4 className="font-bold text-xs font-mono text-slate-200 uppercase">Found New Alliance</h4>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-[10px] text-slate-400 mb-1">ALLIANCE NAME</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Iron Vanguard"
                    required
                    maxLength={32}
                    className="w-full bg-slate-950 px-2.5 py-1.5 rounded border border-slate-800 text-xs text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">TAG (3-4 CHARS)</label>
                  <input
                    type="text"
                    value={tag}
                    onChange={(e) => setTag(e.target.value.toUpperCase())}
                    placeholder="IVG"
                    required
                    maxLength={4}
                    className="w-full bg-slate-950 px-2.5 py-1.5 rounded border border-slate-800 text-xs text-slate-100 font-mono uppercase"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">STRATEGIC CHARTER</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Coalition objectives, territorial protection rules..."
                  rows={2}
                  maxLength={160}
                  className="w-full bg-slate-950 px-2.5 py-1.5 rounded border border-slate-800 text-xs text-slate-100 font-mono"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white"
                >
                  Found Alliance
                </button>
              </div>
            </form>
          )}

          {/* Active Alliances Directory */}
          <div>
            <h4 className="font-bold text-xs font-mono text-slate-400 uppercase mb-2">Registered Coalitions</h4>
            <div className="space-y-2">
              {alliances.map((alli) => {
                const isMember = alli.id === profile.allianceId;
                return (
                  <div
                    key={alli.id}
                    className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-200 font-mono">
                        [{alli.tag}]
                      </div>
                      <div>
                        <div className="font-bold text-slate-200 font-mono flex items-center gap-1.5">
                          <span>{alli.name}</span>
                          <span className="text-[10px] px-1 rounded bg-slate-800 text-slate-400">
                            Leader: {alli.leaderName}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 line-clamp-1">{alli.description}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right text-[11px] font-mono">
                        <div className="text-amber-400 font-bold">{alli.score} PTS</div>
                        <div className="text-slate-500">{alli.memberIds.length} members</div>
                      </div>

                      {!isMember && (
                        <button
                          onClick={() => onJoinAlliance(alli.id)}
                          className="px-3 py-1 rounded bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white font-mono font-semibold transition"
                        >
                          Join
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
