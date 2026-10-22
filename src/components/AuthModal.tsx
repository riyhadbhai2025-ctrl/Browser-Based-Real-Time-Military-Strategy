import React, { useState } from 'react';
import { Shield, UserPlus, LogIn, ChevronRight, AlertCircle, Radio, Compass, Crosshair } from 'lucide-react';
import { PlayerProfile } from '../types/game';

interface AuthModalProps {
  onSuccess: (token: string, profile: PlayerProfile) => void;
  isRestoringSession?: boolean;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onSuccess, isRestoringSession = false }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleQuickPlay = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Guest deployment failed');
      onSuccess(data.token, data.profile);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
    const body = mode === 'register' ? { username, password, email } : { username, password };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Authentication error');
      onSuccess(data.token, data.profile);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      data-testid="login-screen-overlay"
      className="fixed inset-0 z-50 flex flex-col justify-between p-4 sm:p-6 bg-gradient-to-b from-slate-950/60 via-slate-950/20 to-slate-950/70 select-none pointer-events-auto"
    >
      {/* Top Strategic Theater Telemetry Strip */}
      <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-950/65 border border-slate-800/80 backdrop-blur-sm max-w-6xl w-full mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs sm:text-sm font-bold font-mono tracking-wider text-slate-100 uppercase">
              Frontline Dominion
            </div>
            <div className="text-[10px] font-mono text-cyan-400/90 tracking-widest uppercase">
              3D Persistent Combined-Arms RTS Theater
            </div>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-4 text-[10px] font-mono text-slate-300">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900/80 border border-slate-800">
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>LIVE 3D SATELLITE RECON // RIVERFRONT SECTOR</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900/80 border border-slate-800 text-amber-300">
            <Compass className="w-3.5 h-3.5" />
            <span>PREVIEW MODE (READ-ONLY)</span>
          </div>
        </div>
      </div>

      {/* Center Login / Register Command Panel */}
      <div className="my-auto flex items-center justify-center">
        {isRestoringSession ? (
          <div className="w-full max-w-sm rounded-2xl bg-slate-900/85 border border-cyan-500/40 backdrop-blur-md shadow-2xl p-6 text-center space-y-3">
            <div className="w-10 h-10 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin mx-auto" />
            <div className="text-xs font-mono font-bold tracking-widest text-cyan-300 uppercase">
              Restoring Tactical Command Session...
            </div>
            <p className="text-[11px] font-mono text-slate-400">
              Validating encrypted commander credentials and synchronizing 3D sector telemetry.
            </p>
          </div>
        ) : (
          <div className="w-full max-w-md rounded-2xl bg-slate-900/85 border border-slate-700/80 backdrop-blur-md shadow-2xl overflow-hidden">
            {/* Header Hero with Tactical Battlefield Banner */}
            <div className="relative overflow-hidden border-b border-slate-800 text-center">
              <img
                src="/assets/aistudio/Fw5BLLDDwLESOCprFgjWyOrO3iW7ODA4kBiqrcvvpEa-sfZcdyOSvpUqb0Oztv21RjeTVt8uAymaAR7vKCAnjBGdYi0Lqbc_DgjMmIH_b0h4Q0pt5PH9dLMC4QhO_-PbUi98d2ZT4RbY-qrmJxHDCphLhadzqPlNG_93CCJvbFVqHNMkZ2cpaFhY_jLvtcSS_2ef97afb.jfif"
                alt="Frontline Dominion Theater"
                referrerPolicy="no-referrer"
                className="w-full h-28 object-cover brightness-75 contrast-125"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/55 to-transparent flex flex-col items-center justify-end p-3.5">
                <h1 className="text-lg sm:text-xl font-bold font-mono tracking-wider text-slate-100 uppercase drop-shadow-md">
                  Frontline Dominion
                </h1>
                <p className="text-[11px] text-cyan-400 font-mono tracking-wide">
                  Authorize Command Uplink to Enter 3D Battlefield
                </p>
              </div>
            </div>

            <div className="p-5 sm:p-6 space-y-4">
              {error && (
                <div
                  role="alert"
                  className="p-3 rounded-lg bg-rose-950/70 border border-rose-700 text-rose-200 text-xs flex items-center gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{error}</span>
                </div>
              )}

              {/* Non-Privileged Guest Quick Play CTA */}
              <button
                type="button"
                onClick={handleQuickPlay}
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 disabled:opacity-50 text-white font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition shadow-lg shadow-blue-600/25 cursor-pointer"
              >
                <Crosshair className="w-4 h-4" />
                <span>Quick Deploy (Guest Recruit)</span>
                <ChevronRight className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2 my-1">
                <div className="flex-1 h-px bg-slate-800" />
                <span className="text-[10px] text-slate-400 font-mono uppercase">Or Enter With Account</span>
                <div className="flex-1 h-px bg-slate-800" />
              </div>

              {/* Mode Switch Tabs */}
              <div className="flex rounded-lg bg-slate-950/90 p-1 border border-slate-800 text-xs font-mono">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                  }}
                  className={`flex-1 py-1.5 rounded text-center transition cursor-pointer ${
                    mode === 'login' ? 'bg-slate-800 text-white font-bold shadow' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError(null);
                  }}
                  className={`flex-1 py-1.5 rounded text-center transition cursor-pointer ${
                    mode === 'register' ? 'bg-slate-800 text-white font-bold shadow' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  New Enlistment
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-mono text-slate-300 mb-1">COMMANDER CALLSIGN</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. Maverick"
                    required
                    className="w-full bg-slate-950/90 px-3 py-2 rounded-lg border border-slate-700/80 text-xs text-slate-100 font-mono focus:outline-none focus:border-cyan-400"
                  />
                </div>

                {mode === 'register' && (
                  <div>
                    <label className="block text-[11px] font-mono text-slate-300 mb-1">COMMUNICATION EMAIL</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="commander@frontline.mil"
                      className="w-full bg-slate-950/90 px-3 py-2 rounded-lg border border-slate-700/80 text-xs text-slate-100 font-mono focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-mono text-slate-300 mb-1">SECURITY PASSCODE</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full bg-slate-950/90 px-3 py-2 rounded-lg border border-slate-700/80 text-xs text-slate-100 font-mono focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-100 hover:text-white font-mono font-semibold text-xs transition flex items-center justify-center gap-2 border border-slate-600/80 cursor-pointer"
                >
                  {mode === 'register' ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
                  <span>
                    {loading
                      ? 'Authorizing Command Uplink...'
                      : mode === 'register'
                      ? 'Register & Establish Outpost'
                      : 'Authorize & Enter Theater'}
                  </span>
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Theater Status Footer */}
      <div className="text-center text-[10px] font-mono text-slate-400/90 tracking-wider uppercase">
        3D Tactical Engine Active // Authenticate to Deploy to Your Home Base & Enable Command HUD
      </div>
    </div>
  );
};
