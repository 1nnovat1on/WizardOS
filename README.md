# WizardOS — The Elemental Wilds

A side-scrolling elemental combat game for desktop and touch browsers. Built with native Canvas 2D, CSS, and JavaScript. No build, backend, fonts, or external runtime dependencies.

## Play

Open `index.html`, or serve this directory:

```sh
python -m http.server 8000
```

Then visit `http://localhost:8000`. On Windows, `py -m http.server 8000` also works.

The title screen displays **WizardOS** and **Begin**. Encounters start after a short quiet interval. Defeating an adept restores 8 vitality; more opponents can appear as the run progresses. The best defeat count is saved locally when a run ends. The day/night sky, trees, rocks, spells, cloak, beard, and ritual symbols are drawn procedurally.

## Controls

| Action                 | Desktop                              | Mobile                        |
| ---------------------- | ------------------------------------ | ----------------------------- |
| Move                   | A / D or left / right arrows         | Left stick                    |
| Jump                   | Space                                | Jump button                   |
| Aim and cast           | Mouse and hold left button           | Hold right stick, drag to aim |
| Select element         | 1 water, 2 fire, 3 air, 4 earth      | Four element buttons          |
| Direct spell shortcuts | Hold Z fire, X water, C earth, V air | Select and use cast stick     |
| Keyboard aim           | Up / down arrows                     | Right stick                   |
| Shield                 | Hold Shift or right mouse button     | Hold Shield                   |
| Meditate               | Hold E                               | Hold Charge                   |
| Pause / resume         | Escape or pause button               | Pause button                  |

Meditation is available on the ground. The wizard sits cross-legged, stays stationary, and gathers mana inside a rotating rune circle. Release to stand. Casting, jumping, and shielding are disabled while meditating. Getting hit still causes damage.

Portrait touch layouts reserve space beneath the arena for controls. Landscape layouts place controls over the lower corners. Movement and casting use independent pointer captures for simultaneous two-thumb input. Cancellation, focus loss, and pause clear held actions. Sound is optional and starts only after the sound button is selected.

## Element rules

- **Water:** continuous arcing stream, light impact damage, and puddles that persist for 10 seconds. Intercepts fire, extinguishes burning, and wets actors. Puddle size and count are bounded.
- **Fire:** initial fireball followed by a held stream. Deals direct damage and a four-second burn. Ground fire persists briefly. Water extinguishes it. A wind-deflected fireball becomes larger and more damaging.
- **Air:** initial concussive pulse followed by a held torrent. Knocks enemies back and redirects fire in the wind's direction. Redirected fire can hit its original side; it can only be amplified once.
- **Earth:** 0.32-second windup, then a heavy ballistic rock. Penetrates elemental streams. Costs 24 mana with a 0.85-second recovery. A shield stops a rock at the cost of 34 additional mana and knockback.
- **Shield:** prevents direct spell hits, costs 25 mana per second plus impact costs, and breaks at zero mana. Casting and meditation cannot overlap with shielding.
- **Mana:** all spells spend mana. Idle regeneration is 4 per second; seated meditation restores 27 per second. Enemy adepts use mana and must recharge too.

These are starting balance values. Water is lightweight projectile-and-puddle simulation, not a full fluid solver; cloth and beard movement are procedural animation rather than cloth physics.

## GitHub Pages

The repository root remains a static site. Keep `index.html`, `style.css`, and `game.js` together. All asset references are relative, including under the `/WizardOS/` project path. The existing Pages branch/root configuration can continue to serve the game after the reviewed changes are merged into its publishing branch.

## Validation

Run the dependency-free gameplay and input checks:

```sh
node tests/combat.cjs
```

These test spell interactions, mana, stationary meditation, enemy recharge, defeat/restart, and independent pointer input handling. They use a minimal DOM harness and do **not** substitute for real touch-device playtesting.

An additional Playwright browser suite is provided in `tests/browser.cjs`. With Playwright and Chromium installed, serve the project on port 8000 and run it with `node tests/browser.cjs`. It checks the title, desktop movement, portrait/landscape layout, actual browser multitouch dispatch, and pause/restart. The initial development environment could not run that suite because its Chromium download was blocked; physical iOS/Android and browser visual testing remain outstanding.

The optional `?debug=1` query exposes deterministic test hooks. Normal gameplay does not expose them.
