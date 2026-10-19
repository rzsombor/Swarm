import { BoxGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshBVH } from 'three-mesh-bvh';
import { describe, expect, it } from 'vitest';
import { FirstPersonController } from '../../src/player/FirstPersonController';
import type { Action } from '../../src/input/InputService';

const DT = 1 / 60;

function slab(w: number, h: number, d: number, x: number, y: number, z: number) {
  const g = new BoxGeometry(w, h, d).translate(x, y, z);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  return g;
}

function setup(geometries: BoxGeometry[]) {
  const down = new Set<Action>();
  const pressed = new Set<Action>();
  const input = {
    isDown: (a: Action) => down.has(a),
    wasPressed: (a: Action) => pressed.has(a),
    consumeLook: () => ({ x: 0, y: 0 }),
  };
  const merged = mergeGeometries(geometries, false);
  const controller = new FirstPersonController(new MeshBVH(merged), input);
  controller.teleport(new Vector3(0, 0, 0), 0);
  const run = (seconds: number) => {
    for (let i = 0; i < seconds / DT; i++) {
      controller.update(DT);
      pressed.clear();
    }
  };
  return { controller, down, pressed, run };
}

const ground = () => slab(40, 2, 40, 0, -1, 0);

describe('FirstPersonController', () => {
  it('settles on the ground', () => {
    const { controller, run } = setup([ground()]);
    controller.position.y = 1;
    run(1);
    expect(controller.onGround).toBe(true);
    expect(controller.position.y).toBeCloseTo(0, 2);
  });

  it('walks at the configured speed (yaw 0 faces -Z)', () => {
    const { controller, down, run } = setup([ground()]);
    run(0.5);
    down.add('moveForward');
    run(2);
    expect(controller.position.z).toBeLessThan(-4);
    expect(controller.position.z).toBeGreaterThan(-2.6 * 2 - 0.1);
    expect(controller.moveState).toBe('walk');
  });

  it('is stopped by a wall and does not tunnel', () => {
    const { controller, down, run } = setup([ground(), slab(10, 3, 0.2, 0, 1.5, -3)]);
    down.add('moveForward');
    down.add('sprint');
    run(3);
    expect(controller.position.z).toBeGreaterThan(-3 + 0.1 + 0.3 - 0.01);
  });

  it('steps up a 0.2 m ledge', () => {
    const { controller, down, run } = setup([ground(), slab(4, 0.2, 20, 0, 0.1, -12)]);
    down.add('moveForward');
    run(2);
    expect(controller.position.z).toBeLessThan(-3);
    expect(controller.position.y).toBeCloseTo(0.2, 1);
  });

  it('jumps and lands', () => {
    const { controller, pressed, run } = setup([ground()]);
    run(0.2);
    pressed.add('jump');
    let peak = 0;
    for (let i = 0; i < 90; i++) {
      controller.update(DT);
      pressed.clear();
      peak = Math.max(peak, controller.position.y);
    }
    expect(peak).toBeGreaterThan(0.5);
    expect(controller.onGround).toBe(true);
  });

  it('crouches and cannot stand under a low ceiling', () => {
    const { controller, down, run } = setup([ground(), slab(10, 0.2, 10, 0, 1.4, -6)]);
    run(0.2);
    down.add('crouch');
    down.add('moveForward');
    run(2.5);
    down.delete('moveForward');
    expect(controller.position.z).toBeLessThan(-2);
    down.delete('crouch');
    run(0.5);
    expect(controller.crouching).toBe(true);
    down.add('moveBack');
    run(4);
    expect(controller.crouching).toBe(false);
  });
});
