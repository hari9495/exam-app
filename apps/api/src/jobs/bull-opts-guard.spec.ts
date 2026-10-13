import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import Redis from 'ioredis';
import { bullOpts } from './redis-connection';

// Every BullMQ queue and worker takes its options from bullOpts(), so the e2e bootstrap can give each test file its
// own key prefix (BULLMQ_PREFIX) and no test app takes another's jobs. Production keeps BullMQ's default prefix.
function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return tsFiles(full);
    return full.endsWith('.ts') && !/\.(spec|test)\.ts$/.test(full) ? [full] : [];
  });
}

describe('BullMQ options', () => {
  it('every queue and worker goes through bullOpts()', () => {
    const offenders = tsFiles(join(__dirname, '..')).filter((f) => {
      const src = readFileSync(f, 'utf8');
      const made = (src.match(/new (Queue|Worker|QueueEvents|FlowProducer)\(/g) ?? []).length;
      return made > 0 && (src.match(/bullOpts\(/g) ?? []).length < made;
    });
    expect(offenders).toEqual([]);
  });

  it('adds a prefix only when BULLMQ_PREFIX is set', () => {
    const before = process.env.BULLMQ_PREFIX;
    const c = {} as Redis;
    delete process.env.BULLMQ_PREFIX;
    expect(bullOpts(c)).toEqual({ connection: c });
    process.env.BULLMQ_PREFIX = 'e2e-1';
    expect(bullOpts(c)).toEqual({ connection: c, prefix: 'e2e-1' });
    if (before === undefined) delete process.env.BULLMQ_PREFIX;
    else process.env.BULLMQ_PREFIX = before;
  });
});
