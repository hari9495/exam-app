import { MICROSOFT_CONSUMER_TENANT, MOCK_IDP_CLIENTS, isSocialProvider, mockIdpUrl, socialApp, socialIdentity, socialRedirectUri } from './social-sign-in';

const WORK = '6a1f2c3d-0000-4000-8000-00000000d3a0';
const claims = (c: Record<string, unknown>) => ({ iss: 'x', aud: 'y', iat: 0, exp: 0, sub: 's', ...c }) as never;

describe('socialIdentity', () => {
  describe('Google', () => {
    it('vouches for the address only when Google says it is verified', () => {
      expect(socialIdentity('google', claims({ sub: 'g1', email: ' Divya.R@KaveriFoods.in ', email_verified: true, name: 'Divya' }))).toEqual({
        subject: 'g1',
        email: 'divya.r@kaverifoods.in',
        domainEmail: null,
        name: 'Divya',
      });
      expect(socialIdentity('google', claims({ sub: 'g1', email: 'divya.r@kaverifoods.in', email_verified: false }))?.email).toBeNull();
      expect(socialIdentity('google', claims({ sub: 'g1', email: 'divya.r@kaverifoods.in', email_verified: 'true' }))?.email).toBeNull();
      expect(socialIdentity('google', claims({ sub: 'g1', email: 'not an address', email_verified: true }))?.email).toBeNull();
    });

    it('needs a subject', () => {
      expect(socialIdentity('google', claims({ sub: '' }))).toBeNull();
    });
  });

  describe('Microsoft', () => {
    it('subject is tid:oid, never the email', () => {
      expect(socialIdentity('microsoft', claims({ tid: WORK, oid: 'o1' }))?.subject).toBe(`${WORK}:o1`);
      expect(socialIdentity('microsoft', claims({ tid: WORK }))).toBeNull();
      expect(socialIdentity('microsoft', claims({ oid: 'o1' }))).toBeNull();
    });

    it('"nOAuth": the plain email claim is never trusted; only when Microsoft marks it verified (xms_edov)', () => {
      const spoofed = socialIdentity('microsoft', claims({ tid: WORK, oid: 'o1', email: 'ceo@kaverifoods.in', preferred_username: 'x@intruder.test' }));
      expect(spoofed?.email).toBeNull();
      expect(spoofed?.domainEmail).toBe('x@intruder.test');
      expect(socialIdentity('microsoft', claims({ tid: WORK, oid: 'o1', email: 'ceo@kaverifoods.in', xms_edov: 'true' }))?.email).toBeNull();
      expect(socialIdentity('microsoft', claims({ tid: WORK, oid: 'o1', email: 'CEO@kaverifoods.in', xms_edov: true }))?.email).toBe('ceo@kaverifoods.in');
    });

    it("a work account's sign-in name is offered only for the company-verified-domain rule; never for a personal account", () => {
      expect(socialIdentity('microsoft', claims({ tid: WORK, oid: 'o1', preferred_username: 'Divya.R@kaverifoods.in' }))?.domainEmail).toBe('divya.r@kaverifoods.in');
      expect(socialIdentity('microsoft', claims({ tid: MICROSOFT_CONSUMER_TENANT, oid: 'o1', preferred_username: 'divya.r@kaverifoods.in' }))?.domainEmail).toBeNull();
      expect(socialIdentity('microsoft', claims({ tid: MICROSOFT_CONSUMER_TENANT.toUpperCase(), oid: 'o1', preferred_username: 'divya.r@kaverifoods.in' }))?.domainEmail).toBeNull();
    });
  });
});

describe('socialApp / mockIdpUrl (configuration)', () => {
  it('is off (buttons hidden) until both the client id and secret are set', () => {
    expect(socialApp('google', {})).toBeNull();
    expect(socialApp('google', { YX_GOOGLE_CLIENT_ID: 'id' })).toBeNull();
    expect(socialApp('google', { YX_GOOGLE_CLIENT_ID: 'id', YX_GOOGLE_CLIENT_SECRET: ' s ' })).toEqual({ issuer: 'https://accounts.google.com', clientId: 'id', clientSecret: 's' });
    expect(socialApp('microsoft', { YX_MICROSOFT_CLIENT_ID: 'id', YX_MICROSOFT_CLIENT_SECRET: 's' })).toEqual({
      issuer: 'https://login.microsoftonline.com/common/v2.0',
      clientId: 'id',
      clientSecret: 's',
    });
  });

  it('the local mock replaces both, outside production only and on a loopback address only', () => {
    const env = { YX_MOCK_IDP_URL: 'http://127.0.0.1:4010/', NODE_ENV: 'development' };
    expect(socialApp('microsoft', env)).toEqual({ issuer: 'http://127.0.0.1:4010/microsoft', ...MOCK_IDP_CLIENTS.microsoft });
    expect(() => mockIdpUrl({ YX_MOCK_IDP_URL: 'http://127.0.0.1:4010', NODE_ENV: 'production' })).toThrow(/development and tests only/);
    expect(() => socialApp('google', { YX_MOCK_IDP_URL: 'http://127.0.0.1:4010', NODE_ENV: 'production', YX_GOOGLE_CLIENT_ID: 'a', YX_GOOGLE_CLIENT_SECRET: 'b' })).toThrow();
    expect(() => mockIdpUrl({ YX_MOCK_IDP_URL: 'https://idp.example.com' })).toThrow(/loopback/);
    expect(mockIdpUrl({})).toBeNull();
  });

  it('one redirect URI per provider; only the two providers exist', () => {
    const saved = process.env.API_ORIGIN;
    process.env.API_ORIGIN = 'https://api.example.com';
    try {
      expect(socialRedirectUri('google')).toBe('https://api.example.com/api/v1/auth/social/google/callback');
      expect(socialRedirectUri('microsoft')).toBe('https://api.example.com/api/v1/auth/social/microsoft/callback');
    } finally {
      if (saved === undefined) delete process.env.API_ORIGIN;
      else process.env.API_ORIGIN = saved;
    }
    expect(isSocialProvider('google')).toBe(true);
    expect(isSocialProvider('github')).toBe(false);
    expect(isSocialProvider('oidc')).toBe(false);
  });
});
