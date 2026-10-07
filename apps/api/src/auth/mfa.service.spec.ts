import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { createBase32Plugin } from '@otplib/core';
import { NodeCryptoPlugin } from '@otplib/plugin-crypto-node';
import { generateSync as totpCode } from '@otplib/totp';
import { base32 } from '@scure/base';
import {
  DEFAULT_SECURITY_POLICY,
  OrgSecretsCryptoService,
  SessionAssurance,
  loadTenantSecurityPolicy,
  resolvePermissionGrants,
  stepUpSatisfied,
} from '@exam-platform/shared';
import { FIRST_FACTOR_REAUTH_SECONDS, MfaService, MfaUser, RECOVERY_CODE_COUNT } from './mfa.service';
import { SoftAuthenticator } from '../../test/fixtures/soft-authenticator';

jest.mock('@exam-platform/shared', () => {
  const actual = jest.requireActual('@exam-platform/shared');
  return {
    ...actual,
    loadTenantSecurityPolicy: jest.fn(async () => actual.DEFAULT_SECURITY_POLICY),
    resolvePermissionGrants: jest.fn(async () => new Set<string>()),
  };
});

// A tiny in-memory stand-in for the Prisma calls MfaService makes: equality, null, lt, OR.
type Row = Record<string, unknown>;
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return (cond as Row[]).some((c) => matches(row, c));
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date) && 'lt' in (cond as Row)) {
      return row[key] !== null && (row[key] as bigint | number) < ((cond as Row).lt as number);
    }
    return row[key] === cond || (typeof row[key] === 'bigint' && Number(row[key]) === Number(cond));
  });
}
function table() {
  const rows: Row[] = [];
  return {
    rows,
    findMany: jest.fn(async ({ where }: { where?: Row } = {}) => rows.filter((r) => matches(r, where))),
    findFirst: jest.fn(async ({ where }: { where?: Row } = {}) => rows.find((r) => matches(r, where)) ?? null),
    count: jest.fn(async ({ where }: { where?: Row } = {}) => rows.filter((r) => matches(r, where)).length),
    create: jest.fn(async ({ data }: { data: Row }) => {
      const row = { id: randomUUID(), createdAt: new Date(), revokedAt: null, usedAt: null, totpLastStep: null, signCount: 0n, transports: [], ...data };
      rows.push(row);
      return row;
    }),
    createMany: jest.fn(async ({ data }: { data: Row[] }) => {
      for (const d of data) rows.push({ id: randomUUID(), usedAt: null, ...d });
      return { count: data.length };
    }),
    updateMany: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
      const hit = rows.filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    }),
    deleteMany: jest.fn(async ({ where }: { where: Row }) => {
      const keep = rows.filter((r) => !matches(r, where));
      const count = rows.length - keep.length;
      rows.splice(0, rows.length, ...keep);
      return { count };
    }),
  };
}

function fakeRedis() {
  const store = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  return {
    store,
    set: jest.fn(async (key: string, value: string) => (store.set(key, value), 'OK')),
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    getdel: jest.fn(async (key: string) => {
      const value = store.get(key) ?? null;
      store.delete(key);
      return value;
    }),
    del: jest.fn(async (...keys: string[]) => keys.filter((k) => store.delete(k) || sets.delete(k)).length),
    sets,
    smembers: jest.fn(async (key: string) => [...(sets.get(key) ?? [])]),
    multi() {
      const ops: (() => unknown)[] = [];
      const chain = {
        set: (key: string, value: string) => (ops.push(() => store.set(key, value)), chain),
        sadd: (key: string, member: string) => (ops.push(() => sets.set(key, new Set([...(sets.get(key) ?? []), member]))), chain),
        expire: () => chain,
        exec: async () => ops.map((op) => [null, op()]),
      };
      return chain;
    },
  };
}

const OTP = { crypto: new NodeCryptoPlugin(), base32: createBase32Plugin({ encode: base32.encode, decode: base32.decode }) };
const codeAt = (secret: string, offsetSteps = 0) => totpCode({ ...OTP, secret, epoch: Math.floor(Date.now() / 1000) + offsetSteps * 30 });
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

