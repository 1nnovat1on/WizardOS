"use strict";
// Headless rules/input regression tests. No browser or npm dependency required.
const vm = require("node:vm");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const path = require("node:path");
const nodes = new Map();
let context2d = new Proxy(
  {},
  {
    get: (_, key) =>
      key.startsWith("create") ? () => ({ addColorStop() {} }) : () => {},
  },
);
let renderCanvas;
if (process.env.WIZARD_RENDER) {
  renderCanvas = require("@napi-rs/canvas").createCanvas(1200, 650);
  context2d = renderCanvas.getContext("2d");
}
function element(id) {
  if (nodes.has(id)) return nodes.get(id);
  const listeners = {};
  const e = {
    id,
    listeners,
    dataset: {},
    style: {},
    hidden: false,
    textContent: "",
    classList: { add() {}, remove() {} },
    setAttribute(k, v) {
      this[k] = v;
    },
    addEventListener(k, f) {
      (listeners[k] ||= []).push(f);
    },
    setPointerCapture() {},
    focus() {},
    querySelector() {
      return element(id + "-knob");
    },
    getBoundingClientRect() {
      return {
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        width: id === "world" ? 1200 : 83,
        height: id === "world" ? 650 : 83,
      };
    },
    getContext() {
      return context2d;
    },
    emit(k, props = {}) {
      for (const f of listeners[k] || []) f({ preventDefault() {}, ...props });
    },
  };
  nodes.set(id, e);
  return e;
}
const elements = ["water", "fire", "air", "earth"].map((t) => {
  const e = element(t);
  e.dataset.element = t;
  return e;
});
const actions = ["jump", "shield", "charge"].map((t) => {
  const e = element(t);
  e.dataset.action = t;
  return e;
});
const document = {
  getElementById: element,
  querySelectorAll: (s) =>
    s === "[data-element]" ? elements : s === "[data-action]" ? actions : [],
  addEventListener() {},
};
let raf;
const win = element("window");
// Combat checks isolate the music transport; audio.cjs tests its real controller.
win.WizardAudio = class {
  constructor() {
    this.volume = 0;
  }
  play() {}
  pause() {}
  setMuted() {}
  setVolume(value) {
    this.volume = value;
  }
};
const sandbox = {
  document,
  window: win,
  matchMedia: () => ({ matches: false }),
  ResizeObserver: class {
    observe() {}
  },
  devicePixelRatio: 1,
  localStorage: {
    getItem() {
      return null;
    },
    setItem() {},
  },
  URLSearchParams,
  location: { search: "?debug=1" },
  requestAnimationFrame: (f) => {
    raf = f;
  },
  Math,
  console,
};
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "../game.js"), "utf8"),
  sandbox,
);
const g = win.WizardOS;
function reset() {
  g.start();
  g.clearEnemies();
  g.clearShots();
  return g.player;
}
function steps(n) {
  for (let i = 0; i < n; i++) g.update(1 / 120);
}
let checks = 0;
function check(condition, label) {
  assert.ok(condition, label);
  console.log("PASS", label);
  checks++;
}
let p = reset();
p.mana = 20;
g.input.keys.add("KeyE");
g.input.keys.add("KeyD");
g.input.holds.add("cast");
steps(120);
check(
  p.x === 0 && p.charging && p.mana > 46 && g.shots.length === 0,
  "seated charging roots movement, regenerates mana and excludes casting",
);
g.input.keys.delete("KeyE");
steps(30);
check(
  p.x > 40 && !p.charging && g.shots.length > 0,
  "release charging resumes movement and casting",
);
p = reset();
p.mana = 0;
steps(120);
check(Math.abs(p.mana - 4) < 0.01, "passive regeneration is 4 mana per second");
g.input.holds.add("shield");
const m = p.mana;
steps(12);
check(p.mana < m && p.health === 100, "shield continuously drains mana");
steps(20);
check(p.mana >= 0 && !p.shield, "depleted shield breaks without negative mana");
p = reset();
p.angle = 0;
g.addShot(p, "water");
for (let i = 0; i < 240; i++) g.updateShots(1 / 120);
check(g.pools.length > 0, "water creates persistent ground puddles");
function collide(t1, t2) {
  g.clearShots();
  const e = g.actor(50, t2);
  e.angle = Math.PI;
  g.addShot(g.player, t1, 2);
  g.addShot(e, t2, 2);
  g.shots[1].x = g.shots[0].x;
  g.shots[1].y = g.shots[0].y;
  g.updateShots(0);
}
collide("water", "fire");
check(g.shots.length === 0, "water intercepts fire");
collide("air", "fire");
let f = g.shots.find((s) => s.type === "fire");
check(
  f.vx > 0 && f.team === "player" && f.r > 13 && f.damage > 18,
  "air redirects, enlarges, and transfers ownership of fire",
);
for (const t of ["air", "water", "fire"]) {
  collide("earth", t);
  check(
    g.shots.length === 1 && g.shots[0].type === "earth",
    `earth punches through ${t}`,
  );
}
p = reset();
p.shield = true;
g.hit(p, { type: "earth", damage: 33, vx: 100, x: 0, y: 470 });
check(
  p.mana === 66 && p.health === 100 && p.vx > 0,
  "shield stops rock with 34 mana cost and knockback",
);
p.mana = 3;
g.hit(p, { type: "earth", damage: 33, vx: 100, x: 0, y: 470 });
check(!p.shield && p.mana === 0 && p.broken > 0, "impact can shatter shield");
p = reset();
g.hit(p, { type: "fire", damage: 4, vx: 100, x: 0, y: 470 });
const hp = p.health;
steps(120);
check(p.health < hp - 2, "burn damages over time");
g.hit(p, { type: "water", damage: 2, vx: 100, x: 0, y: 470 });
check(p.burn === 0 && p.wet > 0, "water extinguishes burning");
p = reset();
g.choose("earth");
g.input.holds.add("cast");
steps(10);
check(g.shots.length === 0 && p.windup > 0, "earth has a visible windup");
steps(30);
check(
  g.shots.some((s) => s.type === "earth") && p.mana === 76,
  "earth spends mana when rock launches",
);
p = reset();
g.choose("water");
g.input.holds.add("cast");
steps(1800);
check(
  p.mana >= 0 && g.shots.length <= 220,
  "sustained casting remains bounded and cannot overspend mana",
);
g.start();
steps(750);
check(g.enemies.length === 1, "enemy approaches after a quiet interval");
// Give an earth enemy insufficient mana: it must meditate past the 24 mana shot cost.
g.clearEnemies();
const earth = g.actor(290, "earth");
earth.mana = 10;
earth.think = 999;
g.enemies.push(earth);
steps(120);
check(
  earth.charging && earth.mana > 30,
  "enemy recharge continues beyond the low-mana threshold",
);
p = reset();
const foe = g.actor(180, "fire");
foe.health = 0;
g.enemies.push(foe);
g.update(1 / 120);
check(
  g.kills === 1 && g.enemies.length === 0,
  "vanquished enemies are removed and scored once",
);
g.update(1 / 120);
check(g.kills === 1, "kill is not counted twice");
p.health = 0;
g.update(1 / 120);
check(g.state === "dead", "death opens restart state");
g.start();
check(
  g.state === "playing" && g.player.health === 100 && g.kills === 0,
  "restart resets the run",
);
// Two separate pointer IDs must operate movement and casting simultaneously.
reset();
const move = element("moveStick"),
  cast = element("castStick");
