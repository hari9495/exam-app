import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { generate } from 'selfsigned';
import { invalidateTenantSecurityPolicy } from '@exam-platform/shared';
import { IdentityProvidersService } from './identity-providers.service';

// Ported from the former organizations SSO settings tests (single SAML config on the org row) and
// extended to several providers per company (YX-IAM-04/05).
describe('IdentityProvidersService', () => {
  const ORG = 'org-1';
  const context = { organizationId: ORG, isSuperAdmin: false };
  let tx: any;
  let audit: { record: jest.Mock };
  let crypto: { encrypt: jest.Mock };
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
      identityProviderDomain: { deleteMany: jest.fn(), createMany: jest.fn() },
      tenantSecurityPolicy: { findUnique: jest.fn().mockResolvedValue(null) },
      session: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    const tenantPrisma = { forTenant: jest.fn((_ctx, fn) => fn(tx)) };
    audit = { record: jest.fn() };
    crypto = { encrypt: jest.fn((value: string) => `enc(${value})`) };
    sso = { jitRoleIsSafe: jest.fn().mockResolvedValue(true) };
    oidc = { checkIssuer: jest.fn().mockResolvedValue(undefined) };
    sessions = { notifyAdmins: jest.fn() };
    service = new IdentityProvidersService(tenantPrisma as any, audit as any, crypto as any, sso as any, oidc as any, sessions as any);
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
  it.each(['create', 'update', 'remove'])('%s needs both org:manage_settings and org:manage_users', (method) => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, IdentityProvidersController.prototype[method])).toEqual(['org:manage_settings', 'org:manage_users']);
  });
});
