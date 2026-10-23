import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Shield,
  Users,
  Activity,
  History,
  Coins,
  Map as MapIcon,
  Boxes,
  Megaphone,
  BarChart3,
  FileSearch,
  UserCheck,
  Settings,
  LogOut,
  ArrowLeft,
  RefreshCw,
  Search,
  AlertTriangle,
  Lock,
  CheckCircle2,
  XCircle,
  Play,
  RotateCcw,
  Ban,
  Clock,
  Sliders,
  Plus,
  Trash2,
  Eye,
  ChevronLeft,
  ChevronRight,
  Terminal,
  Server,
  Cpu,
  Database,
} from 'lucide-react';
import {
  AIDifficulty,
  AdminPermission,
  AdminRole,
  AdminSessionInfo,
  Announcement,
  AnnouncementPriority,
  AuditLogEntry,
  BuildingDefinition,
  BuildingType,
  ConfigVersionEntry,
  EconomyConfig,
  MapSectorConfig,
  MatchParticipantSummary,
  MatchRecord,
  PlayerProfile,
  PlayerType,
  PlayerTypeStatsSummary,
  ROLE_PERMISSIONS,
  SystemSettings,
  UnitDefinition,
  UnitType,
} from '../../types/game';
import { generateWorld } from '../../game/mapGenerator';

export const PlayerTypeBadge: React.FC<{
  playerType?: PlayerType | string;
  size?: 'xs' | 'sm';
}> = ({ playerType = 'unknown', size = 'xs' }) => {
  const normalized = String(playerType || 'unknown').toLowerCase() as PlayerType;
  const styles: Record<PlayerType, { label: string; classes: string; dot: string }> = {
    human: {
      label: 'HUMAN',
      classes: 'bg-blue-950/90 text-blue-300 border-blue-500/60',
      dot: 'bg-blue-400',
    },
    bot: {
      label: 'BOT',
      classes: 'bg-purple-950/90 text-purple-300 border-purple-500/60',
      dot: 'bg-purple-400',
    },
    system: {
      label: 'SYSTEM',
      classes: 'bg-slate-800/90 text-slate-300 border-slate-500/60',
      dot: 'bg-slate-400',
    },
    unknown: {
      label: 'UNKNOWN',
      classes: 'bg-amber-950/90 text-amber-300 border-amber-500/60',
      dot: 'bg-amber-400',
    },
  };
  const cfg = styles[normalized] || styles.unknown;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border font-mono font-bold tracking-wider uppercase whitespace-nowrap ${
        size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[10px]'
      } ${cfg.classes}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      <span>{cfg.label}</span>
    </span>
  );
};

