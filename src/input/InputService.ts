import { EventBus } from '../core/EventBus';

export type Action =
  | 'moveForward'
  | 'moveBack'
  | 'moveLeft'
  | 'moveRight'
  | 'sprint'
  | 'crouch'
  | 'jump'
  | 'interact'
  | 'toggleLantern'
  | 'fire'
  | 'reload'
  | 'pause';

/** Maps each action to the `KeyboardEvent.code` / `Mouse<button>` values that trigger it. */
export type Bindings = Record<Action, readonly string[]>;

export const DEFAULT_BINDINGS: Bindings = {
  moveForward: ['KeyW'],
  moveBack: ['KeyS'],
  moveLeft: ['KeyA'],
  moveRight: ['KeyD'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  // Not Ctrl: Ctrl+W (crouch-walk) closes the tab and cannot be intercepted.
  crouch: ['KeyC'],
  jump: ['Space'],
  interact: ['KeyE'],
  toggleLantern: ['KeyF'],
  fire: ['Mouse0'],
  reload: ['KeyR'],
  pause: ['Escape'],
};

export type LookMode = 'pointerlock' | 'drag';

export type InputEvents = {
  lookModeChanged: LookMode;
  pointerLockAcquired: void;
  pointerLockLost: void;
  /** A lock request failed after locking had worked before (e.g. the browser's re-lock cooldown after Esc). */
  pointerLockDenied: void;
};

export interface InputOptions {
  /** Receives keyboard, mouse and blur events (normally `window`). */
  target: EventTarget;
  /** Element that is pointer-locked. */
  lockElement?: Element;
  /** Source of visibility and pointer-lock events (normally `document`). */
  doc?: Document;
  bindings?: Bindings;
}

/**
 * Action-based input. Edges (`wasPressed` / `wasReleased`) are latched until the next
 * `beginTick()`, so each simulation tick sees every press exactly once.
 */
export class InputService {
  readonly events = new EventBus<InputEvents>();

  private readonly bindings: Bindings;
  private readonly actionsByCode = new Map<string, Action[]>();
  private readonly codesDown = new Set<string>();
  private pendingPressed = new Set<Action>();
  private pendingReleased = new Set<Action>();
  private pressed = new Set<Action>();
  private released = new Set<Action>();
  private lookX = 0;
  private lookY = 0;
  private mode: LookMode = 'pointerlock';
  private locked = false;
  private everLocked = false;
  private readonly disposers: (() => void)[] = [];

  constructor(private readonly options: InputOptions) {
    this.bindings = options.bindings ?? DEFAULT_BINDINGS;
    for (const [action, codes] of Object.entries(this.bindings) as [Action, readonly string[]][]) {
      for (const code of codes) {
        const list = this.actionsByCode.get(code) ?? [];
        list.push(action);
        this.actionsByCode.set(code, list);
      }
    }

    const { target, doc } = options;
    this.listen(target, 'keydown', (e) => this.onKey(e as KeyboardEvent, true));
    this.listen(target, 'keyup', (e) => this.onKey(e as KeyboardEvent, false));
    this.listen(target, 'mousedown', (e) => this.setCode(`Mouse${(e as MouseEvent).button}`, true));
    this.listen(target, 'mouseup', (e) => this.setCode(`Mouse${(e as MouseEvent).button}`, false));
    this.listen(target, 'mousemove', (e) => this.onMouseMove(e as MouseEvent));
    this.listen(target, 'blur', () => this.clear());
    if (doc) {
      this.listen(doc, 'visibilitychange', () => doc.visibilityState === 'hidden' && this.clear());
      this.listen(doc, 'pointerlockchange', () => this.onPointerLockChange());
      this.listen(doc, 'pointerlockerror', () => this.onLockError());
    }
  }

  get lookMode(): LookMode {
    return this.mode;
  }

  get pointerLocked(): boolean {
    return this.locked;
  }

  isDown(action: Action): boolean {
    return this.bindings[action].some((code) => this.codesDown.has(code));
  }

  wasPressed(action: Action): boolean {
    return this.pressed.has(action);
  }

  wasReleased(action: Action): boolean {
    return this.released.has(action);
  }

  /** Publishes the edges accumulated since the previous tick. Call once per simulation step. */
  beginTick(): void {
    [this.pressed, this.pendingPressed] = [this.pendingPressed, this.pressed];
    [this.released, this.pendingReleased] = [this.pendingReleased, this.released];
    this.pendingPressed.clear();
    this.pendingReleased.clear();
  }

  /** Returns and resets the mouse-look delta (pixels) accumulated since the last call. */
  consumeLook(): { x: number; y: number } {
    const delta = { x: this.lookX, y: this.lookY };
    this.lookX = this.lookY = 0;
    return delta;
  }

  /**
   * Must run inside a user gesture. Resolves via `pointerLockAcquired`, `pointerLockDenied`, or a
   * switch to drag-to-look when pointer lock has never worked (e.g. a sandboxed iframe).
   */
  requestLook(): void {
    if (this.mode === 'drag') return;
    const element = this.options.lockElement;
    if (!element?.requestPointerLock) return this.onLockError();
    try {
      const result: unknown = element.requestPointerLock();
      if (result instanceof Promise) result.catch(() => this.onLockError());
    } catch {
      this.onLockError();
    }
  }

  releaseLook(): void {
    if (this.locked) this.options.doc?.exitPointerLock();
  }

  /** Drops all held keys and buttons, reporting them as released. */
  clear(): void {
    for (const code of [...this.codesDown]) this.setCode(code, false);
  }

  dispose(): void {
    for (const dispose of this.disposers) dispose();
    this.disposers.length = 0;
  }

  private listen(target: EventTarget, type: string, handler: (e: Event) => void): void {
    target.addEventListener(type, handler);
    this.disposers.push(() => target.removeEventListener(type, handler));
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (!this.actionsByCode.has(e.code)) return;
    if (!e.ctrlKey && !e.metaKey) e.preventDefault();
    this.setCode(e.code, down);
  }

  private setCode(code: string, down: boolean): void {
    const actions = this.actionsByCode.get(code);
    if (!actions || this.codesDown.has(code) === down) return;
    const wasDown = new Map(actions.map((a) => [a, this.isDown(a)]));
    if (down) this.codesDown.add(code);
    else this.codesDown.delete(code);
    for (const action of actions) {
      const isDown = this.isDown(action);
      if (isDown === wasDown.get(action)) continue;
      (isDown ? this.pendingPressed : this.pendingReleased).add(action);
    }
  }

  private onMouseMove(e: MouseEvent): void {
    const looking = this.mode === 'pointerlock' ? this.locked : this.codesDown.has('Mouse0');
    if (!looking) return;
    this.lookX += e.movementX;
    this.lookY += e.movementY;
  }

  private onPointerLockChange(): void {
    const locked = this.options.doc?.pointerLockElement === this.options.lockElement;
    const wasLocked = this.locked;
    this.locked = locked;
    if (locked) {
      this.everLocked = true;
      this.events.emit('pointerLockAcquired');
    } else if (wasLocked) {
      this.events.emit('pointerLockLost');
    }
  }

  private onLockError(): void {
    if (this.everLocked) this.events.emit('pointerLockDenied');
    else this.setMode('drag');
  }

  private setMode(mode: LookMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.events.emit('lookModeChanged', mode);
  }
}
