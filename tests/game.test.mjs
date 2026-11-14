import test from "node:test";
import assert from "node:assert/strict";
import { TILE_SIZE, TILE, EVENTS, getDifficulty, isWalkable, isHidingSpot, createEventBus, emit, on } from "../shared.js";
import { createLevel, updateGeneratorTiming, drawGeneratorTiming } from "../levels.js";
import { createPlayer, movePlayer, activateGenerator } from "../player.js";
import { createRobots, hasLineOfSight, canSeePlayer, updateRobots, drawRobots } from "../robots.js";
import { createGame, startGame } from "../main.js";

function room(width = 12, height = 12) {
  return {
    width, height,
    tiles: Array.from({ length: height }, (_, y) =>
      Array.from({ length: width }, (_, x) => !x || !y || x === width - 1 || y === height - 1 ? TILE.WALL : TILE.FLOOR)),
    generators: [{ x: 2, y: 2, on: false }, { x: 8, y: 2, on: false }],
    playerSpawn: { x: 2, y: 8 }, robotSpawns: [{ x: 8, y: 8 }], exit: { x: 9, y: 9 },
  };
}

function pathTo(map, from, to) {
  const queue = [from], previous = new Map([[`${from.x},${from.y}`, null]]);
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (p.x === to.x && p.y === to.y) {
      const path = [];
      let current = p;
      while (previous.get(`${current.x},${current.y}`)) {
        path.push(current); current = previous.get(`${current.x},${current.y}`);
      }
      return path.reverse();
    }
    for (const [dx, dy] of [[1, 0], [0, -1], [-1, 0], [0, 1]]) {
      const next = { x: p.x + dx, y: p.y + dy }, key = `${next.x},${next.y}`;
      if (isWalkable(map, next.x, next.y) && !previous.has(key)) {
        previous.set(key, p); queue.push(next);
      }
    }
  }
  return null;
}

test("shared tile helpers follow the exact floor/wall/desk contract", () => {
  const map = room();
  map.tiles[4][3] = TILE.DESK;
  assert.equal(TILE_SIZE, 16);
  assert.equal(isWalkable(map, 3, 4), true);
  assert.equal(isHidingSpot(map, 3, 4), true);
  assert.equal(isHidingSpot(map, 3, 3), false);
  for (const [x, y] of [[0, 0], [-1, 2], [12, 4], [2, 12], [2.5, 3], [NaN, 3]]) {
    assert.equal(isWalkable(map, x, y), false);
    assert.equal(isHidingSpot(map, x, y), false);
  }
});

test("difficulty grows and stays bounded at its heaviest configuration", () => {
  assert.deepEqual(getDifficulty(1), { mapW: 24, mapH: 16, numGenerators: 2, numRobots: 1, deskDensity: 0.15, sightRange: 4 });
  assert.deepEqual(getDifficulty(2), { mapW: 26, mapH: 18, numGenerators: 4, numRobots: 2, deskDensity: 0.145, sightRange: 4 });
  assert.deepEqual(getDifficulty(1000), { mapW: 32, mapH: 22, numGenerators: 15, numRobots: 10, deskDensity: 0.08, sightRange: 7 });
  for (const level of [...Array.from({ length: 12 }, (_, i) => i + 1), 1000, Number.MAX_SAFE_INTEGER, Number.MAX_VALUE, Infinity]) {
    const d = getDifficulty(level), map = createLevel(level);
    assert.equal(d.numGenerators, Math.min(15, 2 + (level - 1) * 2));
    assert.equal(d.numRobots, Math.min(10, level));
    assert.equal(map.generators.length, d.numGenerators);
    assert.equal(map.robotSpawns.length, d.numRobots);
    assert.ok(d.mapW <= 32 && d.mapH <= 22);
    assert.ok(map.tiles.flat().filter(tile => tile === TILE.DESK).length >= d.numGenerators * 3 + d.numRobots);
  }
  assert.deepEqual(getDifficulty(-3), getDifficulty(1));
  assert.deepEqual(getDifficulty("bad"), getDifficulty(1));
});

test("100 floors and the maximum floor satisfy MapData and reachable objectives", () => {
  for (const level of [...Array.from({ length: 100 }, (_, i) => i + 1), 1000]) {
    const map = createLevel(level), d = getDifficulty(level);
    assert.equal(map.width, d.mapW); assert.equal(map.height, d.mapH);
    assert.equal(map.tiles.length, map.height);
    assert.equal(map.generators.length, d.numGenerators);
    assert.equal(map.robotSpawns.length, d.numRobots);
    for (const row of map.tiles) {
      assert.equal(row.length, map.width);
      assert.ok(row.every(t => [0, 1, 2].includes(t)));
    }
    const objectives = [...map.generators, map.exit, map.playerSpawn, ...map.robotSpawns];
    assert.equal(new Set(objectives.map(p => `${p.x},${p.y}`)).size, objectives.length);
    for (const point of objectives) assert.ok(pathTo(map, map.playerSpawn, point), `floor ${level}: ${JSON.stringify(point)}`);
    assert.ok(map.generators.every(g => g.on === false));
    for (const robot of createRobots(map)) assert.equal(canSeePlayer(map, robot, createPlayer(map), d.sightRange), false);
    assert.deepEqual(createLevel(level), map, "retry must reproduce the same layout");
  }
});

