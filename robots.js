// Robot patrols, wall-occluded vision, and rectangle-only pixel sprites.
import { TILE_SIZE as T, isWalkable, EVENTS } from "./shared.js";

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
  return clearSight(map, from.x, from.y, to.x, to.y);
}

// Tile centers have integer coordinates; fractional endpoints are used only for drawing.
function clearSight(map, fromX, fromY, toX, toY) {
  let x = Math.floor(fromX + 0.5), y = Math.floor(fromY + 0.5);
  const endX = Math.floor(toX + 0.5), endY = Math.floor(toY + 0.5);
  const dx = toX - fromX, dy = toY - fromY;
  const sx = Math.sign(dx), sy = Math.sign(dy);
  const stepX = dx ? 1 / Math.abs(dx) : Infinity;
  const stepY = dy ? 1 / Math.abs(dy) : Infinity;
  let nextX = dx ? (x + sx * 0.5 - fromX) / dx : Infinity;
  let nextY = dy ? (y + sy * 0.5 - fromY) / dy : Infinity;
  const wall = (cx, cy) => !isWalkable(map, cx, cy);
  if (wall(x, y) || wall(endX, endY)) return false;
  while (x !== endX || y !== endY) {
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

/** Rasterize the actual cone as horizontal pixel runs, clipped by walls and the viewport. */
function drawVisionCone(ctx, robot, map, sightRange, camera) {
  const cx = (robot.x + 0.5) * T, cy = (robot.y + 0.5) * T, radius = sightRange * T;
  const minX = Math.max(0, Math.floor(cx - radius), Math.floor(camera.x));
  const maxX = Math.min(map.width * T - 1, Math.ceil(cx + radius) - 1,
    Math.ceil(camera.x + (ctx.canvas?.width ?? map.width * T)) - 1);
  const minY = Math.max(0, Math.floor(cy - radius), Math.floor(camera.y));
  const maxY = Math.min(map.height * T - 1, Math.ceil(cy + radius) - 1,
    Math.ceil(camera.y + (ctx.canvas?.height ?? map.height * T)) - 1);
  ctx.fillStyle = "rgba(255, 98, 76, 0.16)";
  for (let y = minY; y <= maxY; y++) {
    let run = -1;
    for (let x = minX; x <= maxX; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, distanceSquared = dx * dx + dy * dy;
      const forward = dx * robot.facing.x + dy * robot.facing.y;
      const visible = distanceSquared <= radius * radius && forward >= 0 &&
        forward * forward >= distanceSquared * CONE_COSINE * CONE_COSINE - 1e-9 &&
        clearSight(map, robot.x, robot.y, (x + 0.5) / T - 0.5, (y + 0.5) / T - 0.5);
      if (visible && run < 0) run = x;
      if (!visible && run >= 0) {
        ctx.fillRect(run - camera.x, y - camera.y, x - run, 1);
        run = -1;
      }
    }
    if (run >= 0) ctx.fillRect(run - camera.x, y - camera.y, maxX + 1 - run, 1);
  }
}

export function drawRobots(ctx, robots, map, sightRange, camera) {
  for (const robot of robots) drawVisionCone(ctx, robot, map, sightRange, camera);
  // Keep every sprite above every cone, even where patrols overlap.
  for (const robot of robots) {
    const x = robot.x * T - camera.x, y = robot.y * T - camera.y;
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)"; ctx.fillRect(x + 2, y + 13, 13, 3);
    ctx.fillStyle = "#19232d"; ctx.fillRect(x + 3, y + 1, 10, 12);
    ctx.fillRect(x + 2, y + 8, 2, 4); ctx.fillRect(x + 12, y + 8, 2, 4);
    ctx.fillStyle = "#82939c"; ctx.fillRect(x + 4, y + 2, 8, 5);
    ctx.fillStyle = "#b9c7ca"; ctx.fillRect(x + 4, y + 2, 8, 1);
    ctx.fillStyle = "#526773"; ctx.fillRect(x + 4, y + 8, 8, 5);
    ctx.fillStyle = "#d18d52"; ctx.fillRect(x + 5, y + 8, 2, 3);
    ctx.fillStyle = "#111b24"; ctx.fillRect(x + 5, y + 4, 6, 2);
    ctx.fillRect(x + 4, y + 13, 3, 2); ctx.fillRect(x + 9, y + 13, 3, 2);
    ctx.fillStyle = "#81929b"; ctx.fillRect(x + 4, y + 13, 2, 1); ctx.fillRect(x + 9, y + 13, 2, 1);
    const eyeX = x + 7 + robot.facing.x * 3, eyeY = y + 4 + robot.facing.y * 2;
    ctx.fillStyle = "rgba(255, 40, 58, 0.16)"; ctx.fillRect(eyeX - 3, eyeY - 2, 8, 6);
    ctx.fillStyle = "rgba(255, 40, 58, 0.3)"; ctx.fillRect(eyeX - 1, eyeY - 1, 4, 4);
    ctx.fillStyle = "#ff334b"; ctx.fillRect(eyeX, eyeY, 2, 2);
    ctx.fillStyle = "#ffe2d8"; ctx.fillRect(eyeX, eyeY, 1, 1);
  }
}
