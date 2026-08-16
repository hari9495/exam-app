import { authCookieSecure, INSECURE_COOKIES_ENV } from './auth-cookie';

describe('authCookieSecure', () => {
  const saved = process.env[INSECURE_COOKIES_ENV];
  const savedNodeEnv = process.env.NODE_ENV;
  afterEach(() => {
    if (saved === undefined) delete process.env[INSECURE_COOKIES_ENV];
    else process.env[INSECURE_COOKIES_ENV] = saved;
    if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = savedNodeEnv;
  });

  it('is secure by default -- the platform is HTTPS-only', () => {
    delete process.env[INSECURE_COOKIES_ENV];
    expect(authCookieSecure()).toBe(true);
  });

  it('does not depend on NODE_ENV, which is unset in production', () => {
    // The previous candidate-cookie guard was `NODE_ENV === 'production'`. NODE_ENV is not
    // set on the production VM, so that guard evaluated false there and the cookie shipped
    // without Secure. This pins that the flag cannot regress to depending on it.
    delete process.env[INSECURE_COOKIES_ENV];
    delete process.env.NODE_ENV;
    expect(authCookieSecure()).toBe(true);
    process.env.NODE_ENV = 'development';
    expect(authCookieSecure()).toBe(true);
  });

  it('can be explicitly opted OUT for local http development', () => {
    process.env[INSECURE_COOKIES_ENV] = 'true';
    expect(authCookieSecure()).toBe(false);
  });

  it('opts out only on the exact string "true" -- a stray truthy value stays secure', () => {
    // Fail-safe direction: a typo in a local .env must not weaken production.
    process.env[INSECURE_COOKIES_ENV] = '1';
    expect(authCookieSecure()).toBe(true);
    process.env[INSECURE_COOKIES_ENV] = 'yes';
    expect(authCookieSecure()).toBe(true);
  });
});
