// Seeded office floors: retries keep their layout, later floors add rooms and patrols.
import { getDifficulty, TILE, TILE_SIZE } from "./shared.js";

const lighting = new WeakMap();
const generatorTiming = new WeakMap();
const timingMarker = state => Math.round((1 - Math.abs(state.elapsed / 0.65 % 2 - 1)) * 39);

/** First interaction starts; a miss resets; only a green-zone hit permits power. */
export function tryGeneratorTiming(map, generator) {
  const state = generatorTiming.get(map);
  if (state?.generator !== generator) {
    generatorTiming.set(map, { generator, elapsed: 0 });
    return false;
  }
  const marker = timingMarker(state);
  if (marker < 17 || marker > 23) { state.elapsed = 0; return false; }
  generatorTiming.delete(map);
  return true;
}

export function updateGeneratorTiming(map, player, dt = 0) {
  const state = generatorTiming.get(map);
  if (!state) return;
  if (state.generator.on || Math.abs(state.generator.x - player.x) + Math.abs(state.generator.y - player.y) > 1)
    generatorTiming.delete(map);
  else state.elapsed += Math.max(0, dt);
}

export function drawGeneratorTiming(ctx, map, camera) {
  const state = generatorTiming.get(map);
  if (!state) return;
  const x = Math.max(2, Math.min(ctx.canvas.width - 46, Math.round(state.generator.x * TILE_SIZE - camera.x) - 14));
  const y = Math.max(2, Math.min(ctx.canvas.height - 10, Math.round(state.generator.y * TILE_SIZE - camera.y) - 12));
  ctx.fillStyle = "#14271e"; ctx.fillRect(x, y, 44, 8);
  ctx.fillStyle = "#59634e"; ctx.fillRect(x + 2, y + 2, 40, 4);
  ctx.fillStyle = "#83b583"; ctx.fillRect(x + 19, y + 2, 7, 4);
  ctx.fillStyle = "#f2df9b"; ctx.fillRect(x + 2 + timingMarker(state), y + 1, 1, 6);
}

/** @returns {import("./shared.js").MapData} */
export function createLevel(level) {
  const difficulty = getDifficulty(level);
  const { mapW: width, mapH: height } = difficulty;
  const floor = Math.max(1, Math.floor(Number(level) || 1));
  let seed = (floor * 7919) >>> 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const tiles = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      if (!x || !y || x === width - 1 || y === height - 1) return TILE.WALL;
      return TILE.FLOOR;
    }));
  // Two cross-office corridors and a door in every divider keep every room linked.
  const boundaries = [0];
  for (let x = 8; x < width - 3; x += floor === 1 ? 8 : 7 + Math.floor(random() * 3)) {
    boundaries.push(x);
    // Keep extra doors above horizontal dividers, so a doorway cannot be isolated.
    const door = 4 + Math.floor(random() * 2);
    for (let y = 1; y < height - 1; y++)
      if (y !== 3 && y !== height - 4 && (floor === 1 || y !== door)) tiles[y][x] = TILE.WALL;
  }
  boundaries.push(width - 1);
  if (floor > 1) {
    for (let i = 1; i < boundaries.length; i++) {
      const left = boundaries[i - 1] + 1, right = boundaries[i] - 1;
      for (let y = 7; y < height - 5; y += 5) {
        const door = left + Math.floor(random() * (right - left + 1));
        for (let x = left; x <= right; x++) if (x !== door) tiles[y][x] = TILE.WALL;
      }
    }
  }
  const playerSpawn = { x: 2, y: height - 3 };
  const exit = { x: width - 3, y: height - 3 };
  const reserved = new Set();
  const key = p => `${p.x},${p.y}`;
  const cells = [];
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++)
      if (tiles[y][x] === TILE.FLOOR) cells.push({ x, y });
  // Pick existing floor rather than punching isolated holes in office walls.
  function reserveNear(target, allowed = () => true) {
    let best, distance = Infinity;
    for (const p of cells) {
      if (reserved.has(key(p)) || !allowed(p)) continue;
      const d = Math.abs(p.x - target.x) + Math.abs(p.y - target.y);
      if (d < distance) { best = p; distance = d; }
    }
    reserved.add(key(best));
    return { ...best };
  }
  reserved.add(key(playerSpawn));
  reserved.add(key(exit));
  const tutorialDesk = { x: playerSpawn.x, y: playerSpawn.y - 1 };
  reserved.add(key(tutorialDesk));
  const candidates = [
    { x: width - 4, y: 3 }, { x: 4, y: 3 },
    { x: width - 4, y: height - 4 }, { x: 11, y: height - 4 },
    { x: 11, y: 3 },
  ];
  const generators = candidates.slice(0, difficulty.numGenerators)
    .map(p => ({ ...reserveNear(p), on: false }));
  const robotSpawns = Array.from({ length: difficulty.numRobots }, (_, i) =>
    reserveNear({ x: 11 + (i % 3) * 3, y: 6 + Math.floor(i / 3) * 3 },
      p => Math.hypot(p.x - playerSpawn.x, p.y - playerSpawn.y) > difficulty.sightRange + 2));
  // An exact density budget avoids unlucky floors with almost no hiding places.
  const deskCells = cells.filter(p => !reserved.has(key(p)));
  for (let i = deskCells.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deskCells[i], deskCells[j]] = [deskCells[j], deskCells[i]];
  }
  const deskCount = Math.max(1, Math.round(cells.length * difficulty.deskDensity));
  for (const p of deskCells.slice(0, deskCount - 1)) tiles[p.y][p.x] = TILE.DESK;
  // A desk beside the spawn teaches hiding without a tutorial popup.
  tiles[tutorialDesk.y][tutorialDesk.x] = TILE.DESK;
  return { width, height, tiles, generators, playerSpawn, robotSpawns, exit };
}

/**
 * Call after drawing the world, robots and player, before UI overlays.
 * Reads generator.on (set by activateGenerator); no global bus or subscriptions.
 * The optional timestamp uses milliseconds, like requestAnimationFrame.
 */
export function drawDarkness(ctx, map, camera, now = globalThis.performance?.now() ?? Date.now()) {
  const powered = map.generators.filter(g => g.on).length;
  let state = lighting.get(map);
  if (!state) {
    state = { powered: 0, changedAt: -Infinity };
    lighting.set(map, state);
  }
  if (powered !== state.powered) {
    state.changedAt = powered > state.powered ? now : -Infinity;
    state.powered = powered;
  }
  const progress = map.generators.length ? powered / map.generators.length : 1;
  const elapsed = Math.max(0, now - state.changedAt);
  let alpha = 0.84 - progress * 0.70;
  // Brief, diminishing power surges, then steady brighter lighting.
  if (elapsed < 360) {
    const pulses = [0.12, -0.08, 0.09, -0.04, 0.05, -0.02];
    alpha += pulses[Math.floor(elapsed / 60)] * (1 - elapsed / 360);
  }
  alpha = Math.max(0.06, Math.min(0.92, alpha));
  const x = Math.max(0, -camera.x), y = Math.max(0, -camera.y);
  const width = Math.min(ctx.canvas.width, map.width * TILE_SIZE - camera.x) - x;
  const height = Math.min(ctx.canvas.height, map.height * TILE_SIZE - camera.y) - y;
  if (width <= 0 || height <= 0) return;
  const fillStyle = ctx.fillStyle;
  ctx.fillStyle = `rgba(3, 7, 14, ${alpha})`;
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = fillStyle;
}