test("bus dispatches synchronously, unsubscribes, and isolates games", () => {
  const bus = createEventBus(), other = createEventBus(), calls = [];
  const off = bus.on(EVENTS.GENERATOR_ON, p => calls.push(p));
  other.emit(EVENTS.GENERATOR_ON, 1);
  bus.emit(EVENTS.GENERATOR_ON, 2);
  off(); bus.emit(EVENTS.GENERATOR_ON, 3);
  assert.deepEqual(calls, [2]);
  const unsubscribe = on("probe", p => calls.push(p));
  emit("probe", 4); unsubscribe();
  assert.deepEqual(calls, [2, 4]);
});

test("desk hiding updates on spawn, movement, and failed wall moves", () => {
  const map = room(); map.tiles[8][2] = TILE.DESK;
  const player = createPlayer(map);
  assert.equal(player.hidden, true);
  assert.equal(movePlayer(player, -1, 0, map), true);
  assert.equal(player.hidden, false);
  movePlayer(player, 1, 0, map);
  map.tiles[7][2] = TILE.WALL;
  assert.equal(movePlayer(player, 0, -1, map), false);
  assert.equal(player.hidden, true);
  assert.equal(movePlayer(player, 1, 1, map), false);
});

test("generator timing starts, resets on misses, and emits power only on a green hit", () => {
  const map = room(), bus = createEventBus(), events = [], alarms = [];
  bus.on(EVENTS.GENERATOR_ON, p => events.push(p.generator));
  bus.on(EVENTS.ALL_GENERATORS_ON, () => events.push("all"));
  bus.on("generatorAlarm", p => alarms.push(p));
  const player = { x: 2, y: 3 };
  assert.equal(activateGenerator({ x: 3, y: 3 }, map, bus), false);
  assert.equal(activateGenerator(player, map, bus), true);
  assert.equal(map.generators[0].on, false);
  assert.deepEqual(events, []);
  assert.deepEqual(alarms, [], "starting does not sound an alarm");
  updateGeneratorTiming(map, player, 0.1);
  assert.equal(activateGenerator(player, map, bus), true, "a miss is still a handled interaction");
  assert.equal(map.generators[0].on, false);
  assert.deepEqual(alarms, [{ x: 2, y: 2 }], "miss uses the caller's bus and exact tile payload");
  updateGeneratorTiming(map, player, 0.325);
  assert.equal(activateGenerator(player, map, bus), true);
  assert.equal(activateGenerator({ x: 2, y: 2 }, map, bus), false);
  assert.equal(activateGenerator({ x: 8, y: 2 }, map, bus), true);
  assert.equal(map.generators[1].on, false);
  updateGeneratorTiming(map, { x: 8, y: 2 }, 0.325);
  assert.equal(activateGenerator({ x: 8, y: 2 }, map, bus), true);
  assert.equal(activateGenerator({ x: 8, y: 2 }, map, bus), false);
  assert.deepEqual(events, [map.generators[0], map.generators[1], "all"]);
  assert.equal(alarms.length, 1, "successful hits and already-powered generators do not alarm");
});

test("timing bar matches its green zone, resets, and cancels immediately when moving away", () => {
  const map = room(), player = createPlayer(map), bus = createEventBus();
  Object.assign(player, { x: 2, y: 3 });
  const rectangles = [];
  const ctx = { canvas: { width: 416, height: 288 }, fillRect(...rect) {
    assert.ok(rect.every(Number.isInteger)); rectangles.push({ color: this.fillStyle, rect });
  } };
  const draw = () => { rectangles.length = 0; drawGeneratorTiming(ctx, map, { x: 0, y: 0 }); return [...rectangles]; };
  activateGenerator(player, map, bus);
  const initial = draw();
  assert.equal(initial.length, 6);
  updateGeneratorTiming(map, player, 0.15);
  assert.notDeepEqual(draw(), initial, "marker advances");
  activateGenerator(player, map, bus);
  assert.deepEqual(draw().slice(0, 4), initial.slice(0, 4), "miss resets marker exactly");
  assert.ok(draw()[5].rect[2] < initial[5].rect[2], "wrong presses do not restart the countdown");
  updateGeneratorTiming(map, player, 0.325);
  const [,, zone, marker] = draw();
  assert.ok(marker.rect[0] >= zone.rect[0] && marker.rect[0] < zone.rect[0] + zone.rect[2]);
  assert.equal(movePlayer(player, 0, 1, map), true);
  assert.deepEqual(draw(), [], "leaving interaction range cancels without waiting for a frame");
  movePlayer(player, 0, -1, map);
  activateGenerator(player, map, bus);
  assert.deepEqual(draw(), initial, "returning starts a fresh attempt");
  assert.equal(map.generators[0].on, false);
});

