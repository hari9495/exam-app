import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { generate } from 'selfsigned';
import { invalidateTenantSecurityPolicy } from '@exam-platform/shared';
import { IdentityProvidersService, afterRecheck, checkTxt, domainRecheckMaxFailures } from './identity-providers.service';

// Ported from the former organizations SSO settings tests (single SAML config on the org row) and
// extended to several providers per company (YX-IAM-04/05).
describe('IdentityProvidersService', () => {
  const ORG = 'org-1';
  const context = { organizationId: ORG, isSuperAdmin: false };
  let tx: any;
  let audit: { record: jest.Mock };
  let crypto: { encrypt: jest.Mock; hmac: jest.Mock };
  let resolveTxt: jest.Mock;
  let sso: { jitRoleIsSafe: jest.Mock };
  let oidc: { checkIssuer: jest.Mock };
  let sessions: { notifyAdmins: jest.Mock };
  let service: IdentityProvidersService;
  let cert: string;

  const stored = (over: Record<string, unknown> = {}) => ({
    id: 'idp-1',
    organizationId: ORG,
    type: 'saml',
    name: 'Okta',
    status: 'disabled',
    samlEntityId: null,
    samlSsoUrl: null,
    samlCertificate: null,
    oidcIssuer: null,
    oidcClientId: null,
    oidcClientSecretEncrypted: null,
    entraTenantId: null,
    jitEnabled: false,
    jitRole: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    domains: [],
    ...over,
  });

  beforeAll(async () => {
    cert = (await generate([{ name: 'commonName', value: 'idp.test' }])).cert;
  });

  beforeEach(() => {
    invalidateTenantSecurityPolicy(ORG);
    tx = {
      identityProvider: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(stored()),
        create: jest.fn().mockResolvedValue({ id: 'idp-1' }),
        update: jest.fn().mockResolvedValue({ id: 'idp-1' }),
        delete: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      identityProviderDomain: { deleteMany: jest.fn(), createMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null) },
      verifiedDomain: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn(), upsert: jest.fn(async ({ create }) => ({ ...create, verifiedAt: new Date('2026-10-07T00:00:00Z') })) },
      tenantSecurityPolicy: { findUnique: jest.fn().mockResolvedValue(null) },
      session: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    const tenantPrisma = { forTenant: jest.fn((_ctx, fn) => fn(tx)) };
    audit = { record: jest.fn() };
    crypto = { encrypt: jest.fn((value: string) => `enc(${value})`), hmac: jest.fn((purpose: string, value: string) => createHash('sha256').update(`${purpose}|${value}`).digest('hex')) };
    resolveTxt = jest.fn().mockResolvedValue([]);
    sso = { jitRoleIsSafe: jest.fn().mockResolvedValue(true) };
    oidc = { checkIssuer: jest.fn().mockResolvedValue(undefined) };
    sessions = { notifyAdmins: jest.fn() };
    service = new IdentityProvidersService(tenantPrisma as any, audit as any, crypto as any, sso as any, oidc as any, sessions as any, resolveTxt);
  });

  describe('SAML', () => {
    it('rejects a malformed certificate', async () => {
      await expect(service.update(context, 'u1', 'idp-1', { samlCertificate: 'not a real cert' })).rejects.toThrow(BadRequestException);
      expect(tx.identityProvider.update).not.toHaveBeenCalled();
    });

    it('rejects turning a provider on until entity ID, SSO URL and certificate are all set', async () => {
      await expect(service.update(context, 'u1', 'idp-1', { status: 'active', samlEntityId: 'https://idp.test/entity' })).rejects.toThrow(
        BadRequestException,
      );
      expect(tx.identityProvider.update).not.toHaveBeenCalled();
    });

    it('saves valid partial fields and audits which settings changed', async () => {
      await service.update(context, 'u1', 'idp-1', { samlEntityId: 'https://idp.test/entity' });

      expect(tx.identityProvider.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'idp-1' }, data: expect.objectContaining({ samlEntityId: 'https://idp.test/entity' }) }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        context,
        expect.objectContaining({ action: 'identity_provider.updated', metadata: expect.objectContaining({ changed: ['samlEntityId'] }) }),
      );
    });

    it('turns on once all three fields are present', async () => {
      tx.identityProvider.findFirst.mockResolvedValue(stored({ samlEntityId: 'https://idp.test/entity', samlSsoUrl: 'https://idp.test/sso', samlCertificate: cert }));

      await service.update(context, 'u1', 'idp-1', { status: 'active' });

      expect(tx.identityProvider.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'active' }) }));
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ metadata: expect.objectContaining({ changed: ['status'] }) }));
    });

    it('refuses OIDC settings on a SAML provider', async () => {
      await expect(service.update(context, 'u1', 'idp-1', { oidcClientId: 'x' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('OIDC', () => {
    it('Google gets its fixed issuer; the client secret is stored encrypted and never returned', async () => {
      tx.identityProvider.findFirst.mockResolvedValue(
        stored({ type: 'oidc_google', oidcIssuer: 'https://accounts.google.com', oidcClientId: 'cid', oidcClientSecretEncrypted: 'enc(s3cret)' }),
      );

      const view = await service.create(context, 'u1', { type: 'oidc_google', name: 'Google', oidcClientId: 'cid', oidcClientSecret: 's3cret' });

      expect(tx.identityProvider.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ oidcIssuer: 'https://accounts.google.com', oidcClientSecretEncrypted: 'enc(s3cret)', status: 'disabled' }),
        }),
      );
      expect(view).not.toHaveProperty('oidcClientSecretEncrypted');
      expect(view.clientSecretSet).toBe(true);
      expect(JSON.stringify(audit.record.mock.calls)).not.toContain('s3cret');
      // Every administrator hears about a new sign-in provider; never the secret.
      expect(sessions.notifyAdmins).toHaveBeenCalledWith(ORG, expect.stringMatching(/Single sign-on/), expect.stringContaining('Google'));
      expect(JSON.stringify(sessions.notifyAdmins.mock.calls)).not.toContain('s3cret');
    });

    it('Entra is pinned to the directory it names', async () => {
      await service.create(context, 'u1', { type: 'oidc_entra', name: 'Entra', entraTenantId: '0A1B2C3D-0000-4000-8000-000000000001' });

      expect(tx.identityProvider.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            entraTenantId: '0a1b2c3d-0000-4000-8000-000000000001',
            oidcIssuer: 'https://login.microsoftonline.com/0a1b2c3d-0000-4000-8000-000000000001/v2.0',
          }),
        }),
      );
    });

    it('refuses an issuer for Google / Entra, and a private or plain-http issuer for a generic provider', async () => {
      await expect(service.create(context, 'u1', { type: 'oidc_google', name: 'G', oidcIssuer: 'https://evil.test' })).rejects.toThrow(BadRequestException);
      const env = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        for (const issuer of ['http://idp.example.com', 'https://10.0.0.5', 'http://127.0.0.1:8080']) {
          await expect(service.create(context, 'u1', { type: 'oidc_generic', name: 'X', oidcIssuer: issuer })).rejects.toThrow(BadRequestException);
        }
      } finally {
        process.env.NODE_ENV = env;
      }
      expect(tx.identityProvider.create).not.toHaveBeenCalled();
    });

    it('a generic issuer must answer discovery before the provider is turned on', async () => {
      tx.identityProvider.findFirst.mockResolvedValue(
        stored({ type: 'oidc_generic', oidcIssuer: 'https://idp.example.com', oidcClientId: 'cid', oidcClientSecretEncrypted: 'enc(x)' }),
      );
      oidc.checkIssuer.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.update(context, 'u1', 'idp-1', { status: 'active' })).rejects.toThrow(/Could not reach that issuer/);
      expect(tx.identityProvider.update).not.toHaveBeenCalled();
    });

    it('needs a client id and secret before it can be turned on', async () => {
      await expect(service.create(context, 'u1', { type: 'oidc_google', name: 'G', status: 'active', oidcClientId: 'cid' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('domains and JIT (YX-IAM-05)', () => {
    it('replaces the domain set and maps a duplicate domain to 409', async () => {
      await service.update(context, 'u1', 'idp-1', { domains: ['acme.com', 'acme.com', 'acme.in'] });
      expect(tx.identityProviderDomain.deleteMany).toHaveBeenCalledWith({ where: { identityProviderId: 'idp-1' } });
      expect(tx.identityProviderDomain.createMany).toHaveBeenCalledWith({
        data: [
          { organizationId: ORG, domain: 'acme.com', identityProviderId: 'idp-1' },
          { organizationId: ORG, domain: 'acme.in', identityProviderId: 'idp-1' },
        ],
      });

      tx.identityProviderDomain.createMany.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
      await expect(service.update(context, 'u1', 'idp-1', { domains: ['taken.com'] })).rejects.toThrow(ConflictException);
    });

    it('JIT needs a role and at least one domain', async () => {
      await expect(service.update(context, 'u1', 'idp-1', { jitEnabled: true, jitRole: 'panel' })).rejects.toThrow(/domain/);
      await expect(service.update(context, 'u1', 'idp-1', { jitEnabled: true, domains: ['acme.com'] })).rejects.toThrow(/role/);
    });

    it('JIT never grants a role holding a sensitive permission', async () => {
      sso.jitRoleIsSafe.mockResolvedValue(false);
      await expect(service.update(context, 'u1', 'idp-1', { jitEnabled: true, jitRole: 'recruiter', domains: ['acme.com'] })).rejects.toThrow(
        BadRequestException,
      );
      expect(sso.jitRoleIsSafe).toHaveBeenCalledWith(ORG, 'recruiter');
      expect(tx.identityProvider.update).not.toHaveBeenCalled();
    });
  });

  describe('SSO-only (YX-IAM-04)', () => {
    it('the last active provider cannot be switched off or removed while SSO-only is on', async () => {
      tx.tenantSecurityPolicy.findUnique.mockResolvedValue({ organizationId: ORG, ssoOnly: true, breakGlassUserIds: ['a', 'b'] });
      tx.identityProvider.findFirst.mockResolvedValue(
        stored({ status: 'active', samlEntityId: 'e', samlSsoUrl: 'https://idp.test/sso', samlCertificate: cert }),
      );

      await expect(service.update(context, 'u1', 'idp-1', { status: 'disabled' })).rejects.toThrow(/SSO-only/);
      await expect(service.remove(context, 'u1', 'idp-1')).rejects.toThrow(/SSO-only/);
      expect(tx.identityProvider.delete).not.toHaveBeenCalled();

      tx.identityProvider.count.mockResolvedValue(1); // another provider is active
      await service.remove(context, 'u1', 'idp-1');
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'identity_provider.deleted' }));
    });
  });

  // Regression (YX-IAM-05): disabling or deleting a provider -- e.g. a rogue one -- left every
  // session it had signed in alive for up to 12 h, rotating through /auth/refresh.
  describe('ending the sessions a provider signed in', () => {
    const active = () => stored({ status: 'active', samlEntityId: 'e', samlSsoUrl: 'https://idp.test/sso', samlCertificate: cert });
    const revokedBy = (reason: string) => ({
      where: { identityProviderId: 'idp-1', revokedAt: null },
      data: { revokedAt: expect.any(Date), revokedReason: reason },
    });

    it('switching it off revokes its sessions and audits how many', async () => {
      tx.identityProvider.findFirst.mockResolvedValue(active());
      await service.update(context, 'u1', 'idp-1', { status: 'disabled' });
      expect(tx.session.updateMany).toHaveBeenCalledWith(revokedBy('identity_provider_disabled'));
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ metadata: expect.objectContaining({ sessionsRevoked: 2 }) }));
    });

    it('deleting it revokes its sessions before the row (and the link) goes', async () => {
      tx.identityProvider.findFirst.mockResolvedValue(active());
      const order: string[] = [];
      tx.session.updateMany.mockImplementation(async () => (order.push('revoke'), { count: 1 }));
      tx.identityProvider.delete.mockImplementation(async () => order.push('delete'));
      await service.remove(context, 'u1', 'idp-1');
      expect(tx.session.updateMany).toHaveBeenCalledWith(revokedBy('identity_provider_removed'));
      expect(order).toEqual(['revoke', 'delete']);
    });

    it('other edits of an active provider leave its sessions alone', async () => {
      tx.identityProvider.findFirst.mockResolvedValue(active());
      await service.update(context, 'u1', 'idp-1', { name: 'Renamed' });
      expect(tx.session.updateMany).not.toHaveBeenCalled();
    });
  });

  it('trusting a provider for MFA is an audited setting, off by default', async () => {
    await service.create(context, 'u1', { type: 'saml', name: 'Okta' } as any);
    expect(tx.identityProvider.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ mfaTrusted: false }) }));
    await service.update(context, 'u1', 'idp-1', { mfaTrusted: true });
    expect(tx.identityProvider.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ mfaTrusted: true }) }));
    expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ metadata: expect.objectContaining({ changed: ['mfaTrusted'] }) }));
  });

  it('another company\'s provider is not found (RLS hides it)', async () => {
    tx.identityProvider.findFirst.mockResolvedValue(null);
    await expect(service.update(context, 'u1', 'other', { name: 'x' })).rejects.toThrow(NotFoundException);
    await expect(service.remove(context, 'u1', 'other')).rejects.toThrow(NotFoundException);
  });

  describe('domain ownership (email-first routing)', () => {
    const value = () => service.verificationValue(ORG, 'kaverifoods.in');

    it('a public mail domain can never be mapped to a provider', async () => {
      for (const domain of ['gmail.com', 'outlook.com', 'yahoo.co.in', 'yahoo.fr', 'rediffmail.com']) {
        await expect(service.update(context, 'u1', 'idp-1', { domains: ['kaverifoods.in', domain] })).rejects.toThrow(/public email domain/);
      }
      expect(tx.identityProviderDomain.createMany).not.toHaveBeenCalled();
    });

    it('verifies a mapped domain only when its TXT record carries this company\'s value', async () => {
      tx.identityProviderDomain.findUnique.mockResolvedValue({ organizationId: ORG, domain: 'kaverifoods.in' });
      resolveTxt.mockResolvedValueOnce([['v=spf1 -all'], ['yukthix-domain-verification=someone-else']]);
      await expect(service.verifyDomain(context, 'u1', 'kaverifoods.in')).rejects.toThrow(/No TXT record/);
      expect(tx.verifiedDomain.upsert).not.toHaveBeenCalled();

      // TXT strings longer than 255 bytes arrive in chunks; they are joined before comparing.
      const v = value();
      resolveTxt.mockResolvedValueOnce([[v.slice(0, 10), v.slice(10)]]);
      await expect(service.verifyDomain(context, 'u1', 'kaverifoods.in')).resolves.toEqual({ domain: 'kaverifoods.in', verifiedAt: expect.any(Date) });
      expect(resolveTxt).toHaveBeenLastCalledWith('kaverifoods.in');
      expect(tx.verifiedDomain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ organizationId: ORG, domain: 'kaverifoods.in' }),
          // Also how a lapsed domain comes back.
          update: expect.objectContaining({ failedChecks: 0, lapsedAt: null }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'identity_provider.domain_verified', metadata: { domain: 'kaverifoods.in' } }));
      expect(sessions.notifyAdmins).toHaveBeenCalled();
    });

    it('the value differs per company and per domain (no company can reuse another\'s record)', () => {
      expect(service.verificationValue(ORG, 'kaverifoods.in')).not.toBe(service.verificationValue('org-2', 'kaverifoods.in'));
      expect(service.verificationValue(ORG, 'kaverifoods.in')).not.toBe(service.verificationValue(ORG, 'kaveri.in'));
      expect(value()).toMatch(/^yukthix-domain-verification=.{32}$/);
    });

    it('refuses a domain the company has not mapped, a public domain, and a failed lookup', async () => {
      await expect(service.verifyDomain(context, 'u1', 'kaverifoods.in')).rejects.toThrow(NotFoundException);
      await expect(service.verifyDomain(context, 'u1', 'gmail.com')).rejects.toThrow(/public email domain/);
      tx.identityProviderDomain.findUnique.mockResolvedValue({ organizationId: ORG, domain: 'kaverifoods.in' });
      resolveTxt.mockRejectedValueOnce(Object.assign(new Error('queryTxt ENOTFOUND'), { code: 'ENOTFOUND' }));
      await expect(service.verifyDomain(context, 'u1', 'kaverifoods.in')).rejects.toThrow(BadRequestException);
      expect(resolveTxt).toHaveBeenCalledTimes(1);
    });

    it('lists each mapped domain with its status and record', async () => {
      tx.identityProviderDomain.findMany.mockResolvedValue([{ domain: 'kaveri.in' }, { domain: 'kaverifoods.in' }]);
      tx.verifiedDomain.findMany.mockResolvedValue([
        { domain: 'kaverifoods.in', verifiedAt: new Date('2026-10-01T00:00:00Z'), lapsedAt: null },
        { domain: 'kaveri.in', verifiedAt: new Date('2026-09-01T00:00:00Z'), lapsedAt: new Date('2026-10-05T00:00:00Z') },
      ]);
      await expect(service.domains(context)).resolves.toEqual([
        // Lapsed: not verified any more, and says since when.
        { domain: 'kaveri.in', verifiedAt: null, lapsedAt: new Date('2026-10-05T00:00:00Z'), txtRecord: { name: 'kaveri.in', value: service.verificationValue(ORG, 'kaveri.in') } },
        { domain: 'kaverifoods.in', verifiedAt: new Date('2026-10-01T00:00:00Z'), lapsedAt: null, txtRecord: { name: 'kaverifoods.in', value: value() } },
      ]);
    });

    it('a domain taken off every provider loses its verification', async () => {
      tx.identityProviderDomain.findMany.mockResolvedValue([{ domain: 'kaveri.in' }]);
      await service.update(context, 'u1', 'idp-1', { domains: ['kaveri.in'] });
      expect(tx.verifiedDomain.deleteMany).toHaveBeenCalledWith({ where: { organizationId: ORG, domain: { notIn: ['kaveri.in'] } } });
      await service.remove(context, 'u1', 'idp-1');
      expect(tx.verifiedDomain.deleteMany).toHaveBeenCalledTimes(2);
    });
  });

  // W-006: verified domains are re-checked on a schedule.
  describe('scheduled re-check of verified domains', () => {
    const dnsError = (code: string) => Object.assign(new Error(`queryTxt ${code}`), { code });
    const VERIFIED_AT = new Date('2026-09-01T00:00:00Z');
    const row = (failedChecks: number) => ({ organizationId: ORG, domain: 'kaverifoods.in', verifiedAt: VERIFIED_AT, failedChecks });

    it('a look-up is found, a real miss, or unknown when DNS could not answer', async () => {
      const expected = 'yukthix-domain-verification=x';
      const resolver = jest.fn();
      resolver.mockResolvedValueOnce([['yukthix-domain-', 'verification=x']]);
      await expect(checkTxt(resolver, 'a.test', expected)).resolves.toBe('found');
      resolver.mockResolvedValueOnce([['v=spf1 -all'], ['yukthix-domain-verification=other']]);
      await expect(checkTxt(resolver, 'a.test', expected)).resolves.toBe('missing');
      for (const code of ['ENODATA', 'ENOTFOUND']) {
        resolver.mockRejectedValueOnce(dnsError(code));
        await expect(checkTxt(resolver, 'a.test', expected)).resolves.toBe('missing');
      }
      for (const code of ['ETIMEOUT', 'ESERVFAIL', 'ECONNREFUSED', 'EREFUSED']) {
        resolver.mockRejectedValueOnce(dnsError(code));
        await expect(checkTxt(resolver, 'a.test', expected)).resolves.toBe('unknown');
      }
      resolver.mockRejectedValueOnce(new Error('boom'));
      await expect(checkTxt(resolver, 'a.test', expected)).resolves.toBe('unknown');
    });

    it('counts consecutive real misses only: a find resets, a transient error leaves the count, the limit lapses', () => {
      expect(afterRecheck(0, 'missing', 3)).toEqual({ failedChecks: 1, lapse: false });
      expect(afterRecheck(1, 'unknown', 3)).toEqual({ failedChecks: 1, lapse: false });
      expect(afterRecheck(1, 'missing', 3)).toEqual({ failedChecks: 2, lapse: false });
      expect(afterRecheck(2, 'found', 3)).toEqual({ failedChecks: 0, lapse: false });
      expect(afterRecheck(2, 'missing', 3)).toEqual({ failedChecks: 3, lapse: true });
      expect(afterRecheck(0, 'missing', 1)).toEqual({ failedChecks: 1, lapse: true });
    });

    it('the limit is configurable, 3 by default, never below 1', () => {
      expect(domainRecheckMaxFailures(undefined)).toBe(3);
      expect(domainRecheckMaxFailures('5')).toBe(5);
      for (const bad of ['0', '-2', '1.5', 'x', '']) expect(domainRecheckMaxFailures(bad)).toBe(3);
    });

    it('records each answered check; the third miss in a row lapses the domain, audits it and tells the admins', async () => {
      tx.verifiedDomain.updateMany = jest.fn().mockResolvedValue({ count: 1 });
      tx.verifiedDomain.findMany.mockResolvedValue([row(2)]);
      resolveTxt.mockRejectedValueOnce(dnsError('ENODATA'));
      await expect(service.recheckDomains()).resolves.toEqual({ checked: 1, lapsed: 1 });
      expect(tx.verifiedDomain.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { lapsedAt: null } }));
      expect(tx.verifiedDomain.updateMany).toHaveBeenCalledWith({
        where: { organizationId: ORG, domain: 'kaverifoods.in', verifiedAt: VERIFIED_AT, failedChecks: 2, lapsedAt: null },
        data: { lastCheckedAt: expect.any(Date), failedChecks: 3, lapsedAt: expect.any(Date) },
      });
      expect(audit.record).toHaveBeenCalledWith(context, {
        actorUserId: null,
        action: 'identity_provider.domain_lapsed',
        entityType: 'organization',
        entityId: ORG,
        metadata: { domain: 'kaverifoods.in', failedChecks: 3 },
      });
      expect(sessions.notifyAdmins).toHaveBeenCalledWith(ORG, expect.stringContaining('lapsed'), expect.stringContaining('kaverifoods.in'));
    });

    it('a transient DNS error changes nothing; a found record clears earlier misses', async () => {
      tx.verifiedDomain.updateMany = jest.fn().mockResolvedValue({ count: 1 });
      tx.verifiedDomain.findMany.mockResolvedValue([row(2)]);
      resolveTxt.mockRejectedValueOnce(dnsError('ETIMEOUT'));
      await expect(service.recheckDomains()).resolves.toEqual({ checked: 0, lapsed: 0 });
      expect(tx.verifiedDomain.updateMany).not.toHaveBeenCalled();

      resolveTxt.mockResolvedValueOnce([[service.verificationValue(ORG, 'kaverifoods.in')]]);
      await expect(service.recheckDomains()).resolves.toEqual({ checked: 1, lapsed: 0 });
      expect(tx.verifiedDomain.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { lastCheckedAt: expect.any(Date), failedChecks: 0 } }));
      expect(audit.record).not.toHaveBeenCalled();
      expect(sessions.notifyAdmins).not.toHaveBeenCalled();
    });

    it('one domain failing does not stop the others', async () => {
      tx.verifiedDomain.updateMany = jest.fn().mockRejectedValueOnce(new Error('db down')).mockResolvedValue({ count: 1 });
      tx.verifiedDomain.findMany.mockResolvedValue([row(0), { ...row(0), domain: 'kaveri.in' }]);
      await expect(service.recheckDomains()).resolves.toEqual({ checked: 1, lapsed: 0 });
      expect(tx.verifiedDomain.updateMany).toHaveBeenCalledTimes(2);
    });

    it('an admin re-verifying while the check runs wins: no lapse, no alert', async () => {
      tx.verifiedDomain.updateMany = jest.fn().mockResolvedValue({ count: 0 });
      tx.verifiedDomain.findMany.mockResolvedValue([row(2)]);
      await expect(service.recheckDomains()).resolves.toEqual({ checked: 1, lapsed: 0 });
      expect(audit.record).not.toHaveBeenCalled();
      expect(sessions.notifyAdmins).not.toHaveBeenCalled();
    });
  });

  it('needs an organisation context', async () => {
    await expect(service.list({ organizationId: null, isSuperAdmin: true })).rejects.toThrow(BadRequestException);
  });
});

// Regression: a settings-only admin (a custom profile with org:manage_settings but not
// org:manage_users) could add an IdP and use it to sign in as other people.
describe('IdentityProvidersController permissions', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { IdentityProvidersController } = require('./identity-providers.controller');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PERMISSIONS_KEY } = require('../rbac/permissions.decorator');
  it.each(['create', 'update', 'remove', 'verifyDomain'])('%s needs both org:manage_settings and org:manage_users', (method) => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, IdentityProvidersController.prototype[method])).toEqual(['org:manage_settings', 'org:manage_users']);
  });
});
