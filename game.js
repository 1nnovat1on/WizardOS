/* WizardOS — dependency-free Canvas 2D. Physics uses seconds and a fixed step. */
"use strict";
(() => {
  const $ = (id) => document.getElementById(id),
    canvas = $("world"),
    ctx = canvas.getContext("2d");
  const TAU = Math.PI * 2,
    GROUND = 520,
    HEIGHT = 650;
  const COLORS = {
    water: "#79d7eb",
    fire: "#ffad71",
    air: "#dceacb",
    earth: "#bda67b",
  };
  const TYPES = ["water", "fire", "air", "earth"];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)),
    rand = (a, b) => a + Math.random() * (b - a);
  const noise = (n) => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let width = 1100,
    scale = 1,
    state = "title",
    camera = 0,
    clock = 0,
    accumulator = 0,
    last = 0;
  let player,
    enemies = [],
    shots = [],
    particles = [],
    pools = [],
    flames = [],
    trees = new Map();
  let elapsed = 0,
    spawnTimer = 6,
    kills = 0,
    enemySerial = 0,
    best = 0,
    shake = 0,
    message = "",
    messageTime = 0;
  let soundEnabled = true,
    audioContext,
    musicNeedsRetry = false;
  const soundtrack = new window.WizardAudio({
    onError: () => {
      musicNeedsRetry = true;
      $("sound").textContent = "♪ RETRY";
      $("sound").setAttribute("aria-label", "Retry sound");
      tell("MUSIC COULD NOT START · TAP ♪ TO RETRY", 5);
    },
  });
  try {
    best = Number(localStorage.getItem("wizardos-best")) || 0;
  } catch {}
  const input = {
    keys: new Set(),
    holds: new Set(),
    move: 0,
    aim: 0,
    mouse: null,
    jump: false,
  };
  const action = (name) => input.holds.has(name);
  function actor(x, element = null) {
    return {
      x,
      y: GROUND,
      vx: 0,
      vy: 0,
      dir: 1,
      health: 100,
      mana: 100,
      element,
      angle: 0,
      cd: 0,
      held: 0,
      casting: false,
      shield: false,
      charging: false,
      broken: 0,
      burn: 0,
      wet: 0,
      flash: 0,
      windup: 0,
      think: rand(1, 2),
      burst: 0,
      id: ++enemySerial,
    };
  }
  function resize() {
    const r = canvas.getBoundingClientRect();
    scale = r.height / HEIGHT;
    width = r.width / scale;
    const d = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * d);
    canvas.height = Math.round(r.height * d);
  }
  new ResizeObserver(resize).observe($("stage"));
  function tell(text, t = 2.5) {
    message = text;
    messageTime = t;
  }
  function tone(type) {
    if (!soundEnabled || soundtrack.volume === 0) return;
    try {
      audioContext ||= soundtrack.getContext();
      audioContext.resume().catch(() => {});
      const o = audioContext.createOscillator(),
        g = audioContext.createGain();
      o.type = type === "earth" ? "triangle" : "sine";
      const f =
        { fire: 140, water: 420, air: 240, earth: 65, charge: 550, hit: 95 }[
          type
        ] || 220;
      o.frequency.setValueAtTime(f, audioContext.currentTime);
      o.frequency.exponentialRampToValueAtTime(
        f * 0.4,
        audioContext.currentTime + 0.18,
      );
      g.gain.setValueAtTime(
        Math.max(0.0001, 0.035 * soundtrack.volume),
        audioContext.currentTime,
      );
      g.gain.exponentialRampToValueAtTime(
        0.001,
        audioContext.currentTime + 0.22,
      );
      o.connect(g).connect(audioContext.destination);
      o.start();
      o.stop(audioContext.currentTime + 0.23);
    } catch {}
  }
  function clearInput() {
    input.keys.clear();
    input.holds.clear();
    input.move = 0;
    input.aim = 0;
    input.mouse = null;
    input.jump = false;
    document
      .querySelectorAll(".active")
      .forEach((e) => e.classList.remove("active"));
    document
      .querySelectorAll(".stick i")
      .forEach((e) => (e.style.transform = ""));
  }
  function choose(type) {
    player.element = type;
    player.held = 0;
    player.windup = 0;
    document
      .querySelectorAll("[data-element]")
      .forEach((e) =>
        e.setAttribute("aria-pressed", String(e.dataset.element === type)),
      );
  }
  function start() {
    enemies = [];
    shots = [];
    particles = [];
    pools = [];
    flames = [];
    trees.clear();
    elapsed = 0;
    kills = 0;
    enemySerial = 0;
    player = actor(0, "fire");
    camera = -width * 0.36;
    spawnTimer = 6;
    shake = 0;
    clearInput();
    choose("fire");
    state = "playing";
    $("game").classList.remove("paused");
    $("overlay").hidden = true;
    $("hud").hidden = false;
    $("controls").hidden = false;
    $("status").hidden = false;
    resize();
    camera = player.x - width * 0.36;
    tell("WALK THE WILDS · HOLD E / CHARGE TO RESTORE ARCANA", 5);
    accumulator = 0;
    soundtrack.play(true);
  }
  function showScreen(dead = false) {
    soundtrack.pause();
    clearInput();
    state = dead ? "dead" : "paused";
    $("overlay").hidden = false;
    $("game").classList.add("paused");
    $("screenEyebrow").textContent = dead
      ? "THE WILDS REMEMBER"
      : "A MOMENT OF STILLNESS";
    $("screenTitle").textContent = dead ? "Journey ended" : "Rest, wanderer";
    $("screenDescription").textContent = dead
      ? `${kills} vanquished · Best ${best} · ${Math.floor(elapsed)} seconds survived`
      : "Your journey will be here when you return.";
    $("begin").textContent = dead ? "Begin again →" : "Resume →";
    $("restart").hidden = dead;
    $("begin").focus();
  }
  function pause() {
    if (state === "playing") showScreen();
    else if (state === "paused") {
      state = "playing";
      $("overlay").hidden = true;
      $("game").classList.remove("paused");
      accumulator = 0;
      soundtrack.play();
    }
  }
  $("begin").onclick = () => (state === "paused" ? pause() : start());
  $("restart").onclick = start;
  $("pause").onclick = pause;
  $("sound").onclick = () => {
    soundEnabled = musicNeedsRetry ? true : !soundEnabled;
    musicNeedsRetry = false;
    soundtrack.setMuted(!soundEnabled);
    $("sound").textContent = soundEnabled ? "♪ ON" : "♪ OFF";
    $("sound").setAttribute("aria-pressed", String(soundEnabled));
    $("sound").setAttribute(
      "aria-label",
      soundEnabled ? "Mute sound" : "Enable sound",
    );
    tone("charge");
  };
  $("volume").addEventListener("input", (event) => {
    soundtrack.setVolume(Number(event.target.value) / 100);
  });
  document
    .querySelectorAll("[data-element]")
    .forEach((b) => (b.onclick = () => choose(b.dataset.element)));
  window.addEventListener("keydown", (e) => {
    if (
      ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
        e.code,
      )
    )
      e.preventDefault();
    if (e.code === "Escape" && !e.repeat) {
      pause();
      return;
    }
    if (state !== "playing") return;
    input.keys.add(e.code);
    if (e.code === "Space" && !e.repeat) input.jump = true;
    const map = {
      Digit1: "water",
      Digit2: "fire",
      Digit3: "air",
      Digit4: "earth",
      KeyZ: "fire",
      KeyX: "water",
      KeyC: "earth",
      KeyV: "air",
    };
    if (map[e.code] && !e.repeat) choose(map[e.code]);
  });
  window.addEventListener("keyup", (e) => input.keys.delete(e.code));
  window.addEventListener("blur", () => {
    if (state === "playing") showScreen();
    else clearInput();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state === "playing") showScreen();
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerType === "mouse") {
      const r = canvas.getBoundingClientRect();
      input.mouse = {
        x: (e.clientX - r.left) / scale,
        y: (e.clientY - r.top) / scale,
      };
    }
  });
  canvas.addEventListener("pointerdown", (e) => {
    if (state !== "playing") return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    input.holds.add(e.button === 2 ? "mouseShield" : "cast");
    const r = canvas.getBoundingClientRect();
    input.mouse = {
      x: (e.clientX - r.left) / scale,
      y: (e.clientY - r.top) / scale,
    };
  });
  for (const ev of ["pointerup", "pointercancel", "lostpointercapture"])
    canvas.addEventListener(ev, (e) => {
      input.holds.delete("cast");
      input.holds.delete("mouseShield");
    });
  function holdButton(b) {
    let id = null;
    b.addEventListener("pointerdown", (e) => {
      if (state !== "playing" || id !== null) return;
      e.preventDefault();
      id = e.pointerId;
      b.setPointerCapture(id);
      input.holds.add(b.dataset.action);
      b.classList.add("active");
      if (b.dataset.action === "jump") input.jump = true;
    });
    for (const ev of ["pointerup", "pointercancel", "lostpointercapture"])
      b.addEventListener(ev, (e) => {
        if (e.pointerId !== id) return;
        id = null;
        input.holds.delete(b.dataset.action);
        b.classList.remove("active");
      });
  }
  document.querySelectorAll("[data-action]").forEach(holdButton);
  function stick(el, casting) {
    let id = null;
    function update(e) {
      const r = el.getBoundingClientRect(),
        dx = e.clientX - r.left - r.width / 2,
        dy = e.clientY - r.top - r.height / 2,
        n = Math.hypot(dx, dy),
        factor = Math.min(1, 24 / (n || 1));
      el.querySelector("i").style.transform =
        `translate(${dx * factor}px,${dy * factor}px)`;
      if (casting) {
        input.mouse = null;
        if (n > 7) input.aim = Math.atan2(dy, dx);
      } else input.move = clamp(dx / 25, -1, 1);
    }
    el.addEventListener("pointerdown", (e) => {
      if (state !== "playing" || id !== null) return;
      e.preventDefault();
      id = e.pointerId;
      el.setPointerCapture(id);
      if (casting) {
        input.aim = player.dir === 1 ? 0 : Math.PI;
        input.holds.add("touchCast");
      }
      update(e);
    });
    el.addEventListener("pointermove", (e) => {
      if (e.pointerId === id) update(e);
    });
    for (const ev of ["pointerup", "pointercancel", "lostpointercapture"])
      el.addEventListener(ev, (e) => {
        if (e.pointerId !== id) return;
        id = null;
        el.querySelector("i").style.transform = "";
        if (casting) input.holds.delete("touchCast");
        else input.move = 0;
      });
  }
  stick($("moveStick"), false);
  stick($("castStick"), true);
  function puff(x, y, color, count = 8, speed = 60) {
    for (let i = 0; i < count && particles.length < 360; i++)
      particles.push({
        x,
        y,
        vx: rand(-speed, speed),
        vy: rand(-speed, speed),
        life: rand(0.25, 0.8),
        max: 0.8,
        r: rand(1, 4),
        color,
      });
  }
  function puddle(x, amount = 1) {
    let p = pools.find((p) => Math.abs(p.x - x) < 35);
    if (p) {
      p.r = Math.min(70, p.r + amount);
      p.life = 10;
    } else if (pools.length < 40) pools.push({ x, r: 12 + amount, life: 10 });
  }
  function fireGround(x) {
    if (pools.some((p) => Math.abs(p.x - x) < p.r)) return;
    let f = flames.find((f) => Math.abs(f.x - x) < 30);
    if (f) f.life = Math.min(5, f.life + 1);
    else if (flames.length < 30) flames.push({ x, r: 23, life: 4 });
  }
  function addShot(a, type, power = 1) {
    if (shots.length >= 220) return;
    const angle = a.angle,
      dir = Math.cos(angle) >= 0 ? 1 : -1,
      speed = { fire: 540, water: 600, air: 640, earth: 610 }[type];
    const r = {
      fire: power > 1 ? 13 : 7,
      water: 5,
      air: power > 1 ? 35 : 19,
      earth: 18,
    }[type];
    shots.push({
      type,
      x: a.x + dir * 27,
      y: a.y - 73,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - (type === "earth" ? 65 : 0),
      life: type === "water" ? 2.1 : 2.8,
      r,
      power,
      owner: a.id,
      team: a === player ? "player" : "enemy",
      damage: {
        fire: power > 1 ? 18 : 4,
        water: 2,
        air: power > 1 ? 7 : 1.4,
        earth: 33,
      }[type],
      pushed: false,
      hit: new Set(),
    });
    if (power > 1 || type === "earth") tone(type);
  }
  function cast(a, held, dt) {
    a.cd = Math.max(0, a.cd - dt);
    if (!held) {
      a.held = 0;
      a.windup = 0;
      return;
    }
    a.held += dt;
    if (a.element === "earth") {
      if (a.cd <= 0 && a.windup <= 0 && a.mana >= 24) a.windup = 0.32;
      if (a.windup > 0) {
        a.windup -= dt;
        if (a.windup <= 0) {
          if (a.mana >= 24) {
            a.mana -= 24;
            addShot(a, "earth");
            a.cd = 0.85;
          }
          a.windup = 0;
        }
      }
      return;
    }
    if (a.cd > 0) return;
    const first = a.held <= dt * 1.1;
    const cost = { water: 1.1, fire: first ? 8 : 2.2, air: first ? 7 : 1.4 }[
      a.element
    ];
    if (a.mana < cost) {
      if (a === player) tell("ARCANA LOW · HOLD E / CHARGE", 0.5);
      return;
    }
    a.mana -= cost;
    addShot(a, a.element, first && a.element !== "water" ? 2 : 1);
    a.cd =
      first && a.element !== "water"
        ? 0.24
        : { water: 0.045, fire: 0.085, air: 0.075 }[a.element];
  }
  function hit(a, s) {
    if (a.health <= 0) return;
    if (a.shield) {
      const cost = s.type === "earth" ? 34 : s.damage * 0.9 + 1;
      a.mana = Math.max(0, a.mana - cost);
      a.flash = 0.12;
      puff(s.x, s.y, "#cce6ec", 5);
      if (s.type === "earth") a.vx += Math.sign(s.vx) * 190;
      if (a.mana <= 0) {
        a.shield = false;
        a.broken = 1;
        tell("SHIELD SHATTERED", 1.3);
        puff(a.x, a.y - 43, "#cce6ec", 25, 150);
      }
      return;
    }
    a.health = Math.max(0, a.health - s.damage);
    a.flash = 0.09;
    if (s.type === "fire" && a.wet <= 0) a.burn = 4;
    if (s.type === "water") {
      a.wet = 3;
      a.burn = 0;
    }
    if (s.type === "earth") {
      a.vx += Math.sign(s.vx) * 230;
      a.vy = -115;
    }
    if (s.type === "air") a.vx += Math.sign(s.vx) * (s.power > 1 ? 270 : 65);
    if (a === player && !reduced) shake = Math.min(6, shake + 2);
    puff(s.x, s.y, COLORS[s.type], 4);
  }
  function updateActor(a, dt) {
    a.wet = Math.max(0, a.wet - dt);
    a.burn = Math.max(0, a.burn - dt);
    a.flash = Math.max(0, a.flash - dt);
    a.broken = Math.max(0, a.broken - dt);
    if (a.wet > 0) a.burn = 0;
    if (a.burn > 0) {
      a.health = Math.max(0, a.health - 3 * dt);
      if (Math.random() < dt * 24)
        puff(a.x + rand(-12, 12), a.y - 30, "#ffad71", 1, 30);
    }
    for (const p of pools) {
      if (Math.abs(a.x - p.x) < p.r && a.y >= GROUND - 5) {
        a.wet = 2;
        a.burn = 0;
      }
    }
    for (const f of flames) {
      if (
        Math.abs(a.x - f.x) < f.r &&
        a.y >= GROUND - 5 &&
        a.wet <= 0 &&
        !a.shield
      )
        a.burn = 3;
    }
    if (a.charging) {
      a.vx = 0;
      a.vy = 0;
      a.y = GROUND;
      a.mana = Math.min(100, a.mana + 27 * dt);
    } else {
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.vy += 1000 * dt;
      if (a.y >= GROUND) {
        a.y = GROUND;
        a.vy = 0;
      }
      a.vx *= Math.exp(-8 * dt);
      if (!a.casting && !a.shield) a.mana = Math.min(100, a.mana + 4 * dt);
    }
    if (a.shield) {
      a.mana = Math.max(0, a.mana - 25 * dt);
      if (a.mana === 0) {
        a.shield = false;
        a.broken = 0.8;
      }
    }
  }
  function update(dt) {
    elapsed += dt;
    messageTime -= dt;
    shake *= Math.exp(-10 * dt);
    const k = input.keys;
    let movement =
      input.move +
      (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) -
      (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    movement = clamp(movement, -1, 1);
    player.charging = (action("charge") || k.has("KeyE")) && player.y >= GROUND;
    player.shield =
      !player.charging &&
      player.broken <= 0 &&
      player.mana > 0 &&
      (action("shield") ||
        action("mouseShield") ||
        k.has("ShiftLeft") ||
        k.has("ShiftRight"));
    const casting =
      action("cast") ||
      action("touchCast") ||
      ["KeyZ", "KeyX", "KeyC", "KeyV"].some((x) => k.has(x));
    player.casting = casting && !player.charging && !player.shield;
    if (!player.charging) {
      player.x += movement * (player.shield ? 105 : 220) * dt;
      if (movement) player.dir = Math.sign(movement);
      if (input.jump && player.y >= GROUND) player.vy = -440;
    }
    input.jump = false;
    if (input.mouse) {
      player.angle = Math.atan2(
        input.mouse.y - (player.y - 73),
        input.mouse.x + camera - player.x,
      );
    } else if (action("touchCast")) player.angle = input.aim;
    else {
      if (k.has("ArrowUp")) input.aim -= dt * 1.5;
      if (k.has("ArrowDown")) input.aim += dt * 1.5;
      input.aim = clamp(input.aim, -1.25, 1.25);
      player.angle = player.dir === 1 ? input.aim : Math.PI - input.aim;
    }
    if (player.casting) player.dir = Math.cos(player.angle) >= 0 ? 1 : -1;
    cast(player, player.casting, dt);
    updateActor(player, dt);
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      if (enemies.length < Math.min(3, 1 + Math.floor(elapsed / 35))) {
        const side = Math.random() < 0.5 ? -1 : 1,
          e = actor(
            player.x + side * Math.max(340, width * 0.65),
            TYPES[Math.floor(elapsed / 10 + enemySerial) % 4],
          );
        e.health = 65 + Math.min(35, kills * 2);
        e.dir = -side;
        enemies.push(e);
        tell(
          `${e.element.toUpperCase()} ADEPT APPROACHING ${side < 0 ? "←" : "→"}`,
          3,
        );
      }
      spawnTimer = rand(8, 12);
    }
    for (const e of enemies) {
      const dx = player.x - e.x;
      e.dir = Math.sign(dx) || 1;
      e.angle = Math.atan2(player.y - e.y, dx);
      e.think -= dt;
      e.burst = Math.max(0, e.burst - dt);
      e.charging =
        e.burst <= 0 &&
        (e.charging ? e.mana < 70 : e.mana < (e.element === "earth" ? 24 : 12));
      e.shield = false;
      if (!e.charging) {
        if (Math.abs(dx) > Math.min(290, width * 0.58)) e.x += e.dir * 65 * dt;
        else if (Math.abs(dx) < 120) e.x -= e.dir * 40 * dt;
        if (e.think <= 0 && Math.abs(dx) < width * 0.85 + 100) {
          e.burst = e.element === "earth" ? 0.6 : rand(0.6, 1.1);
          e.think = rand(2, 3.4);
        }
      }
      e.casting = e.burst > 0 && !e.charging;
      cast(e, e.casting, dt);
      updateActor(e, dt);
    }
    updateShots(dt);
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy -= 18 * dt;
      p.life -= dt;
    }
    particles = particles.filter((p) => p.life > 0);
    for (const p of pools) p.life -= dt;
    pools = pools.filter((p) => p.life > 0);
    for (const f of flames) {
      f.life -= dt;
      if (pools.some((p) => Math.abs(p.x - f.x) < p.r + f.r)) {
        f.life = 0;
        puff(f.x, GROUND - 8, "#ccd9d5", 5, 35);
      }
    }
    flames = flames.filter((f) => f.life > 0);
    for (const e of enemies)
      if (e.health <= 0) {
        kills++;
        player.health = Math.min(100, player.health + 8);
        puff(e.x, e.y - 45, COLORS[e.element], 25, 110);
        tell("ADEPT VANQUISHED · +8 VITALITY", 2);
      }
    enemies = enemies.filter(
      (e) => e.health > 0 && Math.abs(e.x - player.x) < 3000,
    );
    if (player.health <= 0) {
      best = Math.max(best, kills);
      try {
        localStorage.setItem("wizardos-best", String(best));
      } catch {}
      showScreen(true);
    }
    camera += (player.x - width * 0.4 - camera) * (1 - Math.exp(-4 * dt));
    for (const [key] of trees)
      if (Math.abs(key * 190 - player.x) > 2500) trees.delete(key);
  }
  function updateShots(dt) {
    for (const s of shots) {
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.type === "earth" || s.type === "water") s.vy += 620 * dt;
      if (s.type === "fire") s.vy -= 15 * dt;
      if (s.type === "air")
        s.r = Math.min(s.power > 1 ? 72 : 35, s.r + 25 * dt);
      if (s.y >= GROUND - s.r * 0.3) {
        if (s.type === "water") puddle(s.x, 0.8);
        if (s.type === "fire") fireGround(s.x);
        puff(
          s.x,
          GROUND - 3,
          COLORS[s.type],
          s.type === "earth" ? 15 : 2,
          s.type === "earth" ? 110 : 30,
        );
        s.life = 0;
      }
      if (
        s.type === "fire" &&
        pools.some((p) => Math.abs(s.x - p.x) < p.r && s.y > GROUND - 22)
      ) {
        s.life = 0;
        puff(s.x, s.y, "#dce4df", 3);
      }
      if (s.life <= 0) continue;
      for (const o of shots) {
        if (
          s === o ||
          o.life <= 0 ||
          Math.abs(s.x - o.x) > s.r + o.r ||
          Math.abs(s.y - o.y) > s.r + o.r
        )
          continue;
        if (s.type === "water" && o.type === "fire") {
          s.life = 0;
          o.life = 0;
          puff(s.x, s.y, "#e2e6da", 5, 45);
          break;
        }
        if (s.type === "air" && o.type === "fire" && !o.pushed) {
          o.vx = s.vx * 0.75;
          o.vy = s.vy * 0.75;
          o.r = Math.min(23, o.r * 1.45);
          o.damage *= 1.2;
          o.pushed = true;
          o.owner = s.owner;
          o.team = s.team;
          puff(o.x, o.y, "#ffca83", 4);
        }
        if (s.type === "earth" && o.type !== "earth") {
          o.life = 0;
          puff(o.x, o.y, COLORS[o.type], 2);
        }
      }
      if (s.life <= 0) continue;
      const targets = s.team === "player" ? enemies : [player];
      for (const a of targets) {
        if (s.hit.has(a.id)) continue;
        const ar = a.shield ? 51 : 19,
          center = a.y - (a.charging ? 29 : 44);
        if (
          Math.abs(s.x - a.x) < s.r + ar &&
          Math.abs(s.y - center) < s.r + (a.shield ? 51 : a.charging ? 30 : 46)
        ) {
          hit(a, s);
          s.hit.add(a.id);
          s.life = 0;
          break;
        }
      }
      if (s.type === "fire" || s.type === "water") {
        const id = Math.round(s.x / 190),
          tx = id * 190;
        if (Math.abs(s.x - tx) < 14 && s.y > GROUND - (80 + noise(id) * 85)) {
          if (s.type === "fire") trees.set(id, elapsed + 6);
          else trees.delete(id);
        }
      }
    }
    shots = shots.filter(
      (s) => s.life > 0 && Math.abs(s.x - player.x) < width + 1300,
    );
  }
  function circle(x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.1, r), 0, TAU);
    ctx.fill();
  }
  function line(points, color, w = 1) {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
    ctx.stroke();
  }
  function poly(points, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
    ctx.closePath();
    ctx.fill();
  }
  function glow(x, y, r, color) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function landscape() {
    const day = (Math.sin(clock / 90) + 1) / 2;
    const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(
      0,
      `rgb(${18 + day * 11},${35 + day * 12},${48 + day * 12})`,
    );
    sky.addColorStop(0.65, "#687e7b");
    sky.addColorStop(1, "#9fa78a");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, HEIGHT);
    for (let i = 0; i < 55; i++) {
      const x = (((noise(i) * 2200 - camera * 0.05) % width) + width) % width,
        y = noise(i + 100) * 230;
      circle(
        x,
        y,
        0.6 + noise(i + 5),
        `rgba(239,235,203,${0.15 + noise(i) * 0.4})`,
      );
    }
    glow(width * 0.76, 112, 120, "#d9d8b732");
    circle(width * 0.76, 112, 29, "#e0dfbf");
    circle(width * 0.76 + 13, 104, 26, "#344e59");
    for (let layer = 0; layer < 3; layer++) {
      const par = 0.08 + layer * 0.12,
        step = 150,
        base = 350 + layer * 45,
        pts = [[-200, HEIGHT]];
      const offset = camera * par;
      for (
        let i = Math.floor(offset / step) - 2;
        i < (offset + width) / step + 3;
        i++
      )
        pts.push([
          i * step - offset,
          base - noise(i + layer * 20) * (130 - layer * 25),
        ]);
      pts.push([width + 200, HEIGHT]);
      poly(pts, ["#3b5862", "#36545b", "#294a4e"][layer]);
    }
    // Distant ruined towers and evergreen silhouettes.
    for (
      let i = Math.floor((camera * 0.35) / 430) - 1;
      i < (camera * 0.35 + width) / 430 + 1;
      i++
    ) {
      const x = i * 430 - camera * 0.35,
        y = 360,
        h = 80 + noise(i) * 70;
      ctx.fillStyle = "#29494e";
      ctx.fillRect(x, y - h, 26, h);
      for (let j = 0; j < 3; j++)
        ctx.fillRect(x + j * 11 - 2, y - h - 8, 7, 14);
      ctx.fillStyle = "#718880";
      ctx.fillRect(x + 9, y - h + 24, 6, 15);
    }
    for (
      let i = Math.floor((camera * 0.55) / 65) - 1;
      i < (camera * 0.55 + width) / 65 + 2;
      i++
    ) {
      const x = i * 65 - camera * 0.55,
        h = 55 + noise(i) * 140;
      poly(
        [
          [x - 35, 450],
          [x, 450 - h],
          [x + 35, 450],
        ],
        "#25464a",
      );
      poly(
        [
          [x - 24, 420],
          [x, 430 - h],
          [x + 24, 420],
        ],
        "#2b4b4d",
      );
    }
    const mist = ctx.createLinearGradient(0, 350, 0, GROUND);
    mist.addColorStop(0, "#b9cec000");
    mist.addColorStop(0.65, "#b9cec022");
    mist.addColorStop(1, "#b9cec000");
    ctx.fillStyle = mist;
    ctx.fillRect(0, 350, width, 170);
    ctx.fillStyle = "#172f32";
    ctx.fillRect(0, GROUND, width, HEIGHT - GROUND);
    ctx.fillStyle = "#52675b";
    ctx.fillRect(0, GROUND, width, 3);
    for (
      let i = Math.floor(camera / 22) - 1;
      i < (camera + width) / 22 + 1;
      i++
    ) {
      const x = i * 22 - camera,
        n = noise(i);
      line(
        [
          [x, GROUND + 3],
          [x + Math.sin(clock * 1.4 + i) * 3, GROUND - 4 - n * 10],
        ],
        "#6f8161",
        1,
      );
      if (n > 0.7) circle(x + 3, GROUND - 7, 1.3, "#b6b49a");
      const y = GROUND + 15 + noise(i + 12) * 100;
      line(
        [
          [x, y],
          [x + 7 + n * 25, y],
        ],
        "#284144",
        1,
      );
    }
    // Foreground trees preserve the old sandbox's burnable scenery.
    for (
      let i = Math.floor(camera / 190) - 1;
      i < (camera + width) / 190 + 1;
      i++
    ) {
      const x = i * 190 - camera;
      if (noise(i + 2) < 0.3) continue;
      const h = 80 + noise(i) * 85,
        burning = (trees.get(i) || 0) > elapsed;
      line(
        [
          [x, GROUND],
          [x + 3, GROUND - h * 0.7],
          [x - 7, GROUND - h],
        ],
        burning ? "#806a4c" : "#284442",
        7,
      );
      for (let j = 0; j < 4; j++) {
        const y = GROUND - h + j * h * 0.17;
        poly(
          [
            [x - 34 + j * 3, y + 45],
            [x, y - 15],
            [x + 38 - j * 3, y + 45],
          ],
          burning ? "#655e43" : "#345348",
        );
      }
      if (burning) {
        glow(x, GROUND - h * 0.45, 70, "#eb9b4933");
        for (let j = 0; j < 9; j++)
          circle(
            x + Math.sin(j * 9 + clock * 3) * 22,
            GROUND - 20 - ((clock * 35 + j * 17) % h),
            3 + noise(j) * 3,
            "#edac63",
          );
      }
    }
    // Ancient stone marker.
    const ox = -180 - camera;
    if (ox > -100 && ox < width + 100) {
      poly(
        [
          [ox - 16, GROUND],
          [ox - 12, GROUND - 125],
          [ox, GROUND - 147],
          [ox + 13, GROUND - 125],
          [ox + 19, GROUND],
        ],
        "#71837a",
      );
      poly(
        [
          [ox, GROUND - 147],
          [ox + 13, GROUND - 125],
          [ox + 19, GROUND],
          [ox + 5, GROUND],
        ],
        "#52685f",
      );
      line(
        [
          [ox, GROUND - 105],
          [ox - 5, GROUND - 86],
          [ox + 5, GROUND - 77],
          [ox, GROUND - 56],
        ],
        "#c0c5a4",
        2,
      );
    }
  }
  function rune(x, y, r, time, alpha = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#bde8d8";
    ctx.lineWidth = 1.2;
    for (const radius of [r, r * 0.82]) {
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, TAU);
      ctx.stroke();
    }
    ctx.rotate(time * 0.35);
    for (let i = 0; i < 6; i++) {
      const a = (i * TAU) / 6,
        b = ((i + 2) * TAU) / 6;
      line(
        [
          [Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72],
          [Math.cos(b) * r * 0.72, Math.sin(b) * r * 0.72],
        ],
        "#aedfcc",
        1,
      );
    }
    for (let i = 0; i < 12; i++) {
      ctx.save();
      ctx.rotate((i * TAU) / 12);
      line(
        [
          [0, -r * 0.86],
          [0, -r * 0.96],
          [-3, -r * 0.92],
          [2, -r * 0.89],
        ],
        "#ebdda6",
        1.5,
      );
      ctx.restore();
    }
    ctx.restore();
  }
  function wizard(a, hero = false) {
    const x = a.x - camera,
      y = a.y;
    ctx.save();
    ctx.translate(x, y);
    if (hero && state === "title") ctx.scale(1.7, 1.7);
    const sway = Math.sin(clock * 2.8 + a.id) * 5 + clamp(a.vx * 0.02, -8, 8),
      sit = a.charging,
      top = sit ? -51 : -86,
      robe = hero
        ? "#637e87"
        : {
            fire: "#986752",
            water: "#507f8e",
            air: "#7c8b76",
            earth: "#80725b",
          }[a.element];
    ctx.fillStyle = "#091e2755";
    ctx.beginPath();
    ctx.ellipse(0, 2, sit ? 35 : 25, 6, 0, 0, TAU);
    ctx.fill();
    if (sit) {
      glow(0, -30, 100, "#96ddc338");
      rune(0, -36, 67, clock);
      ctx.save();
      ctx.scale(1, 0.27);
      rune(0, 0, 85, -clock, 0.8);
      ctx.restore();
      for (let i = 0; i < 7; i++)
        circle(
          Math.sin(i * 2.4 + clock) * 49,
          -((clock * 25 + i * 19) % 108),
          1.6,
          "#ddedd0",
        );
    }
    ctx.scale(a.dir, 1);
    // Layered flowing cloak, with a moving hem and a separately animated beard.
    ctx.fillStyle = hero ? "#2d495c" : "#344c4d";
    ctx.beginPath();
    ctx.moveTo(-11, top + 24);
    ctx.bezierCurveTo(-29, top + 35, -28 + sway, -21, -38 + sway, -3);
    ctx.quadraticCurveTo(-12 + sway, 7, 19, -1);
    ctx.lineTo(11, top + 23);
    ctx.fill();
    ctx.fillStyle = robe;
    ctx.beginPath();
    ctx.moveTo(-9, top + 22);
    ctx.lineTo(13, top + 23);
    ctx.bezierCurveTo(17, top + 43, 16, top + 54, sit ? 31 : 21, -2);
    ctx.quadraticCurveTo(4, 5, -22 + sway * 0.3, -2);
    ctx.bezierCurveTo(-10, top + 53, -16, top + 41, -9, top + 22);
    ctx.fill();
    line(
      [
        [-7, top + 32],
        [-3, top + 54],
        [-8 + sway * 0.3, -5],
      ],
      "#a8b6ac55",
      1.5,
    );
    line(
      [
        [11, top + 31],
        [12, top + 49],
        [17, -3],
      ],
      "#cfbf8d88",
      1.2,
    );
    if (sit) {
      ctx.fillStyle = robe;
      ctx.beginPath();
      ctx.ellipse(0, -7, 32, 11, 0, 0, TAU);
      ctx.fill();
      line(
        [
          [-24, -6],
          [14, -1],
          [25, -9],
        ],
        "#afbdac",
        1,
      );
    }
    // Staff, hands and face.
    const sx = sit ? 37 : 26;
    line(
      [
        [sx, 0],
        [sx - 2, top - 2],
        [sx + 1, top - 13],
      ],
      "#514c3e",
      5,
    );
    line(
      [
        [sx - 1, -2],
        [sx - 3, top - 8],
      ],
      "#b8a176",
      1.3,
    );
    glow(sx, top - 10, 22, COLORS[a.element] + "66");
    circle(sx, top - 10, 5, COLORS[a.element]);
    poly(
      [
        [sx, top - 18],
        [sx + 6, top - 10],
        [sx, top - 3],
        [sx - 5, top - 10],
      ],
      COLORS[a.element],
    );
    circle(2, top + 16, 10, "#c9ae8a");
    circle(10, top + 18, 3.2, "#d6bb95");
    line(
      [
        [7, top + 14],
        [11, top + 14],
      ],
      "#253b42",
      1.5,
    );
    ctx.fillStyle = "#e2e6d3";
    ctx.beginPath();
    ctx.moveTo(-8, top + 21);
    ctx.quadraticCurveTo(2, top + 26, 12, top + 20);
    ctx.bezierCurveTo(
      18,
      top + 35,
      6 + sway * 0.75,
      top + 46,
      11 + sway,
      top + 57,
    );
    ctx.bezierCurveTo(-3 + sway * 0.5, top + 50, -14, top + 36, -8, top + 21);
    ctx.fill();
    line(
      [
        [-4, top + 28],
        [0, top + 40],
        [8 + sway * 0.6, top + 49],
      ],
      "#a8beb6",
      1,
    );
    ctx.fillStyle = hero ? "#637f89" : robe;
    ctx.beginPath();
    ctx.moveTo(-21, top + 8);
    ctx.quadraticCurveTo(-10, top - 2, 0, top - 28);
    ctx.quadraticCurveTo(3, top - 39, 17 + sway * 0.4, top - 25);
    ctx.quadraticCurveTo(6, top - 27, 9, top - 12);
    ctx.lineTo(17, top + 7);
    ctx.quadraticCurveTo(0, top + 14, -21, top + 8);
    ctx.fill();
    line(
      [
        [-16, top + 6],
        [15, top + 5],
      ],
      "#d1ba84",
      2,
    );
    circle(4, top - 6, 1.8, "#e2d7a3");
    if (!sit) {
      line(
        [
          [10, top + 37],
          [22, top + 44],
          [sx, top + 36],
        ],
        robe,
        9,
      );
      circle(sx, top + 36, 4, "#c9ae8a");
    } else {
      circle(-17, -15, 3.5, "#c9ae8a");
      circle(18, -15, 3.5, "#c9ae8a");
    }
    ctx.restore();
    if (a.shield) {
      glow(x, y - 44, 75, "#b9e5ed22");
      ctx.strokeStyle = a.flash > 0 ? "#ffffff" : "#b6e2e7";
      ctx.lineWidth = a.flash > 0 ? 3 : 1.5;
      ctx.beginPath();
      ctx.ellipse(x, y - 44, 48, 61, 0, 0, TAU);
      ctx.stroke();
      rune(x, y - 44, 48, clock, 0.45);
    }
    if (a.windup > 0) {
      const progress = 1 - a.windup / 0.32;
      circle(x + a.dir * 37, y - 73, 8 + progress * 11, "#b6a079");
      rune(x + a.dir * 37, y - 73, 25, -clock, 0.6);
    }
    if (!hero) {
      ctx.fillStyle = "#0b2329";
      ctx.fillRect(x - 25, y - 137, 50, 4);
      ctx.fillStyle = COLORS[a.element];
      ctx.fillRect(x - 25, y - 137, (50 * a.health) / 100, 4);
      ctx.font = "8px Arial";
      ctx.textAlign = "center";
      ctx.fillStyle = "#d7dfcd";
      ctx.fillText(a.element.toUpperCase(), x, y - 145);
      if (a.think < 0.6 && a.think > 0) {
        rune(x, y - 68, 29, clock, 0.55);
      }
    }
    if (a.flash > 0) glow(x, y - 44, 45, "#f1eac644");
  }
  function drawShot(s) {
    const x = s.x - camera,
      y = s.y;
    if (s.type === "water") {
      ctx.strokeStyle = "#a5eaf0bb";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x - s.vx * 0.055, y - s.vy * 0.055);
      ctx.lineTo(x, y);
      ctx.stroke();
      circle(x, y, 2, "#e4faf1");
    } else if (s.type === "fire") {
      glow(x, y, s.r * 3, "#ff963f44");
      line(
        [
          [x - s.vx * 0.075, y - s.vy * 0.075],
          [x, y],
        ],
        "#df784aaa",
        s.r * 1.4,
      );
      circle(x, y, s.r, "#f7a660");
      circle(x + 1, y - 1, s.r * 0.48, "#ffe6a3");
    } else if (s.type === "air") {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.atan2(s.vy, s.vx));
      ctx.strokeStyle = "#e1efcfaa";
      ctx.lineWidth = s.power > 1 ? 2 : 1;
      ctx.beginPath();
      ctx.ellipse(0, 0, s.r * 0.3, s.r, 0, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      line(
        [
          [-28, -s.r * 0.4],
          [-4, -s.r * 0.4],
        ],
        "#d1e8d566",
        1,
      );
      line(
        [
          [-35, s.r * 0.3],
          [-5, s.r * 0.3],
        ],
        "#d1e8d566",
        1,
      );
      ctx.restore();
    } else {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(clock * 5);
      poly(
        [
          [-17, -9],
          [-6, -18],
          [13, -14],
          [19, 2],
          [9, 17],
          [-13, 14],
        ],
        "#a28e6d",
      );
      poly(
        [
          [-17, -9],
          [-6, -18],
          [13, -14],
          [1, 0],
        ],
        "#c5b28a",
      );
      line(
        [
          [1, 0],
          [9, 17],
        ],
        "#746950",
        2,
      );
      ctx.restore();
    }
  }
  function render() {
    const r = canvas.getBoundingClientRect();
    ctx.setTransform(
      (canvas.width / r.width) * scale,
      0,
      0,
      (canvas.height / r.height) * scale,
      0,
      0,
    );
    ctx.lineCap = "round";
    landscape();
    ctx.save();
    if (shake && !reduced)
      ctx.translate(rand(-shake, shake), rand(-shake, shake));
    for (const p of pools) {
      ctx.globalAlpha = Math.min(1, p.life / 2);
      ctx.fillStyle = "#6ac4d955";
      ctx.beginPath();
      ctx.ellipse(p.x - camera, GROUND + 2, p.r, 5, 0, 0, TAU);
      ctx.fill();
      line(
        [
          [p.x - camera - p.r * 0.7, GROUND],
          [p.x - camera + p.r * 0.7, GROUND],
        ],
        "#b4e6e199",
        1,
      );
      ctx.globalAlpha = 1;
    }
    for (const f of flames) {
      glow(f.x - camera, GROUND - 8, 40, "#f7994d33");
      for (let i = 0; i < 6; i++) {
        const t = (clock * 2 + i * 0.17) % 1,
          x = f.x - camera + Math.sin(i * 8) * f.r * 0.8;
        poly(
          [
            [x - 4, GROUND],
            [x + Math.sin(clock * 8 + i) * 4, GROUND - 12 - t * 24],
            [x + 5, GROUND],
          ],
          i % 2 ? "#e58f52" : "#fbc480",
        );
      }
    }
    if (state === "title") {
      const a = {
        ...player,
        x: camera + width * 0.76,
        y: GROUND,
        charging: false,
      };
      wizard(a, true);
      rune(width * 0.76, GROUND - 65, 115, clock, 0.13);
    } else {
      enemies.forEach((e) => wizard(e));
      wizard(player, true);
    }
    shots.forEach(drawShot);
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      circle(p.x - camera, p.y, p.r, p.color);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    if (state === "playing") {
      for (const e of enemies) {
        const x = e.x - camera;
        if (x < 15 || x > width - 15) {
          ctx.font = "18px Georgia";
          ctx.textAlign = "center";
          ctx.fillStyle = COLORS[e.element];
          ctx.fillText(
            x < 15 ? "◀" : "▶",
            clamp(x, 15, width - 15),
            GROUND - 95,
          );
        }
      }
      $("healthText").textContent = Math.ceil(player.health);
      $("manaText").textContent = Math.floor(player.mana);
      $("healthBar").style.width = player.health + "%";
      $("manaBar").style.width = player.mana + "%";
      $("score").textContent = `${kills} VANQUISHED`;
      $("status").textContent = player.charging
        ? "MEDITATING · RELEASE TO RISE"
        : player.shield
          ? "AEGIS · ARCANA DRAINING"
          : messageTime > 0
            ? message
            : enemies.length
              ? "READ THEIR CAST · CHOOSE YOUR ELEMENT"
              : "THE WILDS ARE QUIET";
    }
  }
  player = actor(0, "fire");
  resize();
  camera = -width * 0.4;
  function frame(ms) {
    const dt = Math.min((ms - last) / 1000 || 0, 0.05);
    last = ms;
    if (state === "playing") {
      clock += dt;
      accumulator += dt;
      let steps = 0;
      while (accumulator >= 1 / 120 && steps++ < 7) {
        update(1 / 120);
        accumulator -= 1 / 120;
        if (state !== "playing") {
          accumulator = 0;
          break;
        }
      }
    } else if (state === "title" && !reduced) clock += dt;
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // Explicit opt-in hooks for deterministic combat regression checks; absent in normal play.
  if (new URLSearchParams(location.search).has("debug"))
    window.WizardOS = {
      get player() {
        return player;
      },
      get enemies() {
        return enemies;
      },
      get shots() {
        return shots;
      },
      get pools() {
        return pools;
      },
      get state() {
        return state;
      },
      get camera() {
        return camera;
      },
      get width() {
        return width;
      },
      get kills() {
        return kills;
      },
      start,
      pause,
      actor,
      addShot,
      hit,
      updateShots,
      update,
      choose,
      get input() {
        return input;
      },
      clearEnemies() {
        enemies = [];
        spawnTimer = 999;
      },
      clearShots() {
        shots = [];
        pools = [];
        flames = [];
      },
    };
})();