test("timing countdown expires once at three seconds, cancels, and cannot be extended by misses", () => {
  const map = room(), bus = createEventBus(), alarms = [], player = { x: 2, y: 3 };
  bus.on("generatorAlarm", p => alarms.push(p));
  const draw = () => {
    const rectangles = [];
    drawGeneratorTiming({ canvas: { width: 416, height: 288 }, fillRect: (...rect) => rectangles.push(rect) }, map, { x: 0, y: 0 });
    return rectangles;
  };
  activateGenerator(player, map, bus);
  assert.equal(draw()[5][2], 40);
  updateGeneratorTiming(map, player, 1.5);
  assert.equal(draw()[5][2], 20, "half the countdown remains at 1.5 seconds");
  updateGeneratorTiming(map, player, 1.499);
  assert.equal(alarms.length, 0);
  assert.equal(draw().length, 6, "attempt remains active just before its deadline");
  updateGeneratorTiming(map, player, 0.001);
  assert.deepEqual(alarms, [{ x: 2, y: 2 }]);
  assert.deepEqual(draw(), []);
  assert.equal(map.generators[0].on, false);
  updateGeneratorTiming(map, player, 30);
  assert.equal(alarms.length, 1, "expired attempt never repeats its alarm");
  activateGenerator(player, map, bus);
  assert.equal(draw()[5][2], 40, "next E starts a fresh attempt");
  updateGeneratorTiming(map, player, 2.8);
  activateGenerator(player, map, bus);
  assert.equal(alarms.length, 2);
  updateGeneratorTiming(map, player, 0.2);
  assert.equal(alarms.length, 3, "marker reset does not extend the original deadline");
  assert.deepEqual(draw(), []);
  activateGenerator(player, map, bus);
  updateGeneratorTiming(map, { x: 2, y: 4 }, 3);
  assert.equal(alarms.length, 3, "walking away cancels silently rather than timing out");
  activateGenerator(player, map, bus);
  updateGeneratorTiming(map, player, 0.325);
  activateGenerator(player, map, bus);
  updateGeneratorTiming(map, player, 3);
  assert.equal(map.generators[0].on, true);
  assert.equal(alarms.length, 3, "success removes the deadline");
});

test("controller timeout raises an alarm and redirects live robots without pausing play", () => {
  const c = createGame(); c.action();
  const map = room(); map.generators = [{ x: 5, y: 5, on: false }]; map.tiles[6][5] = TILE.DESK;
  c.game.map = map; c.game.player = createPlayer(map);
  Object.assign(c.game.player, { x: 5, y: 6, hidden: true });
  c.game.robots = createRobots(map);
  const alarms = []; c.bus.on("generatorAlarm", p => alarms.push(p));
  c.action();
  for (let i = 0; i < 59; i++) c.update(0.05);
  assert.equal(alarms.length, 0);
  c.update(0.05);
  assert.deepEqual(alarms, [{ x: 5, y: 5 }]);
  assert.equal(c.game.state, "playing");
  assert.equal(map.generators[0].on, false);
  assert.deepEqual(c.game.robots[0].alert.target, { x: 5, y: 5 });
  c.dispose();
});

test("nearby robots investigate around walls, search for three seconds, then resume patrol", () => {
  const map = room(24, 16), bus = createEventBus(), hidden = { x: 2, y: 12, hidden: true };
  map.robotSpawns = [{ x: 5, y: 5 }, { x: 18, y: 5 }, { x: 19, y: 5 }];
  for (let y = 1; y < map.height - 1; y++) if (y !== 8) map.tiles[y][6] = TILE.WALL;
  const robots = createRobots(map), [near, edge, far] = robots;
  let subscriptions = 0;
  const subscribe = bus.on;
  bus.on = (event, handler) => { if (event === "generatorAlarm") subscriptions++; return subscribe(event, handler); };
  updateRobots(robots, 0, hidden, map, 4, bus);
  bus.emit("generatorAlarm", { x: 8, y: 5 });
  assert.deepEqual(near.alert.target, { x: 8, y: 5 });
  assert.ok(near.alert.route.some(p => p.x === 6 && p.y === 8), "route uses the doorway");
  assert.ok(edge.alert, "ten-tile radius is inclusive");
  assert.equal(far.alert, undefined, "distant patrols ignore the sound");
  const steps = near.alert.route.length;
  for (let i = 0; i < steps; i++) {
    const before = { x: near.x, y: near.y };
    updateRobots(robots, 0.48, hidden, map, 4, bus);
    assert.equal(Math.abs(near.x - before.x) + Math.abs(near.y - before.y), 1);
    assert.ok(isWalkable(map, near.x, near.y));
  }
  assert.deepEqual({ x: near.x, y: near.y }, { x: 8, y: 5 });
  assert.equal(near.alert.searching, true);
  assert.equal(near.alert.searchLeft, 3, "search timer starts on arrival, not when alarm sounds");
  for (let i = 0; i < 29; i++) updateRobots(robots, 0.1, hidden, map, 4, bus);
  assert.ok(near.alert);
  assert.deepEqual({ x: near.x, y: near.y }, { x: 8, y: 5 }, "search scans in place");
  updateRobots(robots, 0.1, hidden, map, 4, bus);
  assert.equal(near.alert, undefined);
  updateRobots(robots, 0.48, hidden, map, 4, bus);
  assert.notDeepEqual({ x: near.x, y: near.y }, { x: 8, y: 5 }, "normal patrol resumes");
  assert.equal(subscriptions, 1, "no per-frame or per-detection subscriptions");
});

test("alerts retarget, remain isolated by bus, and replace stale floor context", () => {
  const bus = createEventBus(), otherBus = createEventBus(), hidden = { x: 2, y: 8, hidden: true };
  const map = room(), robots = createRobots(map);
  updateRobots(robots, 0, hidden, map, 4, bus);
  otherBus.emit("generatorAlarm", { x: 8, y: 2 });
  assert.equal(robots[0].alert, undefined);
  bus.emit("generatorAlarm", { x: 8, y: 2 });
  updateRobots(robots, 0.48, hidden, map, 4, bus);
  bus.emit("generatorAlarm", { x: 5, y: 5 });
  assert.deepEqual(robots[0].alert.target, { x: 5, y: 5 });
  assert.deepEqual(robots[0].alert.route.at(-1), { x: 5, y: 5 });
  const oldAlert = robots[0].alert;
  const nextMap = room(), nextRobots = createRobots(nextMap);
  updateRobots(nextRobots, 0, hidden, nextMap, 4, bus);
  bus.emit("generatorAlarm", { x: 8, y: 8 });
  assert.equal(robots[0].alert, oldAlert, "new-floor alarm cannot retarget stale robots");
  assert.equal(nextRobots[0].alert.searching, true, "already at source: start searching immediately");
  bus.emit("generatorAlarm", { x: -1, y: 0 });
  assert.deepEqual(nextRobots[0].alert.target, { x: 8, y: 8 }, "invalid alarm is ignored");
  updateRobots(nextRobots, 3, hidden, nextMap, 4, bus);
  assert.equal(nextRobots[0].alert, undefined);
});

