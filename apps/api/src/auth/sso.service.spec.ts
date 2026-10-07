import { SsoService, oidcEmail, oidcMfaAsserted, samlMfaAsserted } from './sso.service';

const ENTRA_TID = '0a1b2c3d-0000-4000-8000-000000000001';

describe('oidcEmail: which address an ID token vouches for (YX-IAM-04)', () => {
  const google = { type: 'oidc_google', entraTenantId: null };
  const entra = { type: 'oidc_entra', entraTenantId: ENTRA_TID };
  const generic = { type: 'oidc_generic', entraTenantId: null };

  it('Google: verified and inside the Workspace domain (hd) only', () => {
    expect(oidcEmail(google, { email: 'Ana@Acme.com', email_verified: true, hd: 'acme.com' } as any)).toBe('ana@acme.com');
    // A personal Google account registered with a work address has no hd.
    expect(oidcEmail(google, { email: 'ana@acme.com', email_verified: true } as any)).toBeNull();
    expect(oidcEmail(google, { email: 'ana@acme.com', email_verified: true, hd: 'other.com' } as any)).toBeNull();
    expect(oidcEmail(google, { email: 'ana@acme.com', email_verified: false, hd: 'acme.com' } as any)).toBeNull();
  });

  it('Entra: only the configured directory; the UPN, or email only when Entra verified it', () => {
    expect(oidcEmail(entra, { tid: ENTRA_TID, preferred_username: 'ana@acme.com', email: 'boss@victim.com' } as any)).toBe('ana@acme.com');
    expect(oidcEmail(entra, { tid: ENTRA_TID, preferred_username: 'x', email: 'ana@acme.com', xms_edov: true } as any)).toBe('ana@acme.com');
    // Another directory (multi-tenant app / nOAuth): refused whatever it claims.
    expect(oidcEmail(entra, { tid: '99999999-0000-4000-8000-000000000000', preferred_username: 'ana@acme.com' } as any)).toBeNull();
    expect(oidcEmail(entra, { tid: ENTRA_TID, preferred_username: '+911234567890' } as any)).toBeNull();
  });

  it('Generic: email_verified must be true', () => {
    expect(oidcEmail(generic, { email: 'ana@acme.com', email_verified: true } as any)).toBe('ana@acme.com');
    expect(oidcEmail(generic, { email: 'ana@acme.com' } as any)).toBeNull();
    expect(oidcEmail(generic, { email: 'ana@acme.com', email_verified: 'true' } as any)).toBeNull();
  });
});

describe('IdP-asserted MFA (P12 §3: SSO is AAL2 only where the IdP enforces MFA)', () => {
  it('OIDC: amr "mfa" or a known MFA acr; nothing else (a company cannot redefine MFA)', () => {
    expect(oidcMfaAsserted({ amr: ['pwd', 'mfa'] } as any)).toBe(true);
    expect(oidcMfaAsserted({ acr: 'https://refeds.org/profile/mfa' } as any)).toBe(true);
    expect(oidcMfaAsserted({ acr: 'urn:acme:mfa' } as any)).toBe(false);
    expect(oidcMfaAsserted({ amr: ['pwd'], acr: '1' } as any)).toBe(false);
    expect(oidcMfaAsserted({ amr: 'mfa' } as any)).toBe(false);
    expect(oidcMfaAsserted({} as any)).toBe(false);
  });

  it('SAML: AuthnContextClassRef (any xml2js shape) or Entra authnmethodsreferences', () => {
    const assertion = (ref: unknown) => ({ Assertion: { AuthnStatement: [{ AuthnContext: [{ AuthnContextClassRef: [ref] }] }] } });
    expect(samlMfaAsserted(assertion('http://schemas.microsoft.com/claims/multipleauthn'), {})).toBe(true);
    expect(samlMfaAsserted(assertion({ _: 'https://refeds.org/profile/mfa', $: { x: 'y' } }), {})).toBe(true);
    expect(samlMfaAsserted(assertion('urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport'), {})).toBe(false);
    expect(
      samlMfaAsserted(assertion('urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport'), {
        'http://schemas.microsoft.com/claims/authnmethodsreferences': ['http://schemas.microsoft.com/ws/2008/06/identity/authenticationmethod/password', 'http://schemas.microsoft.com/claims/multipleauthn'],
      }),
    ).toBe(true);
    // A value elsewhere in the assertion (e.g. an attribute named like it) is not the class ref.
    expect(samlMfaAsserted({ Assertion: { Subject: ['http://schemas.microsoft.com/claims/multipleauthn'] } }, {})).toBe(false);
    expect(samlMfaAsserted(null, {})).toBe(false);
  });
});