move.emit("pointerdown", { pointerId: 1, clientX: 65, clientY: 41 });
cast.emit("pointerdown", { pointerId: 2, clientX: 65, clientY: 30 });
steps(30);
check(
  g.player.x > 40 && g.shots.length > 0,
  "simultaneous move and cast pointer inputs",
);
move.emit("pointercancel", { pointerId: 1 });
cast.emit("lostpointercapture", { pointerId: 2 });
check(
  g.input.move === 0 && !g.input.holds.has("touchCast"),
  "pointer cancellation clears movement and casting",
);
actions[2].emit("pointerdown", { pointerId: 3 });
steps(10);
check(g.player.charging, "charge button seats wizard");
actions[2].emit("pointerup", { pointerId: 3 });
steps(1);
check(!g.player.charging, "release charge button stands wizard up");
g.pause();
check(
  g.state === "paused" && g.input.holds.size === 0,
  "pause clears held inputs",
);
g.pause();
check(g.state === "playing", "resume restores play");
// Render smoke check exercises all procedural drawing operations.
raf(16);
check(true, "canvas render completes");
console.log(`${checks} checks passed.`);

if (renderCanvas) {
  reset();
  g.player.mana = 25;
  g.input.holds.add("charge");
  steps(30);
  raf(33);
  fs.writeFileSync(
    "/tmp/wizardos-charge.png",
    renderCanvas.toBuffer("image/png"),
  );
  g.input.holds.delete("charge");
  const e = g.actor(270, "fire");
  g.enemies.push(e);
  g.choose("water");
  g.input.holds.add("cast");
  steps(90);
  raf(50);
  fs.writeFileSync(
    "/tmp/wizardos-combat.png",
    renderCanvas.toBuffer("image/png"),
  );
}