test("an unreachable alarm searches locally instead of trapping a robot in investigation forever", () => {
  const map = room(), bus = createEventBus(), hidden = { x: 2, y: 8, hidden: true };
  for (const [x, y] of [[7, 2], [9, 2], [8, 1], [8, 3]]) map.tiles[y][x] = TILE.WALL;
  const robots = createRobots(map), start = { x: robots[0].x, y: robots[0].y };
  updateRobots(robots, 0, hidden, map, 4, bus);
  bus.emit("generatorAlarm", { x: 8, y: 2 });
  assert.equal(robots[0].alert.searching, true);
  updateRobots(robots, 3, hidden, map, 4, bus);
  assert.equal(robots[0].alert, undefined);
  assert.deepEqual({ x: robots[0].x, y: robots[0].y }, start);
  updateRobots(robots, 0.48, hidden, map, 4, bus);
  assert.ok(isWalkable(map, robots[0].x, robots[0].y));
  assert.notDeepEqual({ x: robots[0].x, y: robots[0].y }, start);
});

test("alerted robots still catch during investigation steps and search turns", () => {
  for (const searching of [false, true]) {
    const map = room(), bus = createEventBus();
    map.robotSpawns = [searching ? { x: 5, y: 5 } : { x: 3, y: 5 }];
    const robots = createRobots(map);
    robots[0].facing = searching ? { x: 1, y: 0 } : { x: 0, y: -1 };
    const player = searching ? { x: 5, y: 7, hidden: false } : { x: 4, y: 5, hidden: false };
    let caught = 0; bus.on(EVENTS.CAUGHT, () => caught++);
    updateRobots(robots, 0, player, map, 4, bus);
    assert.equal(caught, 0);
    bus.emit("generatorAlarm", { x: 5, y: 5 });
    updateRobots(robots, 0.48, player, map, 4, bus);
    assert.equal(caught, 1);
  }
});

test("alerted robots show an exclamation mark and briefly red, still wall-clipped cones", () => {
  const map = room(), bus = createEventBus(), robots = createRobots(map);
  const hidden = { x: 2, y: 8, hidden: true };
  updateRobots(robots, 0, hidden, map, 4, bus);
  const draw = () => {
    const rectangles = [];
    drawRobots({ canvas: { width: 192, height: 192 }, fillRect(...rect) {
      assert.ok(rect.every(Number.isInteger)); rectangles.push({ color: this.fillStyle, rect });
    } }, robots, map, 4, { x: 0, y: 0 });
    return rectangles;
  };
  assert.ok(draw().some(d => d.color === "rgba(215, 166, 83, 0.13)"));
  bus.emit("generatorAlarm", { x: 8, y: 2 });
  const alerted = draw();
  assert.ok(alerted.some(d => d.color === "rgba(255, 54, 54, 0.28)"));
  assert.ok(alerted.some(d => d.color === "#ff7462" && d.rect[1] < robots[0].y * TILE_SIZE));
  updateRobots(robots, 1, hidden, map, 4, bus);
  const settled = draw();
  assert.ok(settled.some(d => d.color === "rgba(215, 166, 83, 0.13)"));
  assert.equal(settled.some(d => d.color === "rgba(255, 54, 54, 0.28)"), false);
  assert.ok(robots[0].alert, "exclamation remains after the brief flash");
});

test("catch requires range AND facing cone AND clear sight AND not hidden", () => {
  const map = room(), robot = { x: 3, y: 5, facing: { x: 1, y: 0 } };
  assert.equal(canSeePlayer(map, robot, { x: 7, y: 5, hidden: false }, 4), true);
  assert.equal(canSeePlayer(map, robot, { x: 8, y: 5, hidden: false }, 4), false);
  assert.equal(canSeePlayer(map, robot, { x: 2, y: 5, hidden: false }, 4), false);
  assert.equal(canSeePlayer(map, robot, { x: 4, y: 3, hidden: false }, 4), false);
  assert.equal(canSeePlayer(map, robot, { x: 5, y: 3, hidden: false }, 4), false);
  assert.equal(canSeePlayer(map, robot, { x: 6, y: 4, hidden: false }, 4), true);
  assert.equal(canSeePlayer(map, robot, { x: 7, y: 5, hidden: true }, 4), false);
  map.tiles[5][5] = TILE.WALL;
  assert.equal(canSeePlayer(map, robot, { x: 7, y: 5, hidden: false }, 4), false);
  map.tiles[5][5] = TILE.DESK;
  assert.equal(canSeePlayer(map, robot, { x: 7, y: 5, hidden: false }, 4), true);
  assert.equal(canSeePlayer(map, robot, { x: 3, y: 5, hidden: false }, 4), true);
  assert.equal(canSeePlayer(map, robot, { x: 3, y: 5, hidden: true }, 4), false);
});

