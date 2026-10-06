import { BadRequestException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { httpProvider } from './http-provider';

// The P04 SMS channel: any gateway by configuration only. Every documented example config
// (docs/sms-gateways/examples.json) is validated and rendered here.
const { examples } = JSON.parse(readFileSync(join(__dirname, '../../../../../docs/sms-gateways/examples.json'), 'utf8')) as {
  examples: { name: string; config: Record<string, unknown> }[];
};

const otp = {
  to: '+919845012345',
  body: '482913 is your YukthiX sign-in code. It expires in 5 minutes. Never share it & don\'t "forward".',
  sender: 'YKTHIX',
  dltEntityId: '1101234567890123456',
  dltTemplateId: '1107169876543210987',
  vars: ['482913', 'sign-in code', '5'],
  idempotencyKey: 'idem-1',
};
const withSecrets = (config: Record<string, unknown>) => ({
  ...config,
  secrets: Object.fromEntries(Object.keys(config.secrets as object).map((k) => [k, `s3cr3t-${k}`])),
});
const answer = (json: unknown) => jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify(json) });
const byName = (name: string) => withSecrets(examples.find((e) => e.name === name)!.config);

describe('httpProvider: gateway example configs', () => {
  it('cover the common Indian gateways and any JSON API', () => {
    expect(examples.map((e) => e.name)).toEqual(['Zoho CPaaS (YukthiX shared account)', 'MSG91', 'Gupshup (Enterprise SMS)', 'Kaleyra', 'Exotel', 'Textlocal', 'Any JSON API']);
  });

  it.each(examples.map((e) => [e.name, e.config] as const))('%s: valid, and renders every variable for its content type', async (_name, config) => {
    const full = withSecrets(config);
    expect(() => httpProvider.validateConfig(full)).not.toThrow();
    const fetchImpl = answer({});
    await httpProvider.send(full, otp, fetchImpl as never);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(config.url);
    const body = init.body as string;
    expect(body).not.toMatch(/\{(to|to_digits|message|sender|dlt_entity_id|dlt_template_id|idempotency_key|secret\.[\w-]+)\}/);
    // Template-key gateways (Zoho CPaaS) hold the DLT text themselves and take only the values.
    const valuesOnly = !String(config.bodyTemplate).includes('{message}');
    if (valuesOnly) {
      expect(body).toContain(otp.vars[0]);
      expect(body).toContain(otp.to.slice(1));
    } else if (String(config.contentType).includes('json')) {
      expect(JSON.stringify(JSON.parse(body))).toContain(JSON.stringify(otp.body).slice(1, -1));
    } else {
      const values = [...new URLSearchParams(body).values()];
      expect(values).toContain(otp.body);
      expect(values.some((v) => v === otp.to || v === otp.to.slice(1))).toBe(true);
      expect(values).toContain(otp.sender);
    }
    // Each secret lands where its template puts it.
    const sent = JSON.stringify({ url, headers: init.headers, body: init.body });
    for (const name of Object.keys(config.secrets as object)) expect(sent).toContain(`s3cr3t-${name}`);
  });

  it('MSG91: success and the request id come from the JSON answer', async () => {
    expect(await httpProvider.send(byName('MSG91'), otp, answer({ type: 'success', message: '3a6c-req' }) as never)).toEqual({ ok: true, status: 200, providerMsgId: '3a6c-req' });
    expect(await httpProvider.send(byName('MSG91'), otp, answer({ type: 'error', message: 'Invalid template' }) as never)).toMatchObject({ ok: false, failure: 'rejected' });
  });

  it('Gupshup, Kaleyra, Exotel and Textlocal: message ids from nested answers', async () => {
    expect(await httpProvider.send(byName('Gupshup (Enterprise SMS)'), otp, answer({ response: { id: '4127', status: 'success' } }) as never)).toMatchObject({ ok: true, providerMsgId: '4127' });
    expect(await httpProvider.send(byName('Kaleyra'), otp, answer({ data: [{ message_id: 'kl-9' }] }) as never)).toMatchObject({ ok: true, providerMsgId: 'kl-9' });
    expect(await httpProvider.send(byName('Exotel'), otp, answer({ SMSMessage: { Sid: 'ex-1' } }) as never)).toMatchObject({ ok: true, providerMsgId: 'ex-1' });
    expect(await httpProvider.send(byName('Textlocal'), otp, answer({ status: 'success', messages: [{ id: 88 }] }) as never)).toMatchObject({ ok: true, providerMsgId: '88' });
  });

  it('a 2xx whose answer cannot be read may have been sent: unknown, not rejected', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '<html>busy</html>' });
    expect(await httpProvider.send(byName('MSG91'), otp, fetchImpl as never)).toMatchObject({ ok: false, failure: 'unknown' });
  });
});

