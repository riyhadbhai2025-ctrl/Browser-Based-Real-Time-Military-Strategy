import React, { useEffect, useState } from 'react';
import {
  X,
  Trophy,
  Award,
  Target,
  Swords,
  HelpCircle,
  CheckCircle2,
  Send,
} from 'lucide-react';
import {
  AchievementProgress,
  BattleReport,
  MissionProgress,
  PlayerProfile,
} from '../types/game';

interface ProgressionModalProps {
  profile: PlayerProfile;
  token: string | null;
  onClose: () => void;
  onProfileUpdate: (updatedProfile: PlayerProfile) => void;
}

export const ProgressionModal: React.FC<ProgressionModalProps> = ({
  profile,
  token,
  onClose,
  onProfileUpdate,
}) => {
  const [activeTab, setActiveTab] = useState<'missions' | 'achievements' | 'leaderboard' | 'reports' | 'support'>(
    'missions'
  );
  const [achievements, setAchievements] = useState<AchievementProgress[]>([]);
  const [missions, setMissions] = useState<MissionProgress[]>([]);
  const [battleReports, setBattleReports] = useState<BattleReport[]>([]);
  const [leaderboard, setLeaderboard] = useState<{ players: any[]; alliances: any[] }>({
    players: [],
    alliances: [],
  });
  const [toast, setToast] = useState<string | null>(null);

  // Support ticket state
  const [ticketCategory, setTicketCategory] = useState<'general' | 'bug_report' | 'fair_play' | 'account_recovery'>(
    'general'
  );
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketMessage, setTicketMessage] = useState('');

  const authHeader = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token || localStorage.getItem('frontline_token') || ''}`,
  };

  const fetchProgressionData = () => {
    fetch('/api/progression/status', { headers: authHeader })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        if (data.achievements) setAchievements(data.achievements);
        if (data.missions) setMissions(data.missions);
        if (data.battleReports) setBattleReports(data.battleReports);
        if (data.profile) onProfileUpdate(data.profile);
      })
      .catch(() => {});

    fetch('/api/progression/leaderboard')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setLeaderboard(data);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchProgressionData();
  }, []);

  const showNotice = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const handleClaim = async (rewardId: string) => {
    try {
      const res = await fetch('/api/progression/claim-reward', {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({ rewardId }),
      });
      const data = await res.json();
      if (!res.ok) {
        showNotice(data?.error || 'Could not claim reward');
        return;
      }
      if (data.profile) {
        onProfileUpdate(data.profile);
      }
      showNotice('Supply Drop & Score Reward Claimed!');
      fetchProgressionData();
    } catch {
      showNotice('Network error while claiming reward');
    }
  };

  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketSubject.trim() || !ticketMessage.trim()) return;
    try {
      const res = await fetch('/api/support/ticket', {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({
          category: ticketCategory,
          subject: ticketSubject,
          message: ticketMessage,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showNotice(data?.error || 'Failed to submit dispatch');
        return;
      }
      setTicketSubject('');
      setTicketMessage('');
      showNotice(`Support Dispatch #${data.ticket.id.slice(-6)} transmitted to High Command.`);
    } catch {
      showNotice('Network error submitting support dispatch');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm select-none">
      <div className="w-full max-w-3xl rounded-xl bg-slate-950 border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[86vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Trophy className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="font-bold text-sm text-slate-100 font-mono tracking-wider">
                COMMAND PROGRESSION, MISSIONS & THEATER RANKINGS
              </h2>
              <p className="text-[11px] font-mono text-slate-400">
                {profile.rank} {profile.username} · Level {profile.level} · {profile.score} PTS
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-800 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {toast && (
          <div className="px-4 py-1.5 bg-amber-950/90 border-b border-amber-500/40 text-xs font-mono text-amber-200">
            {toast}
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-900/50 text-xs font-mono">
          <button
            onClick={() => setActiveTab('missions')}
            className={`flex-1 py-2 font-semibold border-b-2 transition flex items-center justify-center gap-1.5 ${
              activeTab === 'missions'
                ? 'border-amber-500 text-amber-300 bg-amber-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Target className="w-3.5 h-3.5" />
            <span>MISSIONS</span>
          </button>
          <button
            onClick={() => setActiveTab('achievements')}
            className={`flex-1 py-2 font-semibold border-b-2 transition flex items-center justify-center gap-1.5 ${
              activeTab === 'achievements'
                ? 'border-amber-500 text-amber-300 bg-amber-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>ACHIEVEMENTS</span>
          </button>
          <button
            onClick={() => setActiveTab('leaderboard')}
            className={`flex-1 py-2 font-semibold border-b-2 transition flex items-center justify-center gap-1.5 ${
              activeTab === 'leaderboard'
                ? 'border-amber-500 text-amber-300 bg-amber-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>LEADERBOARD</span>
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`flex-1 py-2 font-semibold border-b-2 transition flex items-center justify-center gap-1.5 ${
              activeTab === 'reports'
                ? 'border-amber-500 text-amber-300 bg-amber-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Swords className="w-3.5 h-3.5" />
            <span>BATTLE REPORTS</span>
          </button>
          <button
            onClick={() => setActiveTab('support')}
            className={`flex-1 py-2 font-semibold border-b-2 transition flex items-center justify-center gap-1.5 ${
              activeTab === 'support'
                ? 'border-amber-500 text-amber-300 bg-amber-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>SUPPORT</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1">
          {activeTab === 'missions' && (
            <div className="space-y-2.5">
              {missions.map((m) => {
                const pct = Math.min(100, Math.round((m.currentValue / Math.max(1, m.targetValue)) * 100));
                return (
                  <div
                    key={m.id}
                    className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between gap-4 text-xs font-mono"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-1.5 py-0.5 rounded bg-blue-950 text-cyan-300 border border-cyan-700/50 text-[10px] uppercase">
                          {m.cadence}
                        </span>
                        <span className="font-bold text-slate-100">{m.title}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mb-2">{m.description}</p>
                      <div className="w-full h-1.5 bg-slate-800 rounded overflow-hidden mb-1">
                        <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span>
                          PROGRESS: {m.currentValue} / {m.targetValue} ({pct}%)
                        </span>
                        <span className="text-amber-300">
                          REWARD: +{m.rewardScore} PTS · +{m.rewardResources.steel}S +{m.rewardResources.fuel}F
                        </span>
                      </div>
                    </div>

                    <div>
                      {m.claimed ? (
                        <span className="px-3 py-1.5 rounded bg-slate-800 text-emerald-400 text-[10px] font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>CLAIMED</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => handleClaim(m.id)}
                          disabled={!m.completed}
                          className={`px-3 py-1.5 rounded text-xs font-bold transition ${
                            m.completed
                              ? 'bg-amber-600 hover:bg-amber-500 text-white shadow'
                              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          CLAIM REWARD
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'achievements' && (
            <div className="space-y-2.5">
              {achievements.map((a) => {
                const pct = Math.min(100, Math.round((a.currentValue / Math.max(1, a.targetValue)) * 100));
                return (
                  <div
                    key={a.id}
                    className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between gap-4 text-xs font-mono"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-700/50 text-[10px] uppercase">
                          {a.category}
                        </span>
                        <span className="font-bold text-slate-100">{a.title}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mb-2">{a.description}</p>
                      <div className="w-full h-1.5 bg-slate-800 rounded overflow-hidden mb-1">
                        <div className="h-full bg-amber-500" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span>
                          PROGRESS: {a.currentValue} / {a.targetValue} ({pct}%)
                        </span>
                        <span className="text-amber-300">
                          REWARD: +{a.rewardScore} PTS · +{a.rewardResources.concrete}C +{a.rewardResources.steel}S
                        </span>
                      </div>
                    </div>

                    <div>
                      {a.claimed ? (
                        <span className="px-3 py-1.5 rounded bg-slate-800 text-emerald-400 text-[10px] font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>CLAIMED</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => handleClaim(a.id)}
                          disabled={!a.completed}
                          className={`px-3 py-1.5 rounded text-xs font-bold transition ${
                            a.completed
                              ? 'bg-amber-600 hover:bg-amber-500 text-white shadow'
                              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          CLAIM REWARD
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'leaderboard' && (
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-mono font-bold text-slate-400 uppercase mb-2">
                  Top Theater Commanders
                </h4>
                <div className="space-y-1.5">
                  {leaderboard.players.slice(0, 15).map((p, idx) => (
                    <div
                      key={p.id}
                      className={`p-2.5 rounded border flex items-center justify-between text-xs font-mono ${
                        p.id === profile.id
                          ? 'bg-blue-950/40 border-blue-500/60 text-slate-100'
                          : 'bg-slate-900 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 text-center font-bold text-amber-400">#{idx + 1}</span>
                        <div>
                          <div className="font-bold flex items-center gap-1.5">
                            <span>{p.username}</span>
                            {p.allianceTag && <span className="text-cyan-400">[{p.allianceTag}]</span>}
                            <span className="text-[10px] text-emerald-400">LVL {p.level}</span>
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {p.rank} · {p.basesControlled} Bases · {p.totalUnitsDestroyed} Kills
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-amber-400">{p.score} PTS</div>
                        <div className="text-[10px] text-slate-500">{p.activeUnits} Active Units</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'reports' && (
            <div className="space-y-2">
              {battleReports.length === 0 ? (
                <div className="p-6 text-center text-xs font-mono text-slate-500">
                  No siege or highway transfer dispatches recorded yet. Capture enemy bases or transfer convoys across
                  sectors to generate combat logs.
                </div>
              ) : (
                battleReports.map((rep) => (
                  <div key={rep.id} className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-cyan-300 uppercase">
                        [{rep.type.replace('_', ' ')}] {rep.mapName}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {new Date(rep.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-slate-200 text-[11px]">{rep.summary}</p>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'support' && (
            <form onSubmit={handleSubmitTicket} className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 space-y-3">
              <div className="text-xs font-mono text-slate-300">
                Submit a tactical support ticket, bug report, or fair-play review request to High Command.
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 mb-1">CATEGORY</label>
                  <select
                    value={ticketCategory}
                    onChange={(e) => setTicketCategory(e.target.value as any)}
                    className="w-full bg-slate-950 px-2.5 py-1.5 rounded border border-slate-800 text-xs text-slate-100 font-mono"
                  >
                    <option value="general">General Support</option>
                    <option value="bug_report">Bug Report</option>
                    <option value="fair_play">Fair Play / Moderation</option>
                    <option value="account_recovery">Account Assistance</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-mono text-slate-400 mb-1">SUBJECT</label>
                  <input
                    type="text"
                    value={ticketSubject}
                    onChange={(e) => setTicketSubject(e.target.value)}
                    placeholder="Brief summary of issue..."
                    required
                    maxLength={120}
                    className="w-full bg-slate-950 px-2.5 py-1.5 rounded border border-slate-800 text-xs text-slate-100 font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-mono text-slate-400 mb-1">DETAILED DISPATCH</label>
                <textarea
                  value={ticketMessage}
                  onChange={(e) => setTicketMessage(e.target.value)}
                  rows={3}
                  required
                  maxLength={600}
                  placeholder="Provide sector coordinates, unit IDs, or details..."
                  className="w-full bg-slate-950 px-2.5 py-1.5 rounded border border-slate-800 text-xs text-slate-100 font-mono"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-xs font-mono font-bold text-white flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Transmit Dispatch</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
