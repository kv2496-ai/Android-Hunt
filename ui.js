// Every canvas mark, including the lettering, is a colored rectangle.
const glyphs = {
  A:"01110/10001/10001/11111/10001/10001/10001",
  B:"11110/10001/10001/11110/10001/10001/11110",
  C:"01111/10000/10000/10000/10000/10000/01111",
  D:"11110/10001/10001/10001/10001/10001/11110",
  E:"11111/10000/10000/11110/10000/10000/11111",
  F:"11111/10000/10000/11110/10000/10000/10000",
  G:"01111/10000/10000/10111/10001/10001/01111",
  H:"10001/10001/10001/11111/10001/10001/10001",
  I:"11111/00100/00100/00100/00100/00100/11111",
  J:"00111/00010/00010/00010/10010/10010/01100",
  K:"10001/10010/10100/11000/10100/10010/10001",
  L:"10000/10000/10000/10000/10000/10000/11111",
  M:"10001/11011/10101/10101/10001/10001/10001",
  N:"10001/11001/11001/10101/10011/10011/10001",
  O:"01110/10001/10001/10001/10001/10001/01110",
  P:"11110/10001/10001/11110/10000/10000/10000",
  Q:"01110/10001/10001/10001/10101/10010/01101",
  R:"11110/10001/10001/11110/10100/10010/10001",
  S:"01111/10000/10000/01110/00001/00001/11110",
  T:"11111/00100/00100/00100/00100/00100/00100",
  U:"10001/10001/10001/10001/10001/10001/01110",
  V:"10001/10001/10001/10001/10001/01010/00100",
  W:"10001/10001/10001/10101/10101/10101/01010",
  X:"10001/10001/01010/00100/01010/10001/10001",
  Y:"10001/10001/01010/00100/00100/00100/00100",
  Z:"11111/00001/00010/00100/01000/10000/11111",
  0:"01110/10001/10011/10101/11001/10001/01110",
  1:"00100/01100/00100/00100/00100/00100/01110",
  2:"01110/10001/00001/00010/00100/01000/11111",
  3:"11110/00001/00001/01110/00001/00001/11110",
  4:"00010/00110/01010/10010/11111/00010/00010",
  5:"11111/10000/10000/11110/00001/00001/11110",
  6:"01110/10000/10000/11110/10001/10001/01110",
  7:"11111/00001/00010/00100/01000/01000/01000",
  8:"01110/10001/10001/01110/10001/10001/01110",
  9:"01110/10001/10001/01111/00001/00001/01110",
  " ":"00000/00000/00000/00000/00000/00000/00000",
  ".":"00000/00000/00000/00000/00000/00110/00110",
  ",":"00000/00000/00000/00000/00110/00100/01000",
  "!":"00100/00100/00100/00100/00100/00000/00100",
  "?":"01110/10001/00001/00010/00100/00000/00100",
  ":":"00000/00110/00110/00000/00110/00110/00000",
  ";":"00000/00110/00110/00000/00110/00100/01000",
  "-":"00000/00000/00000/11111/00000/00000/00000",
  "_":"00000/00000/00000/00000/00000/00000/11111",
  "/":"00001/00010/00010/00100/01000/01000/10000",
  "\\":"10000/01000/01000/00100/00010/00010/00001",
  "'":"00100/00100/01000/00000/00000/00000/00000",
  "\"":"01010/01010/10100/00000/00000/00000/00000",
  "(":"00010/00100/01000/01000/01000/00100/00010",
  ")":"01000/00100/00010/00010/00010/00100/01000",
  "[":"01110/01000/01000/01000/01000/01000/01110",
  "]":"01110/00010/00010/00010/00010/00010/01110",
  "+":"00000/00100/00100/11111/00100/00100/00000",
  "=":"00000/00000/11111/00000/11111/00000/00000",
  "%":"11001/11010/00010/00100/01000/01011/10011",
  "<":"00010/00100/01000/10000/01000/00100/00010",
  ">":"01000/00100/00010/00001/00010/00100/01000",
};
const bitmap = Object.fromEntries(Object.entries(glyphs).map(([letter, rows]) => [letter, rows.replaceAll("/", "")]));
const presentations = new WeakMap();

