import { BadRequestException } from '@nestjs/common';
import { httpProvider } from './http-provider';

describe('httpProvider.validateConfig', () => {
  const base = { bodyTemplate: '{"to":"{{to}}","body":"{{body}}"}' };

  it('accepts a public https url', () => {
    expect(() => httpProvider.validateConfig({ ...base, url: 'https://api.example.com/sms' })).not.toThrow();
  });

  it('rejects a missing url', () => {
    expect(() => httpProvider.validateConfig({ ...base })).toThrow(BadRequestException);
  });

  it('rejects a missing bodyTemplate', () => {
    expect(() => httpProvider.validateConfig({ url: 'https://api.example.com/sms' })).toThrow(
      BadRequestException,
    );
  });

  it('rejects an unparseable url', () => {
    expect(() => httpProvider.validateConfig({ ...base, url: 'not a url' })).toThrow(BadRequestException);
  });

  it('rejects a non-https url', () => {
    expect(() => httpProvider.validateConfig({ ...base, url: 'http://api.example.com/sms' })).toThrow(
      BadRequestException,
    );
  });

  it('rejects localhost', () => {
    expect(() => httpProvider.validateConfig({ ...base, url: 'https://localhost/sms' })).toThrow(
      BadRequestException,
    );
  });

  it('rejects 127.0.0.1 (IPv4 loopback)', () => {
    expect(() => httpProvider.validateConfig({ ...base, url: 'https://127.0.0.1/sms' })).toThrow(
      BadRequestException,
    );
  });

  it('rejects 10.0.0.5 (IPv4 private range)', () => {
    expect(() => httpProvider.validateConfig({ ...base, url: 'https://10.0.0.5/sms' })).toThrow(
      BadRequestException,
    );
  });

  it('rejects 172.16.0.1 (IPv4 private range)', () => {
    expect(() => httpProvider.validateConfig({ ...base, url: 'https://172.16.0.1/sms' })).toThrow(
      BadRequestException,
    );
  });

  it('rejects 192.168.1.1 (IPv4 private range)', () => {
    expect(() => httpProvider.validateConfig({ ...base, url: 'https://192.168.1.1/sms' })).toThrow(
      BadRequestException,
    );
  });

  it('rejects 169.254.1.1 (IPv4 link-local)', () => {
    expect(() => httpProvider.validateConfig({ ...base, url: 'https://169.254.1.1/sms' })).toThrow(
      BadRequestException,
    );
  });

  it('rejects 0.0.0.0', () => {
    expect(() => httpProvider.validateConfig({ ...base, url: 'https://0.0.0.0/sms' })).toThrow(
      BadRequestException,
    );
  });

  it('rejects [::1] (IPv6 loopback)', () => {
    expect(() => httpProvider.validateConfig({ ...base, url: 'https://[::1]/sms' })).toThrow(
      BadRequestException,
    );
  });

  it('rejects [fd00::1] (IPv6 unique-local)', () => {
    expect(() => httpProvider.validateConfig({ ...base, url: 'https://[fd00::1]/sms' })).toThrow(
      BadRequestException,
    );
  });

  it('rejects [fe80::1] (IPv6 link-local)', () => {
    expect(() => httpProvider.validateConfig({ ...base, url: 'https://[fe80::1]/sms' })).toThrow(
      BadRequestException,
    );
  });

  it('accepts a public hostname starting with "fc" (not an IP literal)', () => {
    expect(() => httpProvider.validateConfig({ ...base, url: 'https://fc-gateway.com/send' })).not.toThrow();
  });

  it('accepts a public hostname starting with "fd" (not an IP literal)', () => {
    expect(() => httpProvider.validateConfig({ ...base, url: 'https://fd-sms.example.com/x' })).not.toThrow();
  });

  it('rejects [::ffff:127.0.0.1] (IPv4-mapped IPv6 loopback)', () => {
    expect(() => httpProvider.validateConfig({ ...base, url: 'https://[::ffff:127.0.0.1]/x' })).toThrow(
      BadRequestException,
    );
  });

  it('rejects [::ffff:10.0.0.1] (IPv4-mapped IPv6 private range)', () => {
    expect(() => httpProvider.validateConfig({ ...base, url: 'https://[::ffff:10.0.0.1]/x' })).toThrow(
      BadRequestException,
    );
  });

  it('rejects [febf::1] (top of the fe80::/10 link-local range)', () => {
    expect(() => httpProvider.validateConfig({ ...base, url: 'https://[febf::1]/x' })).toThrow(
      BadRequestException,
    );
  });

  it('rejects [fe90::1] (inside the fe80::/10 link-local range)', () => {
    expect(() => httpProvider.validateConfig({ ...base, url: 'https://[fe90::1]/x' })).toThrow(
      BadRequestException,
    );
  });
});

