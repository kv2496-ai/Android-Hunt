/** Shared contract. Changes require Person A and Person B's agreement. */
export const TILE_SIZE = 16;
export const TILE = Object.freeze({ FLOOR: 0, WALL: 1, DESK: 2 });
export const EVENTS = Object.freeze({
  GENERATOR_ON: "generatorOn",
  ALL_GENERATORS_ON: "allGeneratorsOn",
  CAUGHT: "caught",
  LEVEL_COMPLETE: "levelComplete",
});

/**
 * Coordinates are integer tile positions, not pixels. tiles[y][x] is row-major.
 * @typedef {{x:number, y:number}} Point
 * @typedef {Object} MapData
 * @property {number} width
 * @property {number} height
 * @property {number[][]} tiles 0 = floor, 1 = wall, 2 = desk
 * @property {{x:number, y:number, on:boolean}[]} generators
 * @property {Point} playerSpawn
 * @property {Point[]} robotSpawns
 * @property {Point} exit
 */

/** All values are bounded so later floors remain playable. sightRange is in tiles. */
export function getDifficulty(level) {
  const n = Math.max(1, Math.floor(Number(level) || 1));
  return {
    mapW: Math.min(32, 24 + 2 * (n - 1)),
    mapH: Math.min(22, 16 + 2 * (n - 1)),
    numGenerators: Math.min(15, 2 + 2 * (n - 1)),
    numRobots: Math.min(10, n),
    deskDensity: Math.max(0.08, 0.15 - (n - 1) * 0.005),
    sightRange: Math.min(7, 4 + Math.floor((n - 1) / 3)),
  };
}

export function isWalkable(map, x, y) {
  return Number.isInteger(x) && Number.isInteger(y) &&
    x >= 0 && y >= 0 && x < map.width && y < map.height &&
    (map.tiles[y][x] === TILE.FLOOR || map.tiles[y][x] === TILE.DESK);
}

export function isHidingSpot(map, x, y) {
  return isWalkable(map, x, y) && map.tiles[y][x] === TILE.DESK;
}

/** Synchronous bus. on() returns an unsubscribe function; listeners receive payload. */
export function createEventBus() {
  const listeners = new Map();
  return {
    on(event, listener) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(listener);
      return () => listeners.get(event)?.delete(listener);
    },
    emit(event, payload) {
      for (const listener of [...(listeners.get(event) || [])]) listener(payload);
    },
  };
}

export const eventBus = createEventBus();
export const on = eventBus.on;
export const emit = eventBus.emit;
