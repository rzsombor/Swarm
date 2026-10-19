import { describe, expect, it } from 'vitest';
import { FixedStepLoop } from '../../src/core/FixedStepLoop';

function setup(options = {}) {
  const alphas: number[] = [];
  let updates = 0;
  const loop = new FixedStepLoop(
    () => updates++,
    (alpha) => alphas.push(alpha),
    options,
  );
  return { loop, alphas, updates: () => updates };
}

describe('FixedStepLoop', () => {
  it('runs one step per 1/60 s frame', () => {
    const { loop, updates } = setup();
    expect(loop.advance(1 / 60)).toBe(1);
    expect(updates()).toBe(1);
  });

  it('accumulates partial frames and reports the interpolation alpha', () => {
    const { loop, alphas } = setup();
    expect(loop.advance(0.5 / 60)).toBe(0);
    expect(alphas.at(-1)).toBeCloseTo(0.5);
    expect(loop.advance(0.75 / 60)).toBe(1);
    expect(alphas.at(-1)).toBeCloseTo(0.25);
  });

  it('runs several steps for a long frame', () => {
    const { loop } = setup();
    expect(loop.advance(3 / 60)).toBe(3);
  });

  it('caps steps per frame and drops the backlog', () => {
    const { loop, alphas } = setup({ maxSteps: 5, maxFrameTime: 1 });
    expect(loop.advance(1)).toBe(5);
    expect(alphas.at(-1)).toBeLessThan(1);
    expect(loop.advance(0)).toBe(0);
  });

  it('clamps huge frame times', () => {
    const { loop } = setup({ maxSteps: 100, maxFrameTime: 0.1 });
    expect(loop.advance(60)).toBe(6);
  });

  it('ignores negative frame times', () => {
    const { loop } = setup();
    expect(loop.advance(-5)).toBe(0);
  });
});
