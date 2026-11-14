import { TILE_SIZE, getDifficulty, createEventBus, EVENTS } from "./shared.js";
import { createLevel } from "./levels.js";
import { drawWorld } from "./world.js";
import { createPlayer, movePlayer, activateGenerator, drawPlayer } from "./player.js";
import { createRobots, updateRobots, detectPlayer, drawRobots } from "./robots.js";
import { createUI, drawOverlay } from "./ui.js";

/** Pure game controller also used by dependency-free Node tests. */
export function createGame(bus = createEventBus()) {
  const game = { state: "title", level: 1, map: null, player: null, robots: [], elapsed: 0, notice: "" };
  let difficulty;
  function loadLevel() {
    difficulty = getDifficulty(game.level);
    game.map = createLevel(game.level);
    game.player = createPlayer(game.map);
    game.robots = createRobots(game.map);
    game.elapsed = 0;
    game.notice = "Find the amber generators. Press E beside one to switch it on.";
  }
  const subscriptions = [
    bus.on(EVENTS.GENERATOR_ON, () => { game.notice = "Generator online. Keep moving, keep out of sight."; }),
    bus.on(EVENTS.ALL_GENERATORS_ON, () => { game.notice = "All generators online. The green exit is unlocked."; }),
    bus.on(EVENTS.CAUGHT, () => {
      if (game.state !== "playing") return;
      game.state = "caught";
      game.notice = "Spotted. Try using the desks to break your trail.";
    }),
    bus.on(EVENTS.LEVEL_COMPLETE, () => {
      if (game.state !== "playing") return;
      game.state = "win";
      game.notice = "A clean getaway. The next floor is waiting.";
    }),
  ];
  function checkOutcome() {
    if (game.state !== "playing") return;
    if (detectPlayer(game.robots, game.player, game.map, difficulty.sightRange, bus)) return;
    if (game.map.generators.every(g => g.on) && game.player.x === game.map.exit.x && game.player.y === game.map.exit.y)
      bus.emit(EVENTS.LEVEL_COMPLETE, { level: game.level, map: game.map });
  }
  loadLevel();
  return {
    game,
    bus,
    action() {
      if (game.state === "playing") {
        if (!activateGenerator(game.player, game.map, bus))
          game.notice = "Stand on or beside an offline generator, then press E.";
        checkOutcome();
        return;
      }
      if (game.state === "win") game.level++;
      loadLevel();
      game.state = "playing";
    },
    retry() {
      if (game.state === "title") return;
      loadLevel(); game.state = "playing";
    },
    move(dx, dy) {
      if (game.state !== "playing") return false;
      const moved = movePlayer(game.player, dx, dy, game.map);
      checkOutcome();
      return moved;
    },
    update(dt) {
      if (game.state !== "playing") return;
      const step = Math.min(Math.max(dt, 0), 0.05);
      game.elapsed += step;
      updateRobots(game.robots, step, game.player, game.map, difficulty.sightRange, bus);
      checkOutcome();
    },
    dispose() { subscriptions.forEach(unsubscribe => unsubscribe()); },
  };
}

export function startGame(document, window) {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const controller = createGame();
  const { game } = controller;
  const keys = new Set();
  let moveClock = 0, lastTime = null;
  const ui = createUI(document, () => { controller.action(); canvas.focus({ preventScroll: true }); });
  const directions = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] };
  const clearInput = () => { keys.clear(); moveClock = 0; lastTime = null; };
  function keyDown(code, repeat = false) {
    if (directions[code]) {
      if (!keys.has(code)) moveClock = 0;
      keys.delete(code); keys.add(code);
    } else if (!repeat && ["Enter", "Space", "KeyE"].includes(code)) {
      controller.action(); keys.clear();
    } else if (!repeat && code === "KeyR") {
      controller.retry(); keys.clear();
    }
  }
  window.addEventListener("keydown", event => {
    // Leave native button Enter/Space activation alone to avoid handling it twice.
    if (event.target instanceof window.HTMLButtonElement && ["Enter", "Space"].includes(event.code)) return;
    if (directions[event.code] || ["Enter", "Space", "KeyE", "KeyR"].includes(event.code)) {
      event.preventDefault(); keyDown(event.code, event.repeat);
    }
  });
  window.addEventListener("keyup", event => keys.delete(event.code));
  window.addEventListener("blur", clearInput);
  document.addEventListener("visibilitychange", clearInput);
  canvas.addEventListener("pointerdown", () => {
    canvas.focus({ preventScroll: true });
    if (game.state !== "playing") controller.action();
  });
  document.querySelectorAll("[data-key]").forEach(button => {
    button.addEventListener("pointerdown", event => {
      event.preventDefault(); button.setPointerCapture(event.pointerId); keyDown(button.dataset.key);
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      button.addEventListener(type, () => keys.delete(button.dataset.key));
  });
  function frame(time) {
    const dt = lastTime === null ? 0 : Math.min((time - lastTime) / 1000, 0.05);
    lastTime = time;
    if (!document.hidden) {
      moveClock -= dt;
      const code = [...keys].at(-1);
      if (game.state === "playing" && directions[code] && moveClock <= 0) {
        controller.move(...directions[code]); moveClock = 0.13;
      }
      controller.update(dt);
    }
    const camera = {
      x: Math.round(Math.max(0, Math.min(game.map.width * TILE_SIZE - canvas.width, (game.player.x + 0.5) * TILE_SIZE - canvas.width / 2))),
      y: Math.round(Math.max(0, Math.min(game.map.height * TILE_SIZE - canvas.height, (game.player.y + 0.5) * TILE_SIZE - canvas.height / 2))),
    };
    // Center maps smaller than the fixed low-resolution viewport.
    if (game.map.width * TILE_SIZE < canvas.width) camera.x = Math.round((game.map.width * TILE_SIZE - canvas.width) / 2);
    if (game.map.height * TILE_SIZE < canvas.height) camera.y = Math.round((game.map.height * TILE_SIZE - canvas.height) / 2);
    drawWorld(ctx, game.map, camera);
    drawRobots(ctx, game.robots, game.map, getDifficulty(game.level).sightRange, camera);
    drawPlayer(ctx, game.player, camera);
    drawOverlay(ctx, game.state, game.level);
    ui.update(game);
    window.requestAnimationFrame(frame);
  }
  window.requestAnimationFrame(frame);
  return controller;
}

if (typeof document !== "undefined") startGame(document, window);
