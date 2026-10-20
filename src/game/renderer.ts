import { Base, CombatEvent, TerrainType, Unit, UnitType } from '../types/game';
import { UNIT_CATALOG } from './catalog';

export interface VisualEffect {
  id: string;
  type: 'explosion' | 'tracer' | 'missile' | 'flak' | 'smoke' | 'damage_text';
  x: number;
  y: number;
  targetX?: number;
  targetY?: number;
  progress: number; // 0 to 1
  durationMs: number;
  startTime: number;
  color?: string;
  size?: number;
  text?: string;
}

export class TacticalRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private terrain: TerrainType[][] = [];
  private bases: Base[] = [];
  private units: Unit[] = [];
  private effects: VisualEffect[] = [];
  private currentUserId: string = 'player_default';
  private userAllianceId: string | null = 'alli_dominion';

  // Camera state
  public cameraX: number = 20; // world cell
  public cameraY: number = 30; // world cell
  public zoom: number = 1.0; // 0.5 to 2.2
  private tileSize: number = 40;

  // Selection
  public selectedUnitIds: Set<string> = new Set();
  public selectedBaseId: string | null = null;
  public selectionBox: { startX: number; startY: number; currentX: number; currentY: number } | null = null;

  // Animation ticks
  private animFrameId: number | null = null;
  private rotorAngle: number = 0;
  private radarAngle: number = 0;
  private waterOffset: number = 0;

  // Fog of war
  public fogEnabled: boolean = true;
  private exploredCells: Uint8Array | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Could not get 2D canvas context');
    this.ctx = ctx;
  }

  public setTerrain(terrain: TerrainType[][]) {
    this.terrain = terrain;
    const h = terrain.length;
    const w = terrain[0]?.length || 0;
    this.exploredCells = new Uint8Array(w * h);
  }

  public updateWorld(bases: Base[], units: Unit[], userId: string, allianceId?: string | null) {
    this.bases = bases;
    this.units = units;
    this.currentUserId = userId;
    this.userAllianceId = allianceId || null;

    // Update fog of war exploration based on player & allied vision
    if (this.terrain.length > 0 && this.exploredCells) {
      const w = this.terrain[0].length;
      const h = this.terrain.length;

      // Vision from friendly bases
      bases.forEach((b) => {
        if (b.ownerId === this.currentUserId || (this.userAllianceId && b.allianceId === this.userAllianceId)) {
          this.revealFogCircle(b.x, b.y, b.radius + 6, w, h);
        }
      });

      // Vision from friendly units
      units.forEach((u) => {
        if (u.ownerId === this.currentUserId || (this.userAllianceId && u.allianceId === this.userAllianceId)) {
          const def = UNIT_CATALOG[u.type];
          const vision = def?.visionRadius || 7;
          this.revealFogCircle(Math.round(u.x), Math.round(u.y), vision, w, h);
        }
      });
    }
  }

  private revealFogCircle(cx: number, cy: number, radius: number, w: number, h: number) {
    if (!this.exploredCells) return;
    const r2 = radius * radius;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= r2) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            this.exploredCells[ny * w + nx] = 1;
          }
        }
      }
    }
  }

  public isCellVisible(x: number, y: number): boolean {
    if (!this.fogEnabled || !this.exploredCells || this.terrain.length === 0) return true;
    const w = this.terrain[0].length;
    const h = this.terrain.length;
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (cx < 0 || cx >= w || cy < 0 || cy >= h) return false;
    return this.exploredCells[cy * w + cx] === 1;
  }

  public addCombatEvent(evt: CombatEvent) {
    // Add explosion or tracer visual
    const now = Date.now();
    this.effects.push({
      id: `fx_exp_${now}_${Math.random()}`,
      type: 'explosion',
      x: evt.x,
      y: evt.y,
      progress: 0,
      durationMs: 400,
      startTime: now,
      size: evt.isFatal ? 36 : 22,
    });

    // Floating damage text
    this.effects.push({
      id: `fx_txt_${now}_${Math.random()}`,
      type: 'damage_text',
      x: evt.x,
      y: evt.y,
      progress: 0,
      durationMs: 750,
      startTime: now,
      text: `-${evt.damage}`,
      color: evt.isFatal ? '#ef4444' : '#f59e0b',
    });
  }

  public startRenderLoop() {
    if (this.animFrameId) return;

    const loop = () => {
      this.render();
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  public stopRenderLoop() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  // World to Screen coordinate translation
  public worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const scale = this.tileSize * this.zoom;
    const screenCenterX = this.canvas.width / 2;
    const screenCenterY = this.canvas.height / 2;
    return {
      x: screenCenterX + (wx - this.cameraX) * scale,
      y: screenCenterY + (wy - this.cameraY) * scale,
    };
  }

  // Screen to World coordinate translation
  public screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const scale = this.tileSize * this.zoom;
    const screenCenterX = this.canvas.width / 2;
    const screenCenterY = this.canvas.height / 2;
    return {
      x: this.cameraX + (sx - screenCenterX) / scale,
      y: this.cameraY + (sy - screenCenterY) / scale,
    };
  }

  public render() {
    const ctx = this.ctx;
    const canvas = this.canvas;
    const width = canvas.width;
    const height = canvas.height;

    // Clear background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    if (this.terrain.length === 0) return;

    this.rotorAngle = (this.rotorAngle + 0.35) % (Math.PI * 2);
    this.radarAngle = (this.radarAngle + 0.05) % (Math.PI * 2);
    this.waterOffset = (this.waterOffset + 0.03) % (Math.PI * 2);

    const scale = this.tileSize * this.zoom;
    const screenCenterX = width / 2;
    const screenCenterY = height / 2;

    const startX = Math.max(0, Math.floor(this.cameraX - screenCenterX / scale - 1));
    const endX = Math.min(this.terrain[0].length, Math.ceil(this.cameraX + screenCenterX / scale + 1));
    const startY = Math.max(0, Math.floor(this.cameraY - screenCenterY / scale - 1));
    const endY = Math.min(this.terrain.length, Math.ceil(this.cameraY + screenCenterY / scale + 1));

    // 1. Draw Terrain Tiles
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const cell = this.terrain[y][x];
        const screenPos = this.worldToScreen(x, y);

        // Tile colors
        let fillColor = '#1e293b';
        if (cell === 'grass') fillColor = '#1e3a24';
        else if (cell === 'plains') fillColor = '#2d3728';
        else if (cell === 'forest') fillColor = '#142918';
        else if (cell === 'mountain') fillColor = '#475569';
        else if (cell === 'water') fillColor = '#0e3a53';
        else if (cell === 'deep_water') fillColor = '#082538';
        else if (cell === 'road') fillColor = '#334155';
        else if (cell === 'railway') fillColor = '#3f3f46';
        else if (cell === 'bridge_road') fillColor = '#475569';
        else if (cell === 'bridge_rail') fillColor = '#52525b';

        ctx.fillStyle = fillColor;
        ctx.fillRect(screenPos.x, screenPos.y, scale + 0.5, scale + 0.5);

        // Grid lines (subtle)
        if (this.zoom > 0.8) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
          ctx.lineWidth = 1;
          ctx.strokeRect(screenPos.x, screenPos.y, scale, scale);
        }

        // Draw terrain details
        if (cell === 'forest') {
          ctx.fillStyle = '#0f2412';
          ctx.beginPath();
          ctx.arc(screenPos.x + scale * 0.5, screenPos.y + scale * 0.5, scale * 0.35, 0, Math.PI * 2);
          ctx.fill();
        } else if (cell === 'mountain') {
          ctx.fillStyle = '#64748b';
          ctx.beginPath();
          ctx.moveTo(screenPos.x + scale * 0.5, screenPos.y + scale * 0.2);
          ctx.lineTo(screenPos.x + scale * 0.85, screenPos.y + scale * 0.8);
          ctx.lineTo(screenPos.x + scale * 0.15, screenPos.y + scale * 0.8);
          ctx.closePath();
          ctx.fill();
        } else if (cell === 'road' || cell === 'bridge_road') {
          ctx.fillStyle = '#e2e8f0';
          ctx.fillRect(screenPos.x + scale * 0.45, screenPos.y + scale * 0.2, scale * 0.1, scale * 0.6);
        } else if (cell === 'railway' || cell === 'bridge_rail') {
          // Rail tracks
          ctx.fillStyle = '#a1a1aa';
          ctx.fillRect(screenPos.x, screenPos.y + scale * 0.35, scale, scale * 0.08);
          ctx.fillRect(screenPos.x, screenPos.y + scale * 0.57, scale, scale * 0.08);
          // Ties
          ctx.fillStyle = '#71717a';
          for (let i = 0; i < 3; i++) {
            ctx.fillRect(screenPos.x + scale * (0.2 + i * 0.3), screenPos.y + scale * 0.25, scale * 0.1, scale * 0.5);
          }
        } else if (cell === 'water' || cell === 'deep_water') {
          // Water shimmering waves
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          const waveY = screenPos.y + scale * 0.5 + Math.sin(this.waterOffset + x * 0.5) * (scale * 0.15);
          ctx.moveTo(screenPos.x + scale * 0.2, waveY);
          ctx.lineTo(screenPos.x + scale * 0.8, waveY);
          ctx.stroke();
        }
      }
    }

    // 2. Draw Bases
    this.bases.forEach((base) => {
      const sPos = this.worldToScreen(base.x, base.y);
      const bRadius = base.radius * scale;

      // Base ownership color
      const isPlayer = base.ownerId === this.currentUserId;
      const isAllied = this.userAllianceId && base.allianceId === this.userAllianceId;
      const isEnemy = base.ownerId === 'enemy_insurgent' || (!isPlayer && !isAllied && base.ownerId !== 'neutral');

      const ownerColor = isPlayer ? '#3b82f6' : isAllied ? '#10b981' : isEnemy ? '#ef4444' : '#f59e0b';
      const isSelected = this.selectedBaseId === base.id;

      // Outer defense perimeter circle / compound wall
      ctx.save();
      ctx.strokeStyle = isSelected ? '#38bdf8' : ownerColor;
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.setLineDash([8, 4]);
      ctx.beginPath();
      ctx.arc(sPos.x, sPos.y, bRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Compound concrete courtyard
      ctx.fillStyle = isPlayer ? 'rgba(59, 130, 246, 0.12)' : isEnemy ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.08)';
      ctx.beginPath();
      ctx.arc(sPos.x, sPos.y, bRadius, 0, Math.PI * 2);
      ctx.fill();

      // Headquarters Central Fortification Structure
      const coreSize = scale * 1.6;
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = ownerColor;
      ctx.lineWidth = 2;
      ctx.fillRect(sPos.x - coreSize / 2, sPos.y - coreSize / 2, coreSize, coreSize);
      ctx.strokeRect(sPos.x - coreSize / 2, sPos.y - coreSize / 2, coreSize, coreSize);

      // Rotating base radar
      ctx.save();
      ctx.translate(sPos.x, sPos.y);
      ctx.rotate(this.radarAngle);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(coreSize * 0.6, 0);
      ctx.stroke();
      ctx.restore();

      // Base Nameplate and HP
      const hpPct = Math.max(0, base.health / base.maxHealth);
      const shieldPct = base.maxShield > 0 ? base.defenseShield / base.maxShield : 0;

      const barW = Math.max(70, scale * 2.2);
      const barH = 5;
      const barY = sPos.y - bRadius - 18;

      // HP Bar background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(sPos.x - barW / 2, barY, barW, barH);
      // HP Bar fill
      ctx.fillStyle = hpPct > 0.5 ? '#22c55e' : hpPct > 0.2 ? '#f59e0b' : '#ef4444';
      ctx.fillRect(sPos.x - barW / 2, barY, barW * hpPct, barH);

      // Shield bar
      if (base.maxShield > 0) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(sPos.x - barW / 2, barY - 6, barW, 4);
        ctx.fillStyle = '#06b6d4';
        ctx.fillRect(sPos.x - barW / 2, barY - 6, barW * shieldPct, 4);
      }

      // Base label text
      ctx.font = 'bold 11px Chakra Petch, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(base.name, sPos.x, barY - 8);

      // Capture progress bar if being contested
      if (base.captureProgress > 0) {
        const capPct = base.captureProgress / 100;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(sPos.x - barW / 2, barY + 7, barW, 7);
        ctx.fillStyle = '#f43f5e';
        ctx.fillRect(sPos.x - barW / 2, barY + 7, barW * capPct, 7);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px Chakra Petch, sans-serif';
        ctx.fillText(`CONQUEST: ${base.captureProgress}%`, sPos.x, barY + 14);
      }
    });

    // 3. Draw Units
    this.units.forEach((unit) => {
      // Check fog of war
      if (!this.isCellVisible(unit.x, unit.y)) {
        return;
      }

      const sPos = this.worldToScreen(unit.x, unit.y);
      const isPlayer = unit.ownerId === this.currentUserId;
      const isAllied = this.userAllianceId && unit.allianceId === this.userAllianceId;
      const isEnemy = unit.ownerId === 'enemy_insurgent' || (!isPlayer && !isAllied);
      const isSelected = this.selectedUnitIds.has(unit.id);

      const unitColor = isPlayer ? '#38bdf8' : isAllied ? '#34d399' : isEnemy ? '#f87171' : '#fbbf24';

      // Selection ring
      if (isSelected) {
        ctx.save();
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sPos.x, sPos.y, scale * 0.55, 0, Math.PI * 2);
        ctx.stroke();

        // Draw weapon range circle
        const def = UNIT_CATALOG[unit.type];
        if (def) {
          ctx.strokeStyle = 'rgba(34, 211, 238, 0.2)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(sPos.x, sPos.y, def.attackRange * scale, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Draw destination path line
        if (unit.path && unit.path.length > 0) {
          ctx.strokeStyle = 'rgba(34, 211, 238, 0.5)';
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(sPos.x, sPos.y);
          unit.path.forEach((p) => {
            const ps = this.worldToScreen(p.x, p.y);
            ctx.lineTo(ps.x, ps.y);
          });
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.restore();
      }

      // Draw custom vector unit sprite
      ctx.save();
      ctx.translate(sPos.x, sPos.y);
      ctx.rotate(unit.rotation);

      this.drawUnitSprite(ctx, unit.type, unitColor, scale);
      ctx.restore();

      // Unit health bar
      const def = UNIT_CATALOG[unit.type];
      const maxHp = def?.maxHealth || unit.maxHealth;
      const hpPct = Math.max(0, unit.health / maxHp);
      const uBarW = scale * 0.8;
      const uBarH = 3;
      const uBarY = sPos.y - scale * 0.55;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(sPos.x - uBarW / 2, uBarY, uBarW, uBarH);
      ctx.fillStyle = hpPct > 0.5 ? '#22c55e' : hpPct > 0.2 ? '#eab308' : '#ef4444';
      ctx.fillRect(sPos.x - uBarW / 2, uBarY, uBarW * hpPct, uBarH);
    });

    // 4. Draw Visual Effects (Explosions, Tracers, Damage Text)
    const now = Date.now();
    this.effects = this.effects.filter((fx) => now - fx.startTime < fx.durationMs);

    this.effects.forEach((fx) => {
      const elapsed = now - fx.startTime;
      fx.progress = elapsed / fx.durationMs;
      const sPos = this.worldToScreen(fx.x, fx.y);

      if (fx.type === 'explosion') {
        const rad = (fx.size || 24) * fx.progress;
        const alpha = Math.max(0, 1 - fx.progress);

        // Flash shockwave
        ctx.save();
        ctx.strokeStyle = `rgba(249, 115, 22, ${alpha})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(sPos.x, sPos.y, rad, 0, Math.PI * 2);
        ctx.stroke();

        // Fire center
        ctx.fillStyle = `rgba(253, 224, 71, ${alpha * 0.8})`;
        ctx.beginPath();
        ctx.arc(sPos.x, sPos.y, rad * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (fx.type === 'damage_text') {
        const floatY = sPos.y - 12 - fx.progress * 24;
        const alpha = Math.max(0, 1 - fx.progress * 0.8);
        ctx.save();
        ctx.font = 'bold 12px Chakra Petch, sans-serif';
        ctx.fillStyle = fx.color || '#ef4444';
        ctx.globalAlpha = alpha;
        ctx.textAlign = 'center';
        ctx.fillText(fx.text || '', sPos.x, floatY);
        ctx.restore();
      }
    });

    // 5. Draw Drag-Selection Box
    if (this.selectionBox) {
      const { startX, startY, currentX, currentY } = this.selectionBox;
      const left = Math.min(startX, currentX);
      const top = Math.min(startY, currentY);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);

      ctx.save();
      ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 2]);
      ctx.fillRect(left, top, width, height);
      ctx.strokeRect(left, top, width, height);
      ctx.restore();
    }
  }

  // Draw distinct original unit silhouettes
  private drawUnitSprite(ctx: CanvasRenderingContext2D, type: UnitType, color: string, scale: number) {
    const s = scale * 0.45;

    switch (type) {
      case 'titan_mbt': {
        // Tank tracks
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(-s * 0.9, -s * 0.8, s * 1.8, s * 0.35);
        ctx.fillRect(-s * 0.9, s * 0.45, s * 1.8, s * 0.35);
        // Hull
        ctx.fillStyle = color;
        ctx.fillRect(-s * 0.7, -s * 0.5, s * 1.4, s);
        // Turret & Cannon barrel
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(0, -s * 0.12, s * 1.4, s * 0.24); // Heavy Cannon
        break;
      }

      case 'vanguard_scout': {
        // Buggy tires
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(-s * 0.8, -s * 0.7, s * 0.4, s * 0.3);
        ctx.fillRect(s * 0.4, -s * 0.7, s * 0.4, s * 0.3);
        ctx.fillRect(-s * 0.8, s * 0.4, s * 0.4, s * 0.3);
        ctx.fillRect(s * 0.4, s * 0.4, s * 0.4, s * 0.3);
        // Fast sleek frame
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(s * 0.8, 0);
        ctx.lineTo(-s * 0.6, -s * 0.5);
        ctx.lineTo(-s * 0.6, s * 0.5);
        ctx.closePath();
        ctx.fill();
        break;
      }

      case 'goliath_howitzer': {
        // Heavy crawler
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(-s, -s * 0.8, s * 2, s * 1.6);
        ctx.fillStyle = color;
        ctx.fillRect(-s * 0.7, -s * 0.6, s * 1.4, s * 1.2);
        // Super long barrel
        ctx.fillStyle = '#334155';
        ctx.fillRect(0, -s * 0.15, s * 2.2, s * 0.3);
        break;
      }

      case 'skyguard_aa': {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(-s * 0.8, -s * 0.7, s * 1.6, s * 1.4);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.5, 0, Math.PI * 2);
        ctx.fill();
        // Quad Flak Barrels
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(0, -s * 0.4, s * 1.2, s * 0.12);
        ctx.fillRect(0, -s * 0.15, s * 1.2, s * 0.12);
        ctx.fillRect(0, s * 0.15, s * 1.2, s * 0.12);
        ctx.fillRect(0, s * 0.4, s * 1.2, s * 0.12);
        break;
      }

      case 'dominator_conquest': {
        // Heavy APC base
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(-s * 0.9, -s * 0.8, s * 1.8, s * 1.6);
        ctx.fillStyle = color;
        ctx.fillRect(-s * 0.7, -s * 0.6, s * 1.4, s * 1.2);
        // Glowing conquest antenna dish
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.2, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'hawk_scout_heli':
      case 'cobra_gunship': {
        // Fuselage
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 0.8, s * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
        // Tail boom
        ctx.fillStyle = '#334155';
        ctx.fillRect(-s * 1.4, -s * 0.08, s * 0.8, s * 0.16);
        // Spinning main rotor blades
        ctx.save();
        ctx.rotate(this.rotorAngle);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-s * 1.6, 0);
        ctx.lineTo(s * 1.6, 0);
        ctx.moveTo(0, -s * 1.6);
        ctx.lineTo(0, s * 1.6);
        ctx.stroke();
        ctx.restore();
        break;
      }

      case 'stormbringer_jet':
      case 'thunderbolt_bomber': {
        // Jet delta wings
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(s * 1.2, 0);
        ctx.lineTo(-s * 0.9, -s * 1.1);
        ctx.lineTo(-s * 0.5, 0);
        ctx.lineTo(-s * 0.9, s * 1.1);
        ctx.closePath();
        ctx.fill();
        // Cockpit
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.ellipse(s * 0.4, 0, s * 0.3, s * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();
        // Engine afterburner glow
        ctx.fillStyle = '#f97316';
        ctx.fillRect(-s * 0.8, -s * 0.15, s * 0.4, s * 0.3);
        break;
      }

      case 'wavecutter_corvette':
      case 'trident_destroyer': {
        // Ship hull
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(s * 1.5, 0);
        ctx.lineTo(-s * 1.2, -s * 0.5);
        ctx.lineTo(-s * 1.2, s * 0.5);
        ctx.closePath();
        ctx.fill();
        // Superstructure
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(-s * 0.5, -s * 0.25, s * 0.9, s * 0.5);
        break;
      }

      case 'iron_dreadnought': {
        // Armored Train Locomotive & Gun Turrets
        ctx.fillStyle = '#27272a';
        ctx.fillRect(-s * 1.5, -s * 0.6, s * 3.0, s * 1.2);
        ctx.fillStyle = color;
        ctx.fillRect(-s * 1.3, -s * 0.45, s * 2.6, s * 0.9);
        // Twin Heavy Railguns
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(-s * 0.5, 0, s * 0.35, 0, Math.PI * 2);
        ctx.arc(s * 0.5, 0, s * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(-s * 0.5, -s * 0.1, s * 1.4, s * 0.2);
        ctx.fillRect(s * 0.5, -s * 0.1, s * 1.4, s * 0.2);
        break;
      }

      default: {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Draw Minimap on an auxiliary canvas
  public drawMinimap(minimapCanvas: HTMLCanvasElement) {
    const mCtx = minimapCanvas.getContext('2d');
    if (!mCtx || this.terrain.length === 0) return;

    const mW = minimapCanvas.width;
    const mH = minimapCanvas.height;
    const tW = this.terrain[0].length;
    const tH = this.terrain.length;

    const cellW = mW / tW;
    const cellH = mH / tH;

    // 1. Draw Terrain Pixels
    for (let y = 0; y < tH; y++) {
      for (let x = 0; x < tW; x++) {
        const c = this.terrain[y][x];
        let col = '#1e293b';
        if (c === 'grass' || c === 'plains') col = '#223824';
        else if (c === 'forest') col = '#142918';
        else if (c === 'mountain') col = '#475569';
        else if (c === 'water' || c === 'deep_water') col = '#0e3a53';
        else if (c === 'road' || c === 'bridge_road') col = '#64748b';
        else if (c === 'railway' || c === 'bridge_rail') col = '#71717a';

        mCtx.fillStyle = col;
        mCtx.fillRect(x * cellW, y * cellH, cellW + 0.5, cellH + 0.5);
      }
    }

    // 2. Draw Base Dots
    this.bases.forEach((b) => {
      const isPlayer = b.ownerId === this.currentUserId;
      const isAllied = this.userAllianceId && b.allianceId === this.userAllianceId;
      const isEnemy = b.ownerId === 'enemy_insurgent' || (!isPlayer && !isAllied && b.ownerId !== 'neutral');

      mCtx.fillStyle = isPlayer ? '#3b82f6' : isAllied ? '#10b981' : isEnemy ? '#ef4444' : '#f59e0b';
      mCtx.beginPath();
      mCtx.arc(b.x * cellW, b.y * cellH, 4, 0, Math.PI * 2);
      mCtx.fill();
    });

    // 3. Draw Unit Dots
    this.units.forEach((u) => {
      if (!this.isCellVisible(u.x, u.y)) return;
      const isPlayer = u.ownerId === this.currentUserId;
      const isAllied = this.userAllianceId && u.allianceId === this.userAllianceId;
      const isEnemy = u.ownerId === 'enemy_insurgent' || (!isPlayer && !isAllied);

      mCtx.fillStyle = isPlayer ? '#38bdf8' : isAllied ? '#34d399' : isEnemy ? '#f87171' : '#fbbf24';
      mCtx.fillRect(u.x * cellW - 1, u.y * cellH - 1, 3, 3);
    });

    // 4. Draw Camera Frustum Rectangle
    const scale = this.tileSize * this.zoom;
    const viewCols = this.canvas.width / scale;
    const viewRows = this.canvas.height / scale;

    const camMinX = (this.cameraX - viewCols / 2) * cellW;
    const camMinY = (this.cameraY - viewRows / 2) * cellH;
    const camW = viewCols * cellW;
    const camH = viewRows * cellH;

    mCtx.strokeStyle = '#ffffff';
    mCtx.lineWidth = 1.5;
    mCtx.strokeRect(camMinX, camMinY, camW, camH);
  }
}
