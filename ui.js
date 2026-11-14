// Person B lane. TODO: Add mission feedback and more rectangle-only bitmap glyphs.
// Every canvas mark, including the lettering, is a colored rectangle.
const glyphs = {
  A:"010101111101101", B:"110101110101110", C:"011100100100011", D:"110101101101110",
  E:"111100110100111", F:"111100110100100", G:"011100101101011", H:"101101111101101",
  I:"111010010010111", J:"001001001101010", K:"101101110101101", L:"100100100100111",
  M:"101111111101101", N:"101111111111101", O:"010101101101010", P:"110101110100100",
  Q:"010101101111011", R:"110101110101101", S:"011100010001110", T:"111010010010010",
  U:"101101101101111", V:"101101101101010", W:"101101111111101", X:"101101010101101",
  Y:"101101010010010", Z:"111001010100111",
  0:"111101101101111", 1:"010110010010111", 2:"110001010100111", 3:"110001010001110",
  4:"101101111001001", 5:"111100110001110", 6:"011100111101111", 7:"111001010010010",
  8:"111101111101111", 9:"111101111001110", ".":"000000000000010", "-":"000000111000000",
};

export function pixelText(ctx, text, centerX, y, size = 1, color = "#e1ddae") {
  ctx.fillStyle = color;
  const start = Math.round(centerX - (text.length * 4 - 1) * size / 2);
  [...text.toUpperCase()].forEach((letter, i) => {
    const glyph = glyphs[letter];
    if (!glyph) return;
    [...glyph].forEach((bit, j) => {
      if (bit === "1") ctx.fillRect(start + (i * 4 + j % 3) * size, y + Math.floor(j / 3) * size, size, size);
    });
  });
}

export function drawOverlay(ctx, state, level) {
  if (state === "playing") return;
  const cx = ctx.canvas.width / 2, cy = ctx.canvas.height / 2;
  ctx.fillStyle = "rgba(13, 28, 21, 0.78)"; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = state === "caught" ? "#bc7957" : "#a6bd7b"; ctx.fillRect(cx - 13, cy - 65, 26, 3);
  pixelText(ctx, state === "title" ? "AFTER HOURS DIVISION" : `FLOOR ${String(level).padStart(2, "0")}`, cx, cy - 46);
  pixelText(ctx, { title: "NIGHT SHIFT", caught: "BUSTED", win: "SHIFT COMPLETE" }[state], cx, cy - 22, 3);
  pixelText(ctx, { title: "CLOCK IN. STAY UNSEEN.", caught: "THE ANDROIDS NEVER CLOCK OUT.", win: "POWER ON. OPERATOR OUT." }[state], cx, cy + 11);
  ctx.fillStyle = "#3c573d"; ctx.fillRect(cx - 79, cy + 39, 158, 23);
  pixelText(ctx, { title: "ENTER TO BEGIN", caught: "ENTER TO RETRY", win: "ENTER - NEXT FLOOR" }[state], cx, cy + 48);
  pixelText(ctx, "HIDE ON DESKS. SWITCH ON POWER.", cx, cy + 83, 1, "#8b9f78");
}

export function createUI(document, onAction) {
  const byId = id => document.getElementById(id);
  byId("action").addEventListener("click", onAction);
  let signature = "";
  return {
    update(game) {
      const { state, level, map, player, elapsed } = game;
      byId("timer").textContent = `SHIFT ${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(Math.floor(elapsed % 60)).padStart(2, "0")}`;
      const next = `${state}/${level}/${player.hidden}/${map.generators.map(g => g.on).join()}/${game.notice}`;
      if (signature === next) return;
      signature = next;
      byId("floor-label").textContent = `FLOOR ${String(level).padStart(2, "0")}`;
      byId("state-label").textContent = { title: "OFF THE CLOCK", playing: "ON THE CLOCK", caught: "DETECTED", win: "CLEARED" }[state];
      byId("camera-status").textContent = `● ${{ title: "STANDBY", playing: "LIVE FEED", caught: "ALERT", win: "ALL CLEAR" }[state]}`;
      byId("stealth-status").textContent = state === "playing" ? (player.hidden ? "IN COVER / INVISIBLE" : "EXPOSED / STAY ALERT") : "AWAITING OPERATOR";
      byId("action-label").textContent = { title: "Clock in", playing: "Switch generator [E]", caught: "Try again", win: "Next floor" }[state];
      byId("message").textContent = game.notice || "An empty desk is a good place to disappear.";
      byId("generators").replaceChildren(...map.generators.map((g, i) => {
        const li = document.createElement("li");
        li.className = g.on ? "powered" : "";
        const lamp = document.createElement("i"); lamp.className = "lamp"; lamp.setAttribute("aria-hidden", "true");
        const name = document.createElement("span"); name.textContent = `GENERATOR ${String(i + 1).padStart(2, "0")}`;
        const status = document.createElement("span"); status.textContent = g.on ? "ONLINE" : "OFFLINE";
        li.append(lamp, name, status); return li;
      }));
    },
  };
}
