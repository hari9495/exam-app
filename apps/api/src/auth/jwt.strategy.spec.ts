import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy.validate', () => {
  let strategy: JwtStrategy;

  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = 'test-secret';
  });

  beforeEach(() => {
    strategy = new JwtStrategy();
  });

  it('passes impersonation claims through to the request user', () => {
    const user = strategy.validate({
      sub: 'target1', organizationId: 'org1', role: 'recruiter',
      impersonatorUserId: 'admin1', impersonatorEmail: 'admin@x.com',
    });
    expect(user).toEqual(expect.objectContaining({
      userId: 'target1', role: 'recruiter', impersonatorUserId: 'admin1', impersonatorEmail: 'admin@x.com',
    }));
  });

  it('leaves impersonation claims undefined for a normal token', () => {
    const user = strategy.validate({ sub: 'u1', organizationId: 'org1', role: 'org_admin' });
    expect(user.impersonatorUserId).toBeUndefined();
  });

  it('surfaces permissionProfileId on the request user', () => {
    const user = strategy.validate({
      sub: 'u1', organizationId: 'org1', role: 'recruiter', permissionProfileId: 'profile-1',
    });
    expect(user.permissionProfileId).toBe('profile-1');
  });

  it('defaults permissionProfileId to null for an old token minted before the claim existed', () => {
    const user = strategy.validate({ sub: 'u1', organizationId: 'org1', role: 'recruiter' });
    expect(user.permissionProfileId).toBeNull();
  });
});
