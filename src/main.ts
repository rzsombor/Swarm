import './style.css';
import {
  PCFShadowMap,
  PerspectiveCamera,
  ACESFilmicToneMapping,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import { FixedStepLoop } from './core/FixedStepLoop';
import { StateMachine } from './core/StateMachine';
import { InputService } from './input/InputService';
import { buildGreybox } from './level/greybox';
import { FirstPersonController } from './player/FirstPersonController';
import { Overlay } from './ui/Overlay';

type GameState = 'boot' | 'title' | 'playing' | 'paused';

/** Read-only view of the game for tests and debugging. */
export interface GameDebugHandle {
  readonly state: GameState | null;
  readonly lookMode: string;
  readonly tick: number;
  readonly moveState: string;
  readonly position: { x: number; y: number; z: number };
}

declare global {
  interface Window {
    __game?: GameDebugHandle;
  }
}

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.toneMapping = ACESFilmicToneMapping;
renderer.outputColorSpace = SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFShadowMap;

const camera = new PerspectiveCamera(75, 1, 0.05, 80);
const level = buildGreybox(camera);
const input = new InputService({ target: window, lockElement: canvas, doc: document });
const controller = new FirstPersonController(level.collision, input);
controller.teleport(level.spawn.position, level.spawn.yaw);
const overlay = new Overlay();
let audio: AudioContext | null = null;
let tick = 0;

const machine = new StateMachine<GameState>();

function startPlaying(): void {
  input.requestLook();
  try {
    audio ??= new AudioContext();
    void audio.resume();
  } catch {
    audio = null;
  }
  machine.go('playing');
}

machine
  .add('boot', { update: () => 'title' })
  .add('title', { enter: () => overlay.show('title', input.lookMode === 'drag') })
  .add('playing', {
    enter: () => overlay.show(null),
    update(dt) {
      if (input.wasPressed('pause')) return 'paused';
      if (input.wasPressed('toggleLantern')) level.lantern.visible = !level.lantern.visible;
      controller.update(dt);
      return null;
    },
  })
  .add('paused', {
    enter: () => {
      input.releaseLook();
      input.clear();
      overlay.show('paused', input.lookMode === 'drag');
    },
  });

overlay.onActivate(() => {
  const state = machine.current;
  if (state === 'title' || state === 'paused') startPlaying();
});
input.events.on('pointerLockLost', () => machine.current === 'playing' && machine.go('paused'));
input.events.on('lookModeChanged', (mode) => {
  if (machine.current === 'title' || machine.current === 'paused') {
    overlay.show(machine.current, mode === 'drag');
  }
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  if (machine.current === 'playing') machine.go('paused');
  void audio?.suspend();
});

function resize(): void {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

let debugTools: { update(): void } | null = null;
if (new URLSearchParams(location.search).has('debug')) {
  void import('./debug/DebugTools').then(({ createDebugTools }) => {
    debugTools = createDebugTools({ controller, input, level, getState: () => machine.current });
  });
}

const loop = new FixedStepLoop(
  (dt) => {
    input.beginTick();
    machine.update(dt);
    tick++;
  },
  (alpha) => {
    controller.applyToCamera(camera, alpha);
    renderer.render(level.scene, camera);
    debugTools?.update();
  },
);

window.__game = {
  get state() {
    return machine.current;
  },
  get lookMode() {
    return input.lookMode;
  },
  get tick() {
    return tick;
  },
  get moveState() {
    return controller.moveState;
  },
  get position() {
    const { x, y, z } = controller.position;
    return { x, y, z };
  },
};

machine.go('boot');
loop.start();
