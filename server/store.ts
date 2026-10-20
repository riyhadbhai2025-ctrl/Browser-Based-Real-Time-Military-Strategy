import fs from 'fs';
import path from 'path';
import { Alliance, Base, ChatMessage, EnvironmentObject, GameNotification, PlayerProfile, Unit } from '../src/types/game';
import { generateWorld } from '../src/game/mapGenerator';

export interface PersistentData {
  users: Record<string, { passwordHash: string; profile: PlayerProfile }>;
  bases: Base[];
  units: Unit[];
  alliances: Alliance[];
  chat: ChatMessage[];
  notifications: GameNotification[];
  envObjects: EnvironmentObject[];
  worldSeed: number;
  lastTickTime: number;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'gamestate.json');

export class GameStore {
  private data: PersistentData;

  constructor() {
    this.data = this.loadOrInit();
  }

  private loadOrInit(): PersistentData {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(DATA_FILE)) {
      try {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (!parsed.envObjects || parsed.envObjects.length === 0) {
          const gen = generateWorld({ width: 100, height: 75, tileSize: 44, seed: parsed.worldSeed || 202610 });
          parsed.envObjects = gen.envObjects;
        }
        console.log(`[Store] Loaded persistent game state with ${parsed.bases?.length || 0} bases and ${parsed.units?.length || 0} units.`);
        return parsed;
      } catch (e) {
        console.error('[Store] Failed to read existing state, re-initializing', e);
      }
    }

