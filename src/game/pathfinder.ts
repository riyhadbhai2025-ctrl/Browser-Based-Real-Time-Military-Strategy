import { TerrainType, UnitCategory } from '../types/game';

interface Node {
  x: number;
  y: number;
  g: number;
  h: number;
  f: number;
  parent?: Node;
}

export function isCellPassable(
  terrain: TerrainType[][],
  x: number,
  y: number,
  category: UnitCategory
): boolean {
  const height = terrain.length;
  const width = terrain[0]?.length || 0;
  if (x < 0 || x >= width || y < 0 || y >= height) return false;

  const cell = terrain[y][x];

  switch (category) {
    case 'air':
      return true; // Air units fly freely over all terrain

    case 'naval':
      return cell === 'water' || cell === 'deep_water' || cell === 'swamp';

    case 'rail':
      return cell === 'railway' || cell === 'bridge_rail';

    case 'ground':
    default:
      if (cell === 'mountain' || cell === 'snow' || cell === 'water' || cell === 'deep_water') {
        return false;
      }
      return true;
  }
}

export function isRailCell(terrain: TerrainType[][], x: number, y: number): boolean {
  const height = terrain.length;
  const width = terrain[0]?.length || 0;
  if (x < 0 || x >= width || y < 0 || y >= height) return false;
  const cell = terrain[y][x];
  return cell === 'railway' || cell === 'bridge_rail';
}

export function getConnectedRailwayCells(terrain: TerrainType[][], startX: number, startY: number): Set<string> {
  const connected = new Set<string>();
  if (!isRailCell(terrain, startX, startY)) return connected;

  const queue: { x: number; y: number }[] = [{ x: startX, y: startY }];
  connected.add(`${startX},${startY}`);

  const dirs = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
    { dx: 1, dy: 1 },
    { dx: -1, dy: 1 },
    { dx: 1, dy: -1 },
    { dx: -1, dy: -1 },
  ];

  while (queue.length > 0) {
    const { x, y } = queue.shift()!;

    for (const d of dirs) {
      const nx = x + d.dx;
      const ny = y + d.dy;
      const key = `${nx},${ny}`;
      if (connected.has(key)) continue;

      if (isRailCell(terrain, nx, ny)) {
        // If diagonal, require both intermediate orthogonal cells to be rail cells (valid track curve)
        if (d.dx !== 0 && d.dy !== 0) {
          if (!isRailCell(terrain, x + d.dx, y) || !isRailCell(terrain, x, y + d.dy)) {
            continue;
          }
        }
        connected.add(key);
        queue.push({ x: nx, y: ny });
      }
    }
  }

  return connected;
}

export function getConnectedRailwayCellsForBase(
  terrain: TerrainType[][],
  base: { x: number; y: number; radius?: number }
): Set<string> {
  const connected = new Set<string>();
  const height = terrain.length;
  const width = terrain[0]?.length || 0;
  if (height === 0 || width === 0) return connected;

  const searchRadius = (base.radius || 4) + 8;
  const bx = Math.round(base.x);
  const by = Math.round(base.y);

  const seeds: { x: number; y: number }[] = [];
  for (let dy = -searchRadius; dy <= searchRadius; dy++) {
    for (let dx = -searchRadius; dx <= searchRadius; dx++) {
      const tx = bx + dx;
      const ty = by + dy;
      if (tx >= 0 && tx < width && ty >= 0 && ty < height) {
        if (isRailCell(terrain, tx, ty)) {
          seeds.push({ x: tx, y: ty });
        }
      }
    }
  }

  if (seeds.length === 0) return connected;

  const queue: { x: number; y: number }[] = [];
  for (const s of seeds) {
    const key = `${s.x},${s.y}`;
    if (!connected.has(key)) {
      connected.add(key);
      queue.push(s);
    }
  }

  const dirs = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
    { dx: 1, dy: 1 },
    { dx: -1, dy: 1 },
    { dx: 1, dy: -1 },
    { dx: -1, dy: -1 },
  ];

  while (queue.length > 0) {
    const { x, y } = queue.shift()!;

    for (const d of dirs) {
      const nx = x + d.dx;
      const ny = y + d.dy;
      const key = `${nx},${ny}`;
      if (connected.has(key)) continue;

      if (isRailCell(terrain, nx, ny)) {
        if (d.dx !== 0 && d.dy !== 0) {
          if (!isRailCell(terrain, x + d.dx, y) || !isRailCell(terrain, x, y + d.dy)) {
            continue;
          }
        }
        connected.add(key);
        queue.push({ x: nx, y: ny });
      }
    }
  }

  return connected;
}