test("all cardinal facings honor the 60-degree cone and inclusive range", () => {
  const map = room(24, 24), robot = { x: 12, y: 12 };
  for (const facing of [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }]) {
    robot.facing = facing;
    assert.equal(canSeePlayer(map, robot, { x: 12 + facing.x * 3, y: 12 + facing.y * 3 }, 3), true);
    assert.equal(canSeePlayer(map, robot, { x: 12 + facing.x * 4, y: 12 + facing.y * 4 }, 3), false);
    assert.equal(canSeePlayer(map, robot, { x: 12 - facing.x, y: 12 - facing.y }, 3), false);
    for (const side of [-1, 1]) {
      // Integer-tile rays just inside (29.74 degrees) and outside (30.96 degrees) each edge.
      assert.equal(canSeePlayer(map, robot, {
        x: 12 + facing.x * 7 - facing.y * 4 * side,
        y: 12 + facing.y * 7 + facing.x * 4 * side,
      }, 9), true);
      assert.equal(canSeePlayer(map, robot, {
        x: 12 + facing.x * 5 - facing.y * 3 * side,
        y: 12 + facing.y * 5 + facing.x * 3 * side,
      }, 9), false);
    }
  }
});

test("line of sight cannot cut diagonally through wall corners", () => {
  const map = room();
  map.tiles[3][4] = TILE.WALL;
  assert.equal(hasLineOfSight(map, { x: 3, y: 3 }, { x: 5, y: 5 }), false);
  assert.equal(hasLineOfSight(map, { x: 5, y: 5 }, { x: 3, y: 3 }), false);
});

// Independent reference: geometric line/closed-box intersection, not grid traversal.
function segmentHitsWall(a, b, x, y) {
  let near = 0, far = 1;
  for (const [origin, delta, low, high] of [[a.x, b.x - a.x, x - 0.5, x + 0.5], [a.y, b.y - a.y, y - 0.5, y + 0.5]]) {
    if (!delta) { if (origin < low || origin > high) return false; continue; }
    const p = (low - origin) / delta, q = (high - origin) / delta;
    near = Math.max(near, Math.min(p, q)); far = Math.min(far, Math.max(p, q));
    if (near > far + 1e-9) return false;
  }
  return true;
}

test("grid sight matches independent segment/rectangle geometry for every ray in a room", () => {
  const map = room(9, 9), walls = [[3, 3], [5, 2], [4, 6], [6, 5]];
  for (const [x, y] of walls) map.tiles[y][x] = TILE.WALL;
  const points = [];
  for (let y = 1; y < 8; y++) for (let x = 1; x < 8; x++) if (isWalkable(map, x, y)) points.push({ x, y });
  for (const a of points) for (const b of points) {
    const expected = !walls.some(([x, y]) => segmentHitsWall(a, b, x, y));
    assert.equal(hasLineOfSight(map, a, b), expected, `${JSON.stringify(a)} to ${JSON.stringify(b)}`);
  }
});

test("robots detect before moving away, and hidden players survive patrol overlap", () => {
  const map = room(), bus = createEventBus();
  let caught = 0; bus.on(EVENTS.CAUGHT, () => caught++);
  const robots = [{ x: 3, y: 5, facing: { x: 1, y: 0 }, clock: 0.47 }];
  updateRobots(robots, 0.05, { x: 3, y: 5, hidden: false }, map, 4, bus);
  assert.equal(caught, 1); assert.equal(robots[0].x, 3);
  updateRobots(robots, 0.05, { x: 4, y: 5, hidden: true }, map, 4, bus);
  assert.equal(caught, 1); assert.equal(robots[0].x, 4);
});

test("title freezes the simulation, caught freezes input, and retry resets the same floor", () => {
  const c = createGame(), original = structuredClone(c.game.map);
  assert.equal(c.game.state, "title");
  assert.equal(c.move(1, 0), false); c.update(1);
  assert.equal(c.game.elapsed, 0);
  c.action();
  c.game.robots[0] = { ...c.game.player, hidden: undefined, facing: { x: 1, y: 0 }, clock: 0 };
  c.update(0.01);
  assert.equal(c.game.state, "caught");
  const player = structuredClone(c.game.player);
  assert.equal(c.move(1, 0), false); c.update(2);
  assert.deepEqual(c.game.player, player);
  c.action();
  assert.equal(c.game.state, "playing"); assert.equal(c.game.level, 1);
  assert.equal(c.game.elapsed, 0); assert.deepEqual(c.game.map, original);
});

test("exit stays locked, all power alone does not win, then exit completes exactly once", () => {
  const c = createGame(), events = [];
  c.bus.on(EVENTS.LEVEL_COMPLETE, p => events.push(p.level));
  c.action(); c.game.robots = [];
  Object.assign(c.game.player, c.game.map.exit); c.game.player.hidden = false;
  c.update(0.01); assert.equal(c.game.state, "playing");
  Object.assign(c.game.player, c.game.map.playerSpawn);
  c.game.map.generators.forEach(g => { g.on = true; });
  c.update(0.01); assert.equal(c.game.state, "playing");
  Object.assign(c.game.player, c.game.map.exit); c.update(0.01);
  assert.equal(c.game.state, "win"); assert.deepEqual(events, [1]);
  c.update(0.01); assert.deepEqual(events, [1]);
  c.action();
  assert.equal(c.game.state, "playing"); assert.equal(c.game.level, 2);
  assert.ok(c.game.map.generators.every(g => !g.on));
  assert.equal(c.game.robots.length, getDifficulty(2).numRobots);
});

