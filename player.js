// Player movement, interaction, and rectangle-only pixel art.
import { TILE_SIZE as T, isWalkable, isHidingSpot, EVENTS } from "./shared.js";

// Animate pixels only: collision, cover, and objectives always use integer tiles.
const STEP_MS = 120;
const SNEAK_STEP_MS = 260;
const DUST_MS = 320;
const states = new WeakMap();
const sneakInputs = new WeakMap();

function sneakInput() {
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") return null;
  if (sneakInputs.has(window)) return sneakInputs.get(window);
  const input = { shifts: new Set(), modifier: false };
  const isShift = event => ["ShiftLeft", "ShiftRight", "Shift"].includes(event.code || event.key);
  window.addEventListener("keydown", event => {
    if (isShift(event)) input.shifts.add(event.code || event.key);
    if (typeof event.shiftKey === "boolean") input.modifier = event.shiftKey;
  });
  window.addEventListener("keyup", event => {
    if (isShift(event)) input.shifts.delete(event.code || event.key);
    if (typeof event.shiftKey === "boolean") input.modifier = event.shiftKey;
  });
  const clear = () => { input.shifts.clear(); input.modifier = false; };
  window.addEventListener("blur", clear);
  window.document?.addEventListener("visibilitychange", clear);
  sneakInputs.set(window, input);
  return input;
}

function playerState(player) {
  if (!states.has(player)) states.set(player, {
    input: sneakInput(), animation: null, dust: [],
    hiddenSince: player.hidden ? performance.now() : null,
  });
  return states.get(player);
}

function updateHiding(player, map, state, time) {
  player.hidden = isHidingSpot(map, player.x, player.y);
  if (!player.hidden) state.hiddenSince = null;
  else if (state.hiddenSince === null) state.hiddenSince = time;
}

function walkFrame(player, state, time) {
  const animation = state.animation;
  if (!animation || animation.toX !== player.x || animation.toY !== player.y)
    return { x: player.x, y: player.y, progress: 1, step: 0, sneaking: false };
  const progress = Math.max(0, Math.min(1, (time - animation.started) / animation.duration));
  return {
    x: animation.fromX + (player.x - animation.fromX) * progress,
    y: animation.fromY + (player.y - animation.fromY) * progress,
    progress, step: animation.step, sneaking: animation.sneaking,
  };
}

export function createPlayer(map) {
  const player = { ...map.playerSpawn, hidden: isHidingSpot(map, map.playerSpawn.x, map.playerSpawn.y), facing: { x: 0, y: -1 } };
  playerState(player);
  return player;
}

export function movePlayer(player, dx, dy, map) {
  const state = playerState(player), time = performance.now();
  updateHiding(player, map, state, time);
  if (!Number.isInteger(dx) || !Number.isInteger(dy) || Math.abs(dx) + Math.abs(dy) !== 1) return false;
  if (!isWalkable(map, player.x + dx, player.y + dy)) return false;
  const sneaking = Boolean(state.input?.shifts.size || state.input?.modifier);
  const previous = state.animation;
  // main.js owns key repeat. Reject its extra ticks rather than changing tile coordinates.
  if (sneaking && previous?.toX === player.x && previous.toY === player.y &&
      time - previous.started < SNEAK_STEP_MS) return false;
  player.facing = { x: dx, y: dy };
  state.animation = {
    fromX: player.x, fromY: player.y,
    toX: player.x + dx, toY: player.y + dy,
    started: time, duration: sneaking ? SNEAK_STEP_MS : STEP_MS,
    step: (previous?.step || 0) + 1, sneaking,
  };
  player.x += dx; player.y += dy;
  updateHiding(player, map, state, time);
  if (!sneaking && !player.hidden) {
    state.dust = state.dust.filter(p => time - p.born < DUST_MS).slice(-10);
    for (const side of [-1, 1]) state.dust.push({
      x: state.animation.fromX * T + 8 - dx * 4 + dy * side * 2,
      y: state.animation.fromY * T + 12 - dy * 4 - dx * side * 2,
      vx: -dx * 8 + dy * side * 5, vy: -dy * 8 - dx * side * 5 - 4,
      born: time,
    });
  }
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
  const state = playerState(player), time = performance.now();
  const frame = walkFrame(player, state, time);
  state.dust = state.dust.filter(p => time - p.born < DUST_MS);
  for (const particle of state.dust) {
    const age = Math.max(0, time - particle.born);
    ctx.fillStyle = `rgba(156, 151, 118, ${(1 - age / DUST_MS) * 0.35})`;
    const size = age < DUST_MS / 2 ? 2 : 1;
    ctx.fillRect(Math.round(particle.x + particle.vx * age / 1000 - camera.x),
      Math.round(particle.y + particle.vy * age / 1000 - camera.y), size, size);
  }
  const x = Math.round(frame.x * T - camera.x), y = Math.round(frame.y * T - camera.y);
  const hidden = player.hidden;
  const lift = hidden ? 0 : Math.round(Math.sin(frame.progress * Math.PI) * (frame.sneaking ? 1 : 2));
  const tuck = hidden ? 4 : 0, bob = !frame.sneaking && lift ? 1 : 0;
  ctx.fillStyle = "#142b20"; ctx.fillRect(x + 4, y + 12, 9, 3);
  ctx.fillStyle = hidden ? "#61735b" : "#c2c9a0";
  ctx.fillRect(x + 4, y + 12 - (frame.step % 2 ? lift : 0), 3, 2);
  ctx.fillRect(x + 9, y + 12 - (frame.step % 2 ? 0 : lift), 3, 2);
  ctx.fillStyle = hidden ? "#52694f" : "#d5ac57";
  ctx.fillRect(x + 4, y + 7 + tuck - bob, 8, hidden ? 3 : 5);
  ctx.fillStyle = hidden ? "#8a9b7d" : "#ead388";
  ctx.fillRect(x + 5, y + 2 + tuck - bob, 6, 5);
  ctx.fillRect(x + 3, y + 8 + tuck - bob, 1, hidden ? 2 : 3);
  ctx.fillRect(x + 12, y + 8 + tuck - bob, 1, hidden ? 2 : 3);
  ctx.fillStyle = hidden ? "#445747" : "#645337";
  ctx.fillRect(x + 5, y + 2 + tuck - bob, 6, 1);
  ctx.fillStyle = hidden ? "#243c2b" : "#2f4030";
  ctx.fillRect(x + 6 + player.facing.x, y + 4 + tuck - bob + player.facing.y, 3, 1);
  if (hidden) {
    if (state.hiddenSince === null) state.hiddenSince = time;
    ctx.fillStyle = "#8ca47d"; ctx.fillRect(x + 1, y + 1, 3, 1); ctx.fillRect(x + 1, y + 1, 1, 3);
    ctx.fillRect(x + 12, y + 14, 3, 1); ctx.fillRect(x + 14, y + 12, 1, 3);
    const pulse = (time - state.hiddenSince) % 1400;
    if (pulse < 700) {
      ctx.fillStyle = `rgba(182, 209, 151, ${0.2 + Math.sin(pulse / 700 * Math.PI) * 0.45})`;
      for (let dot = 0; dot < 3; dot++)
        ctx.fillRect(Math.round(player.x * T - camera.x) + 4 + dot * 3,
          Math.round(player.y * T - camera.y) - 2, 2, 1);
    }
  } else state.hiddenSince = null;
}
