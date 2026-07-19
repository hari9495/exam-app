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
          validateInResponseTo: 'always',
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
    it('resolves to the matching pre-provisioned user for the assertion email', async () => {
      const req = { params: { organizationSlug: 'acme' } };
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', samlEnabled: true });
      tenantPrisma.forTenant.mockResolvedValue({ id: 'user-1', email: 'alice@acme.test', role: 'recruiter', organizationId: 'org-1' });
      const done = jest.fn();

      await strategy.validate(req as any, { nameID: 'alice@acme.test' } as any, done);

      expect(tenantPrisma.forTenant).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: false },
        expect.any(Function),
      );
      expect(done).toHaveBeenCalledWith(null, { id: 'user-1', email: 'alice@acme.test', role: 'recruiter', organizationId: 'org-1' });
    });

    it('calls done with user:false and a not_provisioned info flag when no user matches', async () => {
      const req = { params: { organizationSlug: 'acme' } };
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', samlEnabled: true });
      tenantPrisma.forTenant.mockResolvedValue(null);
      const done = jest.fn();

      await strategy.validate(req as any, { nameID: 'nobody@acme.test' } as any, done);

      expect(done).toHaveBeenCalledWith(null, false, { message: 'not_provisioned' });
    });
  });
});
