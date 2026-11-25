import { assertProductionSecrets, resolveInternalBindHost, secretProblems, SIGNING_SECRETS } from './bootstrap-config';

describe('resolveInternalBindHost', () => {
  it('defaults to 127.0.0.1 when API_INTERNAL_HOST is unset', () => {
    expect(resolveInternalBindHost({})).toBe('127.0.0.1');
  });

  it('uses API_INTERNAL_HOST when set', () => {
    expect(resolveInternalBindHost({ API_INTERNAL_HOST: '10.0.0.5' })).toBe('10.0.0.5');
  });
});

describe('production secrets (security review F9)', () => {
  const strong = Object.fromEntries(SIGNING_SECRETS.map((k) => [k, `${k}-a-real-random-value-of-48-bytes-or-so-xyz`]));
  it('starts with real secrets in production, and never checks outside production (positive)', () => {
    expect(secretProblems({ NODE_ENV: 'production', ...strong })).toEqual([]);
    expect(() => assertProductionSecrets({ NODE_ENV: 'production', ...strong })).not.toThrow();
    expect(secretProblems({ NODE_ENV: 'development', JWT_ACCESS_SECRET: 'dev-access-secret-change-me' })).toEqual([]);
  });
  it('refuses the .env.example placeholders, short and missing secrets in production (negative)', () => {
    const env = { NODE_ENV: 'production', ...strong, JWT_ACCESS_SECRET: 'dev-access-secret-change-me', INTERNAL_SERVICE_SECRET: 'short', CANDIDATE_JWT_REFRESH_SECRET: '' };
    expect(secretProblems(env)).toEqual([
      'JWT_ACCESS_SECRET is still the .env.example placeholder.',
      'CANDIDATE_JWT_REFRESH_SECRET is not set.',
      'INTERNAL_SERVICE_SECRET is shorter than 32 bytes.',
    ]);
    expect(() => assertProductionSecrets(env)).toThrow(/Refusing to start/);
  });
});
