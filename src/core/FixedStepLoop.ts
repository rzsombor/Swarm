export interface FixedStepOptions {
  /** Simulation step in seconds. */
  step?: number;
  /** Upper bound on simulation steps per rendered frame. */
  maxSteps?: number;
  /** Frame time is clamped to this many seconds (tab switches, breakpoints). */
  maxFrameTime?: number;
}

/** Fixed-timestep simulation with a variable-rate render that receives an interpolation alpha. */
export class FixedStepLoop {
  readonly step: number;
  private readonly maxSteps: number;
  private readonly maxFrameTime: number;
  private accumulator = 0;
  private rafId = 0;

  constructor(
    private readonly update: (dt: number) => void,
    private readonly render: (alpha: number) => void,
    { step = 1 / 60, maxSteps = 5, maxFrameTime = 0.1 }: FixedStepOptions = {},
  ) {
    this.step = step;
    this.maxSteps = maxSteps;
    this.maxFrameTime = maxFrameTime;
  }

  /** Advances by one frame of `frameTime` seconds; returns the number of simulation steps run. */
  advance(frameTime: number): number {
    this.accumulator += Math.min(Math.max(frameTime, 0), this.maxFrameTime);
    let steps = 0;
    while (this.accumulator >= this.step - 1e-9 && steps < this.maxSteps) {
      this.update(this.step);
      this.accumulator -= this.step;
      steps++;
    }
    // Hitting the cap means we cannot keep up: drop the backlog instead of spiralling.
    if (steps === this.maxSteps) this.accumulator = 0;
    this.accumulator = Math.max(this.accumulator, 0);
    this.render(this.accumulator / this.step);
    return steps;
  }

  start(): void {
    if (this.rafId) return;
    let last = performance.now();
    const frame = (now: number) => {
      this.rafId = requestAnimationFrame(frame);
      this.advance((now - last) / 1000);
      last = now;
    };
    this.rafId = requestAnimationFrame(frame);
  }

  stop(): void {
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }
}
