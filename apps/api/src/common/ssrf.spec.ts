import { BadRequestException } from '@nestjs/common';
import { assertPublicHttpsHost, assertPublicHttpsUrl, isPublicAddress, publicHttpsFetch, publicOnlyLookup } from './ssrf';

describe('assertPublicHttpsUrl', () => {
  const accept = (url: string) => expect(() => assertPublicHttpsUrl(new URL(url))).not.toThrow();
  const reject = (url: string) => expect(() => assertPublicHttpsUrl(new URL(url))).toThrow(BadRequestException);

  it('accepts a public https url', () => accept('https://api.example.com/x'));
  it('accepts a public hostname starting with "fc" (not an IP literal)', () => accept('https://fc-gateway.com/x'));
  it('accepts a public hostname starting with "fd" (not an IP literal)', () => accept('https://fd-sms.example.com/x'));

  it('rejects a non-https url', () => reject('http://api.example.com'));
  it('rejects localhost', () => reject('https://localhost/x'));
  it('rejects 127.0.0.1 (IPv4 loopback)', () => reject('https://127.0.0.1/x'));
  it('rejects 10.0.0.5 (IPv4 private range)', () => reject('https://10.0.0.5/x'));
  it('rejects 172.16.0.1 (bottom of the IPv4 private range)', () => reject('https://172.16.0.1/x'));
  it('rejects 172.31.0.1 (top of the IPv4 private range)', () => reject('https://172.31.0.1/x'));
  it('rejects 192.168.1.1 (IPv4 private range)', () => reject('https://192.168.1.1/x'));
  it('rejects 169.254.1.1 (IPv4 link-local)', () => reject('https://169.254.1.1/x'));
  it('rejects 0.0.0.0', () => reject('https://0.0.0.0/x'));
  it('rejects [::1] (IPv6 loopback)', () => reject('https://[::1]/x'));
  it('rejects [fd00::1] (IPv6 unique-local)', () => reject('https://[fd00::1]/x'));
  it('rejects [fe80::1] (IPv6 link-local)', () => reject('https://[fe80::1]/x'));
  it('rejects [febf::1] (top of the fe80::/10 link-local range)', () => reject('https://[febf::1]/x'));
  it('rejects [::ffff:127.0.0.1] (IPv4-mapped IPv6 loopback, dotted form)', () =>
    reject('https://[::ffff:127.0.0.1]/x'));
  it('rejects [::ffff:10.0.0.1] (IPv4-mapped IPv6 private range, dotted form)', () =>
    reject('https://[::ffff:10.0.0.1]/x'));
});

// DNS-resolution-checked outbound requests (OIDC issuer, and every URL its discovery document
// names). Regression: a public-looking hostname resolving to a private address passed the
// literal-only check, giving a blind-SSRF port/host oracle and a POST of the client secret.
describe('DNS-checked public HTTPS (ASVS V12.6 / V5.2.6)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dns = require('dns') as typeof import('dns');
  const resolveTo = (...addresses: string[]) =>
    jest.spyOn(dns, 'lookup').mockImplementation(((_host: string, _opts: unknown, cb: (e: null, a: { address: string; family: number }[]) => void) =>
      cb(null, addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })))) as never);
  afterEach(() => jest.restoreAllMocks());

  it.each(['10.1.2.3', '127.0.0.1', '169.254.169.254', '192.168.0.1', '172.16.0.1', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1', '224.0.0.1'])(
    '%s is not a public address',
    (address) => expect(isPublicAddress(address)).toBe(false),
  );

  it.each(['8.8.8.8', '2606:4700:4700::1111'])('%s is public', (address) => expect(isPublicAddress(address)).toBe(true));

  it('refuses a hostname that resolves to a private address, and one with any private answer among public ones', async () => {
    resolveTo('10.0.0.5');
    await expect(assertPublicHttpsHost(new URL('https://internal-service.corp.example'))).rejects.toThrow('public address');
    resolveTo('8.8.8.8', '192.168.1.1');
    await expect(assertPublicHttpsHost(new URL('https://mixed.example'))).rejects.toThrow('public address');
    resolveTo('8.8.8.8');
    await expect(assertPublicHttpsHost(new URL('https://idp.example'))).resolves.toBeUndefined();
    await expect(assertPublicHttpsHost(new URL('http://idp.example'))).rejects.toThrow('https');
  });

  it('the pinned lookup never hands a socket a private address', (done) => {
    resolveTo('169.254.169.254');
    publicOnlyLookup('metadata.example', { all: false }, (error) => {
      expect((error as NodeJS.ErrnoException).code).toBe('ENOTPUBLIC');
      done();
    });
  });

  it('publicHttpsFetch refuses http and never connects to a private resolution', async () => {
    await expect(publicHttpsFetch('http://idp.example/token', { method: 'POST' })).rejects.toThrow('Only https');
    resolveTo('127.0.0.1');
    await expect(publicHttpsFetch('https://evil-discovery.example/token', { method: 'POST', body: new URLSearchParams({ a: 'b' }) })).rejects.toThrow(
      'does not resolve to a public address',
    );
  });
});
