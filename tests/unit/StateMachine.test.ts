import { describe, expect, it } from 'vitest';
import { StateMachine } from '../../src/core/StateMachine';

type Id = 'a' | 'b' | 'c';

describe('StateMachine', () => {
  it('runs enter/exit hooks with the neighbouring state', () => {
    const log: string[] = [];
    const m = new StateMachine<Id>()
      .add('a', {
        enter: (from) => log.push(`enter a from ${from}`),
        exit: (to) => log.push(`exit a to ${to}`),
      })
      .add('b', { enter: (from) => log.push(`enter b from ${from}`) });
    m.go('a');
    m.go('b');
    expect(log).toEqual(['enter a from null', 'exit a to b', 'enter b from a']);
    expect(m.current).toBe('b');
  });

  it('transitions when update returns a state id and stays on null', () => {
    let calls = 0;
    const m = new StateMachine<Id>()
      .add('a', { update: () => (++calls === 2 ? 'b' : null) })
      .add('b', {});
    m.go('a');
    m.update(1);
    expect(m.current).toBe('a');
    m.update(1);
    expect(m.current).toBe('b');
  });

  it('passes dt to update and ignores update before start', () => {
    const dts: number[] = [];
    const m = new StateMachine<Id>().add('a', { update: (dt) => (dts.push(dt), null) });
    m.update(1);
    m.go('a');
    m.update(0.25);
    expect(dts).toEqual([0.25]);
  });

  it('throws on unknown states', () => {
    expect(() => new StateMachine<Id>().go('c')).toThrow();
  });
});
