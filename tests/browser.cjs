/* Run: NODE_PATH=<path containing playwright> node tests/browser.cjs
   Serve the repository on http://127.0.0.1:8000 first. */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:8000/?debug=1");
  await page.screenshot({ path: "/tmp/wizardos-title.png" });
  assert.equal(await page.locator("#screenTitle").textContent(), "WizardOS");
  await page.locator("#begin").click();
  await page.evaluate(() => WizardOS.clearEnemies());
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(350);
  await page.keyboard.up("KeyD");
  assert.ok(
    (await page.evaluate(() => WizardOS.player.x)) > 35,
    "keyboard movement",
  );
  await page.evaluate(() => (WizardOS.player.mana = 20));
  await page.keyboard.down("KeyE");
  await page.waitForTimeout(100);
  const sit = await page.evaluate(() => ({
    x: WizardOS.player.x,
    mana: WizardOS.player.mana,
  }));
  await page.keyboard.down("KeyD");
  await page.mouse.move(900, 480);
  await page.mouse.down();
  await page.waitForTimeout(350);
  assert.equal(
    await page.evaluate(() => WizardOS.player.x),
    sit.x,
    "meditation roots the player",
  );
  assert.ok(
    (await page.evaluate(() => WizardOS.player.mana)) > sit.mana + 6,
    "meditation restores mana",
  );
  assert.equal(
    await page.evaluate(() => WizardOS.shots.length),
    0,
    "cannot cast while charging",
  );
  await page.screenshot({ path: "/tmp/wizardos-charge.png" });
  await page.keyboard.up("KeyE");
  await page.keyboard.up("KeyD");
  await page.mouse.up();
  const results = await page.evaluate(() => {
    const g = WizardOS,
      p = g.player,
      result = [];
    g.pause();
    g.clearShots();
    p.x = 0;
    p.y = 520;
    p.angle = 0;
    p.shield = false;
    p.charging = false;
    p.wet = 0;
    function check(condition, label) {
      if (!condition) throw Error(label);
      result.push(label);
    }
    g.addShot(p, "water");
    for (let i = 0; i < 240; i++) g.updateShots(1 / 120);
    check(g.pools.length > 0, "water remains as a ground puddle");
    g.clearShots();
    g.addShot(p, "water");
    const e = g.actor(60, "fire");
    e.angle = Math.PI;
    g.addShot(e, "fire");
    g.shots[1].x = g.shots[0].x;
    g.shots[1].y = g.shots[0].y;
    g.updateShots(0);
    check(g.shots.length === 0, "water intercepts fire");
    g.addShot(p, "air", 2);
    g.addShot(e, "fire", 2);
    g.shots[1].x = g.shots[0].x;
    g.shots[1].y = g.shots[0].y;
    g.updateShots(0);
    const f = g.shots.find((s) => s.type === "fire");
    check(
      f.vx > 0 && f.team === "player" && f.r > 13,
      "air redirects and enlarges fire",
    );
    g.clearShots();
    g.addShot(p, "earth");
    g.addShot(e, "air");
    g.shots[1].x = g.shots[0].x;
    g.shots[1].y = g.shots[0].y;
    g.updateShots(0);
    check(
      g.shots.length === 1 && g.shots[0].type === "earth",
      "earth penetrates air",
    );
    p.mana = 100;
    p.health = 100;
    p.shield = true;
    g.hit(p, { type: "earth", damage: 33, vx: 100, x: 0, y: 470 });
    check(
      p.mana === 66 && p.health === 100 && p.vx > 0,
      "shield absorbs rock at high mana cost and knockback",
    );
    p.mana = 3;
    g.hit(p, { type: "earth", damage: 33, vx: 100, x: 0, y: 470 });
    check(
      !p.shield && p.mana === 0 && p.broken > 0,
      "shield breaks without negative mana",
    );
    p.burn = 0;
    g.hit(p, { type: "fire", damage: 4, vx: 100, x: 0, y: 470 });
    check(p.burn > 0, "fire applies lingering burn");
    g.hit(p, { type: "water", damage: 2, vx: 100, x: 0, y: 470 });
    check(p.burn === 0 && p.wet > 0, "water extinguishes burn");
    g.start();
    g.clearEnemies();
    const p2 = g.player;
    p2.mana = 0;
    for (let i = 0; i < 120; i++) g.update(1 / 120);
    check(
      p2.mana > 3.9 && p2.mana < 4.1,
      "passive mana regeneration uses elapsed time",
    );
    g.start();
    for (let i = 0; i < 750; i++) g.update(1 / 120);
    check(g.enemies.length === 1, "occasional elemental enemy spawns");
    g.player.health = 0;
    g.update(1 / 120);
    check(g.state === "dead", "death opens restart screen");
    return result;
  });
  console.log(results.join("\n"));
  await page.locator("#begin").click();
  await page.evaluate(() => WizardOS.clearEnemies());
  await page.keyboard.press("Digit1");
  await page.mouse.move(950, 500);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await page.screenshot({ path: "/tmp/wizardos-combat.png" });
  await page.keyboard.press("Escape");
  assert.equal(await page.evaluate(() => WizardOS.state), "paused");
  await page.locator("#begin").click();
  assert.equal(await page.evaluate(() => WizardOS.state), "playing");
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const m = await mobile.newPage();
  m.on("pageerror", (e) => errors.push(e.message));
  await m.goto("http://127.0.0.1:8000/?debug=1");
  await m.locator("#begin").tap();
  await m.evaluate(() => WizardOS.clearEnemies());
  assert.equal(
    await m.evaluate(() => document.documentElement.scrollWidth),
    390,
    "no horizontal mobile overflow",
  );
  const client = await mobile.newCDPSession(m);
  const center = async (s) => {
    const r = await m.locator(s).boundingBox();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  };
  const move = await center("#moveStick"),
    cast = await center("#castStick");
  await m.locator('[data-element="water"]').tap();
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { id: 1, x: move.x + 22, y: move.y },
      { id: 2, x: cast.x + 20, y: cast.y - 8 },
    ],
  });
  await m.waitForTimeout(400);
  assert.ok(
    (await m.evaluate(() => WizardOS.player.x)) > 35,
    "multitouch movement",
  );
  assert.ok(
    (await m.evaluate(() => WizardOS.shots.length)) > 0,
    "multitouch casting while moving",
  );
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await m.waitForTimeout(100);
  assert.equal(
    await m.evaluate(() => WizardOS.input.move),
    0,
    "touch movement releases",
  );
  assert.equal(
    await m.evaluate(() => WizardOS.input.holds.size),
    0,
    "touch casting releases",
  );
  const charge = await center('[data-action="charge"]');
  await m.evaluate(() => (WizardOS.player.mana = 10));
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ id: 1, ...charge }],
  });
  await m.waitForTimeout(400);
  assert.ok(
    await m.evaluate(
      () => WizardOS.player.charging && WizardOS.player.mana > 17,
    ),
    "touch charging",
  );
  await m.screenshot({ path: "/tmp/wizardos-mobile.png" });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  await m.waitForTimeout(50);
  assert.equal(
    await m.evaluate(() => WizardOS.player.charging),
    false,
    "touch cancellation releases charging",
  );
  await m.setViewportSize({ width: 844, height: 390 });
  await m.waitForTimeout(100);
  await m.screenshot({ path: "/tmp/wizardos-landscape.png" });
  for (const s of [
    "#moveStick",
    "#castStick",
    '[data-action="charge"]',
    '[data-element="water"]',
  ]) {
    const r = await m.locator(s).boundingBox();
    assert.ok(
      r.x >= 0 && r.y >= 0 && r.x + r.width <= 844 && r.y + r.height <= 390,
      `${s} fits landscape`,
    );
  }
  assert.deepEqual(errors, [], "no browser runtime errors");
  console.log(
    "PASS: desktop, mobile multitouch, portrait/landscape, pause/restart, and combat checks",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
