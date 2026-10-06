import { HttpException, HttpStatus, Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import Redis from 'ioredis';
import { createHash, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import parsePhoneNumberFromString from 'libphonenumber-js/max';
import { OrgSecretsCryptoService } from '@exam-platform/shared';
import { EmailService } from '../email/email.service';
import { LOGIN_PROTECTION_REDIS, ipBucket } from './login-protection.service';
import { OTP_SMS_SENDER, OtpMobileChannel, OtpSmsSender } from './otp-sender';

// One-time codes by email / SMS / WhatsApp (P12 §3; M04 Q2; P04 YX-NTF-13): sign-in (AAL1), the
// fallback second factor (YX-IAM-03) and mobile-number verification. A code is 6 CSPRNG digits,
// kept only as an HMAC (server-keyed: a plain hash of 10^6 values is no protection) in Redis for
// 5 minutes, accepted once, and burnt after 5 wrong tries. A new code replaces the previous one
// for the same purpose, so a resend never adds guesses. Sends are rate-limited per identifier
// (cooldown + hourly cap) and per client IP, counted the same whether or not an account exists.
export type OtpChannel = 'email' | OtpMobileChannel;
export const OTP_CHANNELS: readonly OtpChannel[] = ['email', 'sms', 'whatsapp'];

export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const OTP_SENDS_PER_IDENTIFIER_PER_HOUR = 5;
export const OTP_SENDS_PER_IP_PER_HOUR = 20;
const HOUR = 60 * 60;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export class TooManyOtpRequestsException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super(
      { statusCode: HttpStatus.TOO_MANY_REQUESTS, message: 'Please wait before asking for another code.', retryAfterSeconds },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

// A typed sign-in identifier: an email address, or a mobile number normalised to E.164
// (libphonenumber-js full metadata; numbers without a country code are read as OTP_DEFAULT_COUNTRY,
// India by default). Null when it is neither.
export function parseOtpIdentifier(raw: string): { kind: 'email' | 'mobile'; value: string } | null {
  const value = raw.trim();
  if (value.includes('@')) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 320 ? { kind: 'email', value: value.toLowerCase() } : null;
  }
  const mobile = normaliseMobileNumber(value);
  return mobile ? { kind: 'mobile', value: mobile } : null;
}

export function normaliseMobileNumber(raw: string): string | null {
  const phone = parsePhoneNumberFromString(raw.trim(), (process.env.OTP_DEFAULT_COUNTRY ?? 'IN') as 'IN');
  if (!phone?.isValid()) return null;
  const type = phone.getType();
  return type === 'MOBILE' || type === 'FIXED_LINE_OR_MOBILE' ? phone.number : null;
}

export const maskMobile = (e164: string) => `${e164.slice(0, 3)}${'•'.repeat(Math.max(0, e164.length - 5))}${e164.slice(-2)}`;

// `label` fills the DLT template's purpose {#var#} (at most 30 characters, APX-A §4.3).
const MESSAGES = {
  sign_in: { subject: 'Your YukthiX sign-in code', what: 'sign-in code', label: 'sign-in code' },
  mfa: { subject: 'Your YukthiX verification code', what: 'verification code', label: 'verification code' },
  mobile: { subject: 'Your YukthiX verification code', what: 'code to verify this mobile number', label: 'mobile verification code' },
} as const;
export type OtpPurpose = keyof typeof MESSAGES;

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly crypto: OrgSecretsCryptoService,
    private readonly email: EmailService,
    @Inject(OTP_SMS_SENDER) private readonly sms: OtpSmsSender,
    @Inject(LOGIN_PROTECTION_REDIS) private readonly redis: Redis,
  ) {}

  // Fail closed: without its store no code can be limited or checked, so nothing proceeds.
  private async store<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error('One-time-code store unavailable', error as Error);
      throw new ServiceUnavailableException('One-time codes are temporarily unavailable. Please try again shortly.');
    }
  }

  channelAvailable(channel: OtpChannel): boolean {
    return channel === 'email' || this.sms.channels.has(channel);
  }

  // Throws 429 unless a code may be sent now to `subject` (any stable identifier: org + email /
  // mobile, a user id) from `ip`. Called before any account lookup, so limits reveal nothing.
  async reserveSend(subject: string, ip: string | null): Promise<void> {
    const id = sha256(subject);
    const cooldown = `auth:otp:cool:${id}`;
    const sends = `auth:otp:sends:${id}`;
    const ipSends = `auth:otp:ip:${ipBucket(ip)}`;
    await this.store(async () => {
      if (!(await this.redis.set(cooldown, '1', 'EX', OTP_RESEND_COOLDOWN_SECONDS, 'NX'))) {
        throw new TooManyOtpRequestsException(Math.max(1, await this.redis.ttl(cooldown)));
      }
      const replies = await this.redis
        .multi()
        .set(sends, 0, 'EX', HOUR, 'NX')
        .incr(sends)
        .set(ipSends, 0, 'EX', HOUR, 'NX')
        .incr(ipSends)
        .exec();
      if (!replies || replies.some(([error]) => error)) throw new Error('otp MULTI failed');
      const over = Number(replies[1][1]) > OTP_SENDS_PER_IDENTIFIER_PER_HOUR ? sends : Number(replies[3][1]) > OTP_SENDS_PER_IP_PER_HOUR ? ipSends : null;
      if (over) {
        await this.redis.del(cooldown); // a refused send must not start a cooldown for this identifier
        throw new TooManyOtpRequestsException(Math.max(1, await this.redis.ttl(over)));
      }
    });
  }

  private mac(key: string, code: string): string {
    return this.crypto.hmac('otp', `${key}\u0000${code}`);
  }

  // A fresh code stored under `key` with `data`, replacing any code already there. Returns it.
  async issue(key: string, data: Record<string, string>): Promise<string> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.store(() =>
      this.redis.multi().del(key).hset(key, { ...data, mac: this.mac(key, code), attempts: '0' }).expire(key, OTP_TTL_SECONDS).exec(),
    );
    return code;
  }

  // The data stored with the code under `key` (without checking a code), or null.
  async peek(key: string): Promise<Record<string, string> | null> {
    const data = await this.store(() => this.redis.hgetall(key));
    return data.mac ? data : null;
  }

  // The stored data when `code` is right; null otherwise. Each try is counted atomically before
  // the compare (constant-time), the 5th wrong try burns the code, and a right code is consumed
  // by the same DEL that only one concurrent caller can win.
  async check(key: string, code: string): Promise<Record<string, string> | null> {
    return this.store(async () => {
      const replies = await this.redis.multi().hincrby(key, 'attempts', 1).hgetall(key).exec();
      if (!replies || replies.some(([error]) => error)) throw new Error('otp MULTI failed');
      const attempts = Number(replies[0][1]);
      const data = replies[1][1] as Record<string, string>;
      if (!data.mac) {
        await this.redis.del(key); // HINCRBY re-created an expired / unknown key
        return null;
      }
      const expected = Buffer.from(data.mac, 'hex');
      const given = Buffer.from(this.mac(key, code), 'hex');
      const right = attempts <= OTP_MAX_ATTEMPTS && timingSafeEqual(expected, given);
      if (!right) {
        if (attempts >= OTP_MAX_ATTEMPTS) await this.redis.del(key);
        return null;
      }
      return (await this.redis.del(key)) === 1 ? data : null;
    });
  }

  async discard(key: string): Promise<void> {
    await this.store(() => this.redis.del(key));
  }

  // Sent at once (YX-NTF-13), fire-and-forget: the caller's response and timing never depend on
  // delivery. The code is the only variable content; nothing else about the account is included.
  // By SMS / WhatsApp the person asked for it on that channel (YX-NTF-14); when it can't go there it
  // goes to `fallbackEmail` if the flow allows one (YX-NTF-07), never when it may already have arrived.
  deliver(
    channel: OtpChannel,
    to: string,
    code: string,
    purpose: OtpPurpose,
    organizationId: string | null | undefined,
    opts: { userId: string; fallbackEmail?: string | null },
  ): void {
    const minutes = OTP_TTL_SECONDS / 60;
    const sending: Promise<unknown> =
      channel === 'email'
        ? this.emailCode(to, code, purpose, organizationId)
        : this.sms
            .send({ organizationId: organizationId ?? null, to, channel, code, purpose: MESSAGES[purpose].label, minutes, idempotencyKey: randomUUID(), recipientUserId: opts.userId })
            .then((result) => {
              if (result.delivered || result.mayHaveArrived) return;
              this.logger.warn(`One-time code not sent by ${channel} (${result.reason})${opts.fallbackEmail ? '; sent by email instead' : ''}`);
              if (opts.fallbackEmail) return this.emailCode(opts.fallbackEmail, code, purpose, organizationId, true);
            });
    sending.catch((error) => this.logger.error(`Failed to send a one-time code by ${channel}`, error as Error));
  }

  private emailCode(to: string, code: string, purpose: OtpPurpose, organizationId?: string | null, insteadOfText = false) {
    const { subject, what } = MESSAGES[purpose];
    return this.email.send({
      to,
      subject,
      html:
        (insteadOfText ? '<p>We could not send your code by text message, so here it is by email.</p>' : '') +
        `<p>Your YukthiX ${what} is:</p><p style="font-size:24px;letter-spacing:4px"><b>${code}</b></p>` +
        `<p>It expires in ${OTP_TTL_SECONDS / 60} minutes and works once. Never share it: YukthiX staff will never ask for it.</p>` +
        '<p>If you did not ask for this code, you can ignore this email.</p>',
      organizationId: organizationId ?? undefined,
    });
  }
}
