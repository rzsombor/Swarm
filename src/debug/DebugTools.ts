import GUI from 'lil-gui';
import Stats from 'stats.js';
import type { Level } from '../level/greybox';
import type { FirstPersonController } from '../player/FirstPersonController';
import type { InputService } from '../input/InputService';

export interface DebugContext {
  controller: FirstPersonController;
  input: InputService;
  level: Level;
  getState: () => string | null;
}

/** FPS/stat overlay, tuning panel and the one-line HUD. Only loaded with `?debug`. */
export function createDebugTools({ controller, input, level, getState }: DebugContext) {
  const hud = document.getElementById('debug-hud') as HTMLElement;
  hud.hidden = false;

  const stats = new Stats();
  document.body.appendChild(stats.dom);

  const gui = new GUI({ title: 'Debug' });
  const speeds = gui.addFolder('Movement');
  for (const key of ['walkSpeed', 'sprintSpeed', 'crouchSpeed', 'jumpSpeed', 'gravity'] as const) {
    speeds.add(controller.config, key, 0, 30, 0.1);
  }
  speeds.add(controller.config, 'lookSensitivity', 0.0005, 0.006, 0.0001);
  gui.add(level.lantern, 'intensity', 0, 60, 0.5).name('lantern');

  let frames = 0;
  let windowStart = performance.now();
  let fps = 0;

  return {
    update(): void {
      stats.update();
      frames++;
      const now = performance.now();
      if (now - windowStart < 500) return;
      fps = Math.round((frames * 1000) / (now - windowStart));
      frames = 0;
      windowStart = now;
      const { x, y, z } = controller.position;
      hud.textContent =
        `${fps} fps | ${getState()} | look: ${input.lookMode}` +
        ` | pos ${x.toFixed(2)} ${y.toFixed(2)} ${z.toFixed(2)} | ${controller.moveState}`;
    },
  };
}
