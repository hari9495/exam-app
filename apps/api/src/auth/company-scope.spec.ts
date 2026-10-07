import { CompanyScopeService, REMEMBERED_COMPANY_COOKIE, companyOriginPattern, companySlugFromHost } from './company-scope';

describe('company from the web address (YX_BASE_DOMAIN)', () => {
  const BASE = 'yukthix.app';

  it('reads <slug>.<base> from a Host or an Origin, ports aside', () => {
    expect(companySlugFromHost('kaveri-foods.yukthix.app', BASE)).toBe('kaveri-foods');
    expect(companySlugFromHost('Kaveri-Foods.YukthiX.app:443', BASE)).toBe('kaveri-foods');
    expect(companySlugFromHost('https://kaveri-foods.yukthix.app', BASE)).toBe('kaveri-foods');
  });

  it('ignores everything else: spoofed or foreign hosts, deeper names, reserved names, no base domain', () => {
    for (const host of [
      'kaveri-foods.evil.test',
      'kaveri-foods.yukthix.app.evil.test',
      'evilyukthix.app',
      'a.kaveri-foods.yukthix.app',
      'yukthix.app',
      'api.yukthix.app',
      'www.yukthix.app',
      '-bad.yukthix.app',
      'https://kaveri-foods.yukthix.app@evil.test',
      '',
      undefined,
    ]) {
      expect(companySlugFromHost(host, BASE)).toBeNull();
    }
    expect(companySlugFromHost('kaveri-foods.yukthix.app', undefined)).toBeNull();
    expect(companySlugFromHost('kaveri-foods.yukthix.app', '')).toBeNull();
  });

  it('CORS allows exactly https://<label>.<base>', () => {
    const pattern = companyOriginPattern(BASE)!;
    expect(pattern.test('https://kaveri-foods.yukthix.app')).toBe(true);
    expect(pattern.test('http://kaveri-foods.yukthix.app')).toBe(false);
    expect(pattern.test('https://kaveri-foods.yukthixxapp')).toBe(false);
    expect(pattern.test('https://kaveri-foods.yukthix.app.evil.test')).toBe(false);
    expect(pattern.test('https://a.b.yukthix.app')).toBe(false);
    expect(companyOriginPattern('')).toBeNull();
  });
});

describe('remembered company cookie', () => {
  const ORG = '3f0c6a52-6c55-4d4b-9a4e-6a1d2f1e0b11';
  let prisma: { organization: { findUnique: jest.Mock } };
  let service: CompanyScopeService;
  const crypto = { hmac: (purpose: string, value: string) => require('crypto').createHmac('sha256', 'k').update(`${purpose}|${value}`).digest('hex') };
  const req = (cookie?: string, host?: string) => ({ cookies: cookie === undefined ? {} : { [REMEMBERED_COMPANY_COOKIE]: cookie }, headers: { host } }) as any;

  beforeEach(() => {
    prisma = { organization: { findUnique: jest.fn().mockResolvedValue({ id: ORG, slug: 'kaveri-foods', name: 'Kaveri Foods', logoPath: null, status: 'active' }) } };
    service = new CompanyScopeService(prisma as any, crypto as any, { signIfOurs: async (p: string | null) => p } as any);
  });

  it('an intact cookie names the company; the company still has to be active', async () => {
    await expect(service.remembered(req(service.cookieValue(ORG)))).resolves.toMatchObject({ id: ORG, slug: 'kaveri-foods' });
    prisma.organization.findUnique.mockResolvedValueOnce({ id: ORG, slug: 'kaveri-foods', status: 'suspended' });
    await expect(service.remembered(req(service.cookieValue(ORG)))).resolves.toBeNull();
  });

  it('a tampered cookie is ignored (other id, altered MAC, no MAC, junk)', async () => {
    const other = '9a9a9a9a-6c55-4d4b-9a4e-6a1d2f1e0b11';
    const [, mac] = service.cookieValue(ORG).split('.');
    for (const value of [`${other}.${mac}`, `${ORG}.${mac.slice(0, -1)}0`, ORG, `${ORG}.`, 'x.y', '']) {
      await expect(service.remembered(req(value))).resolves.toBeNull();
    }
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });

  it('scope order: explicit orgSlug, then the web address, then the remembered company, else email-first', async () => {
    process.env.YX_BASE_DOMAIN = 'yukthix.app';
    try {
      await expect(service.slugFor(req(service.cookieValue(ORG), 'ashok.yukthix.app'), 'given')).resolves.toBe('given');
      await expect(service.slugFor(req(service.cookieValue(ORG), 'ashok.yukthix.app'))).resolves.toBe('ashok');
      await expect(service.slugFor(req(service.cookieValue(ORG), 'evil.test'))).resolves.toBe('kaveri-foods');
      await expect(service.slugFor(req(undefined, 'localhost:3001'))).resolves.toBeUndefined();
    } finally {
      delete process.env.YX_BASE_DOMAIN;
    }
  });
});