describe('httpProvider.send', () => {
  const args = { to: '+15559876543', body: 'Your interview is confirmed' };

  function mockFetch(res: { ok: boolean; status: number }) {
    return jest.fn().mockResolvedValue(res);
  }

  it('substitutes {{to}}/{{body}} into the body and url, defaults method to POST and content-type to json', async () => {
    const fetchImpl = mockFetch({ ok: true, status: 200 });
    const config = {
      url: 'https://api.example.com/sms?to={{to}}',
      bodyTemplate: '{"to":"{{to}}","body":"{{body}}"}',
    };

    const result = await httpProvider.send(config, args, fetchImpl as never);

    expect(result).toEqual({ ok: true, status: 200 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe(`https://api.example.com/sms?to=${args.to}`);
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(options.headers.Authorization).toBeUndefined();
    expect(JSON.parse(options.body)).toEqual({ to: args.to, body: args.body });
  });

  it('sets the Authorization header only when authHeader is present', async () => {
    const fetchImpl = mockFetch({ ok: true, status: 200 });
    const config = {
      url: 'https://api.example.com/sms',
      bodyTemplate: '{}',
      authHeader: 'Bearer abc123',
    };

    await httpProvider.send(config, args, fetchImpl as never);

    const [, options] = fetchImpl.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer abc123');
  });

  it('respects a custom method and contentType', async () => {
    const fetchImpl = mockFetch({ ok: true, status: 200 });
    const config = {
      url: 'https://api.example.com/sms',
      bodyTemplate: 'to={{to}}&body={{body}}',
      method: 'PUT',
      contentType: 'application/x-www-form-urlencoded',
    };

    await httpProvider.send(config, args, fetchImpl as never);

    const [, options] = fetchImpl.mock.calls[0];
    expect(options.method).toBe('PUT');
    expect(options.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    // non-JSON contentType => raw substitution, no JSON-escaping
    expect(options.body).toBe(`to=${args.to}&body=${args.body}`);
  });

  it('JSON-escapes a body value containing a quote when contentType is json', async () => {
    const fetchImpl = mockFetch({ ok: true, status: 200 });
    const config = {
      url: 'https://api.example.com/sms',
      bodyTemplate: '{"body":"{{body}}"}',
    };
    const argsWithQuote = { to: args.to, body: 'She said "hi"' };

    await httpProvider.send(config, argsWithQuote, fetchImpl as never);

    const [, options] = fetchImpl.mock.calls[0];
    expect(() => JSON.parse(options.body)).not.toThrow();
    expect(JSON.parse(options.body)).toEqual({ body: 'She said "hi"' });
  });

  it('returns ok:true for a 2xx response', async () => {
    const fetchImpl = mockFetch({ ok: true, status: 201 });
    const result = await httpProvider.send(
      { url: 'https://api.example.com/sms', bodyTemplate: '{}' },
      args,
      fetchImpl as never,
    );
    expect(result).toEqual({ ok: true, status: 201 });
  });

  it('returns ok:false for a 500 response', async () => {
    const fetchImpl = mockFetch({ ok: false, status: 500 });
    const result = await httpProvider.send(
      { url: 'https://api.example.com/sms', bodyTemplate: '{}' },
      args,
      fetchImpl as never,
    );
    expect(result).toEqual({ ok: false, status: 500 });
  });

  it('returns ok:false when fetch throws, never lets the error escape', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('network down'));
    const result = await httpProvider.send(
      { url: 'https://api.example.com/sms', bodyTemplate: '{}' },
      args,
      fetchImpl as never,
    );
    expect(result).toEqual({ ok: false });
  });
});
