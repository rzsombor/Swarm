import { describe, expect, it } from 'vitest';
import { SeededRng } from '../../src/core/SeededRng';

describe('SeededRng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = new SeededRng(1234);
    const b = new SeededRng(1234);
    expect(Array.from({ length: 10 }, () => a.next())).toEqual(
      Array.from({ length: 10 }, () => b.next()),
    );
  });

  it('differs between seeds', () => {
    expect(new SeededRng(1).next()).not.toBe(new SeededRng(2).next());
  });

  it('stays within bounds', () => {
    const rng = new SeededRng(7);
    for (let i = 0; i < 1000; i++) {
      const n = rng.next();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
      expect(rng.int(5)).toBeLessThan(5);
      expect(rng.range(2, 3)).toBeGreaterThanOrEqual(2);
    }
  });

  it('picks from a list and rejects an empty one', () => {
    expect(['x', 'y']).toContain(new SeededRng(3).pick(['x', 'y']));
    expect(() => new SeededRng(3).pick([])).toThrow();
  });
});