describe('httpProvider: rendering', () => {
  it('URL values are percent-encoded; JSON bodies escape values', async () => {
    const fetchImpl = answer({});
    await httpProvider.send({ url: 'https://gw.example.com/send?to={to}', bodyTemplate: '{"m":"{message}","n":"{to_digits}"}' }, otp, fetchImpl as never);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://gw.example.com/send?to=%2B919845012345');
    expect(JSON.parse(init.body)).toEqual({ m: otp.body, n: '919845012345' });
  });

  it('a message value cannot add a form field or a header line', async () => {
    const evil = { ...otp, body: 'x&apikey=attacker\r\nX-Evil: 1' };
    const fetchImpl = answer({ status: 'success' });
    await httpProvider.send(byName('Textlocal'), evil, fetchImpl as never);
    const form = new URLSearchParams(fetchImpl.mock.calls[0][1].body);
    expect(form.getAll('apikey')).toEqual(['s3cr3t-apikey']);
    expect(form.get('message')).toBe(evil.body);

    const headerFetch = answer({});
    const result = await httpProvider.send({ url: 'https://gw.example.com/x', bodyTemplate: '{}', headers: { 'X-Ref': '{message}' } }, evil, headerFetch as never);
    expect(result).toMatchObject({ ok: false, failure: 'rejected' });
    expect(headerFetch).not.toHaveBeenCalled();
  });

  it('GET sends no body; DLT ids and {varN} are available', async () => {
    const fetchImpl = answer({});
    await httpProvider.send({ url: 'https://gw.example.com/otp?t={dlt_template_id}&otp={var1}&e={dlt_entity_id}', method: 'GET', bodyTemplate: 'unused' }, otp, fetchImpl as never);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://gw.example.com/otp?t=1107169876543210987&otp=482913&e=1101234567890123456');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
  });

  it('an unset secret fails the send before anything goes out', async () => {
    const fetchImpl = answer({});
    expect(await httpProvider.send({ url: 'https://gw.example.com/x', bodyTemplate: 'k={secret.key}' }, otp, fetchImpl as never)).toMatchObject({ ok: false, failure: 'rejected' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('httpProvider: SSRF and config safety', () => {
  const base = { url: 'https://gw.example.com/send', bodyTemplate: '{}' };
  it.each([
    ['plain http', { ...base, url: 'http://gw.example.com/send' }],
    ['localhost', { ...base, url: 'https://localhost/send' }],
    ['a private address', { ...base, url: 'https://10.1.2.3/send' }],
    ['the cloud metadata address', { ...base, url: 'https://169.254.169.254/latest/meta-data' }],
    ['metadata as IPv4-mapped IPv6', { ...base, url: 'https://[::ffff:a9fe:a9fe]/x' }],
    ['a secret in the host', { ...base, url: 'https://{secret.host}/send' }],
    ['a variable in the host', { ...base, url: 'https://gw.example.com{to}/send' }],
    ['a method other than GET / POST / PUT', { ...base, method: 'DELETE' }],
    ['a Host header', { ...base, headers: { Host: 'internal' } }],
    ['a header spanning lines', { ...base, headers: { 'X-A': 'one\r\nX-B: two' } }],
    ['a bad header name', { ...base, headers: { 'Bad Name': 'x' } }],
    ['a secret that is used but not set', { ...base, bodyTemplate: 'key={secret.missing}' }],
    ['a bad secret name', { ...base, secrets: { 'bad name': 'x' } }],
    ['a bad response path', { ...base, response: { messageIdPath: 'a b' } }],
    ['success values that are not a list', { ...base, response: { successValues: 'success' } }],
  ])('refuses %s', (_what, config) => {
    expect(() => httpProvider.validateConfig(config)).toThrow(BadRequestException);
  });

  it('a host that resolves to a private address at send time is refused (DNS-pinned fetch)', async () => {
    const pinned = jest.fn().mockRejectedValue(Object.assign(new Error('gw.example.com does not resolve to a public address'), { code: 'ENOTPUBLIC' }));
    expect(await httpProvider.send(base, otp, pinned as never)).toMatchObject({ ok: false, failure: 'rejected' });
  });

  it('DNS rebinding: a host that passed the save-time check but now resolves to a private address is never contacted', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dns = require('dns') as typeof import('dns');
    const lookup = jest.spyOn(dns, 'lookup').mockImplementation(((_h: string, _o: unknown, cb: (e: null, a: { address: string; family: number }[]) => void) =>
      cb(null, [{ address: '169.254.169.254', family: 4 }])) as never);
    try {
      // The default transport (publicHttpsFetch) pins the connection to the address it checked.
      expect(await httpProvider.send(base, otp)).toMatchObject({ ok: false, failure: 'rejected', error: expect.stringContaining('ENOTPUBLIC') });
    } finally {
      lookup.mockRestore();
    }
  });

  it('classifies failures so a code that may have arrived is never resent', async () => {
    const status = (s: number) => jest.fn().mockResolvedValue({ ok: false, status: s });
    expect(await httpProvider.send(base, otp, status(400) as never)).toMatchObject({ failure: 'rejected' });
    expect(await httpProvider.send(base, otp, status(302) as never)).toMatchObject({ failure: 'rejected' });
    expect(await httpProvider.send(base, otp, status(429) as never)).toMatchObject({ failure: 'unavailable' });
    expect(await httpProvider.send(base, otp, status(503) as never)).toMatchObject({ failure: 'unavailable' });
    expect(await httpProvider.send(base, otp, status(502) as never)).toMatchObject({ failure: 'unknown' });
    const refused = jest.fn().mockRejectedValue(Object.assign(new Error('connect'), { code: 'ECONNREFUSED' }));
    expect(await httpProvider.send(base, otp, refused as never)).toMatchObject({ failure: 'unavailable' });
    const reset = jest.fn().mockRejectedValue(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }));
    expect(await httpProvider.send(base, otp, reset as never)).toMatchObject({ failure: 'unknown' });
  });
});
