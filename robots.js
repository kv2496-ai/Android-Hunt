// Person B lane. TODO: Replace the clockwise fallback patrol with authored routes.
import { TILE_SIZE as T, TILE, isWalkable, EVENTS } from "./shared.js";

export function createRobots(map) {
  return map.robotSpawns.map((p, i) => ({ ...p, facing: { x: 1, y: 0 }, clock: i * 0.07 }));
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

/** 90-degree full cone, inclusive range/boundaries; all four catch conditions must hold. */
export function canSeePlayer(map, robot, player, sightRange) {
  if (player.hidden) return false;
  const dx = player.x - robot.x, dy = player.y - robot.y;
  const distance = Math.hypot(dx, dy);
  if (distance > sightRange) return false;
  if (distance && (dx * robot.facing.x + dy * robot.facing.y) / distance < Math.SQRT1_2 - 1e-9) return false;
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
  for (const robot of robots) {
    robot.clock += dt;
    if (robot.clock < 0.48) continue;
    robot.clock -= 0.48;
    const { x: dx, y: dy } = robot.facing;
    if (isWalkable(map, robot.x + dx, robot.y + dy)) {
      robot.x += dx; robot.y += dy;
    } else {
      robot.facing = { x: -dy, y: dx };
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
