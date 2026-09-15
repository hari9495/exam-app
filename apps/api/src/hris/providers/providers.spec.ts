import { BadRequestException } from '@nestjs/common';
import { getHrisConnector, HRIS_PROVIDER_IDS } from './index';
import type { HrisEmployeePayload } from './types';

const payload: HrisEmployeePayload = {
  event: 'candidate.hired',
  hiredAt: '2026-09-15T10:00:00.000Z',
  organizationId: 'org-1',
  candidate: { id: 'c1', name: 'Ada Lovelace', email: 'ada@example.com', phone: '+15551234567' },
  job: { id: 'job-1', title: 'Engineer', department: 'R&D' },
  offer: { compensation: '100000', startDate: '2026-10-01' },
};

function decodeBasic(header: string): string {
  return Buffer.from(header.replace(/^Basic /, ''), 'base64').toString('utf8');
}

describe('HRIS connector registry', () => {
  it('registers all five providers and falls back to generic for unknown/empty', () => {
    expect(HRIS_PROVIDER_IDS).toEqual(expect.arrayContaining(['generic', 'greenhouse', 'lever', 'bamboohr', 'workday']));
    expect(getHrisConnector('greenhouse').id).toBe('greenhouse');
    expect(getHrisConnector('nope').id).toBe('generic');
    expect(getHrisConnector(null).id).toBe('generic');
  });
});

describe('generic connector', () => {
  const c = getHrisConnector('generic');
  it('posts the payload verbatim to the URL with the auth header', () => {
    const req = c.buildRequest(payload, { targetUrl: 'https://hris.example.com/in', secret: 'Bearer tok' });
    expect(req.url).toBe('https://hris.example.com/in');
    expect(req.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(req.body).candidate.email).toBe('ada@example.com');
  });
  it('prepareConfig keeps the existing header when authHeader is omitted, clears on empty string', () => {
    expect(c.prepareConfig({ targetUrl: 'https://a.example.com' }, { targetUrl: null, secret: 'Bearer old' }).secret).toBe('Bearer old');
    expect(c.prepareConfig({ authHeader: '' }, { targetUrl: 'https://a.example.com', secret: 'Bearer old' }).secret).toBeNull();
  });
  it('prepareConfig requires a URL', () => {
    expect(() => c.prepareConfig({}, null)).toThrow(BadRequestException);
  });
});

describe('greenhouse connector', () => {
  const c = getHrisConnector('greenhouse');
  const secret = JSON.stringify({ apiKey: 'gh_key', onBehalfOf: '42' });
  it('builds a Harvest candidate POST with Basic auth + On-Behalf-Of', () => {
    const req = c.buildRequest(payload, { targetUrl: null, secret });
    expect(req.url).toBe('https://harvest.greenhouse.io/v1/candidates');
    expect(decodeBasic(req.headers.Authorization)).toBe('gh_key:');
    expect(req.headers['On-Behalf-Of']).toBe('42');
    const body = JSON.parse(req.body);
    expect(body.first_name).toBe('Ada');
    expect(body.last_name).toBe('Lovelace');
    expect(body.email_addresses[0].value).toBe('ada@example.com');
  });
  it('prepareConfig requires apiKey and onBehalfOf, and stores a JSON blob', () => {
    expect(() => c.prepareConfig({ apiKey: 'k' }, null)).toThrow(/On-Behalf-Of/);
    const prepared = c.prepareConfig({ apiKey: 'k', onBehalfOf: '7' }, null);
    expect(prepared.targetUrl).toBeNull();
    expect(JSON.parse(prepared.secret as string)).toEqual({ apiKey: 'k', onBehalfOf: '7' });
  });
  it('prepareConfig keeps an existing key when only onBehalfOf changes', () => {
    const prepared = c.prepareConfig({ onBehalfOf: '9' }, { targetUrl: null, secret });
    expect(JSON.parse(prepared.secret as string)).toEqual({ apiKey: 'gh_key', onBehalfOf: '9' });
  });
});

describe('lever connector', () => {
  const c = getHrisConnector('lever');
  it('builds an opportunities POST with perform_as + Basic auth', () => {
    const req = c.buildRequest(payload, { targetUrl: null, secret: JSON.stringify({ apiKey: 'lv', performAs: 'u1' }) });
    expect(req.url).toBe('https://api.lever.co/v1/opportunities?perform_as=u1');
    expect(decodeBasic(req.headers.Authorization)).toBe('lv:');
    expect(JSON.parse(req.body).emails[0]).toBe('ada@example.com');
  });
  it('prepareConfig requires apiKey and performAs', () => {
    expect(() => c.prepareConfig({ apiKey: 'lv' }, null)).toThrow(/perform as/i);
  });
});

describe('bamboohr connector', () => {
  const c = getHrisConnector('bamboohr');
  it('builds a per-subdomain employees POST with Basic auth (key:x)', () => {
    const req = c.buildRequest(payload, { targetUrl: null, secret: JSON.stringify({ apiKey: 'bk', subdomain: 'acme' }) });
    expect(req.url).toBe('https://api.bamboohr.com/api/gateway.php/acme/v1/employees');
    expect(decodeBasic(req.headers.Authorization)).toBe('bk:x');
    const body = JSON.parse(req.body);
    expect(body.firstName).toBe('Ada');
    expect(body.workEmail).toBe('ada@example.com');
    expect(body.hireDate).toBe('2026-10-01'); // from offer.startDate
  });
  it('prepareConfig rejects a malformed subdomain', () => {
    expect(() => c.prepareConfig({ apiKey: 'bk', subdomain: 'bad domain' }, null)).toThrow(/subdomain/i);
  });
});

describe('workday connector', () => {
  const c = getHrisConnector('workday');
  it('posts the payload with a Bearer token to the configured URL', () => {
    const req = c.buildRequest(payload, { targetUrl: 'https://wd.example.com/inbound', secret: 'wd_token' });
    expect(req.url).toBe('https://wd.example.com/inbound');
    expect(req.headers.Authorization).toBe('Bearer wd_token');
  });
  it('prepareConfig requires a URL and a token', () => {
    expect(() => c.prepareConfig({ apiKey: 't' }, null)).toThrow(/URL/i);
    expect(() => c.prepareConfig({ targetUrl: 'https://wd.example.com' }, null)).toThrow(/token/i);
  });
});
