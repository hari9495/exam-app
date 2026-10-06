import { SamlStrategy } from './saml.strategy';

describe('SamlStrategy', () => {
  let prisma: { organization: { findUnique: jest.Mock } };
  let sso: { organizationBySlug: jest.Mock; activeProviders: jest.Mock; resolveUser: jest.Mock };
  let strategy: SamlStrategy;

  // A company's SAML identity provider (P12 Part 1e: several per company, on identity_providers).
  const samlProvider = (over: Record<string, unknown> = {}) => ({
    id: 'idp-1',
    organizationId: 'org-1',
    type: 'saml',
    status: 'active',
    samlEntityId: 'https://idp.example.com/entity',
    samlSsoUrl: 'https://idp.example.com/sso',
    samlCertificate: '-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----',
    mfaClaimValues: [],
    domains: [],
    ...over,
  });
  const enabled = (...providers: unknown[]) => {
    sso.organizationBySlug.mockResolvedValue({ id: 'org-1', slug: 'acme', status: 'active' });
    sso.activeProviders.mockResolvedValue(providers.length ? providers : [samlProvider()]);
  };

  beforeEach(() => {
    prisma = { organization: { findUnique: jest.fn() } };
    sso = { organizationBySlug: jest.fn().mockResolvedValue(null), activeProviders: jest.fn().mockResolvedValue([]), resolveUser: jest.fn() };
    strategy = new SamlStrategy(prisma as any, sso as any, {} as any);
  });

  describe('resolveOrgSamlConfig', () => {
    it('does not demand a password-based authentication context, so passkeys and MFA work', async () => {
      // node-saml otherwise sends RequestedAuthnContext =
      // PasswordProtectedTransport with Comparison="exact", and Entra rejects
      // anyone who signed in with a passkey / Windows Hello / MFA:
      //   AADSTS75011: Authentication method 'MultiFactor, Fido' ... doesn't
      //   match requested authentication method 'Password, ProtectedTransport'
      // Password login worked, stronger credentials did not.
      enabled();

      const config = await strategy.resolveOrgSamlConfig('acme');

      expect(config.disableRequestedAuthnContext).toBe(true);
      // and we must not reintroduce the demand by another name
      expect(config.authnContext).toBeUndefined();
    });

    it('still requires the assertion to be signed while relaxing the auth context', async () => {
      // Relaxing HOW the IdP authenticates must not relax whether we trust the
      // response. The signature and issuer checks are the security boundary.
      enabled();

      const config = await strategy.resolveOrgSamlConfig('acme');

      expect(config.wantAssertionsSigned).toBe(true);
      expect(config.validateInResponseTo).toBe('always');
    });

    it('builds SAML options from the company active SAML provider', async () => {
      enabled();

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
      await expect(strategy.resolveOrgSamlConfig('unknown-org')).rejects.toThrow();
    });

    it('throws when the org has no active SAML provider', async () => {
      sso.organizationBySlug.mockResolvedValue({ id: 'org-1', slug: 'acme', status: 'active' });
      sso.activeProviders.mockResolvedValue([samlProvider({ type: 'oidc_google' })]);

      await expect(strategy.resolveOrgSamlConfig('acme')).rejects.toThrow();
    });

    it('several SAML providers: RelayState picks one of the company own; without it none is guessed', async () => {
      enabled(samlProvider(), samlProvider({ id: 'idp-2', samlSsoUrl: 'https://second.example.com/sso' }));

      await expect(strategy.resolveOrgSamlConfig('acme', 'idp-2')).resolves.toEqual(expect.objectContaining({ entryPoint: 'https://second.example.com/sso' }));
      await expect(strategy.resolveOrgSamlConfig('acme')).rejects.toThrow();
      // Another company's provider id is simply not among this company's providers.
      await expect(strategy.resolveOrgSamlConfig('acme', 'idp-of-another-company')).rejects.toThrow();
    });
  });

  describe('validate', () => {
    it('resolves the account the provider vouches for when the issuer matches (AAL1 without an MFA context)', async () => {
      const req = { params: { organizationSlug: 'acme' } };
      enabled();
      sso.resolveUser.mockResolvedValue({ user: { id: 'user-1', email: 'alice@acme.test', role: 'recruiter', organizationId: 'org-1' } });
      const done = jest.fn();

      await strategy.validate(req as any, { nameID: 'alice@acme.test', issuer: 'https://idp.example.com/entity' } as any, done);

      expect(sso.resolveUser).toHaveBeenCalledWith(expect.objectContaining({ id: 'idp-1' }), 'alice@acme.test', undefined);
      expect(done).toHaveBeenCalledWith(null, { id: 'user-1', email: 'alice@acme.test', role: 'recruiter', organizationId: 'org-1', mfaAsserted: false });
    });

    it('flags IdP-asserted MFA from the AuthnContextClassRef', async () => {
      enabled();
      sso.resolveUser.mockResolvedValue({ user: { id: 'user-1', email: 'alice@acme.test', role: 'recruiter', organizationId: 'org-1' } });
      const done = jest.fn();
      const profile = {
        nameID: 'alice@acme.test',
        issuer: 'https://idp.example.com/entity',
        getAssertion: () => ({ Assertion: { AuthnStatement: [{ AuthnContext: [{ AuthnContextClassRef: ['http://schemas.microsoft.com/claims/multipleauthn'] }] }] } }),
      };

      await strategy.validate({ params: { organizationSlug: 'acme' } } as any, profile as any, done);

      expect(done).toHaveBeenCalledWith(null, expect.objectContaining({ mfaAsserted: true }));
    });

    it('calls done with user:false and the reason when no account is resolved', async () => {
      const req = { params: { organizationSlug: 'acme' } };
      enabled();
      sso.resolveUser.mockResolvedValue({ reason: 'not_provisioned' });
      const done = jest.fn();

      await strategy.validate(req as any, { nameID: 'nobody@acme.test', issuer: 'https://idp.example.com/entity' } as any, done);

      expect(done).toHaveBeenCalledWith(null, false, { message: 'not_provisioned' });
    });

    // Regression test for the finding that the entity ID was collected and
    // required-to-enable but never actually checked against the SAML
    // response's Issuer -- see the comment above this check in validate().
    it('rejects the assertion when the profile issuer does not match the provider entity ID', async () => {
      const req = { params: { organizationSlug: 'acme' } };
      enabled();
      const done = jest.fn();

      await strategy.validate(req as any, { nameID: 'alice@acme.test', issuer: 'https://attacker.example.com/entity' } as any, done);

      expect(done).toHaveBeenCalledWith(null, false, { message: 'issuer_mismatch' });
      expect(sso.resolveUser).not.toHaveBeenCalled();
    });

    it('a response is checked against the provider RelayState names, never another one', async () => {
      enabled(samlProvider(), samlProvider({ id: 'idp-2', samlEntityId: 'https://second.example.com/entity' }));
      const done = jest.fn();

      await strategy.validate(
        { params: { organizationSlug: 'acme' }, body: { RelayState: 'idp-2' } } as any,
        { nameID: 'alice@acme.test', issuer: 'https://idp.example.com/entity' } as any,
        done,
      );

      expect(done).toHaveBeenCalledWith(null, false, { message: 'issuer_mismatch' });
    });
  });

  describe('generateMetadata / resolveSpMetadataConfig', () => {
    it('builds SP metadata for an org that exists but has not enabled SSO yet (no IdP fields set)', async () => {
      // Regression test: SP metadata (this SP's own issuer + ACS callback
      // URL) must not require an active identity provider, since org-admins
      // need to hand this URL to their IdP admin BEFORE SSO can be fully
      // configured and enabled -- see the comment on generateMetadata().
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1' });
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
