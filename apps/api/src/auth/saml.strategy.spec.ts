import { SamlStrategy } from './saml.strategy';

describe('SamlStrategy', () => {
  let prisma: { organization: { findUnique: jest.Mock } };
  let tenantPrisma: { forTenant: jest.Mock };
  let strategy: SamlStrategy;

  beforeEach(() => {
    prisma = { organization: { findUnique: jest.fn() } };
    tenantPrisma = { forTenant: jest.fn() };
    strategy = new SamlStrategy(prisma as any, tenantPrisma as any, {} as any);
  });

  describe('resolveOrgSamlConfig', () => {
    it('builds SAML options from the org row when SSO is enabled', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        samlEnabled: true,
        samlIdpEntityId: 'https://idp.example.com/entity',
        samlIdpSsoUrl: 'https://idp.example.com/sso',
        samlIdpCertificate: '-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----',
      });

      const config = await strategy.resolveOrgSamlConfig('acme');

      expect(config).toEqual(
        expect.objectContaining({
          entryPoint: 'https://idp.example.com/sso',
          idpCert: '-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----',
          idpIssuer: 'https://idp.example.com/entity',
          validateInResponseTo: 'always',
          // Entra's default signs only the assertion, not the outer response
          // -- the assertion signature must be required, the response-level
          // one must not be (see resolveOrgSamlConfig).
          wantAssertionsSigned: true,
          wantAuthnResponseSigned: false,
        }),
      );
    });

    it('throws when the org has no slug match', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      await expect(strategy.resolveOrgSamlConfig('unknown-org')).rejects.toThrow();
    });

    it('throws when the org has not enabled SAML', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', samlEnabled: false });

      await expect(strategy.resolveOrgSamlConfig('acme')).rejects.toThrow();
    });
  });

  describe('validate', () => {
    it('resolves to the matching pre-provisioned user for the assertion email when the issuer matches', async () => {
      const req = { params: { organizationSlug: 'acme' } };
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', samlEnabled: true, samlIdpEntityId: 'https://idp.example.com/entity' });
      tenantPrisma.forTenant.mockResolvedValue({ id: 'user-1', email: 'alice@acme.test', role: 'recruiter', organizationId: 'org-1' });
      const done = jest.fn();

      await strategy.validate(req as any, { nameID: 'alice@acme.test', issuer: 'https://idp.example.com/entity' } as any, done);

      expect(tenantPrisma.forTenant).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: false },
        expect.any(Function),
      );
      expect(done).toHaveBeenCalledWith(null, { id: 'user-1', email: 'alice@acme.test', role: 'recruiter', organizationId: 'org-1' });
    });

    it('calls done with user:false and a not_provisioned info flag when no user matches', async () => {
      const req = { params: { organizationSlug: 'acme' } };
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', samlEnabled: true, samlIdpEntityId: 'https://idp.example.com/entity' });
      tenantPrisma.forTenant.mockResolvedValue(null);
      const done = jest.fn();

      await strategy.validate(req as any, { nameID: 'nobody@acme.test', issuer: 'https://idp.example.com/entity' } as any, done);

      expect(done).toHaveBeenCalledWith(null, false, { message: 'not_provisioned' });
    });

    // Regression test for the finding that samlIdpEntityId was collected and
    // required-to-enable but never actually checked against the SAML
    // response's Issuer -- see the comment above this check in validate().
    it('rejects the assertion when the profile issuer does not match the org-configured entity ID', async () => {
      const req = { params: { organizationSlug: 'acme' } };
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', samlEnabled: true, samlIdpEntityId: 'https://idp.example.com/entity' });
      const done = jest.fn();

      await strategy.validate(req as any, { nameID: 'alice@acme.test', issuer: 'https://attacker.example.com/entity' } as any, done);

      expect(done).toHaveBeenCalledWith(null, false, { message: 'issuer_mismatch' });
      expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
    });
  });

  describe('generateMetadata / resolveSpMetadataConfig', () => {
    it('builds SP metadata for an org that exists but has not enabled SSO yet (no IdP fields set)', async () => {
      // Regression test: SP metadata (this SP's own issuer + ACS callback
      // URL) must not require samlEnabled or any IdP field, since org-admins
      // need to hand this URL to their IdP admin BEFORE SSO can be fully
      // configured and enabled -- see the comment on generateMetadata().
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', samlEnabled: false, samlIdpEntityId: null, samlIdpSsoUrl: null, samlIdpCertificate: null });
      const req = { params: { organizationSlug: 'acme' } };
      const callback = jest.fn();

      strategy.generateMetadata(req as any, callback);
      await new Promise((resolve) => setImmediate(resolve));

      expect(callback).toHaveBeenCalledWith(null, expect.any(String));
      const metadataXml = callback.mock.calls[0][1] as string;
      expect(metadataXml).toContain('EntityDescriptor');
    });

    it('does not require onModuleInit to have run first', async () => {
      const callback = jest.fn();
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1' });

      strategy.generateMetadata({ params: { organizationSlug: 'acme' } } as any, callback);
      await new Promise((resolve) => setImmediate(resolve));

      expect(callback).toHaveBeenCalledWith(null, expect.any(String));
    });

    it('calls back with an error instead of throwing when the org does not exist', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);
      const callback = jest.fn();

      strategy.generateMetadata({ params: { organizationSlug: 'unknown-org' } } as any, callback);
      await new Promise((resolve) => setImmediate(resolve));

      expect(callback).toHaveBeenCalledWith(expect.any(Error));
    });
  });
});
