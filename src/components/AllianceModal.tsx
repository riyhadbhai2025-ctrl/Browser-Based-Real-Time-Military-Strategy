import React, { useEffect, useState } from 'react';
import {
  X,
  Users,
  Plus,
  LogOut,
  UserPlus,
  Check,
  XCircle,
  Shield,
  Crown,
  Settings,
  Activity,
} from 'lucide-react';
import { Alliance, AllianceRecruitmentMode, AllianceRole, PlayerProfile } from '../types/game';

interface AllianceModalProps {
  alliances: Alliance[];
  profile: PlayerProfile;
  token?: string | null;
  onClose: () => void;
  onCreateAlliance: (
    name: string,
    tag: string,
    description: string,
    recruitmentMode?: AllianceRecruitmentMode
  ) => void;
  onJoinAlliance: (allianceId: string) => void;
  onLeaveAlliance?: () => void;
  onRefreshAlliance?: (updatedAlliance: Alliance) => void;
}

interface RosterMember {
  userId: string;
  username: string;
  rank: string;
  level: number;
  score: number;
  role: AllianceRole;
  isOnline: boolean;
  basesCount: number;
}

export const AllianceModal: React.FC<AllianceModalProps> = ({
  alliances,
  profile,
  token,
  onClose,
  onCreateAlliance,
  onJoinAlliance,
  onLeaveAlliance,
  onRefreshAlliance,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'roster' | 'requests' | 'settings'>('overview');
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [description, setDescription] = useState('');
  const [recruitmentMode, setRecruitmentMode] = useState<AllianceRecruitmentMode>('open');

  const [members, setMembers] = useState<RosterMember[]>([]);
  const [inviteTarget, setInviteTarget] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editMode, setEditMode] = useState<AllianceRecruitmentMode>('open');

  const currentAlliance = alliances.find((a) => a.id === profile.allianceId);
  const myRole: AllianceRole =
    currentAlliance?.memberRoles?.[profile.id] ||
    profile.allianceRole ||
    (currentAlliance?.leaderId === profile.id ? 'leader' : 'member');
  const canManageRequests = myRole === 'leader' || myRole === 'co_leader' || myRole === 'officer';
  const canManageRoles = myRole === 'leader' || myRole === 'co_leader';

  useEffect(() => {
    if (!currentAlliance) return;
    setEditDesc(currentAlliance.description || '');
    setEditMode(currentAlliance.recruitmentMode || 'open');

    fetch(`/api/alliances/${currentAlliance.id}/members`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.members) {
          setMembers(data.members);
        }
      })
      .catch(() => {});
  }, [currentAlliance?.id, currentAlliance?.memberIds.length, currentAlliance?.memberRoles]);

  const showStatus = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !tag.trim()) return;
    onCreateAlliance(name.trim(), tag.trim(), description.trim(), recruitmentMode);
    setIsCreating(false);
  };

  const callAllianceApi = async (endpoint: string, body: Record<string, any>) => {
    const authToken = token || localStorage.getItem('frontline_token') || '';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      showStatus(data?.error || 'Operation failed');
      return null;
    }
    if (data?.alliance && onRefreshAlliance) {
      onRefreshAlliance(data.alliance);
    }
    return data;
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteTarget.trim()) return;
    const data = await callAllianceApi('/api/alliances/invite', {
      targetUsernameOrId: inviteTarget.trim(),
    });
    if (data) {
      showStatus(`Invitation transmitted to ${inviteTarget.trim()}`);
      setInviteTarget('');
    }
  };

  const handleRespondRequest = async (applicantUserId: string, approve: boolean) => {
    const data = await callAllianceApi('/api/alliances/respond-request', {
      applicantUserId,
      approve,
    });
    if (data) {
      showStatus(approve ? 'Commander approved into alliance' : 'Join request declined');
    }
  };

  const handleKick = async (targetUserId: string) => {
    const data = await callAllianceApi('/api/alliances/kick', { targetUserId });
    if (data) {
      setMembers((prev) => prev.filter((m) => m.userId !== targetUserId));
      showStatus('Member removed from alliance');
    }
  };

  const handleSetRole = async (targetUserId: string, role: AllianceRole) => {
    const data = await callAllianceApi('/api/alliances/set-role', { targetUserId, role });
    if (data) {
      setMembers((prev) =>
        prev.map((m) => (m.userId === targetUserId ? { ...m, role } : m))
      );
      showStatus(`Updated member role to ${role.replace('_', '-')}`);
    }
  };

  const handleTransferLeadership = async (newLeaderUserId: string) => {
    const data = await callAllianceApi('/api/alliances/transfer-leadership', { newLeaderUserId });
    if (data) {
      showStatus('Alliance leadership transferred');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = await callAllianceApi('/api/alliances/settings', {
      description: editDesc,
      recruitmentMode: editMode,
    });
    if (data) {
      showStatus('Alliance charter and recruitment settings saved');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm select-none">
      <div className="w-full max-w-2xl rounded-xl bg-slate-950 border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[86vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-400" />
            <h2 className="font-bold text-sm text-slate-100 font-mono tracking-wider">
              ALLIANCE COALITION COMMAND
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-800 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {statusMessage && (
          <div className="px-4 py-1.5 bg-indigo-950/90 border-b border-indigo-500/40 text-xs font-mono text-indigo-200">
            {statusMessage}
          </div>
        )}

        {/* Navigation Tabs when in an Alliance */}
        {currentAlliance && (
          <div className="flex border-b border-slate-800 bg-slate-900/50 text-xs font-mono">
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex-1 py-2 font-semibold border-b-2 transition ${
                activeTab === 'overview'
                  ? 'border-indigo-500 text-indigo-300 bg-indigo-950/30'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              COALITION DIRECTORY
            </button>
            <button
              onClick={() => setActiveTab('roster')}
              className={`flex-1 py-2 font-semibold border-b-2 transition ${
                activeTab === 'roster'
                  ? 'border-indigo-500 text-indigo-300 bg-indigo-950/30'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              ROSTER & ROLES ({currentAlliance.memberIds.length})
            </button>
            <button
              onClick={() => setActiveTab('requests')}
              className={`flex-1 py-2 font-semibold border-b-2 transition ${
                activeTab === 'requests'
                  ? 'border-indigo-500 text-indigo-300 bg-indigo-950/30'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              RECRUITMENT ({(currentAlliance.joinRequests || []).length})
            </button>
            {canManageRoles && (
              <button
                onClick={() => setActiveTab('settings')}
                className={`flex-1 py-2 font-semibold border-b-2 transition ${
                  activeTab === 'settings'
                    ? 'border-indigo-500 text-indigo-300 bg-indigo-950/30'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                CHARTER SETTINGS
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="p-4 overflow-y-auto space-y-4">
          {/* Current Alliance Banner */}
          {currentAlliance ? (
            <div className="p-3.5 rounded-lg bg-indigo-950/30 border border-indigo-700/50">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded bg-indigo-600 flex items-center justify-center font-bold text-white font-mono">
                    {currentAlliance.tag}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-100 font-mono">{currentAlliance.name}</h3>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-cyan-300 font-mono uppercase">
                        {currentAlliance.recruitmentMode || 'open'}
                      </span>
                    </div>
                    <p className="text-[11px] text-indigo-300 font-mono">
                      Your Role: <span className="uppercase font-bold">{myRole.replace('_', '-')}</span> · Leader:{' '}
                      {currentAlliance.leaderName}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right text-xs font-mono">
                    <div className="text-amber-400 font-bold">{currentAlliance.score} PTS</div>
                    <div className="text-slate-400">
                      {currentAlliance.memberIds.length}/{currentAlliance.maxMembers || 25} MEMBERS
                    </div>
                  </div>
                  {onLeaveAlliance && (
                    <button
                      onClick={onLeaveAlliance}
                      className="px-2.5 py-1.5 rounded bg-rose-950/80 hover:bg-rose-900 border border-rose-700/60 text-rose-200 text-xs font-mono flex items-center gap-1 transition"
                      title="Leave Alliance"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Leave</span>
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xs text-slate-300 italic">{currentAlliance.description}</p>
            </div>
          ) : (
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-xs">
              <span className="text-slate-400">You are currently an independent commander (no alliance).</span>
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
                  <label className="block text-[10px] text-slate-400 mb-1">TAG (2-4 CHARS)</label>
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
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-[10px] text-slate-400 mb-1">STRATEGIC CHARTER</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Coalition objectives, territorial defense policy..."
                    maxLength={160}
                    className="w-full bg-slate-950 px-2.5 py-1.5 rounded border border-slate-800 text-xs text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">RECRUITMENT</label>
                  <select
                    value={recruitmentMode}
                    onChange={(e) => setRecruitmentMode(e.target.value as AllianceRecruitmentMode)}
                    className="w-full bg-slate-950 px-2 py-1.5 rounded border border-slate-800 text-xs text-slate-100 font-mono"
                  >
                    <option value="open">Open Entry</option>
                    <option value="request_only">Request Only</option>
                    <option value="invite_only">Invite Only</option>
                  </select>
                </div>
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

          {/* TAB 1: OVERVIEW & COALITION DIRECTORY */}
          {(!currentAlliance || activeTab === 'overview') && (
            <div className="space-y-4">
              <div>
                <h4 className="font-bold text-xs font-mono text-slate-400 uppercase mb-2">Registered Coalitions</h4>
                <div className="space-y-2">
                  {alliances.map((alli) => {
                    const isMember = alli.id === profile.allianceId;
                    const mode = alli.recruitmentMode || 'open';
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
                              <span className="text-[9px] px-1 rounded bg-slate-950 text-cyan-400 uppercase">
                                {mode.replace('_', ' ')}
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

                          {!profile.allianceId && !isMember && mode !== 'invite_only' && (
                            <button
                              onClick={() => onJoinAlliance(alli.id)}
                              className="px-3 py-1 rounded bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white font-mono font-semibold transition"
                            >
                              {mode === 'request_only' ? 'Apply' : 'Join'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {currentAlliance?.activityLog && currentAlliance.activityLog.length > 0 && (
                <div>
                  <h4 className="font-bold text-xs font-mono text-slate-400 uppercase mb-2 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Coalition Activity Log</span>
                  </h4>
                  <div className="p-2.5 rounded-lg bg-slate-900/70 border border-slate-800 space-y-1.5 max-h-36 overflow-y-auto text-[11px] font-mono">
                    {currentAlliance.activityLog.slice(0, 12).map((act) => (
                      <div key={act.id} className="flex items-center justify-between text-slate-300">
                        <span>• {act.text}</span>
                        <span className="text-[10px] text-slate-500">
                          {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ROSTER & ROLES */}
          {currentAlliance && activeTab === 'roster' && (
            <div className="space-y-2">
              {members.map((m) => {
                const isSelf = m.userId === profile.id;
                return (
                  <div
                    key={m.userId}
                    className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between text-xs font-mono"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          m.isOnline ? 'bg-emerald-500' : 'bg-slate-600'
                        }`}
                      />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-100">{m.username}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-700/50 uppercase">
                            {m.role.replace('_', '-')}
                          </span>
                          <span className="text-[10px] text-emerald-400">LVL {m.level}</span>
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {m.rank} · {m.score} PTS · {m.basesCount} Bases
                        </div>
                      </div>
                    </div>

                    {!isSelf && canManageRequests && (
                      <div className="flex items-center gap-1">
                        {canManageRoles && m.role !== 'leader' && (
                          <>
                            <select
                              value={m.role}
                              onChange={(e) => handleSetRole(m.userId, e.target.value as AllianceRole)}
                              className="bg-slate-950 px-2 py-1 rounded border border-slate-700 text-[10px] text-slate-200"
                            >
                              <option value="member">Member</option>
                              <option value="officer">Officer</option>
                              {myRole === 'leader' && <option value="co_leader">Co-Leader</option>}
                            </select>

                            {myRole === 'leader' && (
                              <button
                                onClick={() => handleTransferLeadership(m.userId)}
                                className="px-2 py-1 rounded bg-amber-950/70 hover:bg-amber-900 text-amber-300 border border-amber-700/50 text-[10px] flex items-center gap-1"
                                title="Transfer Alliance Leadership"
                              >
                                <Crown className="w-3 h-3" />
                                <span>Lead</span>
                              </button>
                            )}
                          </>
                        )}

                        {m.role !== 'leader' && (
                          <button
                            onClick={() => handleKick(m.userId)}
                            className="px-2 py-1 rounded bg-rose-950/70 hover:bg-rose-900 text-rose-300 border border-rose-700/50 text-[10px]"
                          >
                            Kick
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 3: RECRUITMENT, INVITES & JOIN REQUESTS */}
          {currentAlliance && activeTab === 'requests' && (
            <div className="space-y-4">
              {canManageRequests && (
                <form
                  onSubmit={handleInvite}
                  className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex items-center gap-2"
                >
                  <UserPlus className="w-4 h-4 text-indigo-400 shrink-0" />
                  <input
                    type="text"
                    value={inviteTarget}
                    onChange={(e) => setInviteTarget(e.target.value)}
                    placeholder="Enter commander callsign to invite..."
                    className="flex-1 bg-slate-950 px-2.5 py-1.5 rounded border border-slate-800 text-xs text-slate-100 font-mono"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-xs font-mono font-bold text-white"
                  >
                    Send Invite
                  </button>
                </form>
              )}

              <div>
                <h4 className="font-bold text-xs font-mono text-slate-400 uppercase mb-2">
                  Pending Join Applications ({(currentAlliance.joinRequests || []).length})
                </h4>
                {(currentAlliance.joinRequests || []).length === 0 ? (
                  <div className="p-3 rounded bg-slate-900/50 border border-slate-800 text-xs text-slate-500 font-mono">
                    No pending join requests at this time.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(currentAlliance.joinRequests || []).map((req) => (
                      <div
                        key={req.userId}
                        className="p-2.5 rounded bg-slate-900 border border-slate-800 flex items-center justify-between text-xs font-mono"
                      >
                        <div>
                          <div className="font-bold text-slate-100">{req.username}</div>
                          <div className="text-[10px] text-slate-400">
                            {req.message || 'Requesting commission into alliance forces.'}
                          </div>
                        </div>
                        {canManageRequests && (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleRespondRequest(req.userId, true)}
                              className="px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white flex items-center gap-1 text-[10px]"
                            >
                              <Check className="w-3 h-3" />
                              <span>Approve</span>
                            </button>
                            <button
                              onClick={() => handleRespondRequest(req.userId, false)}
                              className="px-2.5 py-1 rounded bg-rose-900/80 hover:bg-rose-800 text-rose-200 flex items-center gap-1 text-[10px]"
                            >
                              <XCircle className="w-3 h-3" />
                              <span>Decline</span>
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: CHARTER & RECRUITMENT SETTINGS */}
          {currentAlliance && activeTab === 'settings' && canManageRoles && (
            <form onSubmit={handleSaveSettings} className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-indigo-300 uppercase">
                <Settings className="w-4 h-4" />
                <span>Alliance Charter & Recruitment Policy</span>
              </div>
              <div>
                <label className="block text-[10px] font-mono text-slate-400 mb-1">RECRUITMENT POLICY</label>
                <select
                  value={editMode}
                  onChange={(e) => setEditMode(e.target.value as AllianceRecruitmentMode)}
                  className="w-full bg-slate-950 px-2.5 py-1.5 rounded border border-slate-800 text-xs text-slate-100 font-mono"
                >
                  <option value="open">Open Entry (Anyone can join immediately)</option>
                  <option value="request_only">Request Only (Officers approve applications)</option>
                  <option value="invite_only">Invite Only (Requires direct officer invitation)</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono text-slate-400 mb-1">ALLIANCE DESCRIPTION / CHARTER</label>
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={3}
                  maxLength={240}
                  className="w-full bg-slate-950 px-2.5 py-1.5 rounded border border-slate-800 text-xs text-slate-100 font-mono"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-xs font-mono font-bold text-white flex items-center gap-1.5"
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>Save Charter Settings</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
