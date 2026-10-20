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