const PlayerTypeSummaryStrip: React.FC<{
  stats?: PlayerTypeStatsSummary | null;
  onQuickFilter?: (type: string) => void;
}> = ({ stats, onQuickFilter }) => {
  if (!stats) return null;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div
          onClick={() => onQuickFilter?.('human')}
          className={`p-3 bg-slate-900 border border-blue-500/30 rounded ${
            onQuickFilter ? 'cursor-pointer hover:border-blue-400 transition' : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase text-slate-400">Total Human Players</span>
            <PlayerTypeBadge playerType="human" />
          </div>
          <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-blue-300">
            {stats.totalHumanPlayers}
          </div>
          <div className="mt-0.5 text-[10px] font-mono text-slate-400">
            Verified authenticated accounts
          </div>
        </div>

        <div
          onClick={() => onQuickFilter?.('human')}
          className={`p-3 bg-slate-900 border border-blue-500/30 rounded ${
            onQuickFilter ? 'cursor-pointer hover:border-blue-400 transition' : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase text-slate-400">Active Human Players</span>
            <span className="text-[10px] font-mono text-emerald-400 uppercase font-bold">LIVE</span>
          </div>
          <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-cyan-300">
            {stats.activeHumanPlayers}
          </div>
          <div className="mt-0.5 text-[10px] font-mono text-slate-400">
            {stats.offlineHumanPlayers} offline accounts
          </div>
        </div>

        <div
          onClick={() => onQuickFilter?.('bot')}
          className={`p-3 bg-slate-900 border border-purple-500/30 rounded ${
            onQuickFilter ? 'cursor-pointer hover:border-purple-400 transition' : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase text-slate-400">Total Bot Players</span>
            <PlayerTypeBadge playerType="bot" />
          </div>
          <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-purple-300">
            {stats.totalBotPlayers}
          </div>
          <div className="mt-0.5 text-[10px] font-mono text-slate-400">
            Server-registered AI agents
          </div>
        </div>

        <div
          onClick={() => onQuickFilter?.('bot')}
          className={`p-3 bg-slate-900 border border-purple-500/30 rounded ${
            onQuickFilter ? 'cursor-pointer hover:border-purple-400 transition' : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase text-slate-400">Active Bot Players</span>
            <span className="text-[10px] font-mono text-purple-400 uppercase font-bold">AI LOOP</span>
          </div>
          <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-purple-300">
            {stats.activeBotPlayers}
          </div>
          <div className="mt-0.5 text-[10px] font-mono text-slate-400">
            Autonomous simulation active
          </div>
        </div>

        <div
          onClick={() => onQuickFilter?.('system')}
          className={`p-3 bg-slate-900 border border-slate-700 rounded ${
            onQuickFilter ? 'cursor-pointer hover:border-slate-500 transition' : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase text-slate-400">System Entities</span>
            <PlayerTypeBadge playerType="system" />
          </div>
          <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-slate-200">
            {stats.totalSystemEntities}
          </div>
          <div className="mt-0.5 text-[10px] font-mono text-slate-400">
            World / neutral garrisons
          </div>
        </div>

        <div
          onClick={() => onQuickFilter?.('unknown')}
          className={`p-3 bg-slate-900 border border-amber-500/30 rounded ${
            onQuickFilter ? 'cursor-pointer hover:border-amber-400 transition' : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase text-slate-400">Unknown Players</span>
            <PlayerTypeBadge playerType="unknown" />
          </div>
          <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-amber-300">
            {stats.totalUnknownPlayers}
          </div>
          <div className="mt-0.5 text-[10px] font-mono text-slate-400">
            Unverified legacy records
          </div>
        </div>
      </div>

      {stats.activeBotPlayers === 0 && (
        <div className="px-3.5 py-2 bg-purple-950/30 border border-purple-700/50 rounded flex items-center justify-between text-xs font-mono text-purple-200">
          <span>
            AI Bot Status: 0 bot agents are currently active in the simulation loop (AI Aggression may be paused or all AI installations were neutralized).
          </span>
          <span className="text-[10px] uppercase text-purple-400">No Fake Bots Fabricated</span>
        </div>
      )}
    </div>
  );
};

type AdminSection =
  | 'overview'
  | 'players'
  | 'live_matches'
  | 'match_history'
  | 'economy'
  | 'maps'
  | 'catalog'
  | 'announcements'
  | 'analytics'
  | 'audit_logs'
  | 'administrators'
  | 'settings';

interface AdminPanelProps {
  onReturnToGame: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onReturnToGame }) => {
  // Authentication & Session State
  const [adminToken, setAdminToken] = useState<string | null>(() =>
    localStorage.getItem('frontline_admin_token') || localStorage.getItem('frontline_token')
  );
  const [adminProfile, setAdminProfile] = useState<PlayerProfile | null>(null);
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);
  const [permissions, setPermissions] = useState<AdminPermission[]>([]);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Login Form State
  const [loginUsername, setLoginUsername] = useState('Commander');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginSubmitting, setLoginSubmitting] = useState(false);

  // Navigation & Global UI State
  const [activeSection, setActiveSection] = useState<AdminSection>('overview');
  const [statusBanner, setStatusBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Data States
  const [overviewData, setOverviewData] = useState<any>(null);
  const [playersData, setPlayersData] = useState<{
    items: any[];
    stats?: PlayerTypeStatsSummary;
    pagination: any;
  }>({
    items: [],
    pagination: { page: 1, pageSize: 15, total: 0, totalPages: 1 },
  });
  const [playerSearch, setPlayerSearch] = useState('');
  const [playerTypeFilter, setPlayerTypeFilter] = useState('all');
  const [playerConnectionFilter, setPlayerConnectionFilter] = useState('all');
  const [playerMatchFilter, setPlayerMatchFilter] = useState('all');
  const [playerStatusFilter, setPlayerStatusFilter] = useState('all');
  const [playerRoleFilter, setPlayerRoleFilter] = useState('all');
  const [playerSortBy, setPlayerSortBy] = useState('score');
  const [playerPage, setPlayerPage] = useState(1);
  const [selectedPlayerDetail, setSelectedPlayerDetail] = useState<any | null>(null);
  const [verifyTypeTarget, setVerifyTypeTarget] = useState<PlayerType>('bot');
  const [verifyTypeReason, setVerifyTypeReason] = useState('');

  // Moderation Modal State
  const [modModal, setModModal] = useState<{
    player: any;
    action: 'suspend' | 'unsuspend' | 'ban' | 'unban' | 'reset_progress' | 'rename' | 'delete_account';
  } | null>(null);
  const [modReason, setModReason] = useState('');
  const [modDurationMins, setModDurationMins] = useState(60);
  const [modNewUsername, setModNewUsername] = useState('');
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [deleteAllReason, setDeleteAllReason] = useState('Administrative purge of all player accounts');

  // Matches State
  const [matchesData, setMatchesData] = useState<{
    liveSector: any;
    matches: Array<
      MatchRecord & {
        participants?: MatchParticipantSummary[];
        participantTypeCounts?: Record<PlayerType, number>;
      }
    >;
  } | null>(null);
  const [matchActionReason, setMatchActionReason] = useState('Scheduled sector tactical reset');
  const [sandboxUnitType, setSandboxUnitType] = useState<UnitType>('titan_mbt');
  const [sandboxIsHostile, setSandboxIsHostile] = useState(false);

  // Economy State
  const [economyDraft, setEconomyDraft] = useState<EconomyConfig | null>(null);
  const [economyOriginal, setEconomyOriginal] = useState<EconomyConfig | null>(null);
  const [economyHistory, setEconomyHistory] = useState<ConfigVersionEntry[]>([]);
  const [economyReason, setEconomyReason] = useState('');
  const [applyCapToExisting, setApplyCapToExisting] = useState(true);

  // Maps State
  const [mapsList, setMapsList] = useState<MapSectorConfig[]>([]);
  const [selectedMap, setSelectedMap] = useState<MapSectorConfig | null>(null);
  const [newMapForm, setNewMapForm] = useState({
    name: '',
    description: '',
    seed: 551920,
    width: 100,
    height: 75,
    maxPlayers: 8,
    atmospherePreset: 'daylight',
    objectiveTitle: 'OPERATION NORTHERN SPEAR',
    objectiveDescription: 'Capture strategic rail intersections and hold river crossings.',
  });
  const mapPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Catalog State
  const [catalogTab, setCatalogTab] = useState<'units' | 'buildings'>('units');
  const [catalogData, setCatalogData] = useState<{
    units: Record<string, UnitDefinition>;
    buildings: Record<string, BuildingDefinition>;
    version: number;
  } | null>(null);
  const [catalogHistory, setCatalogHistory] = useState<ConfigVersionEntry[]>([]);
  const [editingUnit, setEditingUnit] = useState<UnitDefinition | null>(null);
  const [editingBuilding, setEditingBuilding] = useState<BuildingDefinition | null>(null);
  const [catalogReason, setCatalogReason] = useState('');

  // Announcements State
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [annTitle, setAnnTitle] = useState('');
  const [annMessage, setAnnMessage] = useState('');
  const [annPriority, setAnnPriority] = useState<AnnouncementPriority>('info');

  // Audit Logs State
  const [auditLogsData, setAuditLogsData] = useState<{ items: AuditLogEntry[]; pagination: any }>({
    items: [],
    pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 },
  });
  const [auditSearch, setAuditSearch] = useState('');
  const [auditTargetFilter, setAuditTargetFilter] = useState('all');
  const [auditStatusFilter, setAuditStatusFilter] = useState('all');
  const [auditPage, setAuditPage] = useState(1);

  // Administrators State
  const [adminsData, setAdminsData] = useState<{
    administrators: PlayerProfile[];
    activeSessions: AdminSessionInfo[];
  } | null>(null);
  const [roleTargetUserId, setRoleTargetUserId] = useState('');
  const [roleTargetNewRole, setRoleTargetNewRole] = useState<AdminRole | 'none'>('moderator');
  const [roleChangeReason, setRoleChangeReason] = useState('');

  // Settings State
  const [settingsDraft, setSettingsDraft] = useState<SystemSettings | null>(null);
  const [settingsReason, setSettingsReason] = useState('');

  const showToast = useCallback((type: 'success' | 'error', text: string) => {
    setStatusBanner({ type, text });
    setTimeout(() => setStatusBanner(null), 5000);
  }, []);

  const hasPerm = useCallback(
    (perm: AdminPermission) => {
      return permissions.includes(perm);
    },
    [permissions]
  );

  const apiFetch = useCallback(
    async (endpoint: string, options: RequestInit = {}) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
      };
      if (adminToken) {
        headers['Authorization'] = `Bearer ${adminToken}`;
      }
      const res = await fetch(`/api/admin${endpoint}`, {
        ...options,
        headers,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Request failed with status ${res.status}`);
      }
      return data;
    },
    [adminToken]
  );

  // Verify Admin Session on Mount / Token Change
  useEffect(() => {
    if (!adminToken) {
      setAuthLoading(false);
      return;
    }
    setAuthLoading(true);
    apiFetch('/auth/me')
      .then((res) => {
        setAdminProfile(res.profile);
        setAdminRole(res.role);
        setPermissions(res.permissions || ROLE_PERMISSIONS[res.role as AdminRole] || []);
        setAuthError(null);
      })
      .catch(() => {
        setAdminProfile(null);
        setAdminRole(null);
        setPermissions([]);
      })
      .finally(() => setAuthLoading(false));
  }, [adminToken, apiFetch]);

  // Fetch Section Data
  const refreshCurrentSection = useCallback(async () => {
    if (!adminProfile) return;
    setIsRefreshing(true);
    try {
      if (activeSection === 'overview' || activeSection === 'analytics') {
        const data = await apiFetch('/overview');
        setOverviewData(data);
      }
      if (activeSection === 'players' && hasPerm('players.view')) {
        const q = new URLSearchParams({
          search: playerSearch,
          playerType: playerTypeFilter,
          connectionStatus: playerConnectionFilter,
          matchId: playerMatchFilter,
          status: playerStatusFilter,
          role: playerRoleFilter,
          sortBy: playerSortBy,
          page: String(playerPage),
          pageSize: '15',
        });
        const data = await apiFetch(`/players?${q.toString()}`);
        setPlayersData(data);
      }
      if ((activeSection === 'live_matches' || activeSection === 'match_history') && hasPerm('matches.view')) {
        const data = await apiFetch('/matches');
        setMatchesData(data);
      }
      if (activeSection === 'economy' && hasPerm('economy.view')) {
        const data = await apiFetch('/economy');
        setEconomyOriginal(data.economyConfig);
        setEconomyDraft(JSON.parse(JSON.stringify(data.economyConfig)));
        setEconomyHistory(data.history || []);
      }
      if (activeSection === 'maps' && hasPerm('maps.view')) {
        const data = await apiFetch('/maps');
        setMapsList(data.maps || []);
        if (!selectedMap && data.maps?.length > 0) {
          setSelectedMap(data.maps[0]);
        }
      }
      if (activeSection === 'catalog' && hasPerm('maps.view')) {
        const data = await apiFetch('/catalog');
        setCatalogData(data.catalog);
        setCatalogHistory(data.history || []);
      }
      if (activeSection === 'announcements') {
        const data = await apiFetch('/announcements');
        setAnnouncements(data.announcements || []);
      }
      if (activeSection === 'audit_logs' && hasPerm('audit.view')) {
        const q = new URLSearchParams({
          search: auditSearch,
          targetType: auditTargetFilter,
          status: auditStatusFilter,
          page: String(auditPage),
          pageSize: '25',
        });
        const data = await apiFetch(`/audit-logs?${q.toString()}`);
        setAuditLogsData(data);
      }
      if (activeSection === 'administrators' && hasPerm('admins.manage')) {
        const data = await apiFetch('/administrators');
        setAdminsData(data);
        const pData = await apiFetch('/players?pageSize=100');
        setPlayersData(pData);
      }
      if (activeSection === 'settings') {
        const data = await apiFetch('/settings');
        setSettingsDraft(data.settings);
      }
    } catch (err: any) {
      showToast('error', err.message || 'Failed to load section data');
    } finally {
      setIsRefreshing(false);
    }
  }, [
    adminProfile,
    activeSection,
    apiFetch,
    hasPerm,
    playerSearch,
    playerTypeFilter,
    playerConnectionFilter,
    playerMatchFilter,
    playerStatusFilter,
    playerRoleFilter,
    playerSortBy,
    playerPage,
    selectedMap,
    auditSearch,
    auditTargetFilter,
    auditStatusFilter,
    auditPage,
    showToast,
  ]);

  useEffect(() => {
    refreshCurrentSection();
  }, [refreshCurrentSection]);

  // Render 2D Topographic Map Preview when selectedMap changes in Maps tab
  useEffect(() => {
    if (activeSection !== 'maps' || !selectedMap || !mapPreviewCanvasRef.current) return;
    const canvas = mapPreviewCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const generated = generateWorld({
      width: selectedMap.width,
      height: selectedMap.height,
      tileSize: 40,
      seed: selectedMap.seed,
    });

    const w = canvas.width;
    const h = canvas.height;
    const cellW = w / selectedMap.width;
    const cellH = h / selectedMap.height;

    ctx.clearRect(0, 0, w, h);

    const colorMap: Record<string, string> = {
      deep_water: '#0c2d48',
      water: '#145374',
      sand: '#a89f78',
      plains: '#3a5a40',
      grass: '#344e41',
      light_grass: '#45694e',
      forest: '#1b4332',
      pine_forest: '#143628',
      hills: '#525e54',
      mountain: '#495057',
      rock: '#6c757d',
      snow: '#dee2e6',
      highway: '#64748b',
      road: '#78716c',
      railway: '#475569',
      bridge_road: '#94a3b8',
      bridge_rail: '#cbd5e1',
    };

    for (let y = 0; y < selectedMap.height; y++) {
      for (let x = 0; x < selectedMap.width; x++) {
        const t = generated.terrain[y]?.[x] || 'plains';
        ctx.fillStyle = colorMap[t] || '#3a5a40';
        ctx.fillRect(x * cellW, y * cellH, Math.ceil(cellW), Math.ceil(cellH));
      }
    }

    // Draw Base Markers
    generated.bases.forEach((b, idx) => {
      const bx = b.x * cellW;
      const by = b.y * cellH;
      ctx.beginPath();
      ctx.arc(bx, by, 6, 0, Math.PI * 2);
      ctx.fillStyle = idx === 0 ? '#3b82f6' : idx === 1 ? '#ef4444' : '#f59e0b';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#0f172a';
      ctx.stroke();
    });
  }, [activeSection, selectedMap]);

  // Handlers
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginSubmitting(true);
    setAuthError(null);
    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }
      localStorage.setItem('frontline_admin_token', data.token);
      localStorage.setItem('frontline_token', data.token);
      setAdminToken(data.token);
      setAdminProfile(data.profile);
      setAdminRole(data.role);
      setPermissions(data.permissions || []);
      setLoginPassword('');
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setLoginSubmitting(false);
    }
  };

  const handleAdminLogout = async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    localStorage.removeItem('frontline_admin_token');
    setAdminToken(null);
    setAdminProfile(null);
    setAdminRole(null);
    setPermissions([]);
  };

  const handleInspectPlayer = async (playerId: string) => {
    try {
      const detail = await apiFetch(`/players/${playerId}`);
      setSelectedPlayerDetail(detail);
      setVerifyTypeReason('');
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  const handleVerifyUnknownPlayerType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlayerDetail?.profile?.id) return;
    try {
      const res = await apiFetch(`/players/${selectedPlayerDetail.profile.id}/verify-type`, {
        method: 'POST',
        body: JSON.stringify({
          playerType: verifyTypeTarget,
          reason: verifyTypeReason,
        }),
      });
      showToast('success', res.message || 'Player classification verified.');
      setVerifyTypeReason('');
      await handleInspectPlayer(selectedPlayerDetail.profile.id);
      refreshCurrentSection();
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  const handleAdminHomeBaseAction = async (
    action: 'recover' | 'relocate' | 'repair' | 'reset_cooldowns',
    targetMapId?: string
  ) => {
    if (!selectedPlayerDetail?.profile?.id) return;
    try {
      const res = await apiFetch(`/players/${selectedPlayerDetail.profile.id}/home-base/action`, {
        method: 'POST',
        body: JSON.stringify({
          action,
          targetMapId,
          reason: `Administrative Home Base ${action} operation`,
        }),
      });
      showToast('success', res.message || `Home Base '${action}' executed.`);
      await handleInspectPlayer(selectedPlayerDetail.profile.id);
      refreshCurrentSection();
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  const handleExecuteModeration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modModal) return;
    try {
      const targetId = modModal.player.id;
      const action = modModal.action;
      await apiFetch(`/players/${targetId}/moderate`, {
        method: 'POST',
        body: JSON.stringify({
          action,
          reason: modReason,
          durationMinutes: modDurationMins,
          newUsername: modNewUsername,
        }),
      });
      showToast(
        'success',
        action === 'delete_account'
          ? `Account '${modModal.player.username}' permanently deleted.`
          : `Moderation action '${action}' executed on ${modModal.player.username}.`
      );
      setModModal(null);
      setModReason('');
      if (action === 'delete_account' && selectedPlayerDetail?.profile?.id === targetId) {
        setSelectedPlayerDetail(null);
      } else if (selectedPlayerDetail?.profile?.id === targetId) {
        handleInspectPlayer(targetId);
      }
      refreshCurrentSection();
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  const handleDeleteAllAccounts = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/players/delete-all', {
        method: 'POST',
        body: JSON.stringify({ reason: deleteAllReason || 'Administrative purge of all player accounts' }),
      });
      showToast('success', res.message || 'All player accounts deleted.');
      setShowDeleteAllModal(false);
      setSelectedPlayerDetail(null);
      refreshCurrentSection();
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  const handleMatchAction = async (action: string, extra: Record<string, any> = {}) => {
    try {
      await apiFetch('/matches/action', {
        method: 'POST',
        body: JSON.stringify({ action, reason: matchActionReason, ...extra }),
      });
      showToast('success', `Match operational command '${action}' completed.`);
      refreshCurrentSection();
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  const handleSaveEconomy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!economyDraft) return;
    try {
      const res = await apiFetch('/economy', {
        method: 'PUT',
        body: JSON.stringify({
          ...economyDraft,
          reason: economyReason,
          applyStorageCapToExistingBases: applyCapToExisting,
        }),
      });
      setEconomyOriginal(res.economyConfig);
      setEconomyDraft(JSON.parse(JSON.stringify(res.economyConfig)));
      setEconomyReason('');
      showToast('success', `Economy configuration v${res.economyConfig.version} published to live simulation.`);
      refreshCurrentSection();
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  const handleRollbackEconomy = async (version: number) => {
    try {
      await apiFetch('/economy/rollback', {
        method: 'POST',
        body: JSON.stringify({
          version,
          reason: `Administrative rollback to verified v${version} parameters`,
        }),
      });
      showToast('success', `Rolled back economy configuration to v${version}.`);
      refreshCurrentSection();
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  const handleSaveUnitOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUnit) return;
    try {
      await apiFetch(`/catalog/unit/${editingUnit.type}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...editingUnit,
          reason: catalogReason || `Adjusted ${editingUnit.name} combat balance`,
        }),
      });
      showToast('success', `Published live unit balance for ${editingUnit.name}.`);
      setEditingUnit(null);
      setCatalogReason('');
      refreshCurrentSection();
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  const handleSaveBuildingOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBuilding) return;
    try {
      await apiFetch(`/catalog/building/${editingBuilding.type}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...editingBuilding,
          defenseDamage: editingBuilding.defenseStats?.damage,
          defenseRange: editingBuilding.defenseStats?.range,
          reason: catalogReason || `Adjusted ${editingBuilding.name} facility specs`,
        }),
      });
      showToast('success', `Published live building parameters for ${editingBuilding.name}.`);
      setEditingBuilding(null);
      setCatalogReason('');
      refreshCurrentSection();
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  const handleSaveMap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMap) return;
    try {
      await apiFetch(`/maps/${selectedMap.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...selectedMap,
          reason: `Updated map configuration for ${selectedMap.name}`,
        }),
      });
      showToast('success', `Saved sector configuration for ${selectedMap.name}.`);
      refreshCurrentSection();
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  const handleActivateMap = async (mapId: string) => {
    try {
      await apiFetch(`/maps/${mapId}/activate`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Switched active theater map from Admin Console' }),
      });
      showToast('success', 'Activated map on live battlefield server.');
      refreshCurrentSection();
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  const handleImportMap = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/maps/import', {
        method: 'POST',
        body: JSON.stringify(newMapForm),
      });
      showToast('success', `Validated and imported map '${res.map.name}' (${res.basesCount} strategic bases).`);
      setNewMapForm({ ...newMapForm, name: '', description: '' });
      refreshCurrentSection();
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/announcements', {
        method: 'POST',
        body: JSON.stringify({
          title: annTitle,
          message: annMessage,
          priority: annPriority,
          published: true,
        }),
      });
      setAnnTitle('');
      setAnnMessage('');
      showToast('success', 'Announcement published and broadcast to all online commanders.');
      refreshCurrentSection();
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  const handleToggleAnnouncement = async (ann: Announcement) => {
    try {
      await apiFetch(`/announcements/${ann.id}`, {
        method: 'PUT',
        body: JSON.stringify({ published: !ann.published }),
      });
      refreshCurrentSection();
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    try {
      await apiFetch(`/announcements/${id}`, { method: 'DELETE' });
      showToast('success', 'Announcement deleted.');
      refreshCurrentSection();
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  const handleUpdateAdminRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleTargetUserId) return;
    try {
      await apiFetch('/administrators/role', {
        method: 'POST',
        body: JSON.stringify({
          userId: roleTargetUserId,
          role: roleTargetNewRole === 'none' ? null : roleTargetNewRole,
          reason: roleChangeReason,
        }),
      });
      setRoleChangeReason('');
      showToast('success', 'Administrator role assignment updated.');
      refreshCurrentSection();
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingsDraft) return;
    try {
      await apiFetch('/settings', {
        method: 'PUT',
        body: JSON.stringify({
          ...settingsDraft,
          reason: settingsReason || 'Updated global server operational flags',
        }),
      });
      setSettingsReason('');
      showToast('success', 'System operational settings saved.');
      refreshCurrentSection();
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  // Economy Diff Helper
  const economyDiffs = useMemo(() => {
    if (!economyOriginal || !economyDraft) return [];
    const diffs: Array<{ field: string; before: string | number; after: string | number }> = [];
    const compareKeys: Array<keyof EconomyConfig> = [
      'resourceGenerationMultiplier',
      'unitCostMultiplier',
      'buildingCostMultiplier',
      'unitProductionSpeedMultiplier',
      'buildingBuildSpeedMultiplier',
      'populationCapPerBase',
      'maxGlobalUnits',
      'captureSpeedPerTick',
    ];
    for (const k of compareKeys) {
      if (economyOriginal[k] !== economyDraft[k]) {
        diffs.push({
          field: k,
          before: Number(economyOriginal[k]),
          after: Number(economyDraft[k]),
        });
      }
    }
    return diffs;
  }, [economyOriginal, economyDraft]);

  // --------------------------------------------------------------------------
  // RENDER LOGIN VIEW IF NOT AUTHENTICATED AS ADMIN
  // --------------------------------------------------------------------------
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0F172A] text-slate-100 flex items-center justify-center font-sans">
        <div className="p-6 border border-slate-800 bg-slate-900/90 rounded flex items-center gap-3 text-sm font-mono">
          <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
          <span>VERIFYING ADMIN CREDENTIALS & RBAC CLEARANCE...</span>
        </div>
      </div>
    );
  }

  if (!adminProfile || !adminRole) {
    return (
      <div className="min-h-screen bg-[#0F172A] text-slate-100 flex flex-col justify-center items-center p-4 font-sans">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded p-6 shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-5">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded bg-blue-600/20 border border-blue-500/40 flex items-center justify-center">
                <Shield className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h1 className="text-base font-bold tracking-tight text-white">FRONTLINE DOMINION</h1>
                <p className="text-xs font-mono text-slate-400">HIGH COMMAND ADMIN CONSOLE (/admin)</p>
              </div>
            </div>
            <button
              onClick={onReturnToGame}
              className="px-2.5 py-1 text-xs font-mono rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Battlefield</span>
            </button>
          </div>

          {authError && (
            <div className="mb-4 p-3 rounded bg-red-950/60 border border-red-800 text-xs text-red-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Administrator Callsign</label>
              <input
                type="text"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                placeholder="Commander"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Security Passkey</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                placeholder="Enter admin password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loginSubmitting}
              className="w-full py-2.5 px-4 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs font-mono uppercase tracking-wider transition"
            >
              {loginSubmitting ? 'Authenticating...' : 'Authenticate & Enter Console'}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-slate-800/80 text-[11px] text-slate-400 space-y-1 font-mono">
            <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
              <Lock className="w-3.5 h-3.5 text-blue-400" />
              <span>RBAC Protected Console</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              Access restricted to authorized staff accounts (<span className="text-slate-200">super_admin</span>,{' '}
              <span className="text-slate-200">game_admin</span>, <span className="text-slate-200">moderator</span>,{' '}
              <span className="text-slate-200">analyst</span>). All login attempts and actions are recorded in the
              immutable audit log.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Navigation items filtered or badged by permission
  const navItems: Array<{
    id: AdminSection;
    label: string;
    icon: React.FC<{ className?: string }>;
    perm: AdminPermission;
  }> = [
    { id: 'overview', label: 'Overview', icon: Activity, perm: 'dashboard.view' },
    { id: 'players', label: 'Players', icon: Users, perm: 'players.view' },
    { id: 'live_matches', label: 'Live Matches', icon: Play, perm: 'matches.view' },
    { id: 'match_history', label: 'Match History', icon: History, perm: 'matches.view' },
    { id: 'economy', label: 'Economy', icon: Coins, perm: 'economy.view' },
    { id: 'maps', label: 'Maps', icon: MapIcon, perm: 'maps.view' },
    { id: 'catalog', label: 'Units & Buildings', icon: Boxes, perm: 'maps.view' },
    { id: 'announcements', label: 'Announcements', icon: Megaphone, perm: 'dashboard.view' },
    { id: 'analytics', label: 'Analytics', icon: BarChart3, perm: 'dashboard.view' },
    { id: 'audit_logs', label: 'Audit Logs', icon: FileSearch, perm: 'audit.view' },
    { id: 'administrators', label: 'Administrators', icon: UserCheck, perm: 'admins.manage' },
    { id: 'settings', label: 'Settings', icon: Settings, perm: 'dashboard.view' },
  ];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0F172A] text-slate-100 font-sans select-text">
      {/* 1. LEFT SIDEBAR NAVIGATION (256px) */}
      <aside className="w-64 shrink-0 bg-slate-950 border-r border-slate-800 flex flex-col justify-between">
        <div>
          {/* Brand Header */}
          <div className="px-4 py-3.5 border-b border-slate-800 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-blue-600 flex items-center justify-center text-white font-bold text-xs">
              FD
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold tracking-wider uppercase text-white truncate">
                Frontline Dominion
              </div>
              <div className="text-[11px] font-mono text-slate-400 truncate">ADMINISTRATION CONSOLE</div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-2 space-y-0.5 overflow-y-auto max-h-[calc(100vh-170px)]">
            {navItems.map((item) => {
              const allowed = hasPerm(item.perm);
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => allowed && setActiveSection(item.id)}
                  disabled={!allowed}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded text-xs font-medium transition ${
                    isActive
                      ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40'
                      : allowed
                      ? 'text-slate-300 hover:bg-slate-900 hover:text-white border border-transparent'
                      : 'text-slate-600 cursor-not-allowed opacity-50 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </div>
                  {!allowed && <Lock className="w-3 h-3 text-slate-600" />}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Operator Card */}
        <div className="p-3 border-t border-slate-800 bg-slate-900/50 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono font-semibold text-slate-200 truncate">{adminProfile.username}</span>
            <span className="font-mono text-[10px] uppercase text-cyan-400">{adminRole}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onReturnToGame}
              className="flex-1 py-1.5 px-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono flex items-center justify-center gap-1 border border-slate-700 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>3D Game</span>
            </button>
            <button
              onClick={handleAdminLogout}
              className="py-1.5 px-2.5 rounded bg-red-950/60 hover:bg-red-900/70 text-red-300 text-xs font-mono flex items-center justify-center gap-1 border border-red-800/60 transition"
              title="Revoke Admin Session & Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* 2. MAIN WORKSPACE VIEWPORT */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header Bar */}
        <header className="h-13 shrink-0 bg-slate-950 border-b border-slate-800 px-6 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <span>Admin Console</span>
            <span>/</span>
            <span className="text-slate-100 font-semibold uppercase">{activeSection.replace('_', ' ')}</span>
          </div>

          <div className="flex items-center gap-3">
            {statusBanner && (
              <div
                className={`px-3 py-1 rounded text-xs font-mono flex items-center gap-1.5 border ${
                  statusBanner.type === 'success'
                    ? 'bg-emerald-950/80 border-emerald-700 text-emerald-200'
                    : 'bg-red-950/80 border-red-700 text-red-200'
                }`}
              >
                {statusBanner.type === 'success' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-red-400" />
                )}
                <span>{statusBanner.text}</span>
              </div>
            )}

            <button
              onClick={refreshCurrentSection}
              className="px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-mono text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-cyan-400' : 'text-slate-400'}`} />
              <span>Sync Data</span>
            </button>
          </div>
        </header>

        {/* Scrollable Content Viewport */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* ================================================================
              SECTION 1: OVERVIEW
             ================================================================ */}
          {activeSection === 'overview' && overviewData && (
            <div className="space-y-6">
              {/* Authoritative Player Type Breakdown Strip */}
              <PlayerTypeSummaryStrip
                stats={overviewData.playerTypeStats}
                onQuickFilter={(type) => {
                  if (hasPerm('players.view')) {
                    setPlayerTypeFilter(type);
                    setPlayerPage(1);
                    setActiveSection('players');
                  }
                }}
              />

              {/* Top Metric Strip */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                <div className="p-3.5 bg-slate-900 border border-slate-800 rounded">
                  <div className="text-[11px] font-mono uppercase text-slate-400">Registered Players</div>
                  <div className="mt-1 text-xl font-bold font-mono tabular-nums text-white">
                    {overviewData.kpis.totalPlayers}
                  </div>
                  <div className="mt-0.5 text-[11px] font-mono tabular-nums text-emerald-400">
                    {overviewData.kpis.activePlayers24h} active (24h)
                  </div>
                </div>

                <div className="p-3.5 bg-slate-900 border border-slate-800 rounded">
                  <div className="text-[11px] font-mono uppercase text-slate-400">Online Sessions</div>
                  <div className="mt-1 text-xl font-bold font-mono tabular-nums text-cyan-400">
                    {overviewData.kpis.onlineSessionsCount}
                  </div>
                  <div className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-400">
                    {overviewData.kpis.uniqueOnlinePlayers} unique commanders
                  </div>
                </div>

                <div className="p-3.5 bg-slate-900 border border-slate-800 rounded">
                  <div className="text-[11px] font-mono uppercase text-slate-400">Active Combat Units</div>
                  <div className="mt-1 text-xl font-bold font-mono tabular-nums text-white">
                    {overviewData.kpis.totalUnitsActive}
                  </div>
                  <div className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-400">
                    {overviewData.kpis.playerUnitsCount} Allied · {overviewData.kpis.aiUnitsCount} AI
                  </div>
                </div>

                <div className="p-3.5 bg-slate-900 border border-slate-800 rounded">
                  <div className="text-[11px] font-mono uppercase text-slate-400">Sector Bases</div>
                  <div className="mt-1 text-xl font-bold font-mono tabular-nums text-white">
                    {overviewData.kpis.totalBases}
                  </div>
                  <div className="mt-0.5 text-[11px] font-mono tabular-nums text-amber-400">
                    {overviewData.kpis.playerControlledBases} Player · {overviewData.kpis.aiControlledBases} Kodiak
                  </div>
                </div>

                <div className="p-3.5 bg-slate-900 border border-slate-800 rounded">
                  <div className="text-[11px] font-mono uppercase text-slate-400">Moderation Holds</div>
                  <div className="mt-1 text-xl font-bold font-mono tabular-nums text-amber-400">
                    {overviewData.kpis.suspendedCount + overviewData.kpis.bannedCount}
                  </div>
                  <div className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-400">
                    {overviewData.kpis.suspendedCount} susp · {overviewData.kpis.bannedCount} banned
                  </div>
                </div>

                <div className="p-3.5 bg-slate-900 border border-slate-800 rounded">
                  <div className="text-[11px] font-mono uppercase text-slate-400">10Hz Engine Tick</div>
                  <div className="mt-1 text-xl font-bold font-mono tabular-nums text-emerald-400">
                    {overviewData.serverHealth.lastTickDurationMs} ms
                  </div>
                  <div className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-400">
                    {overviewData.serverHealth.memoryRssMb} MB RSS
                  </div>
                </div>
              </div>

              {/* Server & Simulation Diagnostics Strip */}
              <div className="p-4 bg-slate-900 border border-slate-800 rounded flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-emerald-400" />
                  <span className="text-slate-400">STATUS:</span>
                  <span className="text-emerald-400 font-bold uppercase">{overviewData.serverHealth.status}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-cyan-400" />
                  <span className="text-slate-400">VERSION:</span>
                  <span className="text-slate-200 tabular-nums">{overviewData.serverHealth.gameVersion}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-400" />
                  <span className="text-slate-400">UPTIME:</span>
                  <span className="text-slate-200 tabular-nums">
                    {Math.floor(overviewData.serverHealth.uptimeMs / 60000)}m{' '}
                    {Math.floor((overviewData.serverHealth.uptimeMs % 60000) / 1000)}s
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-amber-400" />
                  <span className="text-slate-400">STATE STORE:</span>
                  <span className="text-slate-200 tabular-nums">{overviewData.serverHealth.databaseSizeKb} KB</span>
                </div>
                <div className="flex items-center gap-2">
                  <Coins className="w-4 h-4 text-emerald-400" />
                  <span className="text-slate-400">ECONOMY MULT:</span>
                  <span className="text-slate-200 tabular-nums">
                    {overviewData.economySummary.resourceGenerationMultiplier}x (v
                    {overviewData.economySummary.configVersion})
                  </span>
                </div>
              </div>

              {/* Two-column Tables: Recent Admin Audit Actions & Live Combat Telemetry */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-slate-900 border border-slate-800 rounded overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                    <h2 className="text-xs font-mono uppercase font-bold text-slate-200">
                      Recent Administrative & Security Events
                    </h2>
                    <button
                      onClick={() => setActiveSection('audit_logs')}
                      className="text-[11px] font-mono text-cyan-400 hover:underline"
                    >
                      View Full Log
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-[11px] font-mono text-slate-400 bg-slate-950/50">
                          <th className="py-2 px-3">Time</th>
                          <th className="py-2 px-3">Admin</th>
                          <th className="py-2 px-3">Action</th>
                          <th className="py-2 px-3">Target</th>
                          <th className="py-2 px-3 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono">
                        {overviewData.recentAuditLogs.map((log: AuditLogEntry) => (
                          <tr key={log.id} className="hover:bg-slate-800/40">
                            <td className="py-2 px-3 tabular-nums text-slate-400">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </td>
                            <td className="py-2 px-3 text-slate-200">{log.adminUsername}</td>
                            <td className="py-2 px-3 text-cyan-300">{log.action}</td>
                            <td className="py-2 px-3 text-slate-400 truncate max-w-[120px]">{log.targetId}</td>
                            <td className="py-2 px-3 text-right">
                              <span
                                className={
                                  log.status === 'success'
                                    ? 'text-emerald-400'
                                    : log.status === 'denied'
                                    ? 'text-amber-400'
                                    : 'text-red-400'
                                }
                              >
                                {log.status.toUpperCase()}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Live Battlefield Combat Stream */}
                <div className="bg-slate-900 border border-slate-800 rounded overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                    <h2 className="text-xs font-mono uppercase font-bold text-slate-200">
                      Recent Battlefield Engagement Telemetry
                    </h2>
                    <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                      {overviewData.recentCombatEvents.length} events recorded
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-[11px] font-mono text-slate-400 bg-slate-950/50">
                          <th className="py-2 px-3">Time</th>
                          <th className="py-2 px-3">Attacker</th>
                          <th className="py-2 px-3">Target</th>
                          <th className="py-2 px-3 text-right">Damage</th>
                          <th className="py-2 px-3 text-right">Coords</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono">
                        {overviewData.recentCombatEvents.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-slate-500">
                              No combat engagements recorded in current tick window.
                            </td>
                          </tr>
                        ) : (
                          overviewData.recentCombatEvents.map((evt: any) => (
                            <tr key={evt.id} className="hover:bg-slate-800/40">
                              <td className="py-2 px-3 tabular-nums text-slate-400">
                                {new Date(evt.timestamp).toLocaleTimeString()}
                              </td>
                              <td className="py-2 px-3 text-slate-200">{evt.attackerType}</td>
                              <td className="py-2 px-3 text-amber-300">
                                {evt.targetType} {evt.isFatal ? '(KIA)' : ''}
                              </td>
                              <td className="py-2 px-3 text-right tabular-nums text-red-400">-{evt.damage} HP</td>
                              <td className="py-2 px-3 text-right tabular-nums text-slate-400">
                                {Math.round(evt.x)}, {Math.round(evt.y)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              SECTION 2: PLAYERS MANAGEMENT & MODERATION
             ================================================================ */}
          {activeSection === 'players' && (
            <div className="space-y-5">
              {/* Player Type Statistics Summary */}
              <PlayerTypeSummaryStrip
                stats={playersData.stats}
                onQuickFilter={(type) => {
                  setPlayerTypeFilter((prev) => (prev === type ? 'all' : type));
                  setPlayerPage(1);
                }}
              />

              {/* Filter & Search Bar */}
              <div className="p-4 bg-slate-900 border border-slate-800 rounded space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                    <Search className="w-4 h-4 text-slate-400 shrink-0" />
                    <input
                      type="text"
                      value={playerSearch}
                      onChange={(e) => {
                        setPlayerSearch(e.target.value);
                        setPlayerPage(1);
                      }}
                      placeholder="Search by player name, player ID, email, faction, or botAgentId..."
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* Quick Player Type Filter Buttons */}
                  <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
                    {[
                      { id: 'all', label: 'All Types' },
                      { id: 'human', label: 'Human Only' },
                      { id: 'bot', label: 'Bot Only' },
                      { id: 'system', label: 'System Only' },
                      { id: 'unknown', label: 'Unknown' },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => {
                          setPlayerTypeFilter(tab.id);
                          setPlayerPage(1);
                        }}
                        className={`px-2.5 py-1 rounded border transition ${
                          playerTypeFilter === tab.id
                            ? 'bg-blue-600/25 border-blue-500 text-white font-bold'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                    {hasPerm('players.ban') && (
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteAllReason('Administrative purge of all player accounts');
                          setShowDeleteAllModal(true);
                        }}
                        className="px-2.5 py-1 rounded border border-red-700/80 bg-red-950/70 hover:bg-red-900/80 text-red-200 font-bold flex items-center gap-1.5 transition"
                        title="Permanently delete all registered player accounts, sessions, alliances, and player bases/units"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        <span>Delete All Accounts</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs font-mono pt-1 border-t border-slate-800/70">
                  <select
                    value={playerTypeFilter}
                    onChange={(e) => {
                      setPlayerTypeFilter(e.target.value);
                      setPlayerPage(1);
                    }}
                    className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200"
                    aria-label="Filter by Player Type"
                  >
                    <option value="all">Player Type: All</option>
                    <option value="human">HUMAN (Authenticated)</option>
                    <option value="bot">BOT (AI Controlled)</option>
                    <option value="system">SYSTEM (World Entity)</option>
                    <option value="unknown">UNKNOWN (Unverified)</option>
                  </select>

                  <select
                    value={playerMatchFilter}
                    onChange={(e) => {
                      setPlayerMatchFilter(e.target.value);
                      setPlayerPage(1);
                    }}
                    className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200"
                    aria-label="Filter by Active Match or Sector"
                  >
                    <option value="all">All Active Matches / Sectors</option>
                    <option value="map_riverfront_assault">Sector 01: Riverfront Assault</option>
                    <option value="map_iron_ridge_corridor">Sector 02: Iron Ridge Corridor</option>
                    <option value="map_archipelago_bastion">Sector 03: Littoral Bastion Delta</option>
                  </select>

                  <select
                    value={playerConnectionFilter}
                    onChange={(e) => {
                      setPlayerConnectionFilter(e.target.value);
                      setPlayerPage(1);
                    }}
                    className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200"
                    aria-label="Filter by Connection Status"
                  >
                    <option value="all">Connection: All</option>
                    <option value="online">Online / Active AI</option>
                    <option value="offline">Offline / Standby</option>
                  </select>

                  <select
                    value={playerStatusFilter}
                    onChange={(e) => {
                      setPlayerStatusFilter(e.target.value);
                      setPlayerPage(1);
                    }}
                    className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200"
                    aria-label="Filter by Account Status"
                  >
                    <option value="all">Account Status: All</option>
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                    <option value="banned">Banned</option>
                  </select>

                  <select
                    value={playerRoleFilter}
                    onChange={(e) => {
                      setPlayerRoleFilter(e.target.value);
                      setPlayerPage(1);
                    }}
                    className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200"
                    aria-label="Filter by Staff Role"
                  >
                    <option value="all">Role: All</option>
                    <option value="super_admin">Super Admin</option>
                    <option value="game_admin">Game Admin</option>
                    <option value="moderator">Moderator</option>
                    <option value="analyst">Analyst</option>
                    <option value="player">Standard Player / Entity</option>
                  </select>

                  <select
                    value={playerSortBy}
                    onChange={(e) => {
                      setPlayerSortBy(e.target.value);
                      setPlayerPage(1);
                    }}
                    className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-cyan-300 ml-auto"
                    aria-label="Sort Players By"
                  >
                    <option value="score">Sort: Score (High-Low)</option>
                    <option value="playerType">Sort: Player Type</option>
                    <option value="connectionStatus">Sort: Online / Active First</option>
                    <option value="username">Sort: Name (A-Z)</option>
                    <option value="lastLoginAt">Sort: Last Active</option>
                    <option value="joinedAt">Sort: Created / Joined Time</option>
                    <option value="level">Sort: Commander Level</option>
                  </select>
                </div>
              </div>

              {/* Players High-Density Data Grid */}
              <div className="bg-slate-900 border border-slate-800 rounded overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-[11px] font-mono text-slate-400 bg-slate-950/60">
                        <th className="py-2.5 px-3">Player Name</th>
                        <th className="py-2.5 px-3">Player ID</th>
                        <th className="py-2.5 px-3">Player Type</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Current Match / Sector</th>
                        <th className="py-2.5 px-3">Team / Faction</th>
                        <th className="py-2.5 px-3">Account / Controller Source</th>
                        <th className="py-2.5 px-3 text-right">Created / Joined</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {playersData.items.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-8 text-center text-slate-500">
                            No players or entities match the selected filters.
                          </td>
                        </tr>
                      ) : (
                        playersData.items.map((p) => {
                          const isHuman = p.playerType === 'human';
                          return (
                            <tr key={p.id} className="hover:bg-slate-800/40">
                              <td className="py-2.5 px-3">
                                <div className="font-semibold text-white flex items-center gap-1.5">
                                  <span>{p.username}</span>
                                  {p.isOnline && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-600/50 text-emerald-300">
                                      ONLINE
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  {p.rank} · Score {p.score} (L{p.level}) · {p.basesOwned}B/{p.unitsOwned}U
                                </div>
                              </td>

                              <td className="py-2.5 px-3">
                                <div className="text-slate-200 font-semibold">{p.id}</div>
                                <div className="text-[10px] text-slate-500 truncate max-w-[160px]">{p.email}</div>
                              </td>

                              <td className="py-2.5 px-3">
                                <PlayerTypeBadge playerType={p.playerType} />
                                {p.adminRole && (
                                  <div className="text-[10px] text-cyan-400 mt-1 uppercase">{p.adminRole}</div>
                                )}
                              </td>

                              <td className="py-2.5 px-3">
                                <div
                                  className={
                                    p.status === 'banned'
                                      ? 'text-red-400 font-bold'
                                      : p.status === 'suspended'
                                      ? 'text-amber-400 font-bold'
                                      : 'text-emerald-400 font-semibold'
                                  }
                                >
                                  {(p.status || 'active').toUpperCase()}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {p.connectionStatus === 'online' ? 'Connected / Active' : 'Offline / Idle'}
                                </div>
                              </td>

                              <td className="py-2.5 px-3">
                                <div className="text-slate-200 truncate max-w-[190px]">
                                  {p.currentMapName || p.currentMapId || 'Sector 01'}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {p.activeMapIds?.length || 1} sector(s) ·{' '}
                                  {p.activeMatchId ? `Match: ${p.activeMatchId}` : 'Standby'}
                                </div>
                              </td>

                              <td className="py-2.5 px-3">
                                <div className="text-slate-200 truncate max-w-[180px]">
                                  {p.faction || 'Independent Commander'}
                                </div>
                                {p.botDifficulty && (
                                  <div className="text-[10px] text-purple-300">
                                    AI Difficulty: {String(p.botDifficulty).toUpperCase()}
                                  </div>
                                )}
                              </td>

                              <td className="py-2.5 px-3">
                                <div className="text-slate-200">
                                  {p.controlSource === 'human'
                                    ? `Account: ${p.accountId || p.id}`
                                    : p.controlSource === 'ai_controller'
                                    ? `AI Agent: ${p.botAgentId || p.id}`
                                    : p.controlSource === 'system'
                                    ? 'Server Simulation Engine'
                                    : 'Unverified Source'}
                                </div>
                                <div className="text-[10px] text-slate-400 truncate max-w-[200px]">
                                  {p.controlStatus || p.verificationStatus}
                                </div>
                              </td>

                              <td className="py-2.5 px-3 text-right tabular-nums">
                                <div className="text-slate-300">
                                  {new Date(p.joinedAt || Date.now()).toLocaleDateString()}
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  Last: {new Date(p.lastActiveAt || p.lastLoginAt || Date.now()).toLocaleTimeString()}
                                </div>
                              </td>

                              <td className="py-2.5 px-3 text-right space-x-1.5 whitespace-nowrap">
                                <button
                                  onClick={() => handleInspectPlayer(p.id)}
                                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                                  title="Inspect Dossier, Controller Provenance & Audit Trail"
                                >
                                  <Eye className="w-3.5 h-3.5 inline mr-1" />
                                  <span>Details</span>
                                </button>

                                {isHuman && hasPerm('players.suspend') && (
                                  <button
                                    onClick={() => {
                                      setModModal({
                                        player: p,
                                        action: p.status === 'suspended' ? 'unsuspend' : 'suspend',
                                      });
                                      setModReason('');
                                    }}
                                    className="px-2 py-1 rounded bg-amber-950/60 hover:bg-amber-900/70 text-amber-300 border border-amber-800/60"
                                  >
                                    {p.status === 'suspended' ? 'Unsuspend' : 'Suspend'}
                                  </button>
                                )}

                                {isHuman && hasPerm('players.ban') && (
                                  <button
                                    onClick={() => {
                                      setModModal({
                                        player: p,
                                        action: p.status === 'banned' ? 'unban' : 'ban',
                                      });
                                      setModReason('');
                                    }}
                                    className="px-2 py-1 rounded bg-red-950/60 hover:bg-red-900/70 text-red-300 border border-red-800/60"
                                  >
                                    {p.status === 'banned' ? 'Unban' : 'Ban'}
                                  </button>
                                )}

                                {isHuman && hasPerm('players.reset_progress') && (
                                  <button
                                    onClick={() => {
                                      setModModal({ player: p, action: 'reset_progress' });
                                      setModReason('');
                                    }}
                                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                                  >
                                    Reset
                                  </button>
                                )}

                                {(isHuman || p.playerType === 'unknown') && hasPerm('players.ban') && (
                                  <button
                                    onClick={() => {
                                      setModModal({ player: p, action: 'delete_account' });
                                      setModReason('Administrative account deletion');
                                    }}
                                    className="px-2 py-1 rounded bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-700/70"
                                    title="Permanently delete player account and remove bases/units"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 inline mr-1" />
                                    <span>Delete</span>
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Footer */}
                <div className="px-4 py-2.5 border-t border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400">
                  <span className="tabular-nums">
                    Showing {playersData.items.length} of {playersData.pagination.total} total entities
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={playerPage <= 1}
                      onClick={() => setPlayerPage((p) => Math.max(1, p - 1))}
                      className="p-1 rounded bg-slate-800 disabled:opacity-40"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="tabular-nums">
                      Page {playersData.pagination.page} / {playersData.pagination.totalPages}
                    </span>
                    <button
                      disabled={playerPage >= playersData.pagination.totalPages}
                      onClick={() => setPlayerPage((p) => p + 1)}
                      className="p-1 rounded bg-slate-800 disabled:opacity-40"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Player Detail Inspector Panel / Drawer */}
              {selectedPlayerDetail && (
                <div className="p-5 bg-slate-900 border border-slate-700 rounded space-y-5 shadow-xl">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
                    <div className="flex items-center gap-3">
                      <PlayerTypeBadge playerType={selectedPlayerDetail.profile.playerType} size="sm" />
                      <div>
                        <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
                          <span>{selectedPlayerDetail.profile.username}</span>
                          <span className="text-slate-400 font-normal">({selectedPlayerDetail.profile.id})</span>
                        </h3>
                        <p className="text-xs text-slate-400 font-mono">
                          {selectedPlayerDetail.profile.rank} · Faction:{' '}
                          <span className="text-slate-200">{selectedPlayerDetail.profile.faction}</span> · Status:{' '}
                          <span className="text-emerald-400">
                            {(selectedPlayerDetail.profile.status || 'active').toUpperCase()}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {selectedPlayerDetail.profile.playerType === 'human' && hasPerm('players.suspend') && (
                        <button
                          onClick={() => {
                            setModModal({ player: selectedPlayerDetail.profile, action: 'rename' });
                            setModNewUsername(selectedPlayerDetail.profile.username);
                            setModReason('');
                          }}
                          className="px-2.5 py-1 text-xs font-mono rounded bg-blue-950/70 border border-blue-700 text-blue-200"
                        >
                          Rename Callsign
                        </button>
                      )}
                      {(selectedPlayerDetail.profile.playerType === 'human' ||
                        selectedPlayerDetail.profile.playerType === 'unknown') &&
                        hasPerm('players.ban') && (
                          <button
                            onClick={() => {
                              setModModal({ player: selectedPlayerDetail.profile, action: 'delete_account' });
                              setModReason('Administrative account deletion');
                            }}
                            className="px-2.5 py-1 text-xs font-mono rounded bg-red-950/80 hover:bg-red-900 border border-red-700 text-red-200 flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete Account</span>
                          </button>
                        )}
                      <button
                        onClick={() => setSelectedPlayerDetail(null)}
                        className="px-2.5 py-1 text-xs font-mono rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                      >
                        Close Dossier
                      </button>
                    </div>
                  </div>

                  {/* Authoritative Identity & Provenance Metadata Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
                    <div className="p-3 bg-slate-950 border border-slate-800 rounded space-y-1">
                      <div className="text-[10px] uppercase text-slate-400">Identity & Verification</div>
                      <div className="text-slate-200 font-semibold">
                        Type: {String(selectedPlayerDetail.profile.playerType || 'unknown').toUpperCase()}
                      </div>
                      <div className="text-slate-400">
                        Verification: <span className="text-cyan-300">{selectedPlayerDetail.profile.verificationStatus}</span>
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Verified By: {selectedPlayerDetail.profile.verifiedBy || 'Unverified'}
                      </div>
                    </div>

                    <div className="p-3 bg-slate-950 border border-slate-800 rounded space-y-1">
                      <div className="text-[10px] uppercase text-slate-400">Controller & Provenance</div>
                      <div className="text-slate-200 font-semibold">
                        Source: {selectedPlayerDetail.profile.controlSource}
                      </div>
                      <div className="text-slate-400">
                        {selectedPlayerDetail.profile.accountId
                          ? `Account ID: ${selectedPlayerDetail.profile.accountId}`
                          : selectedPlayerDetail.profile.botAgentId
                          ? `Bot Agent ID: ${selectedPlayerDetail.profile.botAgentId}`
                          : 'No Human Account Linked'}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Origin: {selectedPlayerDetail.profile.creationSource}
                      </div>
                    </div>

                    <div className="p-3 bg-slate-950 border border-slate-800 rounded space-y-1">
                      <div className="text-[10px] uppercase text-slate-400">Current Match & Sector</div>
                      <div className="text-slate-200 font-semibold">
                        {selectedPlayerDetail.profile.currentMapName || selectedPlayerDetail.profile.currentMapId}
                      </div>
                      <div className="text-slate-400">
                        Connection:{' '}
                        <span className={selectedPlayerDetail.isOnline ? 'text-emerald-400' : 'text-slate-400'}>
                          {selectedPlayerDetail.isOnline ? 'ONLINE / ACTIVE' : 'OFFLINE'}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Matches: {(selectedPlayerDetail.profile.activeMatchIds || []).join(', ') || 'None'}
                      </div>
                    </div>

                    <div className="p-3 bg-slate-950 border border-slate-800 rounded space-y-1">
                      <div className="text-[10px] uppercase text-slate-400">
                        {selectedPlayerDetail.profile.playerType === 'bot'
                          ? 'AI Bot Agent Profile'
                          : 'Activity & Timestamps'}
                      </div>
                      {selectedPlayerDetail.profile.playerType === 'bot' ? (
                        <>
                          <div className="text-purple-300 font-semibold">
                            Difficulty: {String(selectedPlayerDetail.profile.botDifficulty || 'medium').toUpperCase()}
                          </div>
                          <div className="text-slate-300 truncate">
                            {selectedPlayerDetail.profile.botAiProfile || 'Autonomous AI Controller'}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            Last AI Tick: {new Date(selectedPlayerDetail.profile.lastActiveAt).toLocaleTimeString()}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-slate-200">
                            Created: {new Date(selectedPlayerDetail.profile.joinedAt).toLocaleDateString()}
                          </div>
                          <div className="text-slate-400">
                            Last Update: {new Date(selectedPlayerDetail.profile.lastActiveAt || selectedPlayerDetail.profile.lastLoginAt).toLocaleString()}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            Harvested: {selectedPlayerDetail.profile.totalResourcesHarvested}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Classification Verification / Anti-Spoofing Notice */}
                  {selectedPlayerDetail.profile.playerType === 'unknown' && hasPerm('players.suspend') && (
                    <form
                      onSubmit={handleVerifyUnknownPlayerType}
                      className="p-3.5 bg-amber-950/30 border border-amber-600/50 rounded flex flex-wrap items-center justify-between gap-3 text-xs font-mono"
                    >
                      <div>
                        <div className="text-amber-300 font-bold uppercase">
                          Unverified Legacy / Unknown Entity Classification
                        </div>
                        <div className="text-slate-300 text-[11px]">
                          Assign an authoritative server classification for this unresolved record. Action will be recorded in the audit log.
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={verifyTypeTarget}
                          onChange={(e) => setVerifyTypeTarget(e.target.value as PlayerType)}
                          className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white"
                        >
                          <option value="bot">Verify as BOT (AI Agent)</option>
                          <option value="system">Verify as SYSTEM (World Entity)</option>
                          <option value="human">Verify as HUMAN (Account Required)</option>
                        </select>
                        <input
                          type="text"
                          value={verifyTypeReason}
                          onChange={(e) => setVerifyTypeReason(e.target.value)}
                          placeholder="Verification audit reason..."
                          className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white min-w-[220px]"
                          required
                        />
                        <button
                          type="submit"
                          className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold uppercase"
                        >
                          Verify Identity
                        </button>
                      </div>
                    </form>
                  )}

                  {selectedPlayerDetail.profile.playerType === 'human' && (
                    <div className="px-3.5 py-2 bg-blue-950/30 border border-blue-800/50 rounded flex items-center justify-between text-[11px] font-mono text-blue-200">
                      <span>
                        Verified Human Account Protection: Authenticated human accounts are cryptographically bound to user credentials and cannot be reclassified as bots.
                      </span>
                      <span className="text-blue-400 uppercase font-bold">Immutable Human Provenance</span>
                    </div>
                  )}

                  {/* Home Base Command Diagnostics & Recovery Section */}
                  {selectedPlayerDetail.homeBaseDiagnostics && (
                    <div className="p-4 bg-slate-950 border border-indigo-500/40 rounded space-y-3 text-xs font-mono">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-purple-950 text-purple-200 border border-purple-500/60 text-[10px] font-bold">
                            ★ HOME BASE HQ DIAGNOSTICS
                          </span>
                          <span className="font-bold text-white">
                            {selectedPlayerDetail.homeBaseDiagnostics.activeHomeBase
                              ? `${selectedPlayerDetail.homeBaseDiagnostics.activeHomeBase.name} (${selectedPlayerDetail.homeBaseDiagnostics.activeHomeBase.id})`
                              : selectedPlayerDetail.homeBaseDiagnostics.archivedHomeBase
                              ? 'ARCHIVED (INACTIVE EVICTION)'
                              : 'MISSING / UNASSIGNED'}
                          </span>
                        </div>

                        {hasPerm('players.reset_progress') && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleAdminHomeBaseAction('recover')}
                              className="px-2.5 py-1 rounded bg-emerald-950/80 hover:bg-emerald-900 text-emerald-200 border border-emerald-600/60 text-[11px]"
                              title="Recover or spawn missing/archived Home Base on a validated map coordinate"
                            >
                              Recover / Spawn HQ
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAdminHomeBaseAction('repair')}
                              className="px-2.5 py-1 rounded bg-cyan-950/80 hover:bg-cyan-900 text-cyan-200 border border-cyan-600/60 text-[11px]"
                              title="Restore Home Base and all HQ structures to 100% health and shields"
                            >
                              Full HQ Repair
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleAdminHomeBaseAction(
                                  'relocate',
                                  selectedPlayerDetail.homeBaseDiagnostics.homeMapId || 'map_riverfront_assault'
                                )
                              }
                              className="px-2.5 py-1 rounded bg-indigo-950/80 hover:bg-indigo-900 text-indigo-200 border border-indigo-600/60 text-[11px]"
                              title="Relocate Home Base to a fresh unobstructed spawn coordinate"
                            >
                              Relocate HQ
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAdminHomeBaseAction('reset_cooldowns')}
                              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px]"
                              title="Clear Home Map relocation and reconstruction cooldowns"
                            >
                              Reset Cooldowns
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-[11px]">
                        <div className="p-2.5 bg-slate-900 border border-slate-800 rounded">
                          <div className="text-slate-400 text-[10px]">HOME MAP & COORDS</div>
                          <div className="text-slate-100 font-bold truncate">
                            {selectedPlayerDetail.homeBaseDiagnostics.homeMapName ||
                              selectedPlayerDetail.homeBaseDiagnostics.homeMapId}
                          </div>
                          <div className="text-cyan-400">
                            {selectedPlayerDetail.homeBaseDiagnostics.homeBaseCoords
                              ? `X:${selectedPlayerDetail.homeBaseDiagnostics.homeBaseCoords.x}, Y:${selectedPlayerDetail.homeBaseDiagnostics.homeBaseCoords.y}`
                              : 'Unassigned'}
                          </div>
                        </div>

                        <div className="p-2.5 bg-slate-900 border border-slate-800 rounded">
                          <div className="text-slate-400 text-[10px]">LIFECYCLE & INTEGRITY</div>
                          <div className="text-indigo-300 font-bold uppercase">
                            State: {selectedPlayerDetail.homeBaseDiagnostics.lifecycleState || 'none'}
                          </div>
                          <div className="text-emerald-400">
                            {selectedPlayerDetail.homeBaseDiagnostics.activeHomeBase
                              ? `HP ${selectedPlayerDetail.homeBaseDiagnostics.activeHomeBase.health}/${selectedPlayerDetail.homeBaseDiagnostics.activeHomeBase.maxHealth} (${selectedPlayerDetail.homeBaseDiagnostics.armorMultiplier}x Armor)`
                              : 'Offline'}
                          </div>
                        </div>

                        <div className="p-2.5 bg-slate-900 border border-slate-800 rounded">
                          <div className="text-slate-400 text-[10px]">HQ LEVEL & FACILITIES</div>
                          <div className="text-slate-100 font-bold">
                            Command Center Level {selectedPlayerDetail.homeBaseDiagnostics.hqLevel || 1}
                          </div>
                          <div className="text-slate-400">
                            {selectedPlayerDetail.homeBaseDiagnostics.activeHomeBase
                              ? `${selectedPlayerDetail.homeBaseDiagnostics.activeHomeBase.buildings.length} structures · ${selectedPlayerDetail.homeBaseDiagnostics.activeHomeBase.activeTurretsCount || 0} turrets`
                              : selectedPlayerDetail.homeBaseDiagnostics.archivedHomeBase
                              ? `Archived (${selectedPlayerDetail.homeBaseDiagnostics.archivedHomeBase.buildings.length} structures)`
                              : '0 structures'}
                          </div>
                        </div>

                        <div className="p-2.5 bg-slate-900 border border-slate-800 rounded">
                          <div className="text-slate-400 text-[10px]">PLACEMENT & RECONSTRUCTION LOG</div>
                          <div className="text-slate-200">
                            Rebuilds: {(selectedPlayerDetail.homeBaseDiagnostics.destructionHistory || []).length}
                          </div>
                          <div className="text-amber-300">
                            Placement Failures: {(selectedPlayerDetail.homeBaseDiagnostics.placementFailures || []).length}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                    <div>
                      <div className="text-slate-400 uppercase mb-1.5">
                        Moderation & Audit History ({(selectedPlayerDetail.auditTrail || []).length})
                      </div>
                      {(selectedPlayerDetail.profile.moderationHistory || []).length === 0 &&
                      (selectedPlayerDetail.auditTrail || []).length === 0 ? (
                        <div className="text-slate-500">Clean service record. No moderation or audit actions.</div>
                      ) : (
                        <div className="space-y-1.5 max-h-44 overflow-y-auto">
                          {(selectedPlayerDetail.profile.moderationHistory || []).map((m: any) => (
                            <div key={m.id} className="p-2 bg-slate-950 border border-slate-800 rounded">
                              <div className="flex justify-between text-amber-300">
                                <span className="uppercase font-bold">{m.action}</span>
                                <span className="tabular-nums text-slate-400">
                                  {new Date(m.timestamp).toLocaleString()}
                                </span>
                              </div>
                              <div className="text-slate-300 mt-0.5">Reason: {m.reason}</div>
                              <div className="text-slate-500 text-[10px]">By: {m.adminUsername}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="text-slate-400 uppercase mb-1.5">
                        Controlled Bases ({selectedPlayerDetail.bases.length}) & Active Units (
                        {selectedPlayerDetail.units.length})
                      </div>
                      <div className="space-y-1.5 max-h-44 overflow-y-auto">
                        {selectedPlayerDetail.bases.map((b: any) => (
                          <div
                            key={b.id}
                            className="p-2 bg-slate-950 border border-slate-800 rounded flex justify-between"
                          >
                            <span>
                              {b.isHomeBase ? '★ HQ · ' : ''}
                              {b.name} ({b.type.toUpperCase()}) · {b.mapId || 'Sector 01'}
                            </span>
                            <span className="tabular-nums text-emerald-400">
                              HP {b.health}/{b.maxHealth} · X:{b.x} Y:{b.y}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================================================================
              SECTION 3: LIVE MATCHES & SECTOR MONITORING
             ================================================================ */}
          {activeSection === 'live_matches' && matchesData && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="p-4 bg-slate-900 border border-slate-800 rounded space-y-2 font-mono text-xs">
                  <div className="text-slate-400 uppercase">Active Theater Sector</div>
                  <div className="text-base font-bold text-white">{matchesData.liveSector.mapName}</div>
                  <div className="text-slate-400 tabular-nums">
                    Seed: {matchesData.liveSector.seed} · Grid: {matchesData.liveSector.width}x
                    {matchesData.liveSector.height} · Props: {matchesData.liveSector.envObjectsCount}
                  </div>
                  {matchesData.liveSector.participantTypeCounts && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="text-[10px] text-blue-300 font-bold">
                        HUMAN: {matchesData.liveSector.participantTypeCounts.human || 0}
                      </span>
                      <span className="text-[10px] text-purple-300 font-bold">
                        BOT: {matchesData.liveSector.participantTypeCounts.bot || 0}
                      </span>
                      <span className="text-[10px] text-slate-300 font-bold">
                        SYSTEM: {matchesData.liveSector.participantTypeCounts.system || 0}
                      </span>
                      {matchesData.liveSector.participantTypeCounts.unknown > 0 && (
                        <span className="text-[10px] text-amber-300 font-bold">
                          UNKNOWN: {matchesData.liveSector.participantTypeCounts.unknown}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="p-4 bg-slate-900 border border-slate-800 rounded space-y-2 font-mono text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 uppercase">Kodiak PMC Autonomous AI</span>
                    <PlayerTypeBadge playerType="bot" />
                  </div>
                  <div className="flex items-center gap-2">
                    {(['easy', 'medium', 'hard'] as AIDifficulty[]).map((diff) => (
                      <button
                        key={diff}
                        disabled={!hasPerm('matches.terminate')}
                        onClick={() => handleMatchAction('set_ai_difficulty', { difficulty: diff })}
                        className={`px-3 py-1 rounded uppercase border transition ${
                          matchesData.liveSector.aiDifficulty === diff
                            ? 'bg-purple-600 text-white border-purple-500 font-bold'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                        }`}
                      >
                        {diff}
                      </button>
                    ))}
                  </div>
                  <div className="text-slate-400 tabular-nums">
                    Tick Latency: {matchesData.liveSector.lastTickDurationMs} ms ({matchesData.liveSector.totalTicks}{' '}
                    ticks)
                  </div>
                </div>

                <div className="p-4 bg-slate-900 border border-slate-800 rounded space-y-2 font-mono text-xs">
                  <div className="text-slate-400 uppercase">Emergency Sector Match Controls</div>
                  <input
                    type="text"
                    value={matchActionReason}
                    onChange={(e) => setMatchActionReason(e.target.value)}
                    placeholder="Mandatory operational reason..."
                    className="w-full px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-white"
                  />
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      disabled={!hasPerm('matches.terminate')}
                      onClick={() => handleMatchAction('reset_match')}
                      className="flex-1 py-1.5 px-3 rounded bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/50 text-amber-200 flex items-center justify-center gap-1.5 disabled:opacity-40"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset Skirmish</span>
                    </button>
                    <button
                      disabled={!hasPerm('matches.terminate')}
                      onClick={() => handleMatchAction('terminate_match')}
                      className="flex-1 py-1.5 px-3 rounded bg-red-600/20 hover:bg-red-600/30 border border-red-500/50 text-red-200 flex items-center justify-center gap-1.5 disabled:opacity-40"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      <span>Terminate Match</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Active Match Participant Roster (HUMAN / BOT / SYSTEM / UNKNOWN) */}
              {Array.isArray(matchesData.liveSector.participants) && (
                <div className="bg-slate-900 border border-slate-800 rounded overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-mono uppercase font-bold text-slate-200">
                      Active Match Participant Roster ({matchesData.liveSector.participants.length})
                    </h3>
                    <div className="flex items-center gap-2 text-[11px] font-mono">
                      <PlayerTypeBadge playerType="human" />
                      <PlayerTypeBadge playerType="bot" />
                      <PlayerTypeBadge playerType="system" />
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs font-mono">
                      <thead>
                        <tr className="border-b border-slate-800 text-[11px] text-slate-400 bg-slate-950/60">
                          <th className="py-2 px-3">Participant</th>
                          <th className="py-2 px-3">Player ID</th>
                          <th className="py-2 px-3">Player Type</th>
                          <th className="py-2 px-3">Faction / Team</th>
                          <th className="py-2 px-3">Controller Source</th>
                          <th className="py-2 px-3 text-right">Sector Bases</th>
                          <th className="py-2 px-3 text-right">Sector Units</th>
                          <th className="py-2 px-3 text-right">State</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {matchesData.liveSector.participants.map((part: MatchParticipantSummary) => (
                          <tr key={part.playerId} className="hover:bg-slate-800/40">
                            <td className="py-2 px-3 font-semibold text-white">{part.username}</td>
                            <td className="py-2 px-3 text-slate-400">{part.playerId}</td>
                            <td className="py-2 px-3">
                              <PlayerTypeBadge playerType={part.playerType} />
                            </td>
                            <td className="py-2 px-3 text-slate-300">{part.faction}</td>
                            <td className="py-2 px-3 text-slate-400">
                              {part.controlSource}
                              {part.botDifficulty ? ` (${part.botDifficulty.toUpperCase()})` : ''}
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums text-slate-200">{part.basesCount}</td>
                            <td className="py-2 px-3 text-right tabular-nums text-slate-200">{part.unitsCount}</td>
                            <td className="py-2 px-3 text-right">
                              <span className={part.isOnline ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                                {part.isOnline ? 'ACTIVE' : 'OFFLINE'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Sandbox Spawner & Supply Injection Bar */}
              {hasPerm('matches.terminate') && (
                <div className="p-4 bg-slate-900 border border-slate-800 rounded flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-amber-400" />
                    <span className="font-bold text-slate-200 uppercase">Live Battlefield Spawner:</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={sandboxUnitType}
                      onChange={(e) => setSandboxUnitType(e.target.value as UnitType)}
                      className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200"
                    >
                      <option value="rifle_infantry">Rifle Infantry Squad</option>
                      <option value="vanguard_scout">Vanguard Scout Buggy</option>
                      <option value="ironclad_apc">Ironclad Combat Carrier</option>
                      <option value="titan_mbt">Titan Main Battle Tank</option>
                      <option value="goliath_howitzer">Goliath Heavy Howitzer</option>
                      <option value="skyguard_aa">Skyguard Vulcan AA</option>
                      <option value="dominator_conquest">Dominator Command Vehicle</option>
                      <option value="hawk_scout_heli">Hawk Recon Helicopter</option>
                      <option value="cobra_gunship">Cobra Attack Gunship</option>
                      <option value="stormbringer_jet">Stormbringer Interceptor</option>
                      <option value="thunderbolt_bomber">Thunderbolt Heavy Bomber</option>
                      <option value="wavecutter_corvette">Wavecutter Patrol Corvette</option>
                      <option value="trident_destroyer">Trident Guided-Missile Destroyer</option>
                      <option value="iron_dreadnought">Iron Dreadnought Siege Train</option>
                    </select>

                    <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sandboxIsHostile}
                        onChange={(e) => setSandboxIsHostile(e.target.checked)}
                      />
                      <span>Spawn as Hostile BOT (Kodiak PMC)</span>
                    </label>

                    <button
                      onClick={async () => {
                        try {
                          await apiFetch('/spawn_unit', {
                            method: 'POST',
                            body: JSON.stringify({
                              unitType: sandboxUnitType,
                              x: sandboxIsHostile ? 68 : 19,
                              y: sandboxIsHostile ? 22 : 28,
                              ownerId: sandboxIsHostile ? 'enemy_insurgent' : 'player_default',
                            }),
                          });
                          showToast('success', `Spawned ${sandboxUnitType} on live battlefield.`);
                          refreshCurrentSection();
                        } catch (err: any) {
                          showToast('error', err.message);
                        }
                      }}
                      className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-semibold"
                    >
                      Deploy Unit
                    </button>
                  </div>
                </div>
              )}

              {/* Active Sector Bases Table */}
              <div className="bg-slate-900 border border-slate-800 rounded overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                  <h3 className="text-xs font-mono uppercase font-bold text-slate-200">
                    Sector Installations & Resource Stockpiles ({matchesData.liveSector.bases.length})
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs font-mono">
                    <thead>
                      <tr className="border-b border-slate-800 text-[11px] text-slate-400 bg-slate-950/60">
                        <th className="py-2 px-3">Base Name</th>
                        <th className="py-2 px-3">Type</th>
                        <th className="py-2 px-3">Controller & Player Type</th>
                        <th className="py-2 px-3 text-right">Coords</th>
                        <th className="py-2 px-3 text-right">Integrity / Shield</th>
                        <th className="py-2 px-3 text-right">Resources (C / S / A / F)</th>
                        <th className="py-2 px-3 text-right">Supply Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {matchesData.liveSector.bases.map((b: any) => (
                        <tr key={b.id} className="hover:bg-slate-800/40">
                          <td className="py-2 px-3 font-semibold text-white">{b.name}</td>
                          <td className="py-2 px-3 uppercase text-slate-400">{b.type}</td>
                          <td className="py-2 px-3">
                            <div className="flex items-center gap-2">
                              <PlayerTypeBadge
                                playerType={
                                  b.controllerPlayerType ||
                                  (b.ownerId === 'enemy_insurgent'
                                    ? 'bot'
                                    : b.ownerId === 'neutral'
                                    ? 'system'
                                    : 'human')
                                }
                              />
                              <span
                                className={
                                  b.ownerId === 'enemy_insurgent'
                                    ? 'text-purple-300'
                                    : b.ownerId === 'neutral'
                                    ? 'text-slate-400'
                                    : 'text-blue-300'
                                }
                              >
                                {b.ownerName}
                              </span>
                            </div>
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums text-slate-400">
                            X:{b.x} Y:{b.y}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums text-emerald-400">
                            {b.health}/{b.maxHealth} (+{b.defenseShield})
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums text-slate-300">
                            {Math.round(b.resources.concrete)} / {Math.round(b.resources.steel)} /{' '}
                            {Math.round(b.resources.aluminum)} / {Math.round(b.resources.fuel)}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {hasPerm('economy.edit') && (
                              <button
                                onClick={async () => {
                                  try {
                                    await apiFetch('/boost_resources', {
                                      method: 'POST',
                                      body: JSON.stringify({ baseId: b.id, amount: 5000 }),
                                    });
                                    showToast('success', `Granted +5,000 resources to ${b.name}.`);
                                    refreshCurrentSection();
                                  } catch (err: any) {
                                    showToast('error', err.message);
                                  }
                                }}
                                className="px-2 py-1 rounded bg-emerald-950/60 hover:bg-emerald-900/70 border border-emerald-700/60 text-emerald-300"
                              >
                                +5k Supply
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              SECTION 4: MATCH HISTORY
             ================================================================ */}
          {activeSection === 'match_history' && matchesData && (
            <div className="bg-slate-900 border border-slate-800 rounded overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800">
                <h2 className="text-xs font-mono uppercase font-bold text-slate-200">
                  Theater Match & Operation History Log
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] text-slate-400 bg-slate-950/60">
                      <th className="py-2.5 px-3">Match ID</th>
                      <th className="py-2.5 px-3">Sector Map</th>
                      <th className="py-2.5 px-3">Participants & Player Types</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">AI Diff</th>
                      <th className="py-2.5 px-3 text-right">Units / Captures</th>
                      <th className="py-2.5 px-3 text-right">Started</th>
                      <th className="py-2.5 px-3">Outcome / Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {matchesData.matches.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 text-cyan-300">{m.id}</td>
                        <td className="py-2.5 px-3 text-white">
                          {m.mapName} <span className="text-slate-500">(Seed {m.seed})</span>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {(m.participants || []).map((part) => (
                              <span
                                key={part.playerId}
                                className="inline-flex items-center gap-1 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5"
                              >
                                <PlayerTypeBadge playerType={part.playerType} />
                                <span className="text-slate-200 text-[11px]">{part.username}</span>
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={
                              m.status === 'active'
                                ? 'text-emerald-400 font-bold'
                                : m.status === 'completed'
                                ? 'text-blue-400'
                                : 'text-amber-400'
                            }
                          >
                            {m.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 uppercase text-slate-300">{m.aiDifficulty}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-slate-300">
                          {m.totalUnitsSpawned}U / {m.totalBasesCaptured}C
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-slate-400">
                          {new Date(m.startedAt).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-slate-300">
                          {m.terminationReason || m.winnerName || 'In Progress'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================================================================
              SECTION 5: ECONOMY CONFIGURATION & ROLLBACK
             ================================================================ */}
          {activeSection === 'economy' && economyDraft && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <form
                onSubmit={handleSaveEconomy}
                className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded p-5 space-y-5"
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div>
                    <h2 className="text-sm font-bold font-mono uppercase text-white">
                      Authoritative Economy & Production Parameters (v{economyDraft.version})
                    </h2>
                    <p className="text-xs text-slate-400">
                      Last updated by {economyDraft.updatedBy} at {new Date(economyDraft.updatedAt).toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Multipliers Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs font-mono">
                  <div>
                    <label className="block text-slate-400 mb-1">Resource Gen Multiplier (0.1–10x)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      max="10"
                      value={economyDraft.resourceGenerationMultiplier}
                      onChange={(e) =>
                        setEconomyDraft({ ...economyDraft, resourceGenerationMultiplier: Number(e.target.value) })
                      }
                      className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-white tabular-nums"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Unit Cost Multiplier (0.2–5x)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.2"
                      max="5"
                      value={economyDraft.unitCostMultiplier}
                      onChange={(e) => setEconomyDraft({ ...economyDraft, unitCostMultiplier: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-white tabular-nums"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Building Cost Multiplier (0.2–5x)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.2"
                      max="5"
                      value={economyDraft.buildingCostMultiplier}
                      onChange={(e) =>
                        setEconomyDraft({ ...economyDraft, buildingCostMultiplier: Number(e.target.value) })
                      }
                      className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-white tabular-nums"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Unit Train Speed Mult (0.2–5x)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.2"
                      max="5"
                      value={economyDraft.unitProductionSpeedMultiplier}
                      onChange={(e) =>
                        setEconomyDraft({ ...economyDraft, unitProductionSpeedMultiplier: Number(e.target.value) })
                      }
                      className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-white tabular-nums"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Building Speed Mult (0.2–5x)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.2"
                      max="5"
                      value={economyDraft.buildingBuildSpeedMultiplier}
                      onChange={(e) =>
                        setEconomyDraft({ ...economyDraft, buildingBuildSpeedMultiplier: Number(e.target.value) })
                      }
                      className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-white tabular-nums"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Pop Cap Per Base (10–200)</label>
                    <input
                      type="number"
                      min="10"
                      max="200"
                      value={economyDraft.populationCapPerBase}
                      onChange={(e) =>
                        setEconomyDraft({ ...economyDraft, populationCapPerBase: Number(e.target.value) })
                      }
                      className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-white tabular-nums"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Max Global Units (20–1000)</label>
                    <input
                      type="number"
                      min="20"
                      max="1000"
                      value={economyDraft.maxGlobalUnits}
                      onChange={(e) => setEconomyDraft({ ...economyDraft, maxGlobalUnits: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-white tabular-nums"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Base Capture Rate / Tick (1–50)</label>
                    <input
                      type="number"
                      min="1"
                      max="50"
                      value={economyDraft.captureSpeedPerTick}
                      onChange={(e) =>
                        setEconomyDraft({ ...economyDraft, captureSpeedPerTick: Number(e.target.value) })
                      }
                      className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-white tabular-nums"
                    />
                  </div>
                </div>

                {/* Starting Resources */}
                <div className="pt-2 border-t border-slate-800">
                  <div className="text-xs font-mono uppercase text-slate-400 mb-2">
                    Default Starting Resources (New Bases & Skirmish Resets)
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                    {(['concrete', 'steel', 'aluminum', 'fuel'] as const).map((rKey) => (
                      <div key={rKey}>
                        <label className="block text-slate-400 capitalize mb-1">{rKey}</label>
                        <input
                          type="number"
                          min="0"
                          max="100000"
                          value={economyDraft.startingResources[rKey]}
                          onChange={(e) =>
                            setEconomyDraft({
                              ...economyDraft,
                              startingResources: {
                                ...economyDraft.startingResources,
                                [rKey]: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-white tabular-nums"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Diff Preview before Save */}
                {economyDiffs.length > 0 && (
                  <div className="p-3 bg-slate-950 border border-amber-700/60 rounded text-xs font-mono space-y-1">
                    <div className="text-amber-300 font-bold uppercase">Staged Parameter Changes Preview:</div>
                    {economyDiffs.map((d) => (
                      <div key={d.field} className="flex justify-between">
                        <span className="text-slate-300">{d.field}:</span>
                        <span className="tabular-nums">
                          <span className="text-slate-500">{d.before}</span> →{' '}
                          <span className="text-emerald-400 font-bold">{d.after}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="pt-2 border-t border-slate-800 space-y-3">
                  <label className="flex items-center gap-2 text-xs font-mono text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={applyCapToExisting}
                      onChange={(e) => setApplyCapToExisting(e.target.checked)}
                    />
                    <span>Apply increased storage caps to existing active bases</span>
                  </label>

                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      type="text"
                      value={economyReason}
                      onChange={(e) => setEconomyReason(e.target.value)}
                      placeholder="Mandatory change reason for audit log..."
                      className="flex-1 min-w-[220px] px-3 py-2 rounded bg-slate-950 border border-slate-800 text-xs font-mono text-white"
                      required
                    />
                    <button
                      type="submit"
                      disabled={!hasPerm('economy.edit')}
                      className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-xs font-mono font-bold uppercase text-white"
                    >
                      Publish Economy Rules
                    </button>
                  </div>
                </div>
              </form>

              {/* Economy Version History & Rollback */}
              <div className="bg-slate-900 border border-slate-800 rounded p-4 space-y-3">
                <h3 className="text-xs font-mono uppercase font-bold text-slate-200 border-b border-slate-800 pb-2">
                  Version History & Rollback
                </h3>
                <div className="space-y-2.5 max-h-[540px] overflow-y-auto font-mono text-xs">
                  {economyHistory.map((h) => (
                    <div key={h.version} className="p-3 bg-slate-950 border border-slate-800 rounded space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-cyan-400">Version v{h.version}</span>
                        <span className="text-[10px] text-slate-400 tabular-nums">
                          {new Date(h.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-slate-200">{h.changesSummary}</div>
                      <div className="text-slate-400 text-[11px]">Reason: {h.reason}</div>
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] text-slate-500">By {h.adminUsername}</span>
                        {hasPerm('economy.edit') && h.version !== economyDraft.version && (
                          <button
                            onClick={() => handleRollbackEconomy(h.version)}
                            className="px-2 py-0.5 rounded bg-amber-950/70 hover:bg-amber-900 border border-amber-700/60 text-amber-300 text-[10px]"
                          >
                            Rollback to v{h.version}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              SECTION 6: MAPS & CONTENT MANAGEMENT
             ================================================================ */}
          {activeSection === 'maps' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Sector List & Import Form */}
              <div className="space-y-6">
                <div className="bg-slate-900 border border-slate-800 rounded p-4 space-y-3">
                  <h3 className="text-xs font-mono uppercase font-bold text-slate-200 border-b border-slate-800 pb-2">
                    Configured Theater Sectors ({mapsList.length})
                  </h3>
                  <div className="space-y-2">
                    {mapsList.map((m) => (
                      <div
                        key={m.id}
                        onClick={() => setSelectedMap(m)}
                        className={`p-3 rounded border cursor-pointer transition font-mono text-xs ${
                          selectedMap?.id === m.id
                            ? 'bg-blue-950/40 border-blue-500/60 text-white'
                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold">{m.name}</span>
                          {m.isActiveMap && <span className="text-[10px] text-emerald-400 font-bold">[ACTIVE]</span>}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1 tabular-nums">
                          Seed: {m.seed} · {m.width}x{m.height} · Max {m.maxPlayers}P
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Import New Validated Map */}
                {hasPerm('maps.edit') && (
                  <form
                    onSubmit={handleImportMap}
                    className="bg-slate-900 border border-slate-800 rounded p-4 space-y-3 text-xs font-mono"
                  >
                    <h3 className="uppercase font-bold text-slate-200 border-b border-slate-800 pb-2">
                      Import & Validate New Sector Seed
                    </h3>
                    <div>
                      <label className="block text-slate-400 mb-1">Sector Name</label>
                      <input
                        type="text"
                        value={newMapForm.name}
                        onChange={(e) => setNewMapForm({ ...newMapForm, name: e.target.value })}
                        placeholder="Sector 04: Carpathian Basin"
                        className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-white"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-slate-400 mb-1">Terrain Seed</label>
                        <input
                          type="number"
                          value={newMapForm.seed}
                          onChange={(e) => setNewMapForm({ ...newMapForm, seed: Number(e.target.value) })}
                          className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-white tabular-nums"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Max Players</label>
                        <input
                          type="number"
                          min="2"
                          max="16"
                          value={newMapForm.maxPlayers}
                          onChange={(e) => setNewMapForm({ ...newMapForm, maxPlayers: Number(e.target.value) })}
                          className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-white tabular-nums"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Tactical Description</label>
                      <textarea
                        rows={2}
                        value={newMapForm.description}
                        onChange={(e) => setNewMapForm({ ...newMapForm, description: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-white"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold uppercase"
                    >
                      Validate & Register Sector
                    </button>
                  </form>
                )}
              </div>

              {/* Right Column: Map Inspector & 2D Topographic Preview */}
              {selectedMap && (
                <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                    <div>
                      <h2 className="text-sm font-bold font-mono text-white">{selectedMap.name}</h2>
                      <p className="text-xs font-mono text-slate-400">
                        ID: {selectedMap.id} · Updated by {selectedMap.updatedBy}
                      </p>
                    </div>
                    {hasPerm('maps.edit') && !selectedMap.isActiveMap && (
                      <button
                        onClick={() => handleActivateMap(selectedMap.id)}
                        className="px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-mono font-bold uppercase"
                      >
                        Activate on Live Battlefield
                      </button>
                    )}
                  </div>

                  {/* Topographic Preview Canvas */}
                  <div className="bg-slate-950 border border-slate-800 rounded p-3 flex flex-col items-center">
                    <div className="w-full flex justify-between text-[11px] font-mono text-slate-400 mb-2">
                      <span>DETERMINISTIC TOPOGRAPHIC & BASE SPAWN VERIFICATION</span>
                      <span className="tabular-nums">
                        SEED: {selectedMap.seed} ({selectedMap.width}x{selectedMap.height})
                      </span>
                    </div>
                    <canvas
                      ref={mapPreviewCanvasRef}
                      width={500}
                      height={375}
                      className="w-full max-w-[500px] rounded border border-slate-800"
                    />
                  </div>

                  <form onSubmit={handleSaveMap} className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
                    <div>
                      <label className="block text-slate-400 mb-1">Sector Name</label>
                      <input
                        type="text"
                        value={selectedMap.name}
                        onChange={(e) => setSelectedMap({ ...selectedMap, name: e.target.value })}
                        className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Procedural Seed</label>
                      <input
                        type="number"
                        value={selectedMap.seed}
                        onChange={(e) => setSelectedMap({ ...selectedMap, seed: Number(e.target.value) })}
                        className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-white tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Mission Objective Header</label>
                      <input
                        type="text"
                        value={selectedMap.objectiveTitle}
                        onChange={(e) => setSelectedMap({ ...selectedMap, objectiveTitle: e.target.value })}
                        className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Default Lighting Preset</label>
                      <select
                        value={selectedMap.atmospherePreset}
                        onChange={(e) => setSelectedMap({ ...selectedMap, atmospherePreset: e.target.value as any })}
                        className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-white"
                      >
                        <option value="daylight">Daylight</option>
                        <option value="golden_hour">Golden Hour</option>
                        <option value="overcast">Overcast</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-slate-400 mb-1">Objective Briefing</label>
                      <input
                        type="text"
                        value={selectedMap.objectiveDescription}
                        onChange={(e) => setSelectedMap({ ...selectedMap, objectiveDescription: e.target.value })}
                        className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-white"
                      />
                    </div>
                    <div className="sm:col-span-2 flex items-center justify-between pt-2">
                      <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedMap.enabled}
                          onChange={(e) => setSelectedMap({ ...selectedMap, enabled: e.target.checked })}
                        />
                        <span>Enabled in Map Rotation</span>
                      </label>
                      {hasPerm('maps.edit') && (
                        <button
                          type="submit"
                          className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold uppercase"
                        >
                          Save Map Configuration
                        </button>
                      )}
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}

          {/* ================================================================
              SECTION 7: UNITS & BUILDINGS CATALOG MANAGEMENT
             ================================================================ */}
          {activeSection === 'catalog' && catalogData && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded p-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCatalogTab('units')}
                    className={`px-3.5 py-1.5 rounded text-xs font-mono uppercase font-bold transition ${
                      catalogTab === 'units'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-950 text-slate-400 border border-slate-800'
                    }`}
                  >
                    Combat Units ({Object.keys(catalogData.units).length})
                  </button>
                  <button
                    onClick={() => setCatalogTab('buildings')}
                    className={`px-3.5 py-1.5 rounded text-xs font-mono uppercase font-bold transition ${
                      catalogTab === 'buildings'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-950 text-slate-400 border border-slate-800'
                    }`}
                  >
                    Base Facilities ({Object.keys(catalogData.buildings).length})
                  </button>
                </div>

                <div className="flex items-center gap-3 text-xs font-mono">
                  <span className="text-slate-400 tabular-nums">Catalog Version: v{catalogData.version}</span>
                  {hasPerm('content.publish') && (
                    <button
                      onClick={async () => {
                        try {
                          await apiFetch('/catalog/rollback', {
                            method: 'POST',
                            body: JSON.stringify({ reason: 'Restored default factory combat catalog' }),
                          });
                          showToast('success', 'Restored all units and buildings to default stats.');
                          refreshCurrentSection();
                        } catch (err: any) {
                          showToast('error', err.message);
                        }
                      }}
                      className="px-3 py-1.5 rounded bg-amber-950/70 hover:bg-amber-900 border border-amber-700/60 text-amber-300"
                    >
                      Reset All to Defaults
                    </button>
                  )}
                </div>
              </div>

              {catalogTab === 'units' ? (
                <div className="bg-slate-900 border border-slate-800 rounded overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs font-mono">
                      <thead>
                        <tr className="border-b border-slate-800 text-[11px] text-slate-400 bg-slate-950/60">
                          <th className="py-2.5 px-3">Unit Name</th>
                          <th className="py-2.5 px-3">Domain</th>
                          <th className="py-2.5 px-3 text-right">HP / Armor</th>
                          <th className="py-2.5 px-3 text-right">DMG / Range</th>
                          <th className="py-2.5 px-3 text-right">Speed / Train</th>
                          <th className="py-2.5 px-3 text-right">Cost (C/S/A/F)</th>
                          <th className="py-2.5 px-3 text-right">Status</th>
                          <th className="py-2.5 px-3 text-right">Edit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {Object.values(catalogData.units).map((u) => (
                          <tr key={u.type} className="hover:bg-slate-800/40">
                            <td className="py-2.5 px-3 font-semibold text-white">{u.name}</td>
                            <td className="py-2.5 px-3 uppercase text-cyan-400">{u.category}</td>
                            <td className="py-2.5 px-3 text-right tabular-nums text-emerald-400">
                              {u.maxHealth} HP / {u.armor}%
                            </td>
                            <td className="py-2.5 px-3 text-right tabular-nums text-amber-300">
                              {u.attackDamage} / {u.attackRange}c
                            </td>
                            <td className="py-2.5 px-3 text-right tabular-nums text-slate-300">
                              {u.speed} / {u.trainTimeSec}s
                            </td>
                            <td className="py-2.5 px-3 text-right tabular-nums text-slate-400">
                              {u.cost.concrete}/{u.cost.steel}/{u.cost.aluminum}/{u.cost.fuel}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <span className={u.enabled !== false ? 'text-emerald-400' : 'text-red-400'}>
                                {u.enabled !== false ? 'ENABLED' : 'DISABLED'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              {hasPerm('content.publish') && (
                                <button
                                  onClick={() => setEditingUnit(JSON.parse(JSON.stringify(u)))}
                                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700"
                                >
                                  Configure
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-900 border border-slate-800 rounded overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs font-mono">
                      <thead>
                        <tr className="border-b border-slate-800 text-[11px] text-slate-400 bg-slate-950/60">
                          <th className="py-2.5 px-3">Facility Name</th>
                          <th className="py-2.5 px-3">Category</th>
                          <th className="py-2.5 px-3 text-right">Build Time</th>
                          <th className="py-2.5 px-3 text-right">Max Level</th>
                          <th className="py-2.5 px-3 text-right">Cost (C/S/A/F)</th>
                          <th className="py-2.5 px-3 text-right">Status</th>
                          <th className="py-2.5 px-3 text-right">Edit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {Object.values(catalogData.buildings).map((b) => (
                          <tr key={b.type} className="hover:bg-slate-800/40">
                            <td className="py-2.5 px-3 font-semibold text-white">{b.name}</td>
                            <td className="py-2.5 px-3 uppercase text-cyan-400">{b.category}</td>
                            <td className="py-2.5 px-3 text-right tabular-nums text-slate-300">{b.buildTimeSec}s</td>
                            <td className="py-2.5 px-3 text-right tabular-nums text-slate-300">L{b.maxLevel}</td>
                            <td className="py-2.5 px-3 text-right tabular-nums text-slate-400">
                              {b.cost.concrete}/{b.cost.steel}/{b.cost.aluminum}/{b.cost.fuel}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <span className={b.enabled !== false ? 'text-emerald-400' : 'text-red-400'}>
                                {b.enabled !== false ? 'ENABLED' : 'DISABLED'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              {hasPerm('content.publish') && (
                                <button
                                  onClick={() => setEditingBuilding(JSON.parse(JSON.stringify(b)))}
                                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700"
                                >
                                  Configure
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Unit Balance Edit Modal */}
              {editingUnit && (
                <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
                  <form
                    onSubmit={handleSaveUnitOverride}
                    className="w-full max-w-xl bg-slate-900 border border-slate-700 rounded p-5 space-y-4 text-xs font-mono"
                  >
                    <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                      <h3 className="text-sm font-bold text-white uppercase">
                        Edit Unit Specification: {editingUnit.name}
                      </h3>
                      <button
                        type="button"
                        onClick={() => setEditingUnit(null)}
                        className="text-slate-400 hover:text-white"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">Max Health</label>
                        <input
                          type="number"
                          value={editingUnit.maxHealth}
                          onChange={(e) => setEditingUnit({ ...editingUnit, maxHealth: Number(e.target.value) })}
                          className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-white tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Attack Damage</label>
                        <input
                          type="number"
                          value={editingUnit.attackDamage}
                          onChange={(e) => setEditingUnit({ ...editingUnit, attackDamage: Number(e.target.value) })}
                          className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-white tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Armor (0-95%)</label>
                        <input
                          type="number"
                          value={editingUnit.armor}
                          onChange={(e) => setEditingUnit({ ...editingUnit, armor: Number(e.target.value) })}
                          className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-white tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Attack Range</label>
                        <input
                          type="number"
                          step="0.1"
                          value={editingUnit.attackRange}
                          onChange={(e) => setEditingUnit({ ...editingUnit, attackRange: Number(e.target.value) })}
                          className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-white tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Speed</label>
                        <input
                          type="number"
                          step="0.1"
                          value={editingUnit.speed}
                          onChange={(e) => setEditingUnit({ ...editingUnit, speed: Number(e.target.value) })}
                          className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-white tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Train Time (s)</label>
                        <input
                          type="number"
                          value={editingUnit.trainTimeSec}
                          onChange={(e) => setEditingUnit({ ...editingUnit, trainTimeSec: Number(e.target.value) })}
                          className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-white tabular-nums"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      {(['concrete', 'steel', 'aluminum', 'fuel'] as const).map((rk) => (
                        <div key={rk}>
                          <label className="block text-slate-400 capitalize mb-1">{rk}</label>
                          <input
                            type="number"
                            value={editingUnit.cost[rk]}
                            onChange={(e) =>
                              setEditingUnit({
                                ...editingUnit,
                                cost: { ...editingUnit.cost, [rk]: Number(e.target.value) },
                              })
                            }
                            className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-800 text-white tabular-nums"
                          />
                        </div>
                      ))}
                    </div>

                    <label className="flex items-center gap-2 text-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingUnit.enabled !== false}
                        onChange={(e) => setEditingUnit({ ...editingUnit, enabled: e.target.checked })}
                      />
                      <span>Unit Enabled for Production in Live Matches</span>
                    </label>

                    <input
                      type="text"
                      value={catalogReason}
                      onChange={(e) => setCatalogReason(e.target.value)}
                      placeholder="Reason for balance change..."
                      className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-white"
                      required
                    />

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setEditingUnit(null)}
                        className="px-3 py-1.5 rounded bg-slate-800 text-slate-300"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold uppercase"
                      >
                        Publish Unit Changes
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Building Edit Modal */}
              {editingBuilding && (
                <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
                  <form
                    onSubmit={handleSaveBuildingOverride}
                    className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded p-5 space-y-4 text-xs font-mono"
                  >
                    <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                      <h3 className="text-sm font-bold text-white uppercase">
                        Edit Facility Specification: {editingBuilding.name}
                      </h3>
                      <button
                        type="button"
                        onClick={() => setEditingBuilding(null)}
                        className="text-slate-400 hover:text-white"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">Build Time (s)</label>
                        <input
                          type="number"
                          value={editingBuilding.buildTimeSec}
                          onChange={(e) =>
                            setEditingBuilding({ ...editingBuilding, buildTimeSec: Number(e.target.value) })
                          }
                          className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-white tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Max Level (1-20)</label>
                        <input
                          type="number"
                          value={editingBuilding.maxLevel}
                          onChange={(e) => setEditingBuilding({ ...editingBuilding, maxLevel: Number(e.target.value) })}
                          className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-white tabular-nums"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      {(['concrete', 'steel', 'aluminum', 'fuel'] as const).map((rk) => (
                        <div key={rk}>
                          <label className="block text-slate-400 capitalize mb-1">{rk}</label>
                          <input
                            type="number"
                            value={editingBuilding.cost[rk]}
                            onChange={(e) =>
                              setEditingBuilding({
                                ...editingBuilding,
                                cost: { ...editingBuilding.cost, [rk]: Number(e.target.value) },
                              })
                            }
                            className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-800 text-white tabular-nums"
                          />
                        </div>
                      ))}
                    </div>

                    <label className="flex items-center gap-2 text-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingBuilding.enabled !== false}
                        onChange={(e) => setEditingBuilding({ ...editingBuilding, enabled: e.target.checked })}
                      />
                      <span>Facility Enabled for Construction</span>
                    </label>

                    <input
                      type="text"
                      value={catalogReason}
                      onChange={(e) => setCatalogReason(e.target.value)}
                      placeholder="Reason for facility balance change..."
                      className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-white"
                      required
                    />

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setEditingBuilding(null)}
                        className="px-3 py-1.5 rounded bg-slate-800 text-slate-300"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold uppercase"
                      >
                        Publish Facility Changes
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}

          {/* ================================================================
              SECTION 8: ANNOUNCEMENTS & BROADCAST NOTIFICATIONS
             ================================================================ */}
          {activeSection === 'announcements' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {hasPerm('announcements.manage') && (
                <form
                  onSubmit={handleCreateAnnouncement}
                  className="bg-slate-900 border border-slate-800 rounded p-5 space-y-4 text-xs font-mono"
                >
                  <h2 className="text-sm font-bold uppercase text-white border-b border-slate-800 pb-2">
                    Broadcast New Announcement
                  </h2>
                  <div>
                    <label className="block text-slate-400 mb-1">Headline</label>
                    <input
                      type="text"
                      value={annTitle}
                      onChange={(e) => setAnnTitle(e.target.value)}
                      placeholder="SERVER MAINTENANCE NOTICE"
                      className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Priority Level</label>
                    <select
                      value={annPriority}
                      onChange={(e) => setAnnPriority(e.target.value as AnnouncementPriority)}
                      className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-white"
                    >
                      <option value="info">INFO — Standard Bulletin</option>
                      <option value="warning">WARNING — Operational Advisory</option>
                      <option value="critical">CRITICAL — Emergency Directive</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Broadcast Message (Sanitized Plain Text)</label>
                    <textarea
                      rows={4}
                      value={annMessage}
                      onChange={(e) => setAnnMessage(e.target.value)}
                      placeholder="Enter message to broadcast to all online commanders..."
                      className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-white"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold uppercase flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Publish & Broadcast Live</span>
                  </button>
                </form>
              )}

              <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded p-5 space-y-3">
                <h2 className="text-xs font-mono uppercase font-bold text-slate-200 border-b border-slate-800 pb-2">
                  Active & Historical Announcements ({announcements.length})
                </h2>
                <div className="space-y-2.5 font-mono text-xs">
                  {announcements.map((a) => (
                    <div
                      key={a.id}
                      className="p-3.5 bg-slate-950 border border-slate-800 rounded flex items-start justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`uppercase font-bold ${
                              a.priority === 'critical'
                                ? 'text-red-400'
                                : a.priority === 'warning'
                                ? 'text-amber-400'
                                : 'text-cyan-400'
                            }`}
                          >
                            [{a.priority}]
                          </span>
                          <span className="font-bold text-white">{a.title}</span>
                          <span className={a.published ? 'text-emerald-400 text-[10px]' : 'text-slate-500 text-[10px]'}>
                            {a.published ? '(PUBLISHED)' : '(UNPUBLISHED)'}
                          </span>
                        </div>
                        <p className="text-slate-300">{a.message}</p>
                        <div className="text-[10px] text-slate-500 tabular-nums">
                          Created by {a.createdByUsername} · {new Date(a.createdAt).toLocaleString()}
                        </div>
                      </div>

                      {hasPerm('announcements.manage') && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => handleToggleAnnouncement(a)}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                          >
                            {a.published ? 'Unpublish' : 'Publish'}
                          </button>
                          <button
                            onClick={() => handleDeleteAnnouncement(a.id)}
                            className="p-1.5 rounded bg-red-950/60 hover:bg-red-900 text-red-300 border border-red-800/60"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              SECTION 9: ANALYTICS & TELEMETRY
             ================================================================ */}
          {activeSection === 'analytics' && overviewData && (
            <div className="space-y-6 font-mono text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Global Resource Stockpiles */}
                <div className="bg-slate-900 border border-slate-800 rounded p-5 space-y-4">
                  <h3 className="uppercase font-bold text-slate-200 border-b border-slate-800 pb-2">
                    Total Theater Resource Circulation (All Bases)
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(overviewData.economySummary.totalResourcesInWorld).map(([resName, val]: any) => (
                      <div key={resName} className="p-3 bg-slate-950 border border-slate-800 rounded">
                        <div className="text-slate-400 uppercase">{resName}</div>
                        <div className="text-lg font-bold text-white tabular-nums mt-1">
                          {Number(val).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Active Unit Force Distribution */}
                <div className="bg-slate-900 border border-slate-800 rounded p-5 space-y-4">
                  <h3 className="uppercase font-bold text-slate-200 border-b border-slate-800 pb-2">
                    Active Force Composition by Unit Class
                  </h3>
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {Object.entries(overviewData.unitBreakdown).map(([uType, count]: any) => {
                      const pct = Math.round((Number(count) / Math.max(1, overviewData.kpis.totalUnitsActive)) * 100);
                      return (
                        <div key={uType} className="space-y-1">
                          <div className="flex justify-between">
                            <span className="text-slate-200">{uType}</span>
                            <span className="tabular-nums text-cyan-400">
                              {count} units ({pct}%)
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-950 rounded overflow-hidden">
                            <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              SECTION 10: SECURITY & AUDIT LOGS
             ================================================================ */}
          {activeSection === 'audit_logs' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-900 border border-slate-800 rounded flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                  <Search className="w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={auditSearch}
                    onChange={(e) => {
                      setAuditSearch(e.target.value);
                      setAuditPage(1);
                    }}
                    placeholder="Filter audit trail by action, admin, target ID, or reason..."
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-white"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={auditTargetFilter}
                    onChange={(e) => {
                      setAuditTargetFilter(e.target.value);
                      setAuditPage(1);
                    }}
                    className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200"
                  >
                    <option value="all">All Domains</option>
                    <option value="player">Player Moderation</option>
                    <option value="economy">Economy</option>
                    <option value="catalog">Catalog</option>
                    <option value="match">Matches</option>
                    <option value="map">Maps</option>
                    <option value="announcement">Announcements</option>
                    <option value="admin">Admin RBAC</option>
                    <option value="auth">Authentication</option>
                  </select>

                  <select
                    value={auditStatusFilter}
                    onChange={(e) => {
                      setAuditStatusFilter(e.target.value);
                      setAuditPage(1);
                    }}
                    className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200"
                  >
                    <option value="all">All Outcomes</option>
                    <option value="success">Success</option>
                    <option value="denied">Denied (403)</option>
                    <option value="failure">Failure (401)</option>
                  </select>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs font-mono">
                    <thead>
                      <tr className="border-b border-slate-800 text-[11px] text-slate-400 bg-slate-950/60">
                        <th className="py-2.5 px-3">Timestamp</th>
                        <th className="py-2.5 px-3">Administrator</th>
                        <th className="py-2.5 px-3">Role</th>
                        <th className="py-2.5 px-3">Action</th>
                        <th className="py-2.5 px-3">Target</th>
                        <th className="py-2.5 px-3">Reason</th>
                        <th className="py-2.5 px-3 text-right">IP</th>
                        <th className="py-2.5 px-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {auditLogsData.items.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-800/40">
                          <td className="py-2 px-3 tabular-nums text-slate-400 whitespace-nowrap">
                            {new Date(log.timestamp).toLocaleString()}
                          </td>
                          <td className="py-2 px-3 font-semibold text-white">{log.adminUsername}</td>
                          <td className="py-2 px-3 text-slate-400">{log.adminRole}</td>
                          <td className="py-2 px-3 text-cyan-300">{log.action}</td>
                          <td className="py-2 px-3 text-slate-300">
                            {log.targetType}:{log.targetId}
                          </td>
                          <td className="py-2 px-3 text-slate-300 max-w-xs truncate" title={log.reason}>
                            {log.reason}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums text-slate-500">{log.ipAddress}</td>
                          <td className="py-2 px-3 text-right">
                            <span
                              className={
                                log.status === 'success'
                                  ? 'text-emerald-400'
                                  : log.status === 'denied'
                                  ? 'text-amber-400 font-bold'
                                  : 'text-red-400 font-bold'
                              }
                            >
                              {log.status.toUpperCase()}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              SECTION 11: ADMINISTRATORS & RBAC MANAGEMENT (SUPER_ADMIN)
             ================================================================ */}
          {activeSection === 'administrators' && adminsData && (
            <div className="space-y-6 font-mono text-xs">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Role Assignment Form */}
                <form
                  onSubmit={handleUpdateAdminRole}
                  className="bg-slate-900 border border-slate-800 rounded p-5 space-y-4"
                >
                  <h3 className="text-sm font-bold uppercase text-white border-b border-slate-800 pb-2">
                    Assign / Modify Administrator Role
                  </h3>
                  <div>
                    <label className="block text-slate-400 mb-1">Select Account</label>
                    <select
                      value={roleTargetUserId}
                      onChange={(e) => setRoleTargetUserId(e.target.value)}
                      className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-white"
                      required
                    >
                      <option value="">-- Choose Account --</option>
                      {playersData.items.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.username} ({u.adminRole || 'player'})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Target RBAC Role</label>
                    <select
                      value={roleTargetNewRole}
                      onChange={(e) => setRoleTargetNewRole(e.target.value as any)}
                      className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-white"
                    >
                      <option value="super_admin">super_admin (Full Control)</option>
                      <option value="game_admin">game_admin (Economy, Maps, Matches)</option>
                      <option value="moderator">moderator (Player Moderation & Announcements)</option>
                      <option value="analyst">analyst (Read-Only Telemetry & Audit)</option>
                      <option value="none">Revoke Admin Privileges (Standard Player)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Authorization Reason</label>
                    <input
                      type="text"
                      value={roleChangeReason}
                      onChange={(e) => setRoleChangeReason(e.target.value)}
                      placeholder="Mandatory audit reason..."
                      className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-white"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold uppercase"
                  >
                    Update Role Clearance
                  </button>
                </form>

                {/* Active Administrators & Sessions */}
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-slate-900 border border-slate-800 rounded overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-800 font-bold uppercase text-slate-200">
                      Authorized Staff Accounts ({adminsData.administrators.length})
                    </div>
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 text-[11px] text-slate-400 bg-slate-950/60">
                          <th className="py-2 px-3">Callsign</th>
                          <th className="py-2 px-3">Email</th>
                          <th className="py-2 px-3">Assigned Role</th>
                          <th className="py-2 px-3 text-right">Permissions Count</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {adminsData.administrators.map((a) => (
                          <tr key={a.id}>
                            <td className="py-2 px-3 font-bold text-white">{a.username}</td>
                            <td className="py-2 px-3 text-slate-400">{a.email}</td>
                            <td className="py-2 px-3 text-cyan-400">{a.adminRole}</td>
                            <td className="py-2 px-3 text-right tabular-nums text-slate-300">
                              {(ROLE_PERMISSIONS[a.adminRole as AdminRole] || []).length} permissions
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-800 font-bold uppercase text-slate-200">
                      Active Admin Sessions ({adminsData.activeSessions.length})
                    </div>
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 text-[11px] text-slate-400 bg-slate-950/60">
                          <th className="py-2 px-3">Token Prefix</th>
                          <th className="py-2 px-3">Admin</th>
                          <th className="py-2 px-3">Role</th>
                          <th className="py-2 px-3 text-right">Expires At</th>
                          <th className="py-2 px-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {adminsData.activeSessions.map((s) => (
                          <tr key={s.tokenPrefix}>
                            <td className="py-2 px-3 text-slate-400">{s.tokenPrefix}</td>
                            <td className="py-2 px-3 text-white">{s.username}</td>
                            <td className="py-2 px-3 text-cyan-400">{s.role}</td>
                            <td className="py-2 px-3 text-right tabular-nums text-slate-400">
                              {new Date(s.expiresAt).toLocaleTimeString()}
                            </td>
                            <td className="py-2 px-3 text-right">
                              <button
                                onClick={async () => {
                                  await apiFetch(`/administrators/sessions/${encodeURIComponent(s.tokenPrefix)}`, {
                                    method: 'DELETE',
                                  });
                                  showToast('success', 'Session token revoked.');
                                  refreshCurrentSection();
                                }}
                                className="px-2 py-0.5 rounded bg-red-950/60 border border-red-800 text-red-300"
                              >
                                Revoke
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              SECTION 12: SYSTEM SETTINGS & FEATURE FLAGS
             ================================================================ */}
          {activeSection === 'settings' && settingsDraft && (
            <form
              onSubmit={handleSaveSettings}
              className="max-w-3xl bg-slate-900 border border-slate-800 rounded p-6 space-y-5 font-mono text-xs"
            >
              <div className="border-b border-slate-800 pb-3">
                <h2 className="text-sm font-bold uppercase text-white">
                  Global Server Operational Settings & Feature Flags
                </h2>
                <p className="text-slate-400 mt-0.5">
                  Last modified by {settingsDraft.updatedBy} at {new Date(settingsDraft.updatedAt).toLocaleString()}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1">Server Deployment Title</label>
                  <input
                    type="text"
                    value={settingsDraft.gameTitle}
                    onChange={(e) => setSettingsDraft({ ...settingsDraft, gameTitle: e.target.value })}
                    className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Admin Session TTL (ms)</label>
                  <input
                    type="number"
                    value={settingsDraft.sessionTtlMs}
                    onChange={(e) => setSettingsDraft({ ...settingsDraft, sessionTtlMs: Number(e.target.value) })}
                    className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-white tabular-nums"
                  />
                </div>
              </div>

              <div className="space-y-2.5 pt-2 border-t border-slate-800">
                <label className="flex items-center gap-2.5 text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settingsDraft.maintenanceMode}
                    onChange={(e) => setSettingsDraft({ ...settingsDraft, maintenanceMode: e.target.checked })}
                  />
                  <span className="font-bold text-amber-400">
                    ENABLE SERVER MAINTENANCE MODE (Pauses 10Hz combat tick & blocks non-admin commands)
                  </span>
                </label>

                <label className="flex items-center gap-2.5 text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settingsDraft.aiAggressionEnabled}
                    onChange={(e) => setSettingsDraft({ ...settingsDraft, aiAggressionEnabled: e.target.checked })}
                  />
                  <span>Enable Kodiak PMC Autonomous AI Commander Decisions</span>
                </label>

                <label className="flex items-center gap-2.5 text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settingsDraft.alliancesEnabled}
                    onChange={(e) => setSettingsDraft({ ...settingsDraft, alliancesEnabled: e.target.checked })}
                  />
                  <span>Enable Player Coalition / Alliance System</span>
                </label>

                <label className="flex items-center gap-2.5 text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settingsDraft.allowNewRegistrations}
                    onChange={(e) => setSettingsDraft({ ...settingsDraft, allowNewRegistrations: e.target.checked })}
                  />
                  <span>Allow New Commander Account Registrations</span>
                </label>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Maintenance Banner Message</label>
                <input
                  type="text"
                  value={settingsDraft.maintenanceMessage}
                  onChange={(e) => setSettingsDraft({ ...settingsDraft, maintenanceMessage: e.target.value })}
                  className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-white"
                />
              </div>

              <div className="flex items-center gap-3 pt-2 border-t border-slate-800">
                <input
                  type="text"
                  value={settingsReason}
                  onChange={(e) => setSettingsReason(e.target.value)}
                  placeholder="Reason for operational settings update..."
                  className="flex-1 px-3 py-2 rounded bg-slate-950 border border-slate-800 text-white"
                  required
                />
                <button
                  type="submit"
                  disabled={!hasPerm('economy.edit')}
                  className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold uppercase"
                >
                  Apply Settings
                </button>
              </div>
            </form>
          )}
        </main>
      </div>

      {/* ====================================================================
          CONFIRMATION MODAL FOR PLAYER MODERATION ACTIONS
         ==================================================================== */}
      {modModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <form
            onSubmit={handleExecuteModeration}
            className="w-full max-w-md bg-slate-900 border border-slate-700 rounded p-5 space-y-4 font-mono text-xs shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold uppercase text-white">
                Confirm Action: {modModal.action.toUpperCase()}
              </h3>
              <button type="button" onClick={() => setModModal(null)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <div className="text-slate-300">
              Target Commander: <span className="font-bold text-white">{modModal.player.username}</span> (
              {modModal.player.id})
            </div>

            {modModal.action === 'suspend' && (
              <div>
                <label className="block text-slate-400 mb-1">Suspension Duration (Minutes)</label>
                <input
                  type="number"
                  min="1"
                  max="525600"
                  value={modDurationMins}
                  onChange={(e) => setModDurationMins(Number(e.target.value))}
                  className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-white tabular-nums"
                  required
                />
              </div>
            )}

            {modModal.action === 'rename' && (
              <div>
                <label className="block text-slate-400 mb-1">New Commander Callsign</label>
                <input
                  type="text"
                  value={modNewUsername}
                  onChange={(e) => setModNewUsername(e.target.value)}
                  className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-white"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-slate-400 mb-1">Mandatory Audit Reason (Min 3 chars)</label>
              <textarea
                rows={3}
                value={modReason}
                onChange={(e) => setModReason(e.target.value)}
                placeholder="Document specific violation or operational justification..."
                className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-white"
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModModal(null)}
                className="px-3 py-1.5 rounded bg-slate-800 text-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white font-bold uppercase"
              >
                Confirm & Execute
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ====================================================================
          CONFIRMATION MODAL FOR DELETE ALL ACCOUNTS
         ==================================================================== */}
      {showDeleteAllModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <form
            onSubmit={handleDeleteAllAccounts}
            className="w-full max-w-md bg-slate-900 border border-red-700/80 rounded p-5 space-y-4 font-mono text-xs shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold uppercase text-red-400 flex items-center gap-2">
                <Trash2 className="w-4 h-4" />
                <span>Confirm Purge: Delete All Accounts</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowDeleteAllModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-3 rounded bg-red-950/40 border border-red-800/60 text-red-200 leading-relaxed">
              This will permanently delete all registered human/unknown player accounts, revoke all player sessions,
              disband all player alliances, remove all player-owned combat units, and neutralize/remove all player
              bases across all sectors. AI Bot agents (Kodiak PMC) and System world entities will be preserved.
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Mandatory Audit Reason</label>
              <textarea
                rows={2}
                value={deleteAllReason}
                onChange={(e) => setDeleteAllReason(e.target.value)}
                placeholder="Reason for purging all player accounts..."
                className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-white"
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteAllModal(false)}
                className="px-3 py-1.5 rounded bg-slate-800 text-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white font-bold uppercase"
              >
                Delete All Accounts
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
