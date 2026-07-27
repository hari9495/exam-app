import type { INestApplication } from '@nestjs/common';
import { configureTrustProxy } from './trust-proxy';

function fakeApp(): { app: INestApplication; set: jest.Mock } {
  const set = jest.fn();
  const app = { getHttpAdapter: () => ({ getInstance: () => ({ set }) }) } as unknown as INestApplication;
  return { app, set };
}

describe('configureTrustProxy', () => {
  const original = process.env.TRUST_PROXY;
  afterEach(() => {
    if (original === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = original;
  });

  it('does nothing unless TRUST_PROXY is explicitly true', () => {
    for (const value of [undefined, '', 'false', '1', 'yes', 'TRUE']) {
      const { app, set } = fakeApp();
      if (value === undefined) delete process.env.TRUST_PROXY;
      else process.env.TRUST_PROXY = value;
      configureTrustProxy(app);
      expect(set).not.toHaveBeenCalled();
    }
  });

  it('trusts exactly one hop when enabled', () => {
    process.env.TRUST_PROXY = 'true';
    const { app, set } = fakeApp();
    configureTrustProxy(app);
    expect(set).toHaveBeenCalledWith('trust proxy', 1);
  });

  // Not a style preference. `true` trusts the whole X-Forwarded-For chain, so
  // Express returns the left-most entry -- which, because nginx APPENDS the real
  // peer rather than replacing the header, is whatever the client forged. 1
  // trusts a single hop and yields the entry nginx itself added. Using `true`
  // here would silently reopen the spoofing hole. See ADO #6820.
  it('never trusts the whole chain', () => {
    process.env.TRUST_PROXY = 'true';
    const { app, set } = fakeApp();
    configureTrustProxy(app);
    expect(set).not.toHaveBeenCalledWith('trust proxy', true);
  });
});
