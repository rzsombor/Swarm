# Swarm — Greenhouse Anomaly

Browser first-person game. Architecture and plan: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
This repo currently holds the Milestone 1 skeleton: game loop, input, first-person controller and a greybox test level.

## Run

```sh
npm install
npm run dev          # dev server; add ?debug to the URL for stats, tuning panel and HUD line
npm run build        # one self-contained dist/index.html (JS/CSS inlined, no network requests)
npm run preview      # serve the production build
npm run typecheck
npm test             # Vitest unit tests
npm run test:e2e     # builds, then drives dist/index.html in the pre-installed Chromium
```

The e2e test looks for Chromium under `/opt/pw-browsers` (override with `CHROMIUM_PATH`).

## Controls

| Input    | Action                                                        |
| -------- | ------------------------------------------------------------- |
| Click    | Start / resume (grabs the mouse, resumes audio)               |
| Mouse    | Look (pointer lock; if unavailable, hold left mouse and drag) |
| W A S D  | Move                                                          |
| Shift    | Sprint (forward only)                                         |
| C        | Crouch                                                        |
| Space    | Jump                                                          |
| F        | Toggle lantern                                                |
| Esc      | Pause                                                         |

E (interact), R (reload) and left mouse (fire) are bound but not used yet.

## Layout

```
src/
  main.ts            boot, renderer, game states, loop wiring
  core/              FixedStepLoop, EventBus, StateMachine, SeededRng, Entity/Component
  input/             InputService (action bindings, pointer lock with drag-look fallback)
  player/            FirstPersonController (capsule vs. BVH collision)
  level/             greybox test scene + merged collision BVH
  ui/                DOM overlay (title, pause, crosshair)
  debug/             lil-gui, stats.js, HUD line (loaded only with ?debug)
tests/
  unit/              Vitest
  e2e/               Playwright smoke test (playwright-core, plain node script)
```