test("a catch takes priority over an otherwise unlocked exit", () => {
  const c = createGame(); c.action();
  c.game.map.generators.forEach(g => { g.on = true; });
  Object.assign(c.game.player, c.game.map.exit, { hidden: false });
  c.game.robots = [{ ...c.game.map.exit, facing: { x: 1, y: 0 }, clock: 0 }];
  c.update(0.01);
  assert.equal(c.game.state, "caught");
});

test("fresh controllers do not share level state or event listeners", () => {
  const a = createGame(), b = createGame();
  a.action(); b.action();
  a.bus.emit(EVENTS.CAUGHT, {});
  assert.equal(a.game.state, "caught"); assert.equal(b.game.state, "playing");
  b.dispose(); b.bus.emit(EVENTS.CAUGHT, {});
  assert.equal(b.game.state, "playing");
});

test("play the actual first floor end-to-end with live patrols and normal movement timing", () => {
  const c = createGame(); c.action();
  const { map } = c.game, range = getDifficulty(1).sightRange;
  const patrol = createRobots(map), bus = createEventBus(), frames = [], walls = [];
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++)
    if (map.tiles[y][x] === TILE.WALL) walls.push({ x, y });
  const snapshot = () => patrol.map(({ x, y, facing }) => ({ x, y, facing: { ...facing } }));
  // Predict live patrol poses, then plan movement/waits instead of assuming a fixed path is safe.
  for (let turn = 0; turn < 220; turn++) {
    const samples = [snapshot()];
    for (const dt of [0.05, 0.05, 0.03]) {
      updateRobots(patrol, dt, { ...map.playerSpawn, hidden: true }, map, range, bus);
      samples.push(snapshot());
    }
    frames.push(samples);
  }
  const safe = (turn, x, y) => isHidingSpot(map, x, y) || frames[turn].every(samples => samples.every(robot => {
    const dx = x - robot.x, dy = y - robot.y;
    const angle = Math.abs(Math.atan2(dx * -robot.facing.y + dy * robot.facing.x,
      dx * robot.facing.x + dy * robot.facing.y));
    // Independent angle and closed-wall geometry, not canSeePlayer(), chooses safe steps.
    const visible = Math.hypot(dx, dy) <= range && angle <= Math.PI / 6 &&
      !walls.some(wall => segmentHitsWall(robot, { x, y }, wall.x, wall.y));
    return !visible;
  }));
  const all = (1 << map.generators.length) - 1;
  const start = { ...map.playerSpawn, turn: 0, mask: 0, previous: null };
  const queue = [start], seen = new Set();
  let goal;
  for (let head = 0; head < queue.length; head++) {
    const node = queue[head];
    if (node.x === map.exit.x && node.y === map.exit.y && node.mask === all) { goal = node; break; }
    if (node.turn >= frames.length) continue;
    const options = [[1, 0], [0, -1], [-1, 0], [0, 1], [0, 0]].map(([dx, dy]) =>
      ({ x: node.x + dx, y: node.y + dy, mask: node.mask, turns: 1 }));
    map.generators.forEach((g, i) => {
      if (!(node.mask & (1 << i)) && Math.abs(g.x - node.x) + Math.abs(g.y - node.y) <= 1)
        options.push({ x: node.x, y: node.y, mask: node.mask | (1 << i), turns: 3, generator: i });
    });
    for (const { x, y, mask, turns, generator } of options) {
      const turn = node.turn + turns;
      if (turn > frames.length || !isWalkable(map, x, y) ||
          !Array.from({ length: turns }, (_, i) => safe(node.turn + i, x, y)).every(Boolean)) continue;
      const key = ((turn * map.height + y) * map.width + x) * (all + 1) + mask;
      if (seen.has(key)) continue;
      seen.add(key); queue.push({ x, y, turn, mask, generator, previous: node });
    }
  }
  assert.ok(goal, "a safe route must reach every generator and the exit with live patrols");
  const path = [];
  for (let node = goal; node.previous; node = node.previous) path.push(node);
  for (const point of path.reverse()) {
    const dx = point.x - c.game.player.x, dy = point.y - c.game.player.y;
    if (dx || dy) assert.equal(c.move(dx, dy), true);
    if (point.generator !== undefined) c.action();
    for (let turn = point.previous.turn; turn < point.turn; turn++)
      for (const dt of [0.05, 0.05, 0.03]) c.update(dt);
    assert.notEqual(c.game.state, "caught", `caught at ${JSON.stringify({ x: point.x, y: point.y })}`);
    if (point.generator !== undefined) {
      c.action();
      assert.equal(map.generators[point.generator].on, true, "timed activation succeeds with live patrols");
    }
  }
  assert.ok(map.generators.every(g => g.on));
  assert.ok(c.game.elapsed > 0 && c.game.robots.some((r, i) =>
    r.x !== map.robotSpawns[i].x || r.y !== map.robotSpawns[i].y), "patrols must remain active");
  assert.equal(c.game.state, "win");
  c.action(); assert.equal(c.game.level, 2); assert.equal(c.game.state, "playing");
});

