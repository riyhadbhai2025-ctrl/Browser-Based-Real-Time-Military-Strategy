import { Base, CombatEvent, EnvironmentObject, TerrainType, Unit, UnitType } from '../types/game';
import { assetManager } from './assets/assetManager';
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

// Visual priority order for natural organic terrain edge blending
const TERRAIN_PRIORITY: Record<TerrainType, number> = {
  snow: 16,
  mountain: 15,
  rock: 14,
  hills: 13,
  pine_forest: 12,
  forest: 11,
  forest_floor: 10,
  farmland: 9,
  grass: 8,
  light_grass: 7,
  plains: 6,
  dirt: 5,
  mud: 4,
  sand: 3,
  marsh: 2,
  swamp: 2,
  water: 1,
  deep_water: 0,
  // Transport types handled on separate overlay layer
  highway: 8,
  road: 8,
  rural_road: 8,
  dirt_road: 5,
  mud_track: 4,
  damaged_road: 8,
  railway: 8,
  bridge_road: 8,
  bridge_rail: 8,
};

export class TacticalRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private terrain: TerrainType[][] = [];
  private bases: Base[] = [];
  private units: Unit[] = [];
  public envObjects: EnvironmentObject[] = [];
  private effects: VisualEffect[] = [];
  private currentUserId: string = 'player_default';
  private userAllianceId: string | null = 'alli_dominion';

  // Camera state
  public cameraX: number = 20; // world cell
  public cameraY: number = 30; // world cell
  public zoom: number = 1.0; // 0.5 to 2.2
  private tileSize: number = 44;

  // Selection
  public selectedUnitIds: Set<string> = new Set();
  public selectedBaseId: string | null = null;
  public selectionBox: { startX: number; startY: number; currentX: number; currentY: number } | null = null;

  // Animation ticks
  private animFrameId: number | null = null;
  private rotorAngle: number = 0;
  private radarAngle: number = 0;
  private waterOffset: number = 0;
  private waveCycle: number = 0;

  // Fog of war
  public fogEnabled: boolean = true;
  private exploredCells: Uint8Array | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Could not get 2D canvas context');
    this.ctx = ctx;
    assetManager.init();
  }

  public setTerrain(terrain: TerrainType[][]) {
    this.terrain = terrain;
    const h = terrain.length;
    const w = terrain[0]?.length || 0;
    this.exploredCells = new Uint8Array(w * h);
  }

  public updateWorld(
    bases: Base[],
    units: Unit[],
    userId: string,
    allianceId?: string | null,
    envObjects?: EnvironmentObject[]
  ) {
    this.bases = bases;
    this.units = units;
    this.currentUserId = userId;
    this.userAllianceId = allianceId || null;
    if (envObjects) {
      this.envObjects = envObjects;
    }

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
    const now = Date.now();
    this.effects.push({
      id: `fx_exp_${now}_${Math.random()}`,
      type: 'explosion',
      x: evt.x,
      y: evt.y,
      progress: 0,
      durationMs: 400,
      startTime: now,
      size: evt.isFatal ? 38 : 22,
    });

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

    // Tactical dark slate background
    ctx.fillStyle = '#060d17';
    ctx.fillRect(0, 0, width, height);

    if (this.terrain.length === 0) return;

    this.rotorAngle = (this.rotorAngle + 0.35) % (Math.PI * 2);
    this.radarAngle = (this.radarAngle + 0.04) % (Math.PI * 2);
    this.waterOffset = (this.waterOffset + 0.02) % (Math.PI * 2);
    this.waveCycle = (this.waveCycle + 0.035) % (Math.PI * 2);

    const scale = this.tileSize * this.zoom;
    const screenCenterX = width / 2;
    const screenCenterY = height / 2;

    const tHeight = this.terrain.length;
    const tWidth = this.terrain[0].length;

    // Viewport Culling calculation (only draw what is on screen + 2 cell margin)
    const startX = Math.max(0, Math.floor(this.cameraX - screenCenterX / scale - 2));
    const endX = Math.min(tWidth, Math.ceil(this.cameraX + screenCenterX / scale + 2));
    const startY = Math.max(0, Math.floor(this.cameraY - screenCenterY / scale - 2));
    const endY = Math.min(tHeight, Math.ceil(this.cameraY + screenCenterY / scale + 2));

    // =========================================================================
    // LAYER 1: BASE TERRAIN TEXTURES (SEAMLESS CANVAS PATTERNS)
    // =========================================================================
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const cell = this.terrain[y][x];
        const sPos = this.worldToScreen(x, y);

        ctx.save();
        const pattern = assetManager.getTerrainPattern(ctx, cell);
        if (pattern) {
          ctx.fillStyle = pattern;
        } else {
          ctx.fillStyle = assetManager.getTerrainColor(cell);
        }
        ctx.fillRect(sPos.x, sPos.y, scale + 0.5, scale + 0.5);
        ctx.restore();
      }
    }

    // =========================================================================
    // LAYER 2: NON-SQUARE NATURAL TERRAIN TRANSITIONS (ALPHA BLENDING SPLATS)
    // Eliminates square tile grid by blending neighboring terrain edges with curved lobes
    // =========================================================================
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const cell = this.terrain[y][x];
        // Skip pure transport tiles for terrain splatting
        if (cell === 'highway' || cell === 'road' || cell === 'bridge_road' || cell === 'railway' || cell === 'bridge_rail') {
          continue;
        }

        const currentPrio = TERRAIN_PRIORITY[cell] ?? 5;
        const sPos = this.worldToScreen(x, y);

        // 4 Cardinal Neighbors
        const neighbors = [
          { dx: 0, dy: -1, edge: 'top' as const },
          { dx: 0, dy: 1, edge: 'bottom' as const },
          { dx: -1, dy: 0, edge: 'left' as const },
          { dx: 1, dy: 0, edge: 'right' as const },
        ];

        neighbors.forEach((n) => {
          const nx = x + n.dx;
          const ny = y + n.dy;
          if (nx >= 0 && nx < tWidth && ny >= 0 && ny < tHeight) {
            const nCell = this.terrain[ny][nx];
            if (nCell !== cell) {
              const nPrio = TERRAIN_PRIORITY[nCell] ?? 5;
              // If neighbor has higher visual priority, blend its texture onto current cell's border
              if (nPrio > currentPrio) {
                const nPattern = assetManager.getTerrainPattern(ctx, nCell);
                if (nPattern) {
                  this.drawTerrainBlendLobe(ctx, sPos.x, sPos.y, scale, n.edge, nPattern, x, y);
                }
              }
            }
          }
        });

        // 4 Diagonal Corners
        const corners = [
          { dx: -1, dy: -1, corner: 'top-left' as const },
          { dx: 1, dy: -1, corner: 'top-right' as const },
          { dx: -1, dy: 1, corner: 'bottom-left' as const },
          { dx: 1, dy: 1, corner: 'bottom-right' as const },
        ];

        corners.forEach((c) => {
          const nx = x + c.dx;
          const ny = y + c.dy;
          if (nx >= 0 && nx < tWidth && ny >= 0 && ny < tHeight) {
            const nCell = this.terrain[ny][nx];
            if (nCell !== cell) {
              const nPrio = TERRAIN_PRIORITY[nCell] ?? 5;
              if (nPrio > currentPrio) {
                const nPattern = assetManager.getTerrainPattern(ctx, nCell);
                if (nPattern) {
                  this.drawTerrainCornerLobe(ctx, sPos.x, sPos.y, scale, c.corner, nPattern);
                }
              }
            }
          }
        });
      }
    }

    // =========================================================================
    // LAYER 3: SHORELINES, WATER DEPTH CAUSTICS & FOAMING SURF
    // =========================================================================
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const cell = this.terrain[y][x];
        const sPos = this.worldToScreen(x, y);

        // Animated Water Swells & Specular Caustic Highlights
        if (cell === 'water' || cell === 'deep_water') {
          const isDeep = cell === 'deep_water';
          const waveAlpha = isDeep ? 0.14 : 0.26;
          ctx.strokeStyle = `rgba(186, 230, 253, ${waveAlpha})`;
          ctx.lineWidth = Math.max(1, scale * 0.04);
          ctx.beginPath();
          const waveShift = Math.sin(this.waterOffset + x * 0.8 + y * 0.5) * (scale * 0.15);
          ctx.moveTo(sPos.x + scale * 0.15, sPos.y + scale * 0.45 + waveShift);
          ctx.bezierCurveTo(
            sPos.x + scale * 0.38,
            sPos.y + scale * 0.35 + waveShift,
            sPos.x + scale * 0.62,
            sPos.y + scale * 0.55 + waveShift,
            sPos.x + scale * 0.85,
            sPos.y + scale * 0.45 + waveShift
          );
          ctx.stroke();

          // Shoreline Detection: Check if neighbor is land
          const neighbors = [
            { dx: 0, dy: -1, side: 'top' as const },
            { dx: 0, dy: 1, side: 'bottom' as const },
            { dx: -1, dy: 0, side: 'left' as const },
            { dx: 1, dy: 0, side: 'right' as const },
          ];

          neighbors.forEach((n) => {
            const nx = x + n.dx;
            const ny = y + n.dy;
            if (nx >= 0 && nx < tWidth && ny >= 0 && ny < tHeight) {
              const nCell = this.terrain[ny][nx];
              const isLand =
                nCell !== 'water' &&
                nCell !== 'deep_water' &&
                nCell !== 'bridge_road' &&
                nCell !== 'bridge_rail';

              if (isLand) {
                // Sandy wet shore margin
                ctx.fillStyle = 'rgba(194, 163, 108, 0.42)';
                const foamPulse = Math.sin(this.waveCycle + x * 2 + y * 2) * (scale * 0.06);

                if (n.side === 'top') {
                  ctx.fillRect(sPos.x, sPos.y, scale, scale * 0.24);
                  // White foam crest fringe
                  ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
                  ctx.fillRect(sPos.x, sPos.y + scale * 0.18 + foamPulse, scale, scale * 0.07);
                } else if (n.side === 'bottom') {
                  ctx.fillRect(sPos.x, sPos.y + scale * 0.76, scale, scale * 0.24);
                  ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
                  ctx.fillRect(sPos.x, sPos.y + scale * 0.73 - foamPulse, scale, scale * 0.07);
                } else if (n.side === 'left') {
                  ctx.fillRect(sPos.x, sPos.y, scale * 0.24, scale);
                  ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
                  ctx.fillRect(sPos.x + scale * 0.18 + foamPulse, sPos.y, scale * 0.07, scale);
                } else if (n.side === 'right') {
                  ctx.fillRect(sPos.x + scale * 0.76, sPos.y, scale * 0.24, scale);
                  ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
                  ctx.fillRect(sPos.x + scale * 0.73 - foamPulse, sPos.y, scale * 0.07, scale);
                }
              }
            }
          });
        }
      }
    }

    // =========================================================================
    // LAYER 4: REALISTIC ROADS, DIRT TRACKS, RAILWAYS & BRIDGES (AUTO-CONNECTING)
    // =========================================================================
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const cell = this.terrain[y][x];
        const sPos = this.worldToScreen(x, y);

        const isHighway = cell === 'highway';
        const isRoad = cell === 'road' || cell === 'rural_road' || cell === 'damaged_road' || cell === 'bridge_road';
        const isDirt = cell === 'dirt_road' || cell === 'mud_track';
        const isRail = cell === 'railway' || cell === 'bridge_rail';

        if (isHighway || isRoad || isDirt || isRail) {
          // Check 4-way orthogonal connections
          const hasN = y > 0 && this.isMatchingTransport(cell, this.terrain[y - 1][x]);
          const hasS = y < tHeight - 1 && this.isMatchingTransport(cell, this.terrain[y + 1][x]);
          const hasW = x > 0 && this.isMatchingTransport(cell, this.terrain[y][x - 1]);
          const hasE = x < tWidth - 1 && this.isMatchingTransport(cell, this.terrain[y][x + 1]);

          const cx = sPos.x + scale / 2;
          const cy = sPos.y + scale / 2;

          if (isHighway) {
            const roadWidth = scale * 0.62;

            // Concrete safety shoulders
            ctx.fillStyle = '#4a4843';
            this.drawRoadArm(ctx, cx, cy, roadWidth + scale * 0.18, hasN, hasS, hasW, hasE, scale);

            // Dark heavy asphalt surface
            ctx.fillStyle = '#1c1f24';
            this.drawRoadArm(ctx, cx, cy, roadWidth, hasN, hasS, hasW, hasE, scale);

            // Yellow double center lines
            ctx.strokeStyle = '#eab308';
            ctx.lineWidth = Math.max(1, scale * 0.04);
            this.drawRoadCenterLines(ctx, cx, cy, hasN, hasS, hasW, hasE, scale);

            // White dashed lane dividers
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
            ctx.lineWidth = Math.max(1, scale * 0.03);
            ctx.setLineDash([scale * 0.14, scale * 0.1]);
            this.drawRoadSideLines(ctx, cx, cy, roadWidth * 0.35, hasN, hasS, hasW, hasE, scale);
            ctx.setLineDash([]);
          } else if (isRoad) {
            const roadWidth = cell === 'rural_road' ? scale * 0.44 : scale * 0.54;

            // Gravel shoulder underlay
            ctx.fillStyle = '#423d33';
            this.drawRoadArm(ctx, cx, cy, roadWidth + scale * 0.16, hasN, hasS, hasW, hasE, scale);

            // Asphalt surface
            ctx.fillStyle = cell === 'damaged_road' ? '#26292e' : '#22252a';
            this.drawRoadArm(ctx, cx, cy, roadWidth, hasN, hasS, hasW, hasE, scale);

            // White / Yellow Center Lane Markings
            ctx.strokeStyle = cell === 'damaged_road' ? '#ca8a04' : '#eab308';
            ctx.lineWidth = Math.max(1, scale * 0.04);
            ctx.setLineDash([scale * 0.16, scale * 0.12]);
            this.drawRoadCenterLines(ctx, cx, cy, hasN, hasS, hasW, hasE, scale);
            ctx.setLineDash([]);

            // Bridge Span Railings if over water
            if (cell === 'bridge_road') {
              this.drawBridgeStructure(ctx, sPos.x, sPos.y, scale, hasW || hasE ? 'horizontal' : 'vertical', '#3b82f6');
            }
          } else if (isDirt) {
            const trackWidth = scale * 0.46;
            // Warm earth or mud background
            ctx.fillStyle = cell === 'mud_track' ? '#38281a' : '#654f35';
            this.drawRoadArm(ctx, cx, cy, trackWidth, hasN, hasS, hasW, hasE, scale);

            // Dual wheel ruts
            ctx.strokeStyle = cell === 'mud_track' ? '#20150d' : '#3d2e1c';
            ctx.lineWidth = Math.max(1, scale * 0.08);
            this.drawDirtWheelRuts(ctx, cx, cy, hasN, hasS, hasW, hasE, scale);
          } else if (isRail) {
            // Ballast bed
            ctx.fillStyle = '#393c41';
            this.drawRoadArm(ctx, cx, cy, scale * 0.48, hasN, hasS, hasW, hasE, scale);

            // Wooden sleepers (cross-ties)
            this.drawRailSleepers(ctx, cx, cy, hasN, hasS, hasW, hasE, scale);

            // Dual steel tracks
            ctx.strokeStyle = '#a1a1aa';
            ctx.lineWidth = Math.max(1, scale * 0.06);
            this.drawSteelRails(ctx, cx, cy, hasN, hasS, hasW, hasE, scale);

            // Steel truss bridge if over water
            if (cell === 'bridge_rail') {
              this.drawBridgeStructure(ctx, sPos.x, sPos.y, scale, hasW || hasE ? 'horizontal' : 'vertical', '#8b5cf6');
            }
          }
        }
      }
    }

    // =========================================================================
    // LAYER 5: BASES & COURTYARD FORTIFICATIONS
    // =========================================================================
    this.bases.forEach((base) => {
      const sPos = this.worldToScreen(base.x, base.y);
      const bRadius = base.radius * scale;

      const isPlayer = base.ownerId === this.currentUserId;
      const isAllied = this.userAllianceId && base.allianceId === this.userAllianceId;
      const isEnemy = base.ownerId === 'enemy_insurgent' || (!isPlayer && !isAllied && base.ownerId !== 'neutral');

      const ownerColor = isPlayer ? '#3b82f6' : isAllied ? '#10b981' : isEnemy ? '#ef4444' : '#f59e0b';
      const isSelected = this.selectedBaseId === base.id;

      // Outer fortified perimeter wall with battlements
      ctx.save();
      ctx.strokeStyle = isSelected ? '#38bdf8' : ownerColor;
      ctx.lineWidth = isSelected ? 3.5 : 2;
      ctx.beginPath();
      ctx.arc(sPos.x, sPos.y, bRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Compound paved courtyard
      ctx.fillStyle = isPlayer
        ? 'rgba(30, 58, 138, 0.22)'
        : isEnemy
        ? 'rgba(127, 29, 29, 0.22)'
        : 'rgba(120, 80, 20, 0.15)';
      ctx.fill();

      // Perimeter Razor Wire / Barbed Wire coils
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sPos.x, sPos.y, bRadius + 4, 0, Math.PI * 2);
      ctx.stroke();

      // Pulsing energy shield bubble
      if (base.defenseShield > 0) {
        const shieldAlpha = 0.18 + Math.sin(this.waterOffset * 2) * 0.06;
        ctx.fillStyle = `rgba(6, 182, 212, ${shieldAlpha})`;
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sPos.x, sPos.y, bRadius * 1.05, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();

      // Runway for airbase
      if (base.type === 'air') {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(sPos.x - bRadius * 0.8, sPos.y - scale * 0.35, bRadius * 1.6, scale * 0.7);
        // White centerline stripes
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.moveTo(sPos.x - bRadius * 0.75, sPos.y);
        ctx.lineTo(sPos.x + bRadius * 0.75, sPos.y);
        ctx.stroke();
        ctx.setLineDash([]);
        // Threshold piano keys
        ctx.fillStyle = '#ffffff';
        for (let i = -3; i <= 3; i++) {
          ctx.fillRect(sPos.x - bRadius * 0.78, sPos.y + i * 3 - 1, 6, 2);
          ctx.fillRect(sPos.x + bRadius * 0.74, sPos.y + i * 3 - 1, 6, 2);
        }
      }

      // Headquarters central hardened command citadel
      const coreSize = scale * 1.65;
      // Soft drop shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(sPos.x - coreSize / 2 + 5, sPos.y - coreSize / 2 + 5, coreSize, coreSize);

      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = ownerColor;
      ctx.lineWidth = 2.5;
      ctx.fillRect(sPos.x - coreSize / 2, sPos.y - coreSize / 2, coreSize, coreSize);
      ctx.strokeRect(sPos.x - coreSize / 2, sPos.y - coreSize / 2, coreSize, coreSize);

      // Rotating base radar dome
      ctx.save();
      ctx.translate(sPos.x, sPos.y);
      ctx.rotate(this.radarAngle);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(coreSize * 0.6, 0);
      ctx.stroke();
      ctx.restore();

      // Base Health, Shield, and Conquest Progress Bars
      const hpPct = Math.max(0, base.health / base.maxHealth);
      const shieldPct = base.maxShield > 0 ? base.defenseShield / base.maxShield : 0;
      const barW = Math.max(76, scale * 2.3);
      const barH = 5;
      const barY = sPos.y - bRadius - 18;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(sPos.x - barW / 2, barY, barW, barH);
      ctx.fillStyle = hpPct > 0.5 ? '#22c55e' : hpPct > 0.2 ? '#f59e0b' : '#ef4444';
      ctx.fillRect(sPos.x - barW / 2, barY, barW * hpPct, barH);

      if (base.maxShield > 0) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(sPos.x - barW / 2, barY - 6, barW, 4);
        ctx.fillStyle = '#06b6d4';
        ctx.fillRect(sPos.x - barW / 2, barY - 6, barW * shieldPct, 4);
      }

      ctx.font = 'bold 11px Chakra Petch, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(base.name, sPos.x, barY - 8);

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

    // =========================================================================
    // LAYER 6: Y-SORTED ENTITIES (TREES, BUNKERS, CRATERS, PROPS, AND UNITS)
    // =========================================================================
    interface RenderEntity {
      kind: 'env' | 'unit';
      y: number;
      data: any;
    }

    const entityList: RenderEntity[] = [];

    // Environment Objects
    this.envObjects.forEach((obj) => {
      if (obj.x >= startX - 2 && obj.x <= endX + 2 && obj.y >= startY - 2 && obj.y <= endY + 2) {
        if (this.isCellVisible(obj.x, obj.y)) {
          entityList.push({ kind: 'env', y: obj.y, data: obj });
        }
      }
    });

    // Military Units
    this.units.forEach((unit) => {
      if (unit.x >= startX - 2 && unit.x <= endX + 2 && unit.y >= startY - 2 && unit.y <= endY + 2) {
        if (this.isCellVisible(unit.x, unit.y)) {
          entityList.push({ kind: 'unit', y: unit.y, data: unit });
        }
      }
    });

    // Sort by Y ascending (back-to-front depth sorting)
    entityList.sort((a, b) => a.y - b.y);

    entityList.forEach((item) => {
      if (item.kind === 'env') {
        this.renderEnvironmentObject(ctx, item.data, scale);
      } else {
        this.renderMilitaryUnit(ctx, item.data, scale);
      }
    });

    // =========================================================================
    // LAYER 7: COMBAT FX (EXPLOSIONS, TRACERS, DAMAGE FLOATERS)
    // =========================================================================
    const now = Date.now();
    this.effects = this.effects.filter((fx) => now - fx.startTime < fx.durationMs);

    this.effects.forEach((fx) => {
      const elapsed = now - fx.startTime;
      fx.progress = elapsed / fx.durationMs;
      const sPos = this.worldToScreen(fx.x, fx.y);

      if (fx.type === 'explosion') {
        const rad = (fx.size || 24) * fx.progress;
        const alpha = Math.max(0, 1 - fx.progress);

        ctx.save();
        ctx.strokeStyle = `rgba(249, 115, 22, ${alpha})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(sPos.x, sPos.y, rad, 0, Math.PI * 2);
        ctx.stroke();

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

    // =========================================================================
    // LAYER 8: DRAG-SELECTION BOX
    // =========================================================================
    if (this.selectionBox) {
      const { startX, startY, currentX, currentY } = this.selectionBox;
      const left = Math.min(startX, currentX);
      const top = Math.min(startY, currentY);
      const boxW = Math.abs(currentX - startX);
      const boxH = Math.abs(currentY - startY);

      ctx.save();
      ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 2]);
      ctx.fillRect(left, top, boxW, boxH);
      ctx.strokeRect(left, top, boxW, boxH);
      ctx.restore();
    }
  }

  // Draw natural curved terrain transition lobe to eliminate square boundaries
  private drawTerrainBlendLobe(
    ctx: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    scale: number,
    edge: 'top' | 'bottom' | 'left' | 'right',
    pattern: CanvasPattern,
    cellX: number,
    cellY: number
  ) {
    ctx.save();
    ctx.fillStyle = pattern;
    const wave = Math.sin((cellX * 7 + cellY * 13) * 0.4) * (scale * 0.08);

    ctx.beginPath();
    if (edge === 'top') {
      ctx.moveTo(sx, sy);
      ctx.bezierCurveTo(
        sx + scale * 0.3,
        sy + scale * 0.28 + wave,
        sx + scale * 0.7,
        sy + scale * 0.28 - wave,
        sx + scale,
        sy
      );
      ctx.lineTo(sx + scale, sy - 1);
      ctx.lineTo(sx, sy - 1);
    } else if (edge === 'bottom') {
      ctx.moveTo(sx, sy + scale);
      ctx.bezierCurveTo(
        sx + scale * 0.3,
        sy + scale * 0.72 - wave,
        sx + scale * 0.7,
        sy + scale * 0.72 + wave,
        sx + scale,
        sy + scale
      );
      ctx.lineTo(sx + scale, sy + scale + 1);
      ctx.lineTo(sx, sy + scale + 1);
    } else if (edge === 'left') {
      ctx.moveTo(sx, sy);
      ctx.bezierCurveTo(
        sx + scale * 0.28 + wave,
        sy + scale * 0.3,
        sx + scale * 0.28 - wave,
        sy + scale * 0.7,
        sx,
        sy + scale
      );
      ctx.lineTo(sx - 1, sy + scale);
      ctx.lineTo(sx - 1, sy);
    } else if (edge === 'right') {
      ctx.moveTo(sx + scale, sy);
      ctx.bezierCurveTo(
        sx + scale * 0.72 - wave,
        sy + scale * 0.3,
        sx + scale * 0.72 + wave,
        sy + scale * 0.7,
        sx + scale,
        sy + scale
      );
      ctx.lineTo(sx + scale + 1, sy + scale);
      ctx.lineTo(sx + scale + 1, sy);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Draw natural rounded corner fillet for diagonal transitions
  private drawTerrainCornerLobe(
    ctx: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    scale: number,
    corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right',
    pattern: CanvasPattern
  ) {
    ctx.save();
    ctx.fillStyle = pattern;
    const r = scale * 0.3;

    ctx.beginPath();
    if (corner === 'top-left') {
      ctx.arc(sx, sy, r, 0, Math.PI * 0.5, false);
      ctx.lineTo(sx, sy);
    } else if (corner === 'top-right') {
      ctx.arc(sx + scale, sy, r, Math.PI * 0.5, Math.PI, false);
      ctx.lineTo(sx + scale, sy);
    } else if (corner === 'bottom-left') {
      ctx.arc(sx, sy + scale, r, Math.PI * 1.5, Math.PI * 2, false);
      ctx.lineTo(sx, sy + scale);
    } else if (corner === 'bottom-right') {
      ctx.arc(sx + scale, sy + scale, r, Math.PI, Math.PI * 1.5, false);
      ctx.lineTo(sx + scale, sy + scale);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Check matching connectivity for road and transport networks
  private isMatchingTransport(current: TerrainType, neighbor: TerrainType): boolean {
    const isCurrentRoad =
      current === 'highway' ||
      current === 'road' ||
      current === 'rural_road' ||
      current === 'damaged_road' ||
      current === 'bridge_road';

    const isNeighborRoad =
      neighbor === 'highway' ||
      neighbor === 'road' ||
      neighbor === 'rural_road' ||
      neighbor === 'damaged_road' ||
      neighbor === 'bridge_road';

    if (isCurrentRoad) return isNeighborRoad;

    if (current === 'dirt_road' || current === 'mud_track') {
      return neighbor === 'dirt_road' || neighbor === 'mud_track' || isNeighborRoad;
    }

    if (current === 'railway' || current === 'bridge_rail') {
      return neighbor === 'railway' || neighbor === 'bridge_rail';
    }

    return false;
  }

  // Draw 4-way interconnected road geometry with smooth fillet center
  private drawRoadArm(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    roadW: number,
    n: boolean,
    s: boolean,
    w: boolean,
    e: boolean,
    scale: number
  ) {
    const halfW = roadW / 2;
    const halfTile = scale / 2;

    ctx.beginPath();
    ctx.arc(cx, cy, halfW, 0, Math.PI * 2);
    ctx.fill();

    if (n) ctx.fillRect(cx - halfW, cy - halfTile, roadW, halfTile);
    if (s) ctx.fillRect(cx - halfW, cy, roadW, halfTile);
    if (w) ctx.fillRect(cx - halfTile, cy - halfW, halfTile, roadW);
    if (e) ctx.fillRect(cx, cy - halfW, halfTile, roadW);

    if (!n && !s && !w && !e) {
      ctx.beginPath();
      ctx.arc(cx, cy, halfW, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Draw Highway Lane Markings (Yellow double center lines)
  private drawRoadCenterLines(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    n: boolean,
    s: boolean,
    w: boolean,
    e: boolean,
    scale: number
  ) {
    const halfTile = scale / 2;
    ctx.beginPath();
    if (n) {
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, cy - halfTile);
    }
    if (s) {
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, cy + halfTile);
    }
    if (w) {
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx - halfTile, cy);
    }
    if (e) {
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + halfTile, cy);
    }
    ctx.stroke();
  }

  // Draw Highway Side Lane Lines
  private drawRoadSideLines(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    offset: number,
    n: boolean,
    s: boolean,
    w: boolean,
    e: boolean,
    scale: number
  ) {
    const halfTile = scale / 2;
    ctx.beginPath();
    if (n || s) {
      if (n) {
        ctx.moveTo(cx - offset, cy);
        ctx.lineTo(cx - offset, cy - halfTile);
        ctx.moveTo(cx + offset, cy);
        ctx.lineTo(cx + offset, cy - halfTile);
      }
      if (s) {
        ctx.moveTo(cx - offset, cy);
        ctx.lineTo(cx - offset, cy + halfTile);
        ctx.moveTo(cx + offset, cy);
        ctx.lineTo(cx + offset, cy + halfTile);
      }
    }
    if (w || e) {
      if (w) {
        ctx.moveTo(cx, cy - offset);
        ctx.lineTo(cx - halfTile, cy - offset);
        ctx.moveTo(cx, cy + offset);
        ctx.lineTo(cx - halfTile, cy + offset);
      }
      if (e) {
        ctx.moveTo(cx, cy - offset);
        ctx.lineTo(cx + halfTile, cy - offset);
        ctx.moveTo(cx, cy + offset);
        ctx.lineTo(cx + halfTile, cy + offset);
      }
    }
    ctx.stroke();
  }

  // Draw Dirt Road Wheel Ruts
  private drawDirtWheelRuts(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    n: boolean,
    s: boolean,
    w: boolean,
    e: boolean,
    scale: number
  ) {
    const offset = scale * 0.12;
    const halfTile = scale / 2;

    ctx.beginPath();
    if (n || s) {
      if (n) {
        ctx.moveTo(cx - offset, cy);
        ctx.lineTo(cx - offset, cy - halfTile);
        ctx.moveTo(cx + offset, cy);
        ctx.lineTo(cx + offset, cy - halfTile);
      }
      if (s) {
        ctx.moveTo(cx - offset, cy);
        ctx.lineTo(cx - offset, cy + halfTile);
        ctx.moveTo(cx + offset, cy);
        ctx.lineTo(cx + offset, cy + halfTile);
      }
    }
    if (w || e) {
      if (w) {
        ctx.moveTo(cx, cy - offset);
        ctx.lineTo(cx - halfTile, cy - offset);
        ctx.moveTo(cx, cy + offset);
        ctx.lineTo(cx - halfTile, cy + offset);
      }
      if (e) {
        ctx.moveTo(cx, cy - offset);
        ctx.lineTo(cx + halfTile, cy - offset);
        ctx.moveTo(cx, cy + offset);
        ctx.lineTo(cx + halfTile, cy + offset);
      }
    }
    ctx.stroke();
  }

  // Draw Railway Timber Sleepers
  private drawRailSleepers(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    n: boolean,
    s: boolean,
    w: boolean,
    e: boolean,
    scale: number
  ) {
    ctx.fillStyle = '#272018';
    const sleeperLen = scale * 0.44;
    const sleeperThick = Math.max(1.5, scale * 0.08);

    if (w || e) {
      for (let i = -1.5; i <= 1.5; i += 1) {
        ctx.fillRect(cx + i * (scale * 0.28) - sleeperThick / 2, cy - sleeperLen / 2, sleeperThick, sleeperLen);
      }
    }
    if (n || s) {
      for (let i = -1.5; i <= 1.5; i += 1) {
        ctx.fillRect(cx - sleeperLen / 2, cy + i * (scale * 0.28) - sleeperThick / 2, sleeperLen, sleeperThick);
      }
    }
  }

  // Draw Railway Steel Tracks
  private drawSteelRails(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    n: boolean,
    s: boolean,
    w: boolean,
    e: boolean,
    scale: number
  ) {
    const halfGauge = scale * 0.14;
    const halfTile = scale / 2;

    ctx.beginPath();
    if (n || s) {
      if (n) {
        ctx.moveTo(cx - halfGauge, cy);
        ctx.lineTo(cx - halfGauge, cy - halfTile);
        ctx.moveTo(cx + halfGauge, cy);
        ctx.lineTo(cx + halfGauge, cy - halfTile);
      }
      if (s) {
        ctx.moveTo(cx - halfGauge, cy);
        ctx.lineTo(cx - halfGauge, cy + halfTile);
        ctx.moveTo(cx + halfGauge, cy);
        ctx.lineTo(cx + halfGauge, cy + halfTile);
      }
    }
    if (w || e) {
      if (w) {
        ctx.moveTo(cx, cy - halfGauge);
        ctx.lineTo(cx - halfTile, cy - halfGauge);
        ctx.moveTo(cx, cy + halfGauge);
        ctx.lineTo(cx - halfTile, cy + halfGauge);
      }
      if (e) {
        ctx.moveTo(cx, cy - halfGauge);
        ctx.lineTo(cx + halfTile, cy - halfGauge);
        ctx.moveTo(cx, cy + halfGauge);
        ctx.lineTo(cx + halfTile, cy + halfGauge);
      }
    }
    ctx.stroke();
  }

  // Draw Bridge Guardrails, Piers & Water Ripples
  private drawBridgeStructure(
    ctx: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    scale: number,
    orientation: 'horizontal' | 'vertical',
    color: string
  ) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;

    if (orientation === 'horizontal') {
      // Top & Bottom safety barriers
      ctx.strokeRect(sx, sy + scale * 0.18, scale, 2);
      ctx.strokeRect(sx, sy + scale * 0.8, scale, 2);
      // Concrete abutments
      ctx.fillStyle = '#64748b';
      ctx.fillRect(sx, sy + scale * 0.15, 4, scale * 0.7);
      ctx.fillRect(sx + scale - 4, sy + scale * 0.15, 4, scale * 0.7);
    } else {
      // Left & Right safety barriers
      ctx.strokeRect(sx + scale * 0.18, sy, 2, scale);
      ctx.strokeRect(sx + scale * 0.8, sy, 2, scale);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(sx + scale * 0.15, sy, scale * 0.7, 4);
      ctx.fillRect(sx + scale * 0.15, sy + scale - 4, scale * 0.7, 4);
    }
    ctx.restore();
  }

  // Render High-Detail Environment Objects (Trees, Bunkers, Sandbags, Boulders, Craters)
  private renderEnvironmentObject(ctx: CanvasRenderingContext2D, obj: EnvironmentObject, scale: number) {
    const sPos = this.worldToScreen(obj.x, obj.y);
    const spriteCanvas = assetManager.getSpriteCanvas(obj.type);
    if (!spriteCanvas) return;

    const baseScale = (obj.scale || 1.0) * (scale / 40);
    const drawW = spriteCanvas.width * baseScale;
    const drawH = spriteCanvas.height * baseScale;

    // Anchor at center bottom (feet of the tree/building)
    const drawX = sPos.x - drawW / 2;
    const drawY = sPos.y - drawH + scale * 0.45;

    ctx.drawImage(spriteCanvas, drawX, drawY, drawW, drawH);
  }

  // Render Military Combat Units
  private renderMilitaryUnit(ctx: CanvasRenderingContext2D, unit: Unit, scale: number) {
    const sPos = this.worldToScreen(unit.x, unit.y);
    const isPlayer = unit.ownerId === this.currentUserId;
    const isAllied = this.userAllianceId && unit.allianceId === this.userAllianceId;
    const isEnemy = unit.ownerId === 'enemy_insurgent' || (!isPlayer && !isAllied);
    const isSelected = this.selectedUnitIds.has(unit.id);

    const unitColor = isPlayer ? '#38bdf8' : isAllied ? '#34d399' : isEnemy ? '#f87171' : '#fbbf24';

    // Selection ring & Destination Lines
    if (isSelected) {
      ctx.save();
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sPos.x, sPos.y, scale * 0.58, 0, Math.PI * 2);
      ctx.stroke();

      const def = UNIT_CATALOG[unit.type];
      if (def) {
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(sPos.x, sPos.y, def.attackRange * scale, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (unit.path && unit.path.length > 0) {
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.6)';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.8;
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

    // Directional Unit Ground Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(sPos.x + 4, sPos.y + 4, scale * 0.45, scale * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();

    // Draw Unit Sprite with Rotation
    ctx.save();
    ctx.translate(sPos.x, sPos.y);
    ctx.rotate(unit.rotation);
    this.drawUnitSprite(ctx, unit.type, unitColor, scale);
    ctx.restore();

    // Unit Health Bar
    const def = UNIT_CATALOG[unit.type];
    const maxHp = def?.maxHealth || unit.maxHealth;
    const hpPct = Math.max(0, unit.health / maxHp);
    const uBarW = scale * 0.85;
    const uBarH = 3.5;
    const uBarY = sPos.y - scale * 0.62;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(sPos.x - uBarW / 2, uBarY, uBarW, uBarH);
    ctx.fillStyle = hpPct > 0.5 ? '#22c55e' : hpPct > 0.2 ? '#eab308' : '#ef4444';
    ctx.fillRect(sPos.x - uBarW / 2, uBarY, uBarW * hpPct, uBarH);
  }

  // Draw detailed vector military unit sprites
  private drawUnitSprite(ctx: CanvasRenderingContext2D, type: UnitType, color: string, scale: number) {
    const s = scale * 0.48;

    switch (type) {
      case 'titan_mbt': {
        // Tracks
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(-s * 0.95, -s * 0.85, s * 1.9, s * 0.38);
        ctx.fillRect(-s * 0.95, s * 0.47, s * 1.9, s * 0.38);
        // Track wheels
        ctx.fillStyle = '#334155';
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.arc(-s * 0.7 + i * (s * 0.35), -s * 0.66, s * 0.12, 0, Math.PI * 2);
          ctx.arc(-s * 0.7 + i * (s * 0.35), s * 0.66, s * 0.12, 0, Math.PI * 2);
          ctx.fill();
        }
        // Armored hull
        ctx.fillStyle = color;
        ctx.fillRect(-s * 0.75, -s * 0.52, s * 1.5, s * 1.04);
        // Heavy turret & 120mm Cannon barrel
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.42, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(0, -s * 0.13, s * 1.5, s * 0.26);
        ctx.fillStyle = '#f59e0b'; // Muzzle brake
        ctx.fillRect(s * 1.45, -s * 0.16, s * 0.12, s * 0.32);
        break;
      }

      case 'vanguard_scout': {
        // Big offroad tires
        ctx.fillStyle = '#020617';
        ctx.fillRect(-s * 0.85, -s * 0.75, s * 0.45, s * 0.32);
        ctx.fillRect(s * 0.4, -s * 0.75, s * 0.45, s * 0.32);
        ctx.fillRect(-s * 0.85, s * 0.43, s * 0.45, s * 0.32);
        ctx.fillRect(s * 0.4, s * 0.43, s * 0.45, s * 0.32);
        // Sleek buggy chassis
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(s * 0.85, 0);
        ctx.lineTo(-s * 0.65, -s * 0.52);
        ctx.lineTo(-s * 0.65, s * 0.52);
        ctx.closePath();
        ctx.fill();
        // Rollcage
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.8;
        ctx.strokeRect(-s * 0.35, -s * 0.32, s * 0.65, s * 0.64);
        break;
      }

      case 'ironclad_apc': {
        // 8-Wheeled combat carrier
        ctx.fillStyle = '#020617';
        for (let i = 0; i < 4; i++) {
          ctx.fillRect(-s * 0.8 + i * (s * 0.42), -s * 0.8, s * 0.32, s * 0.24);
          ctx.fillRect(-s * 0.8 + i * (s * 0.42), s * 0.56, s * 0.32, s * 0.24);
        }
        ctx.fillStyle = color;
        ctx.fillRect(-s * 0.85, -s * 0.55, s * 1.7, s * 1.1);
        // Twin Autocannons
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(s * 0.2, -s * 0.2, s * 0.8, s * 0.12);
        ctx.fillRect(s * 0.2, s * 0.08, s * 0.8, s * 0.12);
        break;
      }

      case 'goliath_howitzer': {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(-s * 1.05, -s * 0.85, s * 2.1, s * 1.7);
        ctx.fillStyle = color;
        ctx.fillRect(-s * 0.75, -s * 0.65, s * 1.5, s * 1.3);
        // Super long artillery barrel
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(-s * 0.2, -s * 0.16, s * 2.4, s * 0.32);
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(s * 2.1, -s * 0.2, s * 0.16, s * 0.4);
        break;
      }

      case 'skyguard_aa': {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(-s * 0.85, -s * 0.75, s * 1.7, s * 1.5);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.55, 0, Math.PI * 2);
        ctx.fill();
        // Quad Flak Barrels
        ctx.fillStyle = '#38bdf8';
        [-0.38, -0.13, 0.13, 0.38].forEach((offset) => {
          ctx.fillRect(0, s * offset - 1.5, s * 1.3, 3);
        });
        break;
      }

      case 'dominator_conquest': {
        ctx.fillStyle = '#020617';
        ctx.fillRect(-s * 0.95, -s * 0.85, s * 1.9, s * 1.7);
        ctx.fillStyle = color;
        ctx.fillRect(-s * 0.75, -s * 0.65, s * 1.5, s * 1.3);
        // Glowing uplink antenna dish
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.52, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.22, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'hawk_scout_heli':
      case 'cobra_gunship': {
        // Fuselage
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 0.85, s * 0.36, 0, 0, Math.PI * 2);
        ctx.fill();
        // Tail boom
        ctx.fillStyle = '#334155';
        ctx.fillRect(-s * 1.45, -s * 0.08, s * 0.85, s * 0.16);
        // Spinning main rotor blades
        ctx.save();
        ctx.rotate(this.rotorAngle);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-s * 1.7, 0);
        ctx.lineTo(s * 1.7, 0);
        ctx.moveTo(0, -s * 1.7);
        ctx.lineTo(0, s * 1.7);
        ctx.stroke();
        ctx.restore();
        break;
      }

      case 'stormbringer_jet':
      case 'thunderbolt_bomber': {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(s * 1.3, 0);
        ctx.lineTo(-s * 0.95, -s * 1.15);
        ctx.lineTo(-s * 0.55, 0);
        ctx.lineTo(-s * 0.95, s * 1.15);
        ctx.closePath();
        ctx.fill();
        // Canopy
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.ellipse(s * 0.45, 0, s * 0.32, s * 0.13, 0, 0, Math.PI * 2);
        ctx.fill();
        // Afterburner exhaust glow
        ctx.fillStyle = '#f97316';
        ctx.fillRect(-s * 0.85, -s * 0.16, s * 0.42, s * 0.32);
        break;
      }

      case 'wavecutter_corvette':
      case 'trident_destroyer': {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(s * 1.6, 0);
        ctx.lineTo(-s * 1.3, -s * 0.52);
        ctx.lineTo(-s * 1.3, s * 0.52);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(-s * 0.6, -s * 0.28, s * 1.0, s * 0.56);
        break;
      }

      case 'iron_dreadnought': {
        // Armored siege train
        ctx.fillStyle = '#18181b';
        ctx.fillRect(-s * 1.6, -s * 0.65, s * 3.2, s * 1.3);
        ctx.fillStyle = color;
        ctx.fillRect(-s * 1.4, -s * 0.48, s * 2.8, s * 0.96);
        // Twin railguns
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(-s * 0.55, 0, s * 0.36, 0, Math.PI * 2);
        ctx.arc(s * 0.55, 0, s * 0.36, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(-s * 0.55, -s * 0.12, s * 1.45, s * 0.24);
        ctx.fillRect(s * 0.55, -s * 0.12, s * 1.45, s * 0.24);
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

  // Draw High-Quality Radar Minimap
  public drawMinimap(minimapCanvas: HTMLCanvasElement) {
    const mCtx = minimapCanvas.getContext('2d');
    if (!mCtx || this.terrain.length === 0) return;

    const mW = minimapCanvas.width;
    const mH = minimapCanvas.height;
    const tW = this.terrain[0].length;
    const tH = this.terrain.length;

    const cellW = mW / tW;
    const cellH = mH / tH;

    for (let y = 0; y < tH; y++) {
      for (let x = 0; x < tW; x++) {
        const c = this.terrain[y][x];
        mCtx.fillStyle = assetManager.getTerrainColor(c);
        mCtx.fillRect(x * cellW, y * cellH, cellW + 0.5, cellH + 0.5);
      }
    }

    // Base Dots
    this.bases.forEach((b) => {
      const isPlayer = b.ownerId === this.currentUserId;
      const isAllied = this.userAllianceId && b.allianceId === this.userAllianceId;
      const isEnemy = b.ownerId === 'enemy_insurgent' || (!isPlayer && !isAllied && b.ownerId !== 'neutral');

      mCtx.fillStyle = isPlayer ? '#3b82f6' : isAllied ? '#10b981' : isEnemy ? '#ef4444' : '#f59e0b';
      mCtx.beginPath();
      mCtx.arc(b.x * cellW, b.y * cellH, 4.5, 0, Math.PI * 2);
      mCtx.fill();
    });

    // Unit Dots
    this.units.forEach((u) => {
      if (!this.isCellVisible(u.x, u.y)) return;
      const isPlayer = u.ownerId === this.currentUserId;
      const isAllied = this.userAllianceId && u.allianceId === this.userAllianceId;
      const isEnemy = u.ownerId === 'enemy_insurgent' || (!isPlayer && !isAllied);

      mCtx.fillStyle = isPlayer ? '#38bdf8' : isAllied ? '#34d399' : isEnemy ? '#f87171' : '#fbbf24';
      mCtx.fillRect(u.x * cellW - 1, u.y * cellH - 1, 3.2, 3.2);
    });

    // Camera Frustum
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
