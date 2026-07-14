import { decodeJwtPayload } from './jwt';
import { fakeJwt } from './test-utils/fake-jwt';

describe('decodeJwtPayload', () => {
  it('decodes a well-formed JWT payload', () => {
    const token = fakeJwt({ sub: 'u1', organizationId: 'org1', role: 'org_admin' });
    expect(decodeJwtPayload(token)).toEqual({ sub: 'u1', organizationId: 'org1', role: 'org_admin' });
  });

  it('returns null for a malformed token', () => {
    expect(decodeJwtPayload('not-a-jwt')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(decodeJwtPayload('')).toBeNull();
  });
});
