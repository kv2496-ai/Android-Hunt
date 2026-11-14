# Android Hunt

A rectangle-only, top-down pixel-art stealth game in a factory office.
Plain HTML5 canvas and ES modules. No build step, packages, or runtime dependencies.

## Run

From the project directory:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open http://127.0.0.1:8000. ES modules need HTTP, so don't double-click `index.html`.
Any static web server or GitHub Pages works.

## Play

- Enter, the canvas, or **Clock in** starts the shift.
- WASD / arrows move one tile at a time. Touch controls appear on touch devices.
- E / Space / the mission button activates an offline generator on your tile or
  an orthogonally adjacent tile.
- Desks are walkable: standing on any desk makes you hidden immediately.
- Walls stop movement and sight. Desks do not block sight to other tiles.
- Androids patrol clockwise and have visible 90-degree sight cones.
- Activate **every** generator, then step onto the green exit.
- Enter retries after being caught, or advances after a win. R retries the floor.
- Input clears on blur; tabbing away pauses simulation.

The canvas is 416×288 pixels, using 16px tiles, nearest-neighbor CSS scaling,
and `imageSmoothingEnabled = false`. Every canvas mark is a colored rectangle,
including the tiny bitmap lettering. Larger floors scroll with the player.

## Files and handoff

See [AGENTS.md](./AGENTS.md) for the shared contract and ownership rules.
The lane files contain working fallback stubs and TODOs, not finished systems.
Their small exported interfaces let both owners extend the game independently.

## Checks

Node 22+ is needed only for the optional dependency-free tests:

```sh
node --test tests/game.test.mjs
```
