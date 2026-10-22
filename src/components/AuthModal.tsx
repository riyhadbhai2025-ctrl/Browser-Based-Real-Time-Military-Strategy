import React, { useState } from 'react';
import { Shield, UserPlus, LogIn, ChevronRight, AlertCircle } from 'lucide-react';
import { PlayerProfile } from '../types/game';

interface AuthModalProps {
  onSuccess: (token: string, profile: PlayerProfile) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onSuccess }) => {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md select-none">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden">
        {/* Header Hero with Tactical Battlefield Banner */}
        <div className="relative overflow-hidden border-b border-slate-800 text-center">
          <img
            src="/assets/aistudio/Fw5BLLDDwLESOCprFgjWyOrO3iW7ODA4kBiqrcvvpEa-sfZcdyOSvpUqb0Oztv21RjeTVt8uAymaAR7vKCAnjBGdYi0Lqbc_DgjMmIH_b0h4Q0pt5PH9dLMC4QhO_-PbUi98d2ZT4RbY-qrmJxHDCphLhadzqPlNG_93CCJvbFVqHNMkZ2cpaFhY_jLvtcSS_2ef97afb.jfif"
            alt="Frontline Dominion Theater"
            referrerPolicy="no-referrer"
            className="w-full h-32 object-cover brightness-75 contrast-125"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/60 to-transparent flex flex-col items-center justify-end p-4">
            <h1 className="text-xl font-bold font-mono tracking-wider text-slate-100 uppercase drop-shadow-md">
              Frontline Dominion
            </h1>
            <p className="text-[11px] text-cyan-400 font-mono tracking-wide">
              Persistent Real-Time Strategy Theater
            </p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Non-Privileged Guest Quick Play CTA */}
          <button
            onClick={handleQuickPlay}
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition shadow-lg shadow-blue-600/20"
          >
            <span>Quick Deploy (Guest Recruit)</span>
            <ChevronRight className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 my-2">
            <div className="flex-1 h-px bg-slate-800" />
            <span className="text-[10px] text-slate-500 font-mono uppercase">Or Enter With Account</span>
            <div className="flex-1 h-px bg-slate-800" />
          </div>

          {/* Mode Switch Tabs */}
          <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800 text-xs font-mono">
            <button
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`flex-1 py-1 rounded text-center transition ${
                mode === 'login' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`flex-1 py-1 rounded text-center transition ${
                mode === 'register' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400'
              }`}
            >
              New Enlistment
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-[11px] font-mono text-slate-400 mb-1">COMMANDER CALLSIGN</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. Maverick"
                required
                className="w-full bg-slate-950 px-3 py-2 rounded-lg border border-slate-800 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
              />
            </div>

            {mode === 'register' && (
              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">COMMUNICATION EMAIL</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="commander@frontline.mil"
                  className="w-full bg-slate-950 px-3 py-2 rounded-lg border border-slate-800 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
            )}

            <div>
              <label className="block text-[11px] font-mono text-slate-400 mb-1">SECURITY PASSCODE</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-slate-950 px-3 py-2 rounded-lg border border-slate-800 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-mono font-semibold text-xs transition flex items-center justify-center gap-2 border border-slate-700"
            >
              {mode === 'register' ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
              <span>{mode === 'register' ? 'Register & Establish Outpost' : 'Authorize & Enter Theater'}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