describe('SsoService.resolveUser (domains + JIT, YX-IAM-04/05)', () => {
  const ORG = 'org-1';
  let tx: any;
  let prisma: any;
  let audit: { record: jest.Mock };
  let service: SsoService;
  const provider = (over: Record<string, unknown> = {}) =>
    ({ id: 'idp-1', organizationId: ORG, type: 'oidc_generic', jitEnabled: false, jitRole: null, domains: [{ domain: 'acme.com' }], ...over }) as any;

  beforeEach(() => {
    tx = {
      identityProviderDomain: { findUnique: jest.fn().mockResolvedValue({ identityProviderId: 'idp-1' }) },
      user: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'new', email: 'ana@acme.com', role: 'panel', organizationId: ORG }) },
      orgRolePermission: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    prisma = { rolePermission: { findMany: jest.fn().mockResolvedValue([]) } };
    audit = { record: jest.fn() };
    service = new SsoService(prisma, { forTenant: jest.fn((_c, fn) => fn(tx)) } as any, audit as any);
  });

  it('signs in an existing account at one of the provider\'s domains', async () => {
    tx.user.findFirst.mockResolvedValue({ id: 'u1', email: 'ana@acme.com', role: 'org_admin', organizationId: ORG });
    await expect(service.resolveUser(provider(), 'Ana@Acme.com')).resolves.toEqual({ user: expect.objectContaining({ id: 'u1' }) });
  });

  it('refuses a domain mapped to another provider, and any domain outside a provider\'s list', async () => {
    tx.user.findFirst.mockResolvedValue({ id: 'u1' });
    tx.identityProviderDomain.findUnique.mockResolvedValue({ identityProviderId: 'idp-2' });
    await expect(service.resolveUser(provider(), 'ana@acme.com')).resolves.toEqual({ reason: 'domain_not_allowed' });
    // Even a provider with no domains (the pre-1e set-up) cannot speak for a mapped domain.
    await expect(service.resolveUser(provider({ domains: [] }), 'ana@acme.com')).resolves.toEqual({ reason: 'domain_not_allowed' });

    tx.identityProviderDomain.findUnique.mockResolvedValue(null);
    await expect(service.resolveUser(provider(), 'ana@evil.com')).resolves.toEqual({ reason: 'domain_not_allowed' });
  });

  // Regression: a provider with no domains used to vouch for EVERY existing account of the
  // company -- an admin with org:manage_settings could add their own issuer and sign in as an
  // org_admin or a break-glass account. A provider now speaks only for domains mapped to it.
  it('a provider with no domains vouches for nobody, not even an existing org admin', async () => {
    tx.user.findFirst.mockResolvedValue({ id: 'admin', email: 'boss@acme.com', role: 'org_admin', organizationId: ORG });
    tx.identityProviderDomain.findUnique.mockResolvedValue(null);
    await expect(service.resolveUser(provider({ id: 'rogue', domains: [] }), 'boss@acme.com')).resolves.toEqual({ reason: 'domain_not_allowed' });
    tx.identityProviderDomain.findUnique.mockResolvedValue({ identityProviderId: 'idp-1' });
    await expect(service.resolveUser(provider({ id: 'rogue', domains: [] }), 'boss@acme.com')).resolves.toEqual({ reason: 'domain_not_allowed' });
  });

  it('without JIT, an unknown account is not provisioned', async () => {
    await expect(service.resolveUser(provider(), 'new@acme.com')).resolves.toEqual({ reason: 'not_provisioned' });
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('JIT creates the account in the configured non-sensitive role, with an unusable password, and audits it', async () => {
    const result = await service.resolveUser(provider({ jitEnabled: true, jitRole: 'panel' }), 'new@acme.com', 'New Person');
    expect(result).toEqual({ user: expect.objectContaining({ id: 'new' }) });
    expect(tx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ organizationId: ORG, email: 'new@acme.com', name: 'New Person', role: 'panel' }) }),
    );
    expect(tx.user.create.mock.calls[0][0].data.passwordHash).toMatch(/^\$argon2/);
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'user.jit_provisioned' }));
  });

  it('JIT re-checks the role at provisioning: a role that gained a sensitive permission is refused', async () => {
    tx.orgRolePermission.findUnique.mockResolvedValue({ permissionsJson: JSON.stringify(['exam:view', 'org:manage_users']) });
    await expect(service.resolveUser(provider({ jitEnabled: true, jitRole: 'panel' }), 'new@acme.com')).resolves.toEqual({ reason: 'jit_role_sensitive' });
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('JIT never creates an admin, and never for a domain the provider does not own', async () => {
    await expect(service.resolveUser(provider({ jitEnabled: true, jitRole: 'org_admin' }), 'new@acme.com')).resolves.toEqual({ reason: 'jit_role_sensitive' });
    tx.identityProviderDomain.findUnique.mockResolvedValue(null);
    await expect(service.resolveUser(provider({ jitEnabled: true, jitRole: 'panel', domains: [] }), 'new@acme.com')).resolves.toEqual({
      reason: 'domain_not_allowed',
    });
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('two first sign-ins racing: the loser returns the account the winner created', async () => {
    tx.user.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));
    tx.user.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'winner' });
    await expect(service.resolveUser(provider({ jitEnabled: true, jitRole: 'panel' }), 'new@acme.com')).resolves.toEqual({ user: { id: 'winner' } });
  });

  it('refuses a value that is not an email', async () => {
    await expect(service.resolveUser(provider(), 'not-an-email')).resolves.toEqual({ reason: 'no_verified_email' });
  });
});

