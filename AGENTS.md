# Android Hunt: collaboration contract

## Ownership

- **Person A:** `world.js`, `levels.js`.
- **Person B:** `player.js`, `robots.js`, `ui.js`.
- **Integrator:** `index.html`, `main.js`, `README.md`, `.gitignore`, `tests/`,
  and this handoff document.
- **Shared:** `shared.js` is jointly owned by Person A and Person B.

**only edit files in your lane; changes to shared.js need both people’s agreement.**

The bootstrap author may create and validate the initial skeleton across all lanes.
After handoff, ownership applies to all follow-up edits. Do not casually change
another owner's exported interfaces; agree on the change first.

## Shared contract (`shared.js`)

`MapData` uses integer **tile** coordinates everywhere, not pixel coordinates.
The grid is 16px per tile. `tiles[y][x]` is row-major:

```js
{
  width, height,
  tiles: [[0, 1, 2]], // 0 floor, 1 wall, 2 desk
  generators: [{ x, y, on: false }],
  playerSpawn: { x, y },
  robotSpawns: [{ x, y }],
  exit: { x, y }
}
```

- `getDifficulty(level)` returns
  `{ mapW, mapH, numGenerators, numRobots, deskDensity, sightRange }`.
  Levels start at 1; `sightRange` is Euclidean distance in tiles.
- `isWalkable(map, x, y)` is true for in-bounds floor and desk tiles only.
- `isHidingSpot(map, x, y)` is true for desk tiles only.
- `player.hidden` is **true exactly when the player stands on a desk tile**.
  Recompute it when creating or moving the player.
- `TILE_SIZE`, `TILE`, and `EVENTS` are shared constants.
- `createEventBus()` returns `{ emit, on }`. `eventBus`, `emit`, and `on` also
  expose a default singleton. The controller uses a fresh bus per game by default.
  Events dispatch synchronously; `on(name, handler)` returns an unsubscribe function.
  Don't add per-frame subscriptions.

### Event names and payloads

| Event | Payload | Emitted by |
| --- | --- | --- |
| `generatorOn` | `{ generator, map }` | Player interaction after setting `on = true` |
| `allGeneratorsOn` | `{ map }` | Player interaction when the final generator turns on |
| `caught` | `{ robot, player }` | Robot detection |
| `levelComplete` | `{ level, map }` | Controller after checking the exit condition |

Generators turn on only once. The controller accepts caught/completed outcomes
only while playing, freezing the completed/caught floor until user input.

## Required rules

1. A level is won only when all generators are on **and** the player reaches the exit.
2. A robot catches the player only if **all four** conditions hold:
   - the player is within `sightRange` (inclusive);
   - the player is inside the robot's facing cone (90 degrees total, inclusive edges);
   - the robot has line-of-sight not blocked by walls;
   - the player is not hidden.
3. Walls block sight, including touching diagonal wall corners. Desks do not.
   Occupying the robot's tile counts as in-cone; a hidden player is still safe.
4. Catch detection runs before exit completion. No winning through a robot's sight.
5. E / Space activates a generator on the player's tile or one orthogonal tile away.
6. State flow: `title → playing → caught → playing` (same floor),
   or `title → playing → win → playing` (next floor).

## Fallback interfaces

These files are intentionally small working stubs with owner TODOs:

- A, `levels.js`: `createLevel(level) → MapData`. Ensure connected walkable floors,
  reachable generators/exit, distinct objectives, and safe valid spawns.
- A, `world.js`: `drawWorld(ctx, map, camera)`.
- B, `player.js`: `createPlayer(map)`, `movePlayer(player, dx, dy, map) → boolean`,
  `activateGenerator(player, map, bus) → boolean`, `drawPlayer(ctx, player, camera)`.
- B, `robots.js`: `createRobots(map)`, `hasLineOfSight(map, from, to)`,
  `canSeePlayer(map, robot, player, sightRange)`, `detectPlayer(...)`,
  `updateRobots(robots, dt, player, map, sightRange, bus)`,
  `drawRobots(ctx, robots, map, sightRange, camera)`.
- B, `ui.js`: `createUI(document, onAction) → { update(game) }`,
  `drawOverlay(ctx, state, level)`, `pixelText(...)`.
- Integrator, `main.js`: `createGame(bus?)`, `startGame(document, window)`.
  `createGame` is DOM-free for tests.

`camera` has pixel offsets `{ x, y }`. Draw positions are
`tilePosition * TILE_SIZE - cameraOffset`. Robot `facing` is a cardinal unit
vector `{ x, y }`. Updates use seconds. Do not add dependencies or a build step.
Draw with colored rectangles only, including bitmap text; no sprites, images,
canvas text, paths, arcs, or external fonts. Keep pixel scaling unsmoothed.

## Validate

```sh
node --test tests/game.test.mjs
python3 -m http.server 8000 --bind 127.0.0.1
```

Check title/start, movement/walls, desk hiding, generator interaction, locked exit,
all four detection conditions, caught/retry, win/next-floor, blur handling,
and larger scrolling floors. Keep the skeleton runnable during each handoff.