export function pixelText(ctx, text, centerX, y, size = 1, color = "#e1ddae") {
  ctx.fillStyle = color;
  const scale = Math.max(1, Math.round(size));
  String(text).toUpperCase().split("\n").forEach((line, row) => {
    const start = Math.round(centerX - (line.length * 6 - 1) * scale / 2);
    [...line].forEach((letter, i) => {
      const glyph = bitmap[letter] || bitmap["?"];
      for (let j = 0; j < glyph.length; j++) {
        if (glyph[j] === "1") ctx.fillRect(start + (i * 6 + j % 5) * scale, Math.round(y) + (row * 10 + Math.floor(j / 5)) * scale, scale, scale);
      }
    });
  });
}

function presentationFor(canvas) {
  if (!presentations.has(canvas)) presentations.set(canvas, { state: null, titleStart: 0, reducedMotion: false });
  return presentations.get(canvas);
}

function createSounds(document) {
  const window = document.defaultView;
  const AudioContext = window?.AudioContext || window?.webkitAudioContext;
  let supported = !!AudioContext, context, output, muted = false;
  let previousState = null, previousMap = null, previousPowered = 0, lastBuzz = -1;
  const voices = new Set();
  function stop() {
    for (const voice of voices) {
      voice.oscillator.onended = null;
      try { voice.oscillator.stop(); } catch { /* Already ended. */ }
      voice.oscillator.disconnect(); voice.envelope.disconnect();
    }
    voices.clear();
  }
  function unlock() {
    if (!supported || muted || document.hidden) return;
    try {
      if (!context) {
        context = new AudioContext();
        output = context.createGain();
        output.gain.value = 0.3;
        output.connect(context.destination);
      }
      if (context.state === "suspended") context.resume()?.catch(() => {});
    } catch {
      supported = false;
      stop();
    }
  }
  function tone(frequency, endFrequency, delay, duration, type, volume) {
    const oscillator = context.createOscillator(), envelope = context.createGain();
    const start = context.currentTime + delay, end = start + duration;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, end);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(volume, start + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(envelope); envelope.connect(output);
    const voice = { oscillator, envelope };
    voices.add(voice);
    oscillator.onended = () => {
      oscillator.disconnect(); envelope.disconnect(); voices.delete(voice);
    };
    oscillator.start(start); oscillator.stop(end + 0.02);
  }
  function play(effect, delay = 0) {
    // Never queue blocked or muted effects to play unexpectedly after unlocking.
    if (!supported || muted || document.hidden || context?.state !== "running") return false;
    try {
      if (effect === "buzz") {
        tone(60, 42, delay, 0.16, "sawtooth", 0.09);
        tone(120, 85, delay, 0.12, "square", 0.035);
      } else if (effect === "hum") {
        tone(55, 110, delay, 0.65, "triangle", 0.12);
        tone(110, 220, delay + 0.08, 0.55, "sine", 0.06);
      } else if (effect === "alarm") {
        for (let i = 0; i < 3; i++) tone(i % 2 ? 660 : 880, 330, delay + i * 0.21, 0.18, "square", 0.08);
      } else if (effect === "chime") {
        [523.25, 659.25, 783.99, 1046.5].forEach((note, i) => tone(note, note, delay + i * 0.09, 0.4, "sine", 0.1));
      }
      return true;
    } catch {
      stop();
      supported = false;
      return false;
    }
  }
  function silence() {
    stop();
    if (context?.state === "running") context.suspend()?.catch(() => {});
  }
  document.addEventListener("keydown", event => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.isComposing ||
        event.target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName)) return;
    if (event.code === "KeyM" || event.key?.toLowerCase() === "m") {
      event.preventDefault();
      muted = !muted;
      if (output) output.gain.value = muted ? 0 : 0.3;
      if (muted) stop();
    }
    unlock();
  }, true);
  document.addEventListener("pointerdown", unlock, true);
  document.addEventListener("visibilitychange", () => { if (document.hidden) silence(); });
  window?.addEventListener?.("blur", silence);
  return {
    get label() { return muted ? "M: SOUND OFF" : supported ? "M: SOUND ON" : "M: AUDIO N/A"; },
    update(game, presentation, time) {
      const powered = game.map.generators.filter(g => g.on).length;
      if (previousState !== game.state) {
        stop();
        lastBuzz = -1;
        if (game.state === "caught") play("alarm");
        if (game.state === "win") play("chime");
      }
      if (previousMap === game.map && powered > previousPowered)
        for (let i = 0; i < powered - previousPowered; i++) play("hum", i * 0.06);
      if (game.state === "title" && !presentation.reducedMotion) {
        const elapsed = time - presentation.titleStart;
        const phase = [[900, 1100], [1500, 1700], [2100, 2350], [2750, 3100]]
          .findIndex(([start, end]) => elapsed >= start && elapsed < end);
        if (phase >= 0 && phase !== lastBuzz && play("buzz")) lastBuzz = phase;
      }
      previousState = game.state; previousMap = game.map; previousPowered = powered;
    },
  };
}

