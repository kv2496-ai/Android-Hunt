// Person B lane. TODO: Add rectangle-only walk animation while keeping tile coordinates.
import { TILE_SIZE as T, isWalkable, isHidingSpot, EVENTS } from "./shared.js";

// Animate pixels only: collision, cover, and objectives always use integer tiles.
const STEP_MS = 120;
const animations = new WeakMap();

function walkFrame(player, time) {
  const animation = animations.get(player);
  if (!animation || animation.toX !== player.x || animation.toY !== player.y)
    return { x: player.x, y: player.y, progress: 1, step: 0 };
  const progress = Math.max(0, Math.min(1, (time - animation.started) / STEP_MS));
  return {
    x: animation.fromX + (player.x - animation.fromX) * progress,
    y: animation.fromY + (player.y - animation.fromY) * progress,
    progress, step: animation.step,
  };
}

export function createPlayer(map) {
  return { ...map.playerSpawn, hidden: isHidingSpot(map, map.playerSpawn.x, map.playerSpawn.y), facing: { x: 0, y: -1 } };
}

export function movePlayer(player, dx, dy, map) {
  player.hidden = isHidingSpot(map, player.x, player.y);
  if (!Number.isInteger(dx) || !Number.isInteger(dy) || Math.abs(dx) + Math.abs(dy) !== 1) return false;
  player.facing = { x: dx, y: dy };
  if (!isWalkable(map, player.x + dx, player.y + dy)) return false;
  animations.set(player, {
    fromX: player.x, fromY: player.y,
    toX: player.x + dx, toY: player.y + dy,
    started: performance.now(), step: (animations.get(player)?.step || 0) + 1,
  });
  player.x += dx; player.y += dy;
  player.hidden = isHidingSpot(map, player.x, player.y);
  return true;
}

export function activateGenerator(player, map, bus) {
  const generator = map.generators.find(g => !g.on && Math.abs(g.x - player.x) + Math.abs(g.y - player.y) <= 1);
  if (!generator) return false;
  generator.on = true;
  bus.emit(EVENTS.GENERATOR_ON, { generator, map });
  if (map.generators.every(g => g.on)) bus.emit(EVENTS.ALL_GENERATORS_ON, { map });
  return true;
}

export function drawPlayer(ctx, player, camera) {
  const frame = walkFrame(player, performance.now());
  const x = Math.round(frame.x * T - camera.x), y = Math.round(frame.y * T - camera.y);
  ctx.fillStyle = "#142b20"; ctx.fillRect(x + 4, y + 12, 9, 3);
  ctx.fillStyle = player.hidden ? "#afbe8c" : "#ead388"; ctx.fillRect(x + 5, y + 2, 6, 5);
  ctx.fillStyle = player.hidden ? "#728a60" : "#d5ac57"; ctx.fillRect(x + 4, y + 7, 8, 5);
  ctx.fillStyle = "#c2c9a0"; ctx.fillRect(x + 4, y + 12, 3, 2); ctx.fillRect(x + 9, y + 12, 3, 2);
  ctx.fillStyle = "#2f4030"; ctx.fillRect(x + 6 + player.facing.x, y + 4 + player.facing.y, 3, 1);
  if (player.hidden) {
    ctx.fillStyle = "#b6d197"; ctx.fillRect(x + 1, y + 1, 3, 1); ctx.fillRect(x + 1, y + 1, 1, 3);
    ctx.fillRect(x + 12, y + 14, 3, 1); ctx.fillRect(x + 14, y + 12, 1, 3);
  }
}
