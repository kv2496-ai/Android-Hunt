import test from "node:test";
import assert from "node:assert/strict";
import { TILE_SIZE, TILE, EVENTS, getDifficulty, isWalkable, isHidingSpot, createEventBus, emit, on } from "../shared.js";
import { createLevel } from "../levels.js";
import { createPlayer, movePlayer, activateGenerator } from "../player.js";
import { createRobots, hasLineOfSight, canSeePlayer, updateRobots } from "../robots.js";
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
  assert.deepEqual(getDifficulty(1000), { mapW: 32, mapH: 22, numGenerators: 5, numRobots: 5, deskDensity: 0.08, sightRange: 7 });
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

test("generator interaction is orthogonal, idempotent, and emits final-power once", () => {
  const map = room(), bus = createEventBus(), events = [];
  bus.on(EVENTS.GENERATOR_ON, p => events.push(p.generator));
  bus.on(EVENTS.ALL_GENERATORS_ON, () => events.push("all"));
  assert.equal(activateGenerator({ x: 3, y: 3 }, map, bus), false);
  assert.equal(activateGenerator({ x: 2, y: 3 }, map, bus), true);
  assert.equal(activateGenerator({ x: 2, y: 2 }, map, bus), false);
  assert.equal(activateGenerator({ x: 8, y: 2 }, map, bus), true);
  assert.equal(activateGenerator({ x: 8, y: 2 }, map, bus), false);
  assert.deepEqual(events, [map.generators[0], map.generators[1], "all"]);
});

test("catch requires range AND facing cone AND clear sight AND not hidden", () => {
  const map = room(), robot = { x: 3, y: 5, facing: { x: 1, y: 0 } };
  assert.equal(canSeePlayer(map, robot, { x: 7, y: 5, hidden: false }, 4), true);
  assert.equal(canSeePlayer(map, robot, { x: 8, y: 5, hidden: false }, 4), false);
  assert.equal(canSeePlayer(map, robot, { x: 2, y: 5, hidden: false }, 4), false);
  assert.equal(canSeePlayer(map, robot, { x: 4, y: 3, hidden: false }, 4), false);
  assert.equal(canSeePlayer(map, robot, { x: 5, y: 3, hidden: false }, 4), true);
  assert.equal(canSeePlayer(map, robot, { x: 7, y: 5, hidden: true }, 4), false);
  map.tiles[5][5] = TILE.WALL;
  assert.equal(canSeePlayer(map, robot, { x: 7, y: 5, hidden: false }, 4), false);
  map.tiles[5][5] = TILE.DESK;
  assert.equal(canSeePlayer(map, robot, { x: 7, y: 5, hidden: false }, 4), true);
  assert.equal(canSeePlayer(map, robot, { x: 3, y: 5, hidden: false }, 4), true);
  assert.equal(canSeePlayer(map, robot, { x: 3, y: 5, hidden: true }, 4), false);
});

test("all cardinal facings and inclusive cone boundaries work", () => {
  const map = room(), robot = { x: 5, y: 5 };
  for (const facing of [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }]) {
    robot.facing = facing;
    assert.equal(canSeePlayer(map, robot, { x: 5 + facing.x * 3, y: 5 + facing.y * 3 }, 3), true);
    assert.equal(canSeePlayer(map, robot, { x: 5 - facing.x, y: 5 - facing.y }, 3), false);
    assert.equal(canSeePlayer(map, robot, { x: 5 + facing.x * 2 - facing.y * 2, y: 5 + facing.y * 2 + facing.x * 2 }, 3), true);
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
  function walkTo(target) {
    const path = pathTo(c.game.map, c.game.player, target);
    assert.ok(path);
    for (const point of path) {
      c.move(point.x - c.game.player.x, point.y - c.game.player.y);
      for (const dt of [0.05, 0.05, 0.03]) c.update(dt);
      assert.notEqual(c.game.state, "caught", `caught at ${JSON.stringify(point)}`);
    }
  }
  // Visit the west generator, cross the upper office doors, then leave via the east office.
  walkTo(c.game.map.generators[1]); c.action();
  walkTo(c.game.map.generators[0]); c.action();
  walkTo(c.game.map.exit);
  assert.equal(c.game.state, "win");
  c.action(); assert.equal(c.game.level, 2); assert.equal(c.game.state, "playing");
});

function browserHarness() {
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