export function findRailwayPath(
  terrain: TerrainType[][],
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  maxSteps = 600
): { x: number; y: number }[] {
  const sx = Math.round(startX);
  const sy = Math.round(startY);
  const ex = Math.round(endX);
  const ey = Math.round(endY);

  const height = terrain.length;
  const width = terrain[0]?.length || 0;
  if (sx < 0 || sx >= width || sy < 0 || sy >= height) return [];
  if (ex < 0 || ex >= width || ey < 0 || ey >= height) return [];

  if (!isRailCell(terrain, sx, sy)) return [];

  let targetX = ex;
  let targetY = ey;
  if (!isRailCell(terrain, targetX, targetY)) {
    let found = false;
    let closestDist = Infinity;
    const connected = getConnectedRailwayCells(terrain, sx, sy);
    for (const key of connected) {
      const [cx, cy] = key.split(',').map(Number);
      const dist = Math.hypot(cx - ex, cy - ey);
      if (dist < closestDist && dist <= 8) {
        closestDist = dist;
        targetX = cx;
        targetY = cy;
        found = true;
      }
    }
    if (!found) return [];
  }

  const connectedNetwork = getConnectedRailwayCells(terrain, sx, sy);
  if (!connectedNetwork.has(`${targetX},${targetY}`)) {
    return [];
  }

  if (sx === targetX && sy === targetY) {
    return [{ x: targetX, y: targetY }];
  }

  const openSet: Node[] = [];
  const closedSet = new Uint8Array(width * height);

  const startNode: Node = {
    x: sx,
    y: sy,
    g: 0,
    h: Math.hypot(targetX - sx, targetY - sy),
    f: Math.hypot(targetX - sx, targetY - sy),
  };
  openSet.push(startNode);

  const directions = [
    { dx: 1, dy: 0, cost: 1 },
    { dx: -1, dy: 0, cost: 1 },
    { dx: 0, dy: 1, cost: 1 },
    { dx: 0, dy: -1, cost: 1 },
    { dx: 1, dy: 1, cost: 1.414 },
    { dx: -1, dy: 1, cost: 1.414 },
    { dx: 1, dy: -1, cost: 1.414 },
    { dx: -1, dy: -1, cost: 1.414 },
  ];

  let steps = 0;
  let closestNode = startNode;

  while (openSet.length > 0 && steps < maxSteps) {
    steps++;

    let bestIndex = 0;
    for (let i = 1; i < openSet.length; i++) {
      if (openSet[i].f < openSet[bestIndex].f) {
        bestIndex = i;
      }
    }

    const current = openSet.splice(bestIndex, 1)[0];
    const currentIndex = current.y * width + current.x;
    closedSet[currentIndex] = 1;

    if (current.h < closestNode.h) {
      closestNode = current;
    }

    if (current.x === targetX && current.y === targetY) {
      return reconstructPath(current);
    }

    for (const dir of directions) {
      const nx = current.x + dir.dx;
      const ny = current.y + dir.dy;

      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      if (closedSet[ny * width + nx] === 1) continue;

      if (!isRailCell(terrain, nx, ny)) continue;

      if (dir.dx !== 0 && dir.dy !== 0) {
        if (!isRailCell(terrain, current.x + dir.dx, current.y) ||
            !isRailCell(terrain, current.x, current.y + dir.dy)) {
          continue;
        }
      }

      const tentativeG = current.g + dir.cost;
      const existing = openSet.find((n) => n.x === nx && n.y === ny);

      if (!existing) {
        const h = Math.hypot(targetX - nx, targetY - ny);
        openSet.push({
          x: nx,
          y: ny,
          g: tentativeG,
          h,
          f: tentativeG + h,
          parent: current,
        });
      } else if (tentativeG < existing.g) {
        existing.g = tentativeG;
        existing.f = tentativeG + existing.h;
        existing.parent = current;
      }
    }
  }

  return reconstructPath(closestNode);
}