function drawTitle(ctx, presentation, time) {
  const { width, height } = ctx.canvas, cx = width / 2, cy = height / 2;
  const elapsed = presentation.reducedMotion ? 5000 : time - presentation.titleStart;
  // Deliberate, spaced power failures, not a rapid strobe.
  const lightsOn = elapsed < 900 || (elapsed >= 1100 && elapsed < 1500) ||
    (elapsed >= 1700 && elapsed < 2100) || (elapsed >= 2350 && elapsed < 2750);
  ctx.fillStyle = lightsOn ? "rgba(255, 245, 203, 0.38)" : "#070d10";
  ctx.fillRect(0, 0, width, height);
  for (let x = 36; x + 50 <= width - 20; x += 96) {
    ctx.fillStyle = lightsOn ? "#667365" : "#18221f";
    ctx.fillRect(x - 2, 17, 52, 7);
    ctx.fillStyle = lightsOn ? "#fff4c5" : "#26342a";
    ctx.fillRect(x, 18, 48, 3);
  }
  if (elapsed < 3100) return;
  const slide = Math.min(1, (elapsed - 3100) / 850);
  const eased = 1 - (1 - slide) ** 3;
  const size = Math.max(1, Math.min(2, Math.floor((width - 32) / (27 * 6))));
  const narratorY = Math.round(-40 + (cy + 22) * eased);
  pixelText(ctx, "The droids have gone rogue.\nEscape the factory.", cx, narratorY, size, "#e7e6c4");
  if (slide < 1) return;
  pixelText(ctx, "ANDROID HUNT / NIGHT SHIFT", cx, cy - 70, 1, "#819f89");
  ctx.fillStyle = "#a6bd7b"; ctx.fillRect(cx - 18, cy + 42, 36, 2);
  if (elapsed < 4200) return;
  ctx.fillStyle = "#203a2b"; ctx.fillRect(cx - 89, cy + 57, 178, 25);
  pixelText(ctx, "Press SPACE to start", cx, cy + 66, 1, "#e9f0bd");
  pixelText(ctx, "WASD / ARROWS: MOVE   E: POWER", cx, height - 30, 1, "#819f89");
  pixelText(ctx, presentation.sounds?.label || "M: SOUND ON", cx, height - 16, 1, "#819f89");
}