function browserHarness({ AudioContext } = {}) {
  class Element {
    constructor() { this.listeners = {}; this.dataset = {}; this.children = []; }
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
    fire(name, data = {}) { for (const fn of this.listeners[name] || []) fn({ target: this, preventDefault() {}, ...data }); }
    replaceChildren(...children) { this.children = children; }
    append(...children) { this.children.push(...children); }
    setAttribute() {}
    focus() {}
    setPointerCapture() {}
  }
  class Button extends Element {}
  const nodes = new Map();
  const doc = new Element();
  doc.hidden = false;
  doc.getElementById = id => {
    if (!nodes.has(id)) nodes.set(id, id === "action" ? new Button() : new Element());
    return nodes.get(id);
  };
  const touch = new Button(); touch.dataset.key = "ArrowUp";
  doc.querySelectorAll = () => [touch];
  doc.createElement = () => new Element();
  const canvas = doc.getElementById("game"); canvas.width = 416; canvas.height = 288;
  let draws = 0;
  const ctx = { canvas, fillRect(...args) { assert.ok(args.every(Number.isFinite)); draws++; } };
  canvas.getContext = () => new Proxy(ctx, {
    get(target, key) { assert.ok(key in target, `non-rectangle canvas operation: ${String(key)}`); return target[key]; },
    set(target, key, value) { assert.ok(["fillStyle", "imageSmoothingEnabled"].includes(key)); target[key] = value; return true; },
  });
  const win = new Element(); win.HTMLButtonElement = Button;
  win.AudioContext = AudioContext; win.document = doc; doc.defaultView = win;
  let nextFrame, time = 0;
  win.requestAnimationFrame = fn => { nextFrame = fn; };
  const c = startGame(doc, win);
  return {
    c, doc, win, canvas, touch, ctx,
    get draws() { return draws; },
    frame(ms = 16) { time += ms; nextFrame(time); },
    key(code, repeat = false, target = canvas) { win.fire("keydown", { code, repeat, target }); },
    up(code) { win.fire("keyup", { code }); },
  };
}

