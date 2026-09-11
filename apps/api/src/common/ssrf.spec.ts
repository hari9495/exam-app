import { BadRequestException } from '@nestjs/common';
import { assertPublicHttpsUrl } from './ssrf';

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