export function drawOverlay(ctx, state, level) {
  const presentation = presentationFor(ctx.canvas);
  const time = globalThis.performance?.now() ?? Date.now();
  if (presentation.state !== state) {
    presentation.state = state;
    if (state === "title") presentation.titleStart = time;
  }
  if (state === "title") {
    drawTitle(ctx, presentation, time);
    return;
  }
  if (state === "playing") return;
  if (state !== "caught" && state !== "win") return;
  const cx = ctx.canvas.width / 2, cy = ctx.canvas.height / 2;
  const caught = state === "caught", accent = caught ? "#e58b70" : "#b6dc8d";
  ctx.fillStyle = "rgba(6, 12, 10, 0.86)"; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = accent; ctx.fillRect(24, cy - 94, ctx.canvas.width - 48, 188);
  ctx.fillStyle = "#101d17"; ctx.fillRect(25, cy - 93, ctx.canvas.width - 50, 186);
  pixelText(ctx, `${caught ? "SIGNAL LOST" : "ALL CLEAR"} / LEVEL ${level}`, cx, cy - 76, 1, "#819f89");
  ctx.fillStyle = accent; ctx.fillRect(cx - 13, cy - 53, 26, 3);
  const heading = caught ? "You were caught!" : `Level ${level} cleared`;
  const size = Math.max(1, Math.min(3, Math.floor((ctx.canvas.width - 64) / (heading.length * 6 - 1))));
  pixelText(ctx, heading, cx, cy - 29, size, accent);
  pixelText(ctx, caught ? "Stay unseen. Hide under desks." : "All generators online. Exit reached.", cx, cy + 7, 1, "#d2d8b9");
  ctx.fillStyle = caught ? "#492b25" : "#29402c"; ctx.fillRect(cx - 115, cy + 34, 230, 27);
  pixelText(ctx, caught ? "Press SPACE to restart" : "Press SPACE to continue", cx, cy + 44, 1, "#edf1cc");
  pixelText(ctx, caught ? `RETRY LEVEL ${level} / SPACE OR ENTER` : `NEXT: LEVEL ${Number(level) + 1} / SPACE OR ENTER`, cx, cy + 76, 1, "#819f89");
  pixelText(ctx, presentation.sounds?.label || "M: SOUND ON", cx, ctx.canvas.height - 14, 1, "#819f89");
}

function drawHUD(ctx, game, powered, nearby, soundLabel) {
  const { width, height } = ctx.canvas, { level, map, player } = game;
  const total = map.generators.length, allPowered = total > 0 && powered === total;
  ctx.fillStyle = "rgba(7, 16, 12, 0.94)";
  ctx.fillRect(0, 0, width, 20);
  ctx.fillRect(0, height - 18, width, 18);
  ctx.fillStyle = allPowered ? "#b6dc8d" : "#536d4a"; ctx.fillRect(0, 19, width, 1);
  const levelLabel = `LEVEL ${String(level).padStart(2, "0")}`;
  pixelText(ctx, levelLabel, 12 + (levelLabel.length * 6 - 1) / 2, 6, 1, "#e7e6c4");
  const powerLabel = `GENERATORS ${powered}/${total}`;
  pixelText(ctx, powerLabel, width - 12 - (powerLabel.length * 6 - 1) / 2, 6, 1, allPowered ? "#b6dc8d" : "#e1c06b");
  map.generators.forEach((generator, i) => {
    ctx.fillStyle = generator.on ? "#b6dc8d" : "#465242";
    ctx.fillRect(Math.round(width / 2 - total * 10 / 2 + i * 10), 8, 6, 5);
  });
  const hint = allPowered ? "POWER RESTORED / REACH THE EXIT"
    : nearby ? "E / SPACE: SWITCH ON GENERATOR"
    : player.hidden ? "HIDDEN / THE DROIDS CANNOT SEE YOU"
    : "FIND GENERATORS / HIDE UNDER DESKS";
  pixelText(ctx, hint, 12 + (hint.length * 6 - 1) / 2, height - 12, 1, allPowered || player.hidden ? "#b6dc8d" : "#a8b49a");
  pixelText(ctx, soundLabel, width - 12 - (soundLabel.length * 6 - 1) / 2, height - 12, 1, "#d2d8b9");
}