describe('MfaService', () => {
  const SID = randomUUID();
  const USER: MfaUser = {
    id: randomUUID(),
    email: 'admin@mfa.test',
    organizationId: randomUUID(),
    role: 'org_admin',
    status: 'active',
    permissionProfileId: null,
    mfaEnrolmentDueAt: new Date(Date.now() + 86_400_000),
  };
  const FRESH = { assuranceLevel: 'aal2', mfaVerifiedAt: new Date(), mfaMethod: 'totp', mfaEnrolmentDueAt: USER.mfaEnrolmentDueAt };
  // Signed in just now (sessions.created_at): fresh enough to enrol a first factor.
  const AAL1: SessionAssurance = { assuranceLevel: 'aal1', mfaVerifiedAt: null, mfaMethod: null, mfaEnrolmentDueAt: USER.mfaEnrolmentDueAt, authenticatedAt: new Date() };
  let tx: { authenticator: ReturnType<typeof table>; recoveryCode: ReturnType<typeof table>; session: { updateMany: jest.Mock }; user: { findUnique: jest.Mock } };
  let redis: ReturnType<typeof fakeRedis>;
  let audit: { record: jest.Mock };
  let sessions: { notifySecurityChange: jest.Mock };
  let service: MfaService;
  const crypto = new OrgSecretsCryptoService();

  beforeAll(() => {
    process.env.ORG_SECRETS_ENCRYPTION_KEY ??= 'a'.repeat(64);
    process.env.FRONTEND_URL = 'http://localhost:3000';
  });

  beforeEach(() => {
    tx = { authenticator: table(), recoveryCode: table(), session: { updateMany: jest.fn(async () => ({ count: 1 })) }, user: { findUnique: jest.fn(async () => USER) } };
    redis = fakeRedis();
    audit = { record: jest.fn() };
    sessions = { notifySecurityChange: jest.fn() };
    const tenantPrisma = { forTenant: jest.fn(async (_ctx: unknown, fn: (t: unknown) => unknown) => fn(tx)) };
    service = new MfaService({} as never, tenantPrisma as never, crypto, audit as never, sessions as never, redis as never, {} as never);
    (loadTenantSecurityPolicy as jest.Mock).mockResolvedValue(DEFAULT_SECURITY_POLICY);
    (resolvePermissionGrants as jest.Mock).mockResolvedValue(new Set(['org:manage_users']));
  });

  async function enrolTotp(): Promise<{ secret: string; recoveryCodes?: string[] }> {
    const { secret, otpauthUrl } = await service.startTotp(USER, AAL1, SID);
    expect(otpauthUrl).toMatch(/^otpauth:\/\/totp\/YukthiX:admin%40mfa\.test\?secret=[A-Z2-7]+&issuer=YukthiX$/);
    const { recoveryCodes } = await service.confirmTotp(USER, AAL1, SID, codeAt(secret));
    return { secret, recoveryCodes };
  }

  describe('TOTP (otplib)', () => {
    it('enrolment stores the secret encrypted, hands out 10 single-use recovery codes once (hashed at rest), and lifts the session to AAL2', async () => {
      const { secret, recoveryCodes } = await enrolTotp();
      const [row] = tx.authenticator.rows;
      expect(row).toMatchObject({ type: 'totp', userId: USER.id, organizationId: USER.organizationId });
      expect(row.secretEncrypted).not.toContain(secret);
      expect(crypto.decrypt(row.secretEncrypted as string)).toBe(secret);

      expect(recoveryCodes).toHaveLength(RECOVERY_CODE_COUNT);
      expect(new Set(recoveryCodes).size).toBe(RECOVERY_CODE_COUNT);
      recoveryCodes!.forEach((c) => expect(c).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/));
      expect(tx.recoveryCode.rows.map((r) => r.codeHash)).toEqual(recoveryCodes!.map((c) => sha256(c.replace(/-/g, ''))));
      expect(JSON.stringify(tx.recoveryCode.rows)).not.toContain(recoveryCodes![0]);

      // AAL2 as 'enrolment': meets the MFA floor, never a step-up.
      expect(tx.session.updateMany).toHaveBeenCalledWith({
        where: { id: SID, userId: USER.id, revokedAt: null },
        data: expect.objectContaining({ assuranceLevel: 'aal2', mfaMethod: 'enrolment', mfaVerifiedAt: expect.any(Date) }),
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'mfa.enrolled', metadata: { factor: 'totp', first: true, otherSessionsRevoked: 1 } }),
      );
      expect(sessions.notifySecurityChange).toHaveBeenCalled();
    });

    it('a wrong confirmation code enrols nothing; the setup is single-use and expires with its key', async () => {
      const { secret } = await service.startTotp(USER, AAL1, SID);
      await expect(service.confirmTotp(USER, AAL1, SID, codeAt(secret) === '000000' ? '111111' : '000000')).rejects.toThrow(BadRequestException);
      expect(tx.authenticator.rows).toHaveLength(0);
      await service.confirmTotp(USER, AAL1, SID, codeAt(secret));
      // A second factor needs step-up (below); with it, the consumed setup is gone.
      await expect(service.confirmTotp(USER, FRESH, SID, codeAt(secret, 1))).rejects.toThrow('expired');
    });

    it('accepts one step of clock drift, rejects two, and never accepts the same time step twice (replay)', async () => {
      const { secret } = await enrolTotp();
      const proof = (code: string) => service.verifyProof(USER, { factor: 'totp', code }, null);
      // Enrolment consumed the current step.
      expect(await proof(codeAt(secret))).toBeNull();
      expect(await proof(codeAt(secret, 1))).toBe('totp');
      expect(await proof(codeAt(secret, 1))).toBeNull(); // replayed
      expect(await proof(codeAt(secret, -1))).toBeNull(); // older than the last accepted step
      expect(await proof(codeAt(secret, 3))).toBeNull(); // outside the drift window
      expect(await proof('12345')).toBeNull();
      expect(await proof('abcdef')).toBeNull();
    });

    it('a revoked authenticator app no longer verifies', async () => {
      const { secret } = await enrolTotp();
      tx.authenticator.rows[0].revokedAt = new Date();
      expect(await service.verifyProof(USER, { factor: 'totp', code: codeAt(secret, 1) }, null)).toBeNull();
    });

    it("refuses an authenticator app the company's policy does not allow", async () => {
      (loadTenantSecurityPolicy as jest.Mock).mockResolvedValue({ ...DEFAULT_SECURITY_POLICY, allowedFactors: ['passkey'] });
      await expect(service.startTotp(USER, AAL1, SID)).rejects.toThrow('does not allow');
    });
  });

  // Regression (high): an AAL1 session for an account with no factor -- a phished password, a
  // mailbox-only OTP sign-in, a stolen refresh cookie -- could enrol the attacker's authenticator
  // and get a 15-minute step-up window plus the recovery codes.
  describe('first-factor enrolment (ASVS V2.5 / V3.7.1)', () => {
    it('needs a fresh sign-in: an old session (e.g. kept alive by a stolen refresh cookie) is refused', async () => {
      const old = { ...AAL1, authenticatedAt: new Date(Date.now() - (FIRST_FACTOR_REAUTH_SECONDS + 60) * 1000) };
      await expect(service.startTotp(USER, old, SID)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'REAUTH_REQUIRED' }) });
      await expect(service.passkeyRegistrationOptions(USER, old, SID)).rejects.toThrow(ForbiddenException);
      // Unknown sign-in time fails closed.
      await expect(service.startTotp(USER, { ...AAL1, authenticatedAt: undefined }, SID)).rejects.toThrow(ForbiddenException);
      expect(tx.authenticator.rows).toHaveLength(0);
    });

    it('lifts the session to AAL2 without granting a step-up', async () => {
      await enrolTotp();
      const call = tx.session.updateMany.mock.calls.map(([args]) => args).find((args) => args.where.id === SID);
      const elevated = { ...AAL1, ...call.data };
      expect(elevated.mfaMethod).toBe('enrolment');
      expect(stepUpSatisfied(elevated)).toBe(false);
    });

    it('signs out every other session of the account and cancels its half-finished sign-ins', async () => {
      const token = await service.createPendingLogin({ userId: USER.id, method: 'password', orgSlug: 'o', identifier: 'i', breakGlass: false, deviceIdHash: sha256('d') });
      await enrolTotp();
      expect(tx.session.updateMany).toHaveBeenCalledWith({
        where: { userId: USER.id, id: { not: SID }, revokedAt: null },
        data: { revokedAt: expect.any(Date), revokedReason: 'mfa_enrolled' },
      });
      expect(await service.loadPendingLogin(token, 'd')).toBeNull();
    });
  });

  // P12 Q1/Q7: YukthiX staff use a hardware security key only.
  describe('YukthiX staff (super admins)', () => {
    const STAFF: MfaUser = { ...USER, role: 'super_admin', organizationId: null };

    it('cannot enrol an authenticator app, and a TOTP code or recovery code never verifies for them', async () => {
      await expect(service.startTotp(STAFF, AAL1, SID)).rejects.toThrow('security key');
      tx.recoveryCode.rows.push({ id: 'r', userId: STAFF.id, codeHash: sha256('aaaabbbbccccdddd'), usedAt: null });
      expect(await service.verifyProof(STAFF, { factor: 'recovery_code', code: 'aaaa-bbbb-cccc-dddd' }, null)).toBeNull();
      expect(await service.verifyProof(STAFF, { factor: 'totp', code: '123456' }, null)).toBeNull();
      await expect(service.regenerateRecoveryCodes(STAFF)).rejects.toThrow('do not use recovery codes');
    });

    it('asks for a roaming key with user verification, refuses a synced passkey, and issues no recovery codes', async () => {
      const options = await service.passkeyRegistrationOptions(STAFF, AAL1, SID);
      expect(options.authenticatorSelection).toMatchObject({ authenticatorAttachment: 'cross-platform', userVerification: 'required' });
      await expect(service.registerPasskey(STAFF, AAL1, SID, new SoftAuthenticator().register(options, { synced: true }))).rejects.toThrow('hardware security key');

      const again = await service.passkeyRegistrationOptions(STAFF, AAL1, SID);
      const { recoveryCodes } = await service.registerPasskey(STAFF, AAL1, SID, new SoftAuthenticator().register(again));
      expect(recoveryCodes).toBeUndefined();
      expect(tx.recoveryCode.rows.filter((r) => r.userId === STAFF.id && r.id !== 'r')).toHaveLength(0);
    });

    it('a TOTP enrolled before the rule is not a usable factor for staff', async () => {
      tx.authenticator.rows.push({ id: 'old-totp', userId: STAFF.id, type: 'totp', revokedAt: null, createdAt: new Date() });
      expect(await service.hasFactor(STAFF)).toBe(false);
    });
  });

  describe('mobile verification', () => {
    it('every code sent is audited, with the number masked (YX-IAM-10)', async () => {
      const otp = { channelAvailable: () => true, reserveSend: jest.fn(), issue: jest.fn(async () => '123456'), deliver: jest.fn() };
      const tenantPrisma = { forTenant: jest.fn(async (_ctx: unknown, fn: (t: unknown) => unknown) => fn(tx)) };
      service = new MfaService({} as never, tenantPrisma as never, crypto, audit as never, sessions as never, redis as never, otp as never);
      await service.startMobileVerification({ ...USER, role: 'recruiter' }, AAL1, SID, '+919876543210', 'sms', '203.0.113.5');
      expect(audit.record).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'user.mobile_verification_started', metadata: expect.objectContaining({ channel: 'sms', ip: '203.0.113.5' }) }),
      );
      expect(JSON.stringify(audit.record.mock.calls)).not.toContain('9876543210');
    });
  });

  describe('recovery codes (YX-IAM-11)', () => {
    it('each code works once, forgiving case and dashes; its use is audited and the user told', async () => {
      const { recoveryCodes } = await enrolTotp();
      const code = recoveryCodes![3];
      expect(await service.verifyProof(USER, { factor: 'recovery_code', code: code.toUpperCase().replace(/-/g, ' ') }, null)).toBe('recovery_code');
      expect(await service.verifyProof(USER, { factor: 'recovery_code', code }, null)).toBeNull();
      expect(await service.verifyProof(USER, { factor: 'recovery_code', code: 'aaaa-bbbb-cccc-dddd' }, null)).toBeNull();
      expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'mfa.recovery_code_used' }));
      expect(sessions.notifySecurityChange).toHaveBeenCalledWith(USER, expect.stringContaining('recovery code'), expect.any(String));
    });

    it('regenerating replaces every old code', async () => {
      const { recoveryCodes } = await enrolTotp();
      const { recoveryCodes: fresh } = await service.regenerateRecoveryCodes(USER);
      expect(await service.verifyProof(USER, { factor: 'recovery_code', code: recoveryCodes![0] }, null)).toBeNull();
      expect(await service.verifyProof(USER, { factor: 'recovery_code', code: fresh[0] }, null)).toBe('recovery_code');
    });
  });

  describe('passkeys (@simplewebauthn/server)', () => {
    async function enrolPasskey(session: SessionAssurance = AAL1) {
      const device = new SoftAuthenticator();
      const options = await service.passkeyRegistrationOptions(USER, session, SID);
      expect(options).toMatchObject({ rp: { id: 'localhost', name: 'YukthiX' }, attestation: 'none' });
      const result = await service.registerPasskey(USER, session, SID, device.register(options), 'Laptop');
      return { device, result };
    }
    const proveWith = async (device: SoftAuthenticator, overrides: Parameters<SoftAuthenticator['assert']>[1] = {}) => {
      const options = await service.stepUpPasskeyOptions(USER, SID);
      const challenge = await service.takeStepUpChallenge(SID);
      return service.verifyProof(USER, { factor: 'passkey', credential: device.assert(options, overrides) as never }, challenge);
    };

    it('registers a passkey (public key only, no secret) and verifies a genuine assertion', async () => {
      const { device, result } = await enrolPasskey();
      expect(result.recoveryCodes).toHaveLength(RECOVERY_CODE_COUNT);
      const [row] = tx.authenticator.rows;
      expect(row).toMatchObject({ type: 'passkey', credentialId: device.id, label: 'Laptop' });
      expect(row.secretEncrypted).toBeUndefined();
      expect(Buffer.isBuffer(row.publicKey)).toBe(true);
      expect(await proveWith(device)).toBe('passkey');
      expect(Number(row.signCount)).toBe(device.counter);
    });

    it('rejects a tampered signature, a foreign origin, a reused challenge and a counter that does not move forward', async () => {
      const { device } = await enrolPasskey();
      expect(await proveWith(device, { tamper: true })).toBeNull();
      expect(await proveWith(device, { origin: 'https://evil.example' })).toBeNull();
      expect(await proveWith(device)).toBe('passkey');
      expect(await proveWith(device, { keepCounter: true })).toBeNull(); // cloned authenticator / replayed assertion

      const options = await service.stepUpPasskeyOptions(USER, SID);
      const assertion = device.assert(options);
      const challenge = await service.takeStepUpChallenge(SID);
      expect(await service.verifyProof(USER, { factor: 'passkey', credential: assertion as never }, challenge)).toBe('passkey');
      expect(await service.takeStepUpChallenge(SID)).toBeNull(); // the challenge was single-use
      expect(await service.verifyProof(USER, { factor: 'passkey', credential: assertion as never }, 'some-other-challenge')).toBeNull();
    });

    it("rejects someone else's credential", async () => {
      await enrolPasskey();
      expect(await proveWith(new SoftAuthenticator())).toBeNull();
    });

    it('rejects a registration from a foreign origin, and a registration challenge works once', async () => {
      const device = new SoftAuthenticator();
      const options = await service.passkeyRegistrationOptions(USER, AAL1, SID);
      await expect(service.registerPasskey(USER, AAL1, SID, device.register(options, { origin: 'https://evil.example' }))).rejects.toThrow('could not be verified');
      await expect(service.registerPasskey(USER, AAL1, SID, device.register(options))).rejects.toThrow('expired');
      expect(tx.authenticator.rows).toHaveLength(0);
    });

    it('adding a second factor needs a fresh step-up, so a hijacked session cannot plant one', async () => {
      await enrolTotp();
      await expect(service.passkeyRegistrationOptions(USER, AAL1, SID)).rejects.toThrow(ForbiddenException);
      const stale = { ...FRESH, mfaVerifiedAt: new Date(Date.now() - 20 * 60_000) };
      await expect(service.passkeyRegistrationOptions(USER, stale, SID)).rejects.toThrow(ForbiddenException);
      const { result } = await enrolPasskey(FRESH);
      expect(result.recoveryCodes).toBeUndefined(); // not the first factor: codes unchanged
    });

    it('asks every new passkey to be discoverable and user-verifying, so it can be the whole sign-in', async () => {
      const options = await service.passkeyRegistrationOptions(USER, AAL1, SID);
      expect(options.authenticatorSelection).toEqual({ residentKey: 'required', requireResidentKey: true, userVerification: 'required' });
    });

    // Founder decision 7 Oct 2026: a passkey is a sign-in method in its own right (US-A-039).
    describe('passwordless sign-in', () => {
      const DEVICE = 'device-cookie-a';
      async function signInWith(device: SoftAuthenticator, overrides: Parameters<SoftAuthenticator['assert']>[1] = {}, deviceId = DEVICE) {
        const options = await service.passwordlessOptions(DEVICE);
        const credential = device.assert(options, overrides);
        const challenge = await service.takePasswordlessChallenge(credential, deviceId);
        const passkey = await service.findPasskey(credential.id);
        return Boolean(challenge && passkey && (await service.verifyPasswordless(passkey as never, credential as never, challenge)));
      }

      it('offers no allowCredentials (the browser lists its discoverable passkeys) and requires user verification', async () => {
        await enrolPasskey();
        const options = await service.passwordlessOptions(DEVICE);
        expect(options.allowCredentials ?? []).toEqual([]);
        expect(options).toMatchObject({ rpId: 'localhost', userVerification: 'required' });
        expect([...redis.store.keys()]).toContain(`auth:passkey:chal:${sha256(options.challenge)}`);
        expect(redis.store.get(`auth:passkey:chal:${sha256(options.challenge)}`)).toBe(sha256(DEVICE)); // device-bound, hashed
      });

      it('a genuine assertion from the right device names the account and moves the counter', async () => {
        const { device } = await enrolPasskey();
        expect(await signInWith(device)).toBe(true);
        expect(Number(tx.authenticator.rows[0].signCount)).toBe(device.counter);
      });

      it('the challenge is single-use and only for the device it was issued to', async () => {
        const { device } = await enrolPasskey();
        const options = await service.passwordlessOptions(DEVICE);
        const credential = device.assert(options);
        expect(await service.takePasswordlessChallenge(credential, 'another-device')).toBeNull();
        expect(await service.takePasswordlessChallenge(credential, DEVICE)).toBeNull(); // spent by the first try
        const fresh = device.assert(await service.passwordlessOptions(DEVICE));
        expect(await service.takePasswordlessChallenge(fresh, DEVICE)).toEqual(expect.any(String));
        expect(await service.takePasswordlessChallenge(fresh, DEVICE)).toBeNull(); // replay
      });

      it('a challenge it never issued, or unreadable client data, is refused', async () => {
        const { device } = await enrolPasskey();
        expect(await service.takePasswordlessChallenge(device.assert({ challenge: 'A'.repeat(43) }), DEVICE)).toBeNull();
        expect(await service.takePasswordlessChallenge({ response: { clientDataJSON: 'not-json' } }, DEVICE)).toBeNull();
      });

      it('refuses no user verification, a foreign origin or RP, a tampered signature, a replayed counter and a wrong or missing user handle', async () => {
        const { device } = await enrolPasskey();
        expect(await signInWith(device, { noUserVerification: true })).toBe(false);
        expect(await signInWith(device, { origin: 'https://evil.example' })).toBe(false);
        expect(await signInWith(device, { tamper: true })).toBe(false);
        expect(await signInWith(device, { userHandle: null })).toBe(false);
        expect(await signInWith(device, { userHandle: Buffer.from(randomUUID()).toString('base64url') })).toBe(false);
        expect(await signInWith(device)).toBe(true);
        expect(await signInWith(device, { keepCounter: true })).toBe(false);

        const otherRp = new SoftAuthenticator('evil.example');
        (otherRp as unknown as { credentialId: Buffer }).credentialId = Buffer.from(device.id, 'base64url');
        otherRp.userHandle = device.userHandle;
        otherRp.counter = device.counter;
        expect(await signInWith(otherRp)).toBe(false);
      });

      it('an unknown or removed credential is not found', async () => {
        const { device } = await enrolPasskey();
        expect(await service.findPasskey(new SoftAuthenticator().id)).toBeNull();
        tx.authenticator.rows[0].revokedAt = new Date();
        expect(await service.findPasskey(device.id)).toBeNull();
      });
    });
  });

  describe('renaming a passkey', () => {
    it("renames the person's own live passkey, audited; anything else is not found", async () => {
      const options = await service.passkeyRegistrationOptions(USER, AAL1, SID);
      await service.registerPasskey(USER, AAL1, SID, new SoftAuthenticator().register(options), 'Chrome on Windows');
      const id = tx.authenticator.rows[0].id as string;
      await service.renamePasskey(USER, id, 'Work laptop');
      expect(tx.authenticator.rows[0].label).toBe('Work laptop');
      expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'mfa.renamed', entityId: id }));
      await expect(service.renamePasskey({ ...USER, id: randomUUID() }, id, 'Mine now')).rejects.toThrow('not found');
    });
  });

  describe('removing factors', () => {
    it('the last factor cannot go while MFA is required for the account', async () => {
      await enrolTotp();
      await expect(service.removeFactor(USER, tx.authenticator.rows[0].id as string)).rejects.toThrow('required');
      expect(tx.authenticator.rows[0].revokedAt).toBeNull();
    });

    it('otherwise it is revoked (never deleted) with the recovery codes, audited and notified', async () => {
      (resolvePermissionGrants as jest.Mock).mockResolvedValue(new Set());
      const recruiter = { ...USER, role: 'recruiter' };
      await enrolTotp();
      await service.removeFactor(recruiter, tx.authenticator.rows[0].id as string);
      expect(tx.authenticator.rows[0].revokedAt).toBeInstanceOf(Date);
      expect(tx.recoveryCode.rows).toHaveLength(0);
      expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'mfa.removed' }));
    });

    it("someone else's factor id is not found", async () => {
      await enrolTotp();
      await expect(service.removeFactor(USER, randomUUID())).rejects.toThrow('not found');
    });
  });

  describe('sensitive roles (P12 §3)', () => {
    it('YukthiX staff always; others by their effective grants; everyone when the company says so', async () => {
      (resolvePermissionGrants as jest.Mock).mockResolvedValue(new Set());
      expect(await service.mfaRequiredFor({ ...USER, role: 'super_admin', organizationId: null })).toBe(true);
      expect(await service.mfaRequiredFor({ ...USER, role: 'panel' })).toBe(false);
      (resolvePermissionGrants as jest.Mock).mockResolvedValue(new Set(['exam:manage'])); // proctor / evaluator
      expect(await service.mfaRequiredFor({ ...USER, role: 'recruiter' })).toBe(true);
      (resolvePermissionGrants as jest.Mock).mockResolvedValue(new Set());
      (loadTenantSecurityPolicy as jest.Mock).mockResolvedValue({ ...DEFAULT_SECURITY_POLICY, mfaScope: 'all' });
      expect(await service.mfaRequiredFor({ ...USER, role: 'panel' })).toBe(true);
    });
  });

  describe('pending sign-in', () => {
    const pending = { userId: USER.id, method: 'password' as const, orgSlug: 'o', identifier: 'i', breakGlass: false, deviceIdHash: sha256('device-a') };

    it('is stored only under the hash of its token, readable only from the device that started it, and consumed once', async () => {
      const token = await service.createPendingLogin(pending);
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect([...redis.store.keys()]).toEqual([`auth:mfa:pending:${sha256(token)}`]);
      expect([...redis.sets.get(`auth:mfa:pending-user:${USER.id}`)!]).toEqual([sha256(token)]); // per-user index: hashes only
      expect(await service.loadPendingLogin(token, 'device-a')).toEqual(pending);
      expect(await service.loadPendingLogin(token, 'device-b')).toBeNull();
      expect(await service.loadPendingLogin('x'.repeat(43), 'device-a')).toBeNull();
      expect(await service.consumePendingLogin(token)).toBe(true);
      expect(await service.consumePendingLogin(token)).toBe(false);
      expect(await service.loadPendingLogin(token, 'device-a')).toBeNull();
    });

    // Regression: an mfaToken won with the old password stayed usable for 5 minutes after a
    // password reset or an MFA reset.
    it('cancelPendingLogins ends every half-finished sign-in of that user only', async () => {
      const mine = await service.createPendingLogin(pending);
      const theirs = await service.createPendingLogin({ ...pending, userId: 'someone-else' });
      await service.cancelPendingLogins(USER.id);
      expect(await service.loadPendingLogin(mine, 'device-a')).toBeNull();
      expect(await service.loadPendingLogin(theirs, 'device-a')).not.toBeNull();
    });

    it('fails closed (503) when the store is down', async () => {
      redis.get.mockRejectedValue(new Error('down'));
      await expect(service.loadPendingLogin('t', 'd')).rejects.toThrow('temporarily unavailable');
    });
  });
});
