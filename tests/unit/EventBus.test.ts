import { describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/EventBus';

describe('EventBus', () => {
  it('delivers typed payloads and supports unsubscribe', () => {
    const bus = new EventBus<{ hit: number; ping: void }>();
    const hits: number[] = [];
    let pings = 0;
    const off = bus.on('hit', (n) => hits.push(n));
    bus.on('ping', () => pings++);
    bus.emit('hit', 3);
    bus.emit('ping');
    off();
    bus.emit('hit', 4);
    expect(hits).toEqual([3]);
    expect(pings).toBe(1);
  });
});