export function findPath(
  terrain: TerrainType[][],
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  category: UnitCategory,
  maxSteps = 400
): { x: number; y: number }[] {
  const sx = Math.round(startX);
  const sy = Math.round(startY);
  const ex = Math.round(endX);
  const ey = Math.round(endY);

  const height = terrain.length;
  const width = terrain[0]?.length || 0;

  if (category === 'rail') {
    return findRailwayPath(terrain, sx, sy, ex, ey, maxSteps);
  }

  // Air units fly in a direct line
  if (category === 'air') {
    return [
      { x: sx, y: sy },
      { x: endX, y: endY },
    ];
  }

  // Check start & target boundaries
  if (sx < 0 || sx >= width || sy < 0 || sy >= height) return [];
  if (ex < 0 || ex >= width || ey < 0 || ey >= height) return [];

  // If destination is impassable, find nearest passable neighbor
  let targetX = ex;
  let targetY = ey;
  if (!isCellPassable(terrain, targetX, targetY, category)) {
    let found = false;
    for (let r = 1; r <= 3 && !found; r++) {
      for (let dy = -r; dy <= r && !found; dy++) {
        for (let dx = -r; dx <= r && !found; dx++) {
          const nx = ex + dx;
          const ny = ey + dy;
          if (isCellPassable(terrain, nx, ny, category)) {
            targetX = nx;
            targetY = ny;
            found = true;
          }
        }
      }
    }
    if (!found) return [];
  }

  if (sx === targetX && sy === targetY) {
    return [{ x: targetX, y: targetY }];
  }

  const openSet: Node[] = [];
  const closedSet = new Uint8Array(width * height);

  const startNode: Node = {
    x: sx,
    y: sy,
    g: 0,
    h: Math.hypot(targetX - sx, targetY - sy),
    f: Math.hypot(targetX - sx, targetY - sy),
  };
  openSet.push(startNode);

  const directions = [
    { dx: 1, dy: 0, cost: 1 },
    { dx: -1, dy: 0, cost: 1 },
    { dx: 0, dy: 1, cost: 1 },
    { dx: 0, dy: -1, cost: 1 },
    { dx: 1, dy: 1, cost: 1.414 },
    { dx: -1, dy: 1, cost: 1.414 },
    { dx: 1, dy: -1, cost: 1.414 },
    { dx: -1, dy: -1, cost: 1.414 },
  ];

  let steps = 0;
  let closestNode = startNode;

  while (openSet.length > 0 && steps < maxSteps) {
    steps++;

    // Find node with lowest f
    let bestIndex = 0;
    for (let i = 1; i < openSet.length; i++) {
      if (openSet[i].f < openSet[bestIndex].f) {
        bestIndex = i;
      }
    }

    const current = openSet.splice(bestIndex, 1)[0];
    const currentIndex = current.y * width + current.x;
    closedSet[currentIndex] = 1;

    if (current.h < closestNode.h) {
      closestNode = current;
    }

    // Reached destination
    if (current.x === targetX && current.y === targetY) {
      return reconstructPath(current);
    }

    for (const dir of directions) {
      const nx = current.x + dir.dx;
      const ny = current.y + dir.dy;

      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

      const neighborIndex = ny * width + nx;
      if (closedSet[neighborIndex] === 1) continue;

      if (!isCellPassable(terrain, nx, ny, category)) continue;

      // Prevent cutting diagonal through corners of obstacles
      if (dir.dx !== 0 && dir.dy !== 0) {
        if (!isCellPassable(terrain, current.x + dir.dx, current.y, category) ||
            !isCellPassable(terrain, current.x, current.y + dir.dy, category)) {
          continue;
        }
      }

      // Terrain speed factor
      let terrainCost = dir.cost;
      const cellType = terrain[ny][nx];
      if (cellType === 'highway') terrainCost *= 0.55;
      else if (cellType === 'road' || cellType === 'bridge_road') terrainCost *= 0.65;
      else if (cellType === 'rural_road') terrainCost *= 0.72;
      else if (cellType === 'damaged_road') terrainCost *= 0.85;
      else if (cellType === 'dirt_road') terrainCost *= 0.8;
      else if (cellType === 'mud_track' || cellType === 'mud') terrainCost *= 1.4;
      else if (cellType === 'forest' || cellType === 'pine_forest' || cellType === 'forest_floor') terrainCost *= 1.35;
      else if (cellType === 'swamp' || cellType === 'marsh') terrainCost *= 1.8;
      else if (cellType === 'sand') terrainCost *= 1.2;
      else if (cellType === 'hills') terrainCost *= 1.2;
      else if (cellType === 'rock') terrainCost *= 1.25;

      const tentativeG = current.g + terrainCost;
      const existing = openSet.find((n) => n.x === nx && n.y === ny);

      if (!existing) {
        const h = Math.hypot(targetX - nx, targetY - ny);
        openSet.push({
          x: nx,
          y: ny,
          g: tentativeG,
          h,
          f: tentativeG + h,
          parent: current,
        });
      } else if (tentativeG < existing.g) {
        existing.g = tentativeG;
        existing.f = tentativeG + existing.h;
        existing.parent = current;
      }
    }
  }

  // If didn't reach exact destination, return path to closest explored node
  return reconstructPath(closestNode);
}

function reconstructPath(node: Node): { x: number; y: number }[] {
  const path: { x: number; y: number }[] = [];
  let curr: Node | undefined = node;
  while (curr) {
    path.unshift({ x: curr.x, y: curr.y });
    curr = curr.parent;
  }
  return path;
}
