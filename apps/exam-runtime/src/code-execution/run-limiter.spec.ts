import { RunLimiter, MAX_RUNS_PER_QUESTION, RunCounterStore } from './run-limiter';

describe('RunLimiter', () => {
  function fakeStore(startingCount = 0): RunCounterStore & { calls: { incr: string[]; expire: [string, number][] } } {
    let count = startingCount;
    const calls = { incr: [] as string[], expire: [] as [string, number][] };
    return {
      calls,
      incr: async (key: string) => {
        calls.incr.push(key);
        count += 1;
        return count;
      },
      expire: async (key: string, seconds: number) => {
        calls.expire.push([key, seconds]);
        return 1;
      },
    };
  }

  it('allows a run when the count is under the cap', async () => {
    const store = fakeStore(0);
    const limiter = new RunLimiter(store);

    const result = await limiter.checkAndIncrement('attempt-1', 'question-1');

    expect(result).toEqual({ allowed: true, remaining: MAX_RUNS_PER_QUESTION - 1 });
    expect(store.calls.incr).toEqual([`code-run:attempt-1:question-1`]);
  });

  it('sets an expiry only on the first increment for a key', async () => {
    const store = fakeStore(0);
    const limiter = new RunLimiter(store);

    await limiter.checkAndIncrement('attempt-1', 'question-1');

    expect(store.calls.expire).toEqual([[`code-run:attempt-1:question-1`, 86400]]);
  });

  it('does not re-set the expiry on subsequent increments', async () => {
    const store = fakeStore(1);
    const limiter = new RunLimiter(store);

    await limiter.checkAndIncrement('attempt-1', 'question-1');

    expect(store.calls.expire).toEqual([]);
  });

  it('rejects a run once the cap is reached', async () => {
    const store = fakeStore(MAX_RUNS_PER_QUESTION);
    const limiter = new RunLimiter(store);

    const result = await limiter.checkAndIncrement('attempt-1', 'question-1');

    expect(result).toEqual({ allowed: false, remaining: 0 });
  });

  it('scopes the counter independently per attempt and per question', async () => {
    const store = fakeStore(0);
    const limiter = new RunLimiter(store);

    await limiter.checkAndIncrement('attempt-1', 'question-1');
    await limiter.checkAndIncrement('attempt-1', 'question-2');
    await limiter.checkAndIncrement('attempt-2', 'question-1');

    expect(store.calls.incr).toEqual([
      'code-run:attempt-1:question-1',
      'code-run:attempt-1:question-2',
      'code-run:attempt-2:question-1',
    ]);
  });
});