    return this.createNewWorld();
  }

  public createNewWorld(seed: number = 202610): PersistentData {
    const { bases, envObjects } = generateWorld({ width: 100, height: 75, tileSize: 40, seed });

    // Starter units for initial player
    const initialUnits: Unit[] = [
      {
        id: 'unit_vanguard_1',
        type: 'vanguard_scout',
        ownerId: 'player_default',
        ownerName: 'Commander',
        allianceId: 'alli_dominion',
        x: 16,
        y: 28,
        rotation: 0,
        health: 280,
        maxHealth: 280,
        command: 'idle',
        path: [],
        lastAttackTime: 0,
        kills: 0,
        homeBaseId: 'base_alpha_home',
      },
      {
        id: 'unit_titan_1',
        type: 'titan_mbt',
        ownerId: 'player_default',
        ownerName: 'Commander',
        allianceId: 'alli_dominion',
        x: 17,
        y: 29,
        rotation: 0,
        health: 1100,
        maxHealth: 1100,
        command: 'idle',
        path: [],
        lastAttackTime: 0,
        kills: 0,
        homeBaseId: 'base_alpha_home',
      },
      {
        id: 'unit_ironclad_1',
        type: 'ironclad_apc',
        ownerId: 'player_default',
        ownerName: 'Commander',
        allianceId: 'alli_dominion',
        x: 17,
        y: 27,
        rotation: 0,
        health: 650,
        maxHealth: 650,
        command: 'idle',
        path: [],
        lastAttackTime: 0,
        kills: 0,
        homeBaseId: 'base_alpha_home',
      },
      {
        id: 'unit_dominator_1',
        type: 'dominator_conquest',
        ownerId: 'player_default',
        ownerName: 'Commander',
        allianceId: 'alli_dominion',
        x: 15,
        y: 30,
        rotation: 0,
        health: 900,
        maxHealth: 900,
        command: 'idle',
        path: [],
        lastAttackTime: 0,
        kills: 0,
        homeBaseId: 'base_alpha_home',
      },
      // Insurgent enemy patrol units
      {
        id: 'unit_enemy_titan_1',
        type: 'titan_mbt',
        ownerId: 'enemy_insurgent',
        ownerName: 'Kodiak PMC',
        x: 68,
        y: 22,
        rotation: Math.PI,
        health: 1100,
        maxHealth: 1100,
        command: 'patrol',
        path: [],
        lastAttackTime: 0,
        kills: 0,
        homeBaseId: 'base_enemy_stronghold',
      },
      {
        id: 'unit_enemy_cobra_1',
        type: 'cobra_gunship',
        ownerId: 'enemy_insurgent',
        ownerName: 'Kodiak PMC',
        x: 72,
        y: 21,
        rotation: Math.PI,
        health: 680,
        maxHealth: 680,
        command: 'idle',
        path: [],
        lastAttackTime: 0,
        kills: 0,
        homeBaseId: 'base_enemy_stronghold',
      },
    ];

    const initialAlliances: Alliance[] = [
      {
        id: 'alli_dominion',
        name: 'Dominion Vanguard',
        tag: 'DOM',
        description: 'Elite unified coalition defending frontline sectors and tactical logistics.',
        leaderId: 'player_default',
        leaderName: 'Commander',
        memberIds: ['player_default'],
        bannerColor: '#2563eb', // Blue
        createdTime: Date.now(),
        score: 1450,
        territoryBasesCount: 2,
      },
      {
        id: 'alli_kodiak',
        name: 'Kodiak Syndicate',
        tag: 'KOD',
        description: 'Hostile PMC cartel seizing unmonitored oil infrastructure and weapon caches.',
        leaderId: 'enemy_insurgent',
        leaderName: 'Warlord Vance',
        memberIds: ['enemy_insurgent'],
        bannerColor: '#dc2626', // Red
        createdTime: Date.now(),
        score: 1800,
        territoryBasesCount: 1,
      },
    ];

    const initialChat: ChatMessage[] = [
      {
        id: 'chat_init_1',
        senderId: 'system',
        senderName: 'HQ Tactical Net',
        channel: 'system',
        content: 'Frontline Dominion operational network initialized. Welcome, Commander.',
        timestamp: Date.now() - 3600000,
      },
      {
        id: 'chat_init_2',
        senderId: 'player_default',
        senderName: 'Commander',
        allianceTag: 'DOM',
        channel: 'global',
        content: 'All units report in. Fortifying Sector Alpha perimeter.',
        coords: { x: 14, y: 28 },
        timestamp: Date.now() - 1800000,
      },
    ];

    const initialNotifications: GameNotification[] = [
      {
        id: 'notif_init_1',
        userId: 'player_default',
        type: 'system',
        title: 'Command Briefing Available',
        message: 'Review tactical map and queue vehicle production at Iron Forge Redoubt.',
        coords: { x: 14, y: 28 },
        timestamp: Date.now(),
        read: false,
      },
    ];

    const defaultProfile: PlayerProfile = {
      id: 'player_default',
      username: 'Commander',
      email: 'commander@frontline.mil',
      rank: 'Major General',
      score: 1450,
      level: 4,
      avatar: 'tank_commander',
      allianceId: 'alli_dominion',
      allianceRole: 'leader',
      homeBaseId: 'base_alpha_home',
      totalBasesCaptured: 2,
      totalUnitsProduced: 18,
      totalUnitsDestroyed: 9,
      totalResourcesHarvested: 42000,
      joinedAt: Date.now() - 86400000 * 3,
      lastLoginAt: Date.now(),
      beginnerProtectionUntil: Date.now() + 86400000 * 2,
      isAdmin: true,
    };

    const newData: PersistentData = {
      users: {
        player_default: {
          passwordHash: '$2a$10$wE9iK8v9vPj1OQ3r5kUa2edqZqZkL2KxYpP9o4kL1fJz6mNq2u8a', // hashed 'admin123'
          profile: defaultProfile,
        },
      },
      bases,
      units: initialUnits,
      alliances: initialAlliances,
      chat: initialChat,
      notifications: initialNotifications,
      envObjects,
      worldSeed: seed,
      lastTickTime: Date.now(),
    };

    this.saveData(newData);
    return newData;
  }

  public getData(): PersistentData {
    return this.data;
  }

  public saveData(dataToSave?: PersistentData) {
    if (dataToSave) {
      this.data = dataToSave;
    }
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (e) {
      console.error('[Store] Error persisting state to file', e);
    }
  }
}

export const gameStore = new GameStore();
