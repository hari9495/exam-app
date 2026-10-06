import { HttpException, HttpStatus, Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import Redis from 'ioredis';
import ipaddr from 'ipaddr.js';
import { createHash } from 'crypto';

// Brute-force protection for password sign-in (YX-IAM-07), on Redis counters shared by every
// API instance. Two independent keys are counted on each failed attempt:
//   * the account: (organisation slug, lower-cased email), hashed -- counted identically
//     whether or not the account exists, so lock behaviour cannot reveal which accounts do;
//   * the client IP (IPv6 collapsed to its /64, the unit one subscriber controls).
// Account: from the 3rd consecutive failure each attempt must wait 1, 2, 4 ... 60 s (progressive
// delay); every 10th failure locks it for 15 min, doubling per lock up to 24 h (the P12 §9
// acceptance test: 10 failures => temporary lock + user notified). A success clears it.
// IP: 30 failures inside 15 min locks that IP for 15 min, whatever accounts were tried.
export const ACCOUNT_DELAY_AFTER = 3;
export const ACCOUNT_MAX_DELAY_SECONDS = 60;
export const ACCOUNT_LOCK_EVERY = 10;
export const ACCOUNT_LOCK_BASE_SECONDS = 15 * 60;
export const ACCOUNT_LOCK_MAX_SECONDS = 24 * 60 * 60;
export const ACCOUNT_FAILURE_MEMORY_SECONDS = 24 * 60 * 60;
export const IP_LOCK_THRESHOLD = 30;
export const IP_WINDOW_SECONDS = 15 * 60;
export const IP_LOCK_SECONDS = 15 * 60;

export const LOGIN_PROTECTION_REDIS = 'LOGIN_PROTECTION_REDIS';

// How long the account must wait after its `failures`-th consecutive failure (0 = no wait).
export function accountBlockSeconds(failures: number): number {
  if (failures > 0 && failures % ACCOUNT_LOCK_EVERY === 0) {
    const lockNumber = failures / ACCOUNT_LOCK_EVERY;
    return Math.min(ACCOUNT_LOCK_BASE_SECONDS * 2 ** (lockNumber - 1), ACCOUNT_LOCK_MAX_SECONDS);
  }
  if (failures < ACCOUNT_DELAY_AFTER) return 0;
  return Math.min(2 ** (failures - ACCOUNT_DELAY_AFTER), ACCOUNT_MAX_DELAY_SECONDS);
}

export function ipBucket(ip: string | null): string {
  if (!ip || !ipaddr.isValid(ip)) return 'unknown';
  const addr = ipaddr.process(ip); // unwraps IPv4-mapped IPv6
  if (addr.kind() === 'ipv6') {
    return (addr as ipaddr.IPv6).parts.slice(0, 4).map((p) => p.toString(16)).join(':') + '::/64';
  }
  return addr.toString();
}

export class TooManyLoginAttemptsException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Too many sign-in attempts. Please wait and try again.',
        retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export interface LoginBlock {
  scope: 'account' | 'ip';
  retryAfterSeconds: number;
}

@Injectable()
export class LoginProtectionService {
  private readonly logger = new Logger(LoginProtectionService.name);

  constructor(@Inject(LOGIN_PROTECTION_REDIS) private readonly redis: Redis) {}

  private keys(orgSlug: string, identifier: string, ip: string | null) {
    const account = createHash('sha256').update(`${orgSlug}\u0000${identifier}`).digest('hex');
    const bucket = ipBucket(ip);
    return {
      accountFailures: `auth:lp:acct:fail:${account}`,
      accountBlock: `auth:lp:acct:block:${account}`,
      ipFailures: `auth:lp:ip:fail:${bucket}`,
      ipBlock: `auth:lp:ip:block:${bucket}`,
    };
  }

  // Fail closed: without its counters the lockout cannot be enforced, so sign-in is refused
  // (503) rather than silently opened to unlimited guessing.
  private async run<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (error) {
      this.logger.error('Login-protection store unavailable; refusing sign-in', error as Error);
      throw new ServiceUnavailableException('Sign-in is temporarily unavailable. Please try again shortly.');
    }
  }

  // Null when the attempt may proceed; otherwise which limit applies and for how long.
  async check(orgSlug: string, identifier: string, ip: string | null): Promise<LoginBlock | null> {
    const k = this.keys(orgSlug, identifier, ip);
    const [accountMs, ipMs] = await this.run(() => Promise.all([this.redis.pttl(k.accountBlock), this.redis.pttl(k.ipBlock)]));
    if (ipMs > 0) return { scope: 'ip', retryAfterSeconds: Math.ceil(ipMs / 1000) };
    if (accountMs > 0) return { scope: 'account', retryAfterSeconds: Math.ceil(accountMs / 1000) };
    return null;
  }

  // Counts a failed attempt; `locked` is true when this failure started an account lock.
  async registerFailure(orgSlug: string, identifier: string, ip: string | null): Promise<{ failures: number; locked: boolean }> {
    const k = this.keys(orgSlug, identifier, ip);
    return this.run(async () => {
      const replies = await this.redis
        .multi()
        .incr(k.accountFailures)
        .expire(k.accountFailures, ACCOUNT_FAILURE_MEMORY_SECONDS)
        .set(k.ipFailures, 0, 'EX', IP_WINDOW_SECONDS, 'NX')
        .incr(k.ipFailures)
        .exec();
      if (!replies || replies.some(([error]) => error)) throw new Error('login-protection MULTI failed');
      const failures = Number(replies[0][1]);
      const ipFailures = Number(replies[3][1]);

      const blockSeconds = accountBlockSeconds(failures);
      const writes = this.redis.multi();
      if (blockSeconds > 0) writes.set(k.accountBlock, '1', 'EX', blockSeconds);
      if (ipFailures >= IP_LOCK_THRESHOLD) writes.set(k.ipBlock, '1', 'EX', IP_LOCK_SECONDS, 'NX');
      if (writes.length > 0) await writes.exec();
      return { failures, locked: failures % ACCOUNT_LOCK_EVERY === 0 };
    });
  }

  // A successful sign-in clears the account's failure history. The IP counter is deliberately
  // left alone: one valid account must not let an IP reset its own stuffing budget.
  async registerSuccess(orgSlug: string, identifier: string, ip: string | null): Promise<void> {
    const k = this.keys(orgSlug, identifier, ip);
    await this.run(() => this.redis.del(k.accountFailures, k.accountBlock));
  }
}
