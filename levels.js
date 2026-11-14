// Person A lane. TODO: Replace this deterministic fallback with authored office floors.
import { getDifficulty, TILE } from "./shared.js";

/** @returns {import("./shared.js").MapData} */
export function createLevel(level) {
  const difficulty = getDifficulty(level);
  const { mapW: width, mapH: height } = difficulty;
  let seed = (level * 7919) >>> 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const tiles = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      if (!x || !y || x === width - 1 || y === height - 1) return TILE.WALL;
      if (x % 8 === 0 && y !== 3 && y !== height - 4) return TILE.WALL;
      return random() < difficulty.deskDensity ? TILE.DESK : TILE.FLOOR;
    }));
  const playerSpawn = { x: 2, y: height - 3 };
  const exit = { x: width - 3, y: height - 3 };
  const candidates = [
    { x: width - 4, y: 3 }, { x: 4, y: 3 },
    { x: width - 4, y: height - 4 }, { x: 11, y: height - 4 },
    { x: 11, y: 3 },
  ];
  const generators = candidates.slice(0, difficulty.numGenerators).map(p => ({ ...p, on: false }));
  const robotSpawns = Array.from({ length: difficulty.numRobots }, (_, i) => ({
    x: 11 + (i % 3) * 3, y: 6 + Math.floor(i / 3) * 3,
  }));
  for (const p of [playerSpawn, exit, ...generators, ...robotSpawns]) tiles[p.y][p.x] = TILE.FLOOR;
  // A desk beside the spawn teaches hiding without a tutorial popup.
  tiles[playerSpawn.y - 1][playerSpawn.x] = TILE.DESK;
  return { width, height, tiles, generators, playerSpawn, robotSpawns, exit };
}
