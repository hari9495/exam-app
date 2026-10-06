import { HttpException, HttpStatus, Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import Redis from 'ioredis';
import ipaddr from 'ipaddr.js';
import { createHash } from 'crypto';

// Brute-force protection for every guessable sign-in secret (YX-IAM-07): passwords, one-time
// codes, the second factor and step-up, on Redis counters shared by every API instance.
//   * the account: (scope, identifier) hashed -- e.g. (organisation slug, lower-cased email) or
//     ('mfa', user id) -- counted identically whether or not the account exists, so lock
//     behaviour cannot reveal which accounts do;
//   * the client IP (IPv6 collapsed to its /64, the unit one subscriber controls).
// Account: from the 3rd consecutive failure each attempt must wait 1, 2, 4 ... 60 s (progressive
// delay); every 10th failure locks it for 15 min, doubling per lock up to 24 h (the P12 §9
// acceptance test: 10 failures => temporary lock + user notified). A success clears it.
// IP: 30 failures inside 15 min locks that IP for 15 min, whatever accounts were tried.
//
// Atomic and pre-emptive: an attempt is COUNTED (and the next delay / lock set) by one Lua script
// BEFORE the secret is verified, so a burst of parallel requests from many IPs cannot all pass
// the check while the first verification is still running. A success then clears the count.
//
// Soft lock (anti-DoS): a device cookie that has completed a sign-in for the account in the last
// TRUSTED_DEVICE_DAYS keeps its own counter, so a stranger hammering the account cannot lock its
// owner out on their usual device. Break-glass accounts get the delay but never the long lock.
export const ACCOUNT_DELAY_AFTER = 3;
export const ACCOUNT_MAX_DELAY_SECONDS = 60;
export const ACCOUNT_LOCK_EVERY = 10;
export const ACCOUNT_LOCK_BASE_SECONDS = 15 * 60;
export const ACCOUNT_LOCK_MAX_SECONDS = 24 * 60 * 60;
export const ACCOUNT_FAILURE_MEMORY_SECONDS = 24 * 60 * 60;
export const IP_LOCK_THRESHOLD = 30;
export const IP_WINDOW_SECONDS = 15 * 60;
export const IP_LOCK_SECONDS = 15 * 60;
export const TRUSTED_DEVICE_DAYS = 30;

export const LOGIN_PROTECTION_REDIS = 'LOGIN_PROTECTION_REDIS';

// How long the account must wait after its `failures`-th consecutive failure (0 = no wait).
// `lockExempt`: only the progressive delay, never the long lock.
export function accountBlockSeconds(failures: number, lockExempt = false): number {
  if (!lockExempt && failures > 0 && failures % ACCOUNT_LOCK_EVERY === 0) {
    const lockNumber = failures / ACCOUNT_LOCK_EVERY;
    return Math.min(ACCOUNT_LOCK_BASE_SECONDS * 2 ** (lockNumber - 1), ACCOUNT_LOCK_MAX_SECONDS);
  }
  if (failures < ACCOUNT_DELAY_AFTER) return 0;
  return Math.min(2 ** (failures - ACCOUNT_DELAY_AFTER), ACCOUNT_MAX_DELAY_SECONDS);
}

// The same schedule as accountBlockSeconds, inside Redis. KEYS: ip block, trusted-device marker,
// account block, account failures, device block, device failures. ARGV: lockExempt, memory.
// Returns {'ip'|'account', ms} when blocked, else {'ok', failures-including-this-attempt}.
const RESERVE_SCRIPT = `
local ipMs = redis.call('PTTL', KEYS[1])
if ipMs > 0 then return {'ip', ipMs} end
local block, fail = KEYS[3], KEYS[4]
if redis.call('EXISTS', KEYS[2]) == 1 then block, fail = KEYS[5], KEYS[6] end
local ms = redis.call('PTTL', block)
if ms > 0 then return {'account', ms} end
local n = redis.call('INCR', fail)
redis.call('EXPIRE', fail, tonumber(ARGV[2]))
local s = 0
if ARGV[1] ~= '1' and n % ${ACCOUNT_LOCK_EVERY} == 0 then
  s = math.min(${ACCOUNT_LOCK_BASE_SECONDS} * 2 ^ (n / ${ACCOUNT_LOCK_EVERY} - 1), ${ACCOUNT_LOCK_MAX_SECONDS})
elseif n >= ${ACCOUNT_DELAY_AFTER} then
  s = math.min(2 ^ (n - ${ACCOUNT_DELAY_AFTER}), ${ACCOUNT_MAX_DELAY_SECONDS})
end
if s > 0 then redis.call('SET', block, '1', 'EX', s) end
return {'ok', n}
`;

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

// One reserved attempt: blocked, or counted (failures includes this attempt).
export interface LoginAttempt {
  block: LoginBlock | null;
  failures: number;
  lockExempt: boolean;
}

export interface AttemptOptions {
  // The raw device cookie: a device trusted for this account uses its own counter.
  deviceId?: string;
  // Break-glass accounts: the progressive delay only, never the long lock (alert instead).
  lockExempt?: boolean;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class LoginProtectionService {
  private readonly logger = new Logger(LoginProtectionService.name);

  constructor(@Inject(LOGIN_PROTECTION_REDIS) private readonly redis: Redis) {}

  private keys(scope: string, identifier: string, ip: string | null, deviceId?: string) {
    const account = sha256(`${scope}\u0000${identifier}`);
    const device = deviceId ? sha256(deviceId) : 'none';
    const bucket = ipBucket(ip);
    return {
      accountFailures: `auth:lp:acct:fail:${account}`,
      accountBlock: `auth:lp:acct:block:${account}`,
      trusted: `auth:lp:trusted:${account}:${device}`,
      deviceFailures: `auth:lp:dev:fail:${account}:${device}`,
      deviceBlock: `auth:lp:dev:block:${account}:${device}`,
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

  // Read-only: null when an attempt may proceed (used where nothing secret is verified, e.g.
  // before sending a one-time code). Anything that verifies a secret uses reserve().
  async check(scope: string, identifier: string, ip: string | null, deviceId?: string): Promise<LoginBlock | null> {
    const k = this.keys(scope, identifier, ip, deviceId);
    return this.run(async () => {
      const trusted = deviceId ? (await this.redis.exists(k.trusted)) === 1 : false;
      const [accountMs, ipMs] = await Promise.all([this.redis.pttl(trusted ? k.deviceBlock : k.accountBlock), this.redis.pttl(k.ipBlock)]);
      if (ipMs > 0) return { scope: 'ip', retryAfterSeconds: Math.ceil(ipMs / 1000) };
      if (accountMs > 0) return { scope: 'account', retryAfterSeconds: Math.ceil(accountMs / 1000) };
      return null;
    });
  }

  // Atomically: refuse when blocked; otherwise count this attempt as a failure up front and set
  // the delay / lock it earns. Call BEFORE verifying the secret; registerSuccess() clears it.
  async reserve(scope: string, identifier: string, ip: string | null, options: AttemptOptions = {}): Promise<LoginAttempt> {
    const k = this.keys(scope, identifier, ip, options.deviceId);
    const lockExempt = Boolean(options.lockExempt);
    const [kind, value] = await this.run(
      () =>
        this.redis.eval(
          RESERVE_SCRIPT,
          6,
          k.ipBlock,
          options.deviceId ? k.trusted : `${k.trusted}:none`,
          k.accountBlock,
          k.accountFailures,
          k.deviceBlock,
          k.deviceFailures,
          lockExempt ? '1' : '0',
          ACCOUNT_FAILURE_MEMORY_SECONDS,
        ) as Promise<[string, number]>,
    );
    if (kind === 'ip' || kind === 'account') {
      return { block: { scope: kind, retryAfterSeconds: Math.ceil(Number(value) / 1000) }, failures: 0, lockExempt };
    }
    return { block: null, failures: Number(value), lockExempt };
  }

  // The reserved attempt failed: it is already counted for the account; count it for the IP.
  // `locked` is true when this failure started an account lock (the holder is told).
  async registerFailure(scope: string, identifier: string, ip: string | null, attempt: LoginAttempt): Promise<{ failures: number; locked: boolean }> {
    const k = this.keys(scope, identifier, ip);
    await this.run(async () => {
      const replies = await this.redis.multi().set(k.ipFailures, 0, 'EX', IP_WINDOW_SECONDS, 'NX').incr(k.ipFailures).exec();
      if (!replies || replies.some(([error]) => error)) throw new Error('login-protection MULTI failed');
      if (Number(replies[1][1]) >= IP_LOCK_THRESHOLD) await this.redis.set(k.ipBlock, '1', 'EX', IP_LOCK_SECONDS, 'NX');
    });
    // For a lock-exempt (break-glass) account this still reports the threshold, so the caller alerts.
    return { failures: attempt.failures, locked: attempt.failures > 0 && attempt.failures % ACCOUNT_LOCK_EVERY === 0 };
  }

  // The secret was right: the account's failure history (shared and this device's) is cleared.
  // `trustDevice`: the sign-in is complete, so this device gets its own counter from now on.
  // The IP counter is deliberately left alone: one valid account must not let an IP reset its
  // own stuffing budget.
  async registerSuccess(scope: string, identifier: string, ip: string | null, options: { deviceId?: string; trustDevice?: boolean } = {}): Promise<void> {
    const k = this.keys(scope, identifier, ip, options.deviceId);
    await this.run(async () => {
      await this.redis.del(k.accountFailures, k.accountBlock, k.deviceFailures, k.deviceBlock);
      if (options.deviceId && options.trustDevice) await this.redis.set(k.trusted, '1', 'EX', TRUSTED_DEVICE_DAYS * 24 * 60 * 60);
    });
  }
}
