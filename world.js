// Rectangle-only office scenery. Decorations never change the map's tile rules.
import { TILE_SIZE as T, TILE } from "./shared.js";

export function drawWorld(ctx, map, camera) {
  ctx.imageSmoothingEnabled = false;
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
      // Coordinate-based wear stays fixed while the camera scrolls or power changes.
      const variant = (x * 17 + y * 31) % 11;
      if (tile === TILE.FLOOR) {
        if (variant < 3) {
          ctx.fillStyle = "#354937";
          ctx.fillRect(px + 3, py + 5, 5, 1);
          ctx.fillRect(px + 9, py + 11, 3, 1);
        } else if (variant === 3) {
          ctx.fillStyle = "#25392d";
          ctx.fillRect(px + 4, py + 5, 8, 6);
          ctx.fillStyle = "#41533d";
          for (let i = 0; i < 3; i++) ctx.fillRect(px + 5, py + 6 + i * 2, 6, 1);
        } else if (variant === 4) {
          ctx.fillStyle = "#394b37";
          ctx.fillRect(px + 10, py + 3, 2, 2);
          ctx.fillRect(px + 3, py + 12, 3, 1);
        }
      }
      if (tile === TILE.WALL) {
        ctx.fillStyle = "#182b23"; ctx.fillRect(px, py, T, T);
        ctx.fillStyle = "#53674e"; ctx.fillRect(px, py, T, 3);
        ctx.fillStyle = "#3d5340"; ctx.fillRect(px + 1, py + 3, 14, 9);
        ctx.fillStyle = "#263d2e"; ctx.fillRect(px + 1, py + 12, 14, 2);
        ctx.fillStyle = "#718063"; ctx.fillRect(px + 2, py + 4, 1, 1);
        ctx.fillStyle = "#293f31"; ctx.fillRect(px + 10, py + 3, 1, 9);
      } else if (tile === TILE.DESK) {
        ctx.fillStyle = "#182c22"; ctx.fillRect(px + 2, py + 5, 13, 10);
        // Chair and table legs remain inside the walkable hiding tile.
        ctx.fillStyle = "#43594b"; ctx.fillRect(px + 5, py + 12, 6, 3);
        ctx.fillStyle = "#23382c";
        ctx.fillRect(px + 2, py + 11, 2, 3);
        ctx.fillRect(px + 11, py + 11, 2, 3);
        ctx.fillStyle = "#738461"; ctx.fillRect(px + 1, py + 3, 13, 9);
        ctx.fillStyle = "#9aab7d"; ctx.fillRect(px + 1, py + 3, 13, 2);
        const furniture = (x + y * 2) % 3;
        if (furniture === 0) {
          ctx.fillStyle = "#293e32"; ctx.fillRect(px + 4, py + 1, 6, 5);
          ctx.fillStyle = "#a7bd8a"; ctx.fillRect(px + 5, py + 2, 4, 2);
          ctx.fillStyle = "#c1c6a0"; ctx.fillRect(px + 4, py + 8, 5, 2);
          ctx.fillStyle = "#293e32"; ctx.fillRect(px + 10, py + 8, 2, 2);
        } else if (furniture === 1) {
          ctx.fillStyle = "#4e6350"; ctx.fillRect(px + 3, py + 6, 5, 4);
          ctx.fillStyle = "#c9c6a1"; ctx.fillRect(px + 4, py + 5, 5, 4);
          ctx.fillStyle = "#7d8d70"; ctx.fillRect(px + 5, py + 6, 3, 1);
          ctx.fillStyle = "#d1ba84"; ctx.fillRect(px + 11, py + 6, 2, 3);
        } else {
          ctx.fillStyle = "#354b3d"; ctx.fillRect(px + 3, py + 5, 8, 5);
          ctx.fillStyle = "#adb596"; ctx.fillRect(px + 4, py + 6, 5, 1);
          ctx.fillRect(px + 7, py + 7, 2, 2);
          ctx.fillStyle = "#d1ba84"; ctx.fillRect(px + 11, py + 5, 2, 4);
        }
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