export function createUI(document, onAction) {
  const byId = id => document.getElementById(id);
  byId("action").addEventListener("click", onAction);
  const canvas = byId("game"), ctx = canvas.getContext?.("2d");
  const presentation = presentationFor(canvas), sounds = createSounds(document);
  presentation.sounds = sounds;
  presentation.reducedMotion = !!document.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  canvas.setAttribute("aria-keyshortcuts", "M");
  let signature = "", generatorSignature = "";
  return {
    update(game) {
      const { state, level, map, player, elapsed } = game;
      const powered = map.generators.filter(g => g.on).length;
      const allPowered = map.generators.length > 0 && powered === map.generators.length;
      const nearby = map.generators.some(g => !g.on && Math.abs(g.x - player.x) + Math.abs(g.y - player.y) <= 1);
      sounds.update(game, presentation, globalThis.performance?.now() ?? Date.now());
      // The controller draws the world and overlays before this update each frame.
      if (ctx && state === "playing") drawHUD(ctx, game, powered, nearby, sounds.label);
      const timer = `SHIFT ${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(Math.floor(elapsed % 60)).padStart(2, "0")}`;
      if (byId("timer").textContent !== timer) byId("timer").textContent = timer;
      const powerSignature = `${level}/${map.generators.map(g => Number(g.on)).join()}`;
      const next = `${state}/${level}/${player.hidden}/${powerSignature}/${nearby}/${game.notice}/${sounds.label}`;
      if (signature === next) return;
      signature = next;
      byId("floor-label").textContent = `FLOOR ${String(level).padStart(2, "0")}`;
      byId("state-label").textContent = { title: "OFF THE CLOCK", playing: "ON THE CLOCK", caught: "DETECTED", win: "CLEARED" }[state];
      byId("camera-status").textContent = `● ${{ title: "STANDBY", playing: "LIVE FEED", caught: "ALERT", win: "ALL CLEAR" }[state]}`;
      byId("stealth-status").textContent = state === "playing" ? (player.hidden ? "IN COVER / INVISIBLE" : "EXPOSED / STAY ALERT") : "AWAITING OPERATOR";
      byId("action").disabled = state === "playing" && !nearby;
      byId("action-label").textContent = {
        title: "Start [SPACE]",
        playing: allPowered ? "Exit unlocked" : nearby ? "Switch generator [E]" : "Find a generator",
        caught: "Restart level [SPACE]",
        win: "Next level [SPACE]",
      }[state];
      const mission = allPowered ? "All generators online. The green exit is unlocked. Reach it to clear the level."
        : nearby ? `Offline generator in reach. Press E or SPACE. ${powered}/${map.generators.length} generators online.`
        : game.notice || "An empty desk is a good place to disappear.";
      const message = {
        title: "The droids have gone rogue. Escape the factory. Press SPACE to start.",
        caught: `You were caught! Press SPACE to restart level ${level}. Hide under desks to stay unseen.`,
        win: `Level ${level} cleared. Press SPACE to continue to level ${Number(level) + 1}.`,
      }[state] || mission;
      byId("message").textContent = message;
      canvas.setAttribute("aria-label", (state === "playing"
        ? `Level ${level}. ${powered}/${map.generators.length} generators online. ${player.hidden ? "Hidden under a desk." : "Exposed."} Move with WASD or arrows. Activate generators with E or Space, then reach the exit.`
        : message) + ` ${sounds.label}. Press M to mute or unmute sound.`);
      if (generatorSignature === powerSignature) return;
      generatorSignature = powerSignature;
      byId("generators").setAttribute("aria-label", `${powered}/${map.generators.length} generators online`);
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