test("wrong E raises a real bus alarm, reuses UI alarm audio, and honors mute and hidden tabs", () => {
  const frequencies = [];
  class FakeAudioContext {
    constructor() { this.state = "running"; this.currentTime = 0; this.destination = {}; }
    createGain() { return { gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {},
      exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
    createOscillator() { return { frequency: { setValueAtTime(value) { frequencies.push(value); },
      exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {}, start() {}, stop() {} }; }
    resume() { this.state = "running"; return Promise.resolve(); }
    suspend() { this.state = "suspended"; return Promise.resolve(); }
  }
  const h = browserHarness({ AudioContext: FakeAudioContext });
  h.doc.fire("pointerdown"); h.key("Enter"); h.frame();
  const map = room(); h.c.game.map = map;
  Object.assign(h.c.game.player, { x: 2, y: 3, hidden: false });
  h.c.game.robots = [];
  const alarms = []; h.c.bus.on("generatorAlarm", p => alarms.push(p));
  h.key("KeyE"); h.frame();
  assert.deepEqual(frequencies, [], "starting has no alarm audio");
  h.key("KeyE"); h.frame();
  assert.deepEqual(alarms, [{ x: 2, y: 2 }]);
  assert.deepEqual(frequencies, [880, 660, 880], "reuse the existing three-tone alarm");
  h.doc.fire("keydown", { code: "KeyM" });
  h.key("KeyE"); h.frame();
  assert.equal(frequencies.length, 3, "mute suppresses new alarms");
  h.doc.fire("keydown", { code: "KeyM" }); h.frame();
  assert.equal(frequencies.length, 3, "unmuting cannot replay a missed alarm");
  h.c.bus.emit("generatorAlarm", { x: 2, y: 2 }); h.frame();
  assert.equal(frequencies.length, 6, "external bus alarms also play the same sound");
  for (let i = 0; i < 60; i++) h.frame(50);
  assert.equal(map.generators[0].on, false);
  assert.equal(alarms.length, 4, "timeout emits exactly one more alarm");
  assert.equal(frequencies.length, 9, "timeout uses the same alarm sound");
  h.doc.hidden = true; h.doc.fire("visibilitychange");
  h.c.bus.emit("generatorAlarm", { x: 2, y: 2 }); h.frame();
  assert.equal(frequencies.length, 9, "hidden tab cannot play alarms");
  h.doc.hidden = false; h.doc.fire("visibilitychange"); h.doc.fire("pointerdown"); h.frame();
  assert.equal(frequencies.length, 9, "returning to the tab cannot replay a hidden alarm");
});

test("wrong E immediately redirects robots through the default controller and countdown pauses in hidden tabs", () => {
  const h = browserHarness(); h.key("Enter"); h.frame();
  const map = room(); map.tiles[6][5] = TILE.DESK; map.generators = [{ x: 5, y: 5, on: false }];
  h.c.game.map = map; h.c.game.player = createPlayer(map);
  Object.assign(h.c.game.player, { x: 5, y: 6, hidden: true });
  h.c.game.robots = createRobots(map);
  const alarms = []; h.c.bus.on("generatorAlarm", p => alarms.push(p));
  h.key("KeyE"); h.key("KeyE");
  assert.deepEqual(alarms, [{ x: 5, y: 5 }]);
  assert.deepEqual(h.c.game.robots[0].alert.target, { x: 5, y: 5 });
  for (let i = 0; i < 40; i++) h.frame(50);
  h.doc.hidden = true; h.doc.fire("visibilitychange");
  for (let i = 0; i < 100; i++) h.frame(50);
  assert.equal(alarms.length, 1, "hidden-tab wall time does not consume gameplay countdown");
  h.doc.hidden = false; h.doc.fire("visibilitychange"); h.frame();
  for (let i = 0; i < 20; i++) h.frame(50);
  assert.equal(alarms.length, 2, "remaining active gameplay time reaches deadline");
});

test("E timing works through the browser entry while robots move, and leaving or capture interrupts it", () => {
  const h = browserHarness(); h.key("Enter"); h.frame();
  const map = room(); h.c.game.map = map; h.c.game.player = createPlayer(map);
  Object.assign(h.c.game.player, { x: 2, y: 3 });
  h.c.game.robots = [{ x: 8, y: 8, facing: { x: 1, y: 0 }, clock: 0.47 }];
  let powered = 0; h.c.bus.on(EVENTS.GENERATOR_ON, () => powered++);
  const markerDraws = [];
  const draw = h.ctx.fillRect;
  h.ctx.fillRect = function (...rect) {
    if (this.fillStyle === "#f2df9b") markerDraws.push(rect);
    draw.call(this, ...rect);
  };
  h.key("KeyE");
  assert.equal(map.generators[0].on, false, "E starts rather than powers");
  for (let i = 0; i < 20; i++) h.frame();
  assert.ok(markerDraws.length >= 20, "active marker renders every frame");
  assert.notDeepEqual(markerDraws[0], markerDraws.at(-1), "marker moves");
  assert.notEqual(h.c.game.robots[0].x, 8, "patrol keeps moving during the mini-game");
  h.key("KeyE"); h.key("KeyE", true);
  assert.equal(map.generators[0].on, true); assert.equal(powered, 1);
  Object.assign(h.c.game.player, { x: 8, y: 3 });
  h.key("KeyE");
  h.key("ArrowDown"); h.frame(); h.up("ArrowDown");
  const rectangles = [];
  drawGeneratorTiming({ canvas: h.canvas, fillRect: (...rect) => rectangles.push(rect) }, map, { x: 0, y: 0 });
  assert.deepEqual(rectangles, [], "walking out of range immediately removes the bar");
  h.key("ArrowUp"); h.frame(); h.up("ArrowUp"); h.key("KeyE");
  h.c.game.robots = [{ x: 8, y: 3, facing: { x: 1, y: 0 }, clock: 0 }];
  h.frame(); assert.equal(h.c.game.state, "caught");
  assert.equal(map.generators[1].on, false, "mini-game does not protect against capture");
  h.key("Enter");
  drawGeneratorTiming({ canvas: h.canvas, fillRect: (...rect) => rectangles.push(rect) }, h.c.game.map, { x: 0, y: 0 });
  assert.deepEqual(rectangles, [], "retry has no stale mini-game");
});

test("real browser entry renders every state using rectangles and unsmoothed pixels", () => {
  const h = browserHarness(); h.frame();
  assert.equal(h.ctx.imageSmoothingEnabled, false); assert.ok(h.draws > 100);
  assert.equal(h.doc.getElementById("state-label").textContent, "OFF THE CLOCK");
  h.key("Enter"); h.frame();
  assert.equal(h.c.game.state, "playing");
  h.key("ArrowUp"); h.frame(); h.up("ArrowUp");
  assert.equal(h.c.game.player.hidden, true);
  assert.equal(h.doc.getElementById("stealth-status").textContent, "IN COVER / INVISIBLE");
  h.c.bus.emit(EVENTS.CAUGHT, {}); h.frame();
  assert.equal(h.doc.getElementById("state-label").textContent, "DETECTED");
  h.key("Enter"); h.frame();
  h.c.bus.emit(EVENTS.LEVEL_COMPLETE, {}); h.frame();
  assert.equal(h.doc.getElementById("state-label").textContent, "CLEARED");
  h.key("Enter"); h.frame();
  assert.equal(h.doc.getElementById("floor-label").textContent, "FLOOR 02");
});

test("blur clears held movement, hidden tabs pause, and touch cancellation releases keys", () => {
  const h = browserHarness(); h.key("Enter"); h.frame();
  h.key("ArrowUp"); h.frame();
  h.win.fire("blur");
  const p = { x: h.c.game.player.x, y: h.c.game.player.y };
  for (let i = 0; i < 20; i++) h.frame();
  assert.equal(h.c.game.player.x, p.x); assert.equal(h.c.game.player.y, p.y);
  h.doc.hidden = true; h.doc.fire("visibilitychange");
  const elapsed = h.c.game.elapsed;
  for (let i = 0; i < 20; i++) h.frame();
  assert.equal(h.c.game.elapsed, elapsed);
  h.doc.hidden = false; h.doc.fire("visibilitychange");
  h.touch.fire("pointerdown", { pointerId: 1 }); h.frame();
  h.touch.fire("pointercancel");
  const after = h.c.game.player.y;
  for (let i = 0; i < 20; i++) h.frame();
  assert.equal(h.c.game.player.y, after);
});

test("a focused native button does not double-trigger Enter or Space", () => {
  const h = browserHarness(), action = h.doc.getElementById("action");
  h.frame();
  h.key("Enter", false, action);
  assert.equal(h.c.game.state, "title");
  action.fire("click"); h.frame();
  assert.equal(h.c.game.state, "playing");
});

test("large scrolling floors render with the default entry and no missing drawing methods", () => {
  const h = browserHarness(); h.key("Enter");
  for (let level = 1; level < 16; level++) {
    h.c.bus.emit(EVENTS.LEVEL_COMPLETE, {}); h.key("Enter");
  }
  assert.equal(h.c.game.map.width, 32); assert.equal(h.c.game.map.height, 22);
  Object.assign(h.c.game.player, h.c.game.map.exit);
  h.frame();
  assert.ok(h.draws > 100);
});
