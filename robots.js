// Robot patrols, wall-occluded vision, and rectangle-only pixel sprites.
import { TILE_SIZE as T, TILE, isWalkable, EVENTS } from "./shared.js";

const PATROL_STEP = 0.48;
const CONE_COSINE = Math.cos(Math.PI / 6);
const DIRECTIONS = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];

export function createRobots(map) {
  return map.robotSpawns.map((p, i) => ({
    ...p, facing: { x: 1, y: 0 }, clock: i * 0.07,
    patrolSeed: ((p.x + 1) * 73856093 ^ (p.y + 1) * 19349663 ^ map.width * 83492791 ^ i) >>> 0,
    route: [],
  }));
}

/** Pick a random reachable destination, then reconstruct a shortest cardinal route. */
function planPatrol(robot, map) {
  const start = robot.y * map.width + robot.x;
  const previous = new Int32Array(map.width * map.height).fill(-1);
  previous[start] = start;
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const tile = queue[head], x = tile % map.width, y = Math.floor(tile / map.width);
    for (const direction of DIRECTIONS) {
      const nx = x + direction.x, ny = y + direction.y, next = ny * map.width + nx;
      if (!isWalkable(map, nx, ny) || previous[next] !== -1) continue;
      previous[next] = tile;
      queue.push(next);
    }
  }
  if (queue.length < 2) return [];
  // Local random state makes retries reproducible without changing global randomness.
  robot.patrolSeed = (Math.imul(robot.patrolSeed ?? start, 1664525) + 1013904223) >>> 0;
  const destination = queue[1 + Math.floor(robot.patrolSeed / 4294967296 * (queue.length - 1))];
  const route = [];
  for (let tile = destination; tile !== start; tile = previous[tile])
    route.push({ x: tile % map.width, y: Math.floor(tile / map.width) });
  return route.reverse();
}

/** Supercover grid ray: walls block sight, including diagonal wall corners. Desks do not. */
export function hasLineOfSight(map, from, to) {
  let x = from.x, y = from.y;
  const dx = to.x - x, dy = to.y - y;
  const sx = Math.sign(dx), sy = Math.sign(dy);
  const stepX = dx ? 1 / Math.abs(dx) : Infinity;
  const stepY = dy ? 1 / Math.abs(dy) : Infinity;
  let nextX = stepX / 2, nextY = stepY / 2;
  const wall = (cx, cy) => !isWalkable(map, cx, cy) || map.tiles[cy][cx] === TILE.WALL;
  if (wall(x, y) || wall(to.x, to.y)) return false;
  while (x !== to.x || y !== to.y) {
    if (Math.abs(nextX - nextY) < 1e-9) {
      if (wall(x + sx, y) || wall(x, y + sy)) return false;
      x += sx; y += sy; nextX += stepX; nextY += stepY;
    } else if (nextX < nextY) {
      x += sx; nextX += stepX;
    } else {
      y += sy; nextY += stepY;
    }
    if (wall(x, y)) return false;
  }
  return true;
}

/** 60-degree full cone, inclusive range/boundaries; all four catch conditions must hold. */
export function canSeePlayer(map, robot, player, sightRange) {
  if (player.hidden) return false;
  const dx = player.x - robot.x, dy = player.y - robot.y;
  const distance = Math.hypot(dx, dy);
  if (distance > sightRange) return false;
  if (distance && (dx * robot.facing.x + dy * robot.facing.y) / distance < CONE_COSINE - 1e-9) return false;
  return hasLineOfSight(map, robot, player);
}

export function detectPlayer(robots, player, map, sightRange, bus) {
  const robot = robots.find(r => canSeePlayer(map, r, player, sightRange));
  if (robot) bus.emit(EVENTS.CAUGHT, { robot, player });
  return Boolean(robot);
}

export function updateRobots(robots, dt, player, map, sightRange, bus) {
  // Detect both before and after patrol movement so a robot cannot step past the player.
  if (detectPlayer(robots, player, map, sightRange, bus)) return;
  const elapsed = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  for (const robot of robots) {
    robot.clock = (robot.clock ?? 0) + elapsed;
    while (robot.clock >= PATROL_STEP) {
      robot.clock -= PATROL_STEP;
      if (!robot.route) {
        // Accept existing caller-created robots with only position, facing, and clock.
        const next = { x: robot.x + robot.facing.x, y: robot.y + robot.facing.y };
        robot.route = isWalkable(map, next.x, next.y) ? [next] : [];
      }
      const next = robot.route[0];
      if (!next || !isWalkable(map, next.x, next.y) ||
          Math.abs(next.x - robot.x) + Math.abs(next.y - robot.y) !== 1)
        robot.route = planPatrol(robot, map);
      const point = robot.route.shift();
      if (!point) {
        robot.clock %= PATROL_STEP;
        break;
      }
      robot.facing = { x: point.x - robot.x, y: point.y - robot.y };
      robot.x = point.x; robot.y = point.y;
      if (detectPlayer(robots, player, map, sightRange, bus)) return;
    }
  }
  detectPlayer(robots, player, map, sightRange, bus);
}

export function drawRobots(ctx, robots, map, sightRange, camera) {
  for (const robot of robots) {
    ctx.fillStyle = "rgba(215, 166, 83, 0.13)";
    for (let y = Math.max(1, robot.y - sightRange); y <= Math.min(map.height - 2, robot.y + sightRange); y++) {
      for (let x = Math.max(1, robot.x - sightRange); x <= Math.min(map.width - 2, robot.x + sightRange); x++) {
        if (canSeePlayer(map, robot, { x, y, hidden: false }, sightRange))
          ctx.fillRect(x * T - camera.x + 1, y * T - camera.y + 1, T - 2, T - 2);
      }
    }
    const x = robot.x * T - camera.x, y = robot.y * T - camera.y;
    ctx.fillStyle = "#14271e"; ctx.fillRect(x + 3, y + 12, 11, 3);
    ctx.fillStyle = "#a45c46"; ctx.fillRect(x + 4, y + 6, 9, 7);
    ctx.fillStyle = "#ce9270"; ctx.fillRect(x + 4, y + 2, 9, 6);
    ctx.fillStyle = "#533b30"; ctx.fillRect(x + 5, y + 4, 7, 2);
    ctx.fillStyle = "#f1cf80"; ctx.fillRect(x + 7 + robot.facing.x * 2, y + 4 + robot.facing.y, 2, 2);
    ctx.fillStyle = "#a4ac89"; ctx.fillRect(x + 4, y + 13, 3, 2); ctx.fillRect(x + 10, y + 13, 3, 2);
  }
}
