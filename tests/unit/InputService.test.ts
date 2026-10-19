import { beforeEach, describe, expect, it } from 'vitest';
import { InputService } from '../../src/input/InputService';

function key(type: 'keydown' | 'keyup', code: string): Event {
  return Object.assign(new Event(type), { code, ctrlKey: false, metaKey: false });
}
function mouse(
  type: string,
  props: { button?: number; movementX?: number; movementY?: number } = {},
): Event {
  return Object.assign(new Event(type), { button: 0, movementX: 0, movementY: 0, ...props });
}

describe('InputService', () => {
  let target: EventTarget;
  let input: InputService;

  beforeEach(() => {
    target = new EventTarget();
    input = new InputService({ target });
  });

  it('reports a press once, on the next tick only', () => {
    target.dispatchEvent(key('keydown', 'KeyW'));
    expect(input.isDown('moveForward')).toBe(true);
    expect(input.wasPressed('moveForward')).toBe(false);
    input.beginTick();
    expect(input.wasPressed('moveForward')).toBe(true);
    input.beginTick();
    expect(input.wasPressed('moveForward')).toBe(false);
    expect(input.isDown('moveForward')).toBe(true);
  });

  it('ignores key auto-repeat', () => {
    target.dispatchEvent(key('keydown', 'Space'));
    input.beginTick();
    target.dispatchEvent(key('keydown', 'Space'));
    input.beginTick();
    expect(input.wasPressed('jump')).toBe(false);
  });

  it('reports releases', () => {
    target.dispatchEvent(key('keydown', 'KeyF'));
    input.beginTick();
    target.dispatchEvent(key('keyup', 'KeyF'));
    input.beginTick();
    expect(input.wasReleased('toggleLantern')).toBe(true);
    expect(input.isDown('toggleLantern')).toBe(false);
  });

  it('keeps an action down while any bound key is held', () => {
    target.dispatchEvent(key('keydown', 'ShiftLeft'));
    target.dispatchEvent(key('keydown', 'ShiftRight'));
    target.dispatchEvent(key('keyup', 'ShiftLeft'));
    input.beginTick();
    expect(input.isDown('sprint')).toBe(true);
    expect(input.wasReleased('sprint')).toBe(false);
    target.dispatchEvent(key('keyup', 'ShiftRight'));
    input.beginTick();
    expect(input.wasReleased('sprint')).toBe(true);
  });

  it('keeps a press that lands between ticks even if released before the tick', () => {
    target.dispatchEvent(key('keydown', 'KeyE'));
    target.dispatchEvent(key('keyup', 'KeyE'));
    input.beginTick();
    expect(input.wasPressed('interact')).toBe(true);
    expect(input.wasReleased('interact')).toBe(true);
  });

  it('clears held keys on blur and reports them released', () => {
    target.dispatchEvent(key('keydown', 'KeyW'));
    input.beginTick();
    target.dispatchEvent(new Event('blur'));
    input.beginTick();
    expect(input.isDown('moveForward')).toBe(false);
    expect(input.wasReleased('moveForward')).toBe(true);
  });

  it('maps mouse buttons to actions', () => {
    target.dispatchEvent(mouse('mousedown', { button: 0 }));
    input.beginTick();
    expect(input.wasPressed('fire')).toBe(true);
  });

  it('only accumulates look delta while dragging in drag mode', () => {
    input.requestLook(); // no lock element: falls back to drag
    expect(input.lookMode).toBe('drag');
    target.dispatchEvent(mouse('mousemove', { movementX: 5, movementY: 2 }));
    expect(input.consumeLook()).toEqual({ x: 0, y: 0 });
    target.dispatchEvent(mouse('mousedown'));
    target.dispatchEvent(mouse('mousemove', { movementX: 5, movementY: 2 }));
    target.dispatchEvent(mouse('mousemove', { movementX: 1, movementY: -1 }));
    expect(input.consumeLook()).toEqual({ x: 6, y: 1 });
    expect(input.consumeLook()).toEqual({ x: 0, y: 0 });
  });

  it('announces look-mode changes', () => {
    const modes: string[] = [];
    input.events.on('lookModeChanged', (m) => modes.push(m));
    input.requestLook();
    input.requestLook();
    expect(modes).toEqual(['drag']);
  });

  it('reports a refused re-lock instead of falling back once pointer lock has worked', () => {
    const lockElement = { requestPointerLock: () => Promise.resolve() } as unknown as Element;
    const doc = Object.assign(new EventTarget(), {
      pointerLockElement: null as Element | null,
      visibilityState: 'visible',
    }) as unknown as Document & { pointerLockElement: Element | null };
    const locking = new InputService({ target, lockElement, doc });
    const events: string[] = [];
    locking.events.on('pointerLockAcquired', () => events.push('acquired'));
    locking.events.on('pointerLockDenied', () => events.push('denied'));

    doc.pointerLockElement = lockElement;
    doc.dispatchEvent(new Event('pointerlockchange'));
    doc.pointerLockElement = null;
    doc.dispatchEvent(new Event('pointerlockchange'));
    doc.dispatchEvent(new Event('pointerlockerror'));

    expect(events).toEqual(['acquired', 'denied']);
    expect(locking.lookMode).toBe('pointerlock');
  });
});