describe('SsoService.routeByVerifiedDomain (email-first, no company known)', () => {
  let tx: any;
  let prisma: any;
  let service: SsoService;
  const KAVERI = { id: 'org-kaveri', slug: 'kaveri-foods', status: 'active' };
  const okta = { id: 'idp-okta', organizationId: KAVERI.id, type: 'saml', status: 'active', domains: [{ domain: 'kaverifoods.in' }] };

  beforeEach(() => {
    tx = {
      verifiedDomain: { findMany: jest.fn().mockResolvedValue([{ organizationId: KAVERI.id }]) },
      identityProvider: { findMany: jest.fn().mockResolvedValue([okta]) },
    };
    prisma = { organization: { findUnique: jest.fn().mockResolvedValue(KAVERI) } };
    service = new SsoService(prisma, { forTenant: jest.fn((_c, fn) => fn(tx)) } as any, { record: jest.fn() } as any);
  });

  it('routes a domain exactly one company has verified and mapped to an active provider', async () => {
    await expect(service.routeByVerifiedDomain('Divya.R@KaveriFoods.in')).resolves.toEqual({ org: { id: KAVERI.id, slug: 'kaveri-foods' }, provider: okta });
    expect(tx.verifiedDomain.findMany).toHaveBeenCalledWith({ where: { domain: 'kaverifoods.in' }, select: { organizationId: true }, take: 2 });
  });

  it('never routes an unverified domain, a domain two companies verified, or a public mail domain', async () => {
    tx.verifiedDomain.findMany.mockResolvedValueOnce([]);
    await expect(service.routeByVerifiedDomain('divya.r@kaverifoods.in')).resolves.toBeNull();
    tx.verifiedDomain.findMany.mockResolvedValueOnce([{ organizationId: KAVERI.id }, { organizationId: 'org-other' }]);
    await expect(service.routeByVerifiedDomain('divya.r@kaverifoods.in')).resolves.toBeNull();
    tx.verifiedDomain.findMany.mockClear();
    for (const email of ['someone@gmail.com', 'someone@yahoo.co.in', 'someone@outlook.com']) {
      await expect(service.routeByVerifiedDomain(email)).resolves.toBeNull();
    }
    expect(tx.verifiedDomain.findMany).not.toHaveBeenCalled();
  });

  it('never routes to a suspended company, or when no active provider maps the domain any more', async () => {
    prisma.organization.findUnique.mockResolvedValueOnce({ ...KAVERI, status: 'suspended' });
    await expect(service.routeByVerifiedDomain('divya.r@kaverifoods.in')).resolves.toBeNull();
    tx.identityProvider.findMany.mockResolvedValueOnce([{ ...okta, domains: [{ domain: 'kaveri.in' }] }]);
    await expect(service.routeByVerifiedDomain('divya.r@kaverifoods.in')).resolves.toBeNull();
  });
});
