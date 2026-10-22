import {
  bigint,
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

// 1. Users table (stores both Firebase UID / internal userId, credentials, and full PlayerProfile JSON)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  username: text('username').notNull(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  profileJson: jsonb('profile_json').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});

// 2. Sessions table (stores player and admin session tokens durably)
export const sessions = pgTable('sessions', {
  token: text('token').primaryKey(),
  userId: text('user_id').notNull(),
  role: text('role'),
  sessionJson: jsonb('session_json'),
  expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
});

// 3. Maps table (stores multi-map configurations, seeds, highway exits, and environmental props)
export const maps = pgTable('maps', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  seed: integer('seed').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  isActiveMap: boolean('is_active_map').notNull().default(true),
  configJson: jsonb('config_json').notNull(),
  envObjectsJson: jsonb('env_objects_json').notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});

// 4. Bases table (isolated by mapId, with full Base state & resources)
export const bases = pgTable('bases', {
  id: text('id').primaryKey(),
  mapId: text('map_id').notNull(),
  ownerId: text('owner_id').notNull(),
  allianceId: text('alliance_id'),
  x: integer('x').notNull(),
  y: integer('y').notNull(),
  baseJson: jsonb('base_json').notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});

// 5. Units table (isolated by mapId, with full Unit state & coordinates)
export const units = pgTable('units', {
  id: text('id').primaryKey(),
  mapId: text('map_id').notNull(),
  ownerId: text('owner_id').notNull(),
  allianceId: text('alliance_id'),
  x: doublePrecision('x').notNull(),
  y: doublePrecision('y').notNull(),
  unitJson: jsonb('unit_json').notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});

// 6. Alliances table (full roster, roles, join requests, invites, activity logs)
export const alliances = pgTable('alliances', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  tag: text('tag').notNull(),
  leaderId: text('leader_id').notNull(),
  allianceJson: jsonb('alliance_json').notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});

// 7. Chat messages table
export const chatMessages = pgTable('chat_messages', {
  id: text('id').primaryKey(),
  mapId: text('map_id').notNull().default('map_riverfront_assault'),
  channel: text('channel').notNull(),
  senderId: text('sender_id').notNull(),
  allianceId: text('alliance_id'),
  messageJson: jsonb('message_json').notNull(),
  timestamp: bigint('timestamp', { mode: 'number' }).notNull(),
});

// 8. Battle & Siege Reports table
export const battleReports = pgTable('battle_reports', {
  id: text('id').primaryKey(),
  mapId: text('map_id').notNull(),
  attackerId: text('attacker_id').notNull(),
  defenderId: text('defender_id').notNull(),
  baseId: text('base_id'),
  reportType: text('report_type').notNull(),
  reportJson: jsonb('report_json').notNull(),
  timestamp: bigint('timestamp', { mode: 'number' }).notNull(),
});

// 9. System Key-Value Store (economyConfig, catalogState, systemSettings, configHistory, announcements, auditLogs, matches, fogOfWar)
export const systemKv = pgTable('system_kv', {
  key: text('key').primaryKey(),
  valueJson: jsonb('value_json').notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});
