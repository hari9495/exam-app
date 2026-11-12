import { EventEmitter } from 'events';
import { whenReady } from './redis-connection';

// A fresh app's first sign-in raced the Redis connect and got 503 (fail closed); the clients now wait at start.
describe('whenReady', () => {
  const client = (status: string) => Object.assign(new EventEmitter(), { status });

  it('resolves at once when connected', async () => {
    await expect(whenReady(client('ready') as never, 50)).resolves.toBeUndefined();
  });

  it('waits for the connection', async () => {
    const c = client('connecting');
    let done = false;
    const p = whenReady(c as never, 5_000).then(() => (done = true));
    await new Promise((r) => setTimeout(r, 20));
    expect(done).toBe(false);
    c.emit('ready');
    await p;
    expect(done).toBe(true);
    expect(c.listenerCount('ready')).toBe(0);
  });

  it('gives up after the wait without Redis (the app still starts; commands fail closed or open as before)', async () => {
    const c = client('reconnecting');
    const t = Date.now();
    await whenReady(c as never, 60);
    expect(Date.now() - t).toBeGreaterThanOrEqual(55);
    expect(c.listenerCount('ready')).toBe(0);
  });
});
