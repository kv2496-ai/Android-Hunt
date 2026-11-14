// Person A lane. TODO: Add more rectangle-only office furniture and floor variants.
import { TILE_SIZE as T, TILE } from "./shared.js";

export function drawWorld(ctx, map, camera) {
  ctx.fillStyle = "#17291f";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const px = x * T - camera.x, py = y * T - camera.y;
      if (px < -T || py < -T || px >= ctx.canvas.width || py >= ctx.canvas.height) continue;
      const tile = map.tiles[y][x];
      ctx.fillStyle = (x + y) % 2 ? "#2b3e30" : "#2e4132";
      ctx.fillRect(px, py, T, T);
      ctx.fillStyle = "#334735";
      ctx.fillRect(px, py, T, 1);
      ctx.fillRect(px, py, 1, T);
      if (tile === TILE.WALL) {
        ctx.fillStyle = "#182b23"; ctx.fillRect(px, py, T, T);
        ctx.fillStyle = "#53674e"; ctx.fillRect(px, py, T, 3);
        ctx.fillStyle = "#3d5340"; ctx.fillRect(px + 1, py + 3, 14, 9);
        ctx.fillStyle = "#263d2e"; ctx.fillRect(px + 1, py + 12, 14, 2);
      } else if (tile === TILE.DESK) {
        ctx.fillStyle = "#182c22"; ctx.fillRect(px + 2, py + 5, 13, 10);
        ctx.fillStyle = "#738461"; ctx.fillRect(px + 1, py + 3, 13, 9);
        ctx.fillStyle = "#9aab7d"; ctx.fillRect(px + 1, py + 3, 13, 2);
        ctx.fillStyle = "#293e32"; ctx.fillRect(px + 4, py + 1, 6, 5);
        ctx.fillStyle = "#a7bd8a"; ctx.fillRect(px + 5, py + 2, 4, 2);
        ctx.fillStyle = "#b9b99a"; ctx.fillRect(px + 9, py + 8, 3, 2);
      }
    }
  }
  const allOn = map.generators.every(g => g.on);
  const ex = map.exit.x * T - camera.x, ey = map.exit.y * T - camera.y;
  ctx.fillStyle = allOn ? "#83b583" : "#50644b"; ctx.fillRect(ex + 1, ey + 1, 14, 14);
  ctx.fillStyle = "#233d2d"; ctx.fillRect(ex + 4, ey + 3, 8, 12);
  ctx.fillStyle = allOn ? "#c6e7ac" : "#8b926d"; ctx.fillRect(ex + 6, ey + 5, 4, 2);
  ctx.fillRect(ex + 8, ey + 4, 2, 4);
  for (const g of map.generators) {
    const x = g.x * T - camera.x, y = g.y * T - camera.y;
    ctx.fillStyle = "#14281e"; ctx.fillRect(x + 2, y + 3, 13, 12);
    ctx.fillStyle = g.on ? "#6e9a62" : "#9b7c43"; ctx.fillRect(x + 2, y + 2, 11, 11);
    ctx.fillStyle = g.on ? "#c4e6a0" : "#e1c06b"; ctx.fillRect(x + 4, y + 4, 3, 4);
    ctx.fillStyle = "#354734"; ctx.fillRect(x + 9, y + 4, 2, 2);
    ctx.fillRect(x + 4, y + 10, 7, 1);
  }
}
