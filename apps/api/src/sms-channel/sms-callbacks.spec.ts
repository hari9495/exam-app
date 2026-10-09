import { createHmac } from 'crypto';
import { CallbackConfig, TWILIO_CALLBACK, callbackConfigError, callbackFor, parseCallback, verifyCallback } from './sms-callbacks';

// Gateway delivery reports and opt-outs (YX-NTF-10/11): authenticated per account, mapped by configuration.
describe('SMS callbacks', () => {
  const SECRET = 'k3y-for-this-account-only-0123456789';
  const json: CallbackConfig = {
    auth: 'hmac',
    signatureHeader: 'x-signature',
    itemsPath: 'events',
    messageIdPath: 'id',
    statusPath: 'status',
    addressPath: 'to',
    delivered: ['delivered'],
    failed: ['failed', 'undelivered'],
    optedOut: ['opted_out'],
  };
  const body = Buffer.from(JSON.stringify({ events: [{ id: 'm-1', status: 'delivered' }, { id: 'm-2', status: 'undelivered' }, { status: 'opted_out', to: '+919845012345' }, { id: 'm-3', status: 'queued' }] }));
  const sign = (raw: Buffer, secret = SECRET, encoding: 'hex' | 'base64' = 'hex') => createHmac('sha256', secret).update(raw).digest(encoding);
  const req = (headers: Record<string, string>, raw = body, query: Record<string, unknown> = {}) => ({ rawBody: raw, headers: { 'content-type': 'application/json', ...headers }, query });

  describe('verifyCallback', () => {
    it('accepts the HMAC of the exact body, with or without a sha256= prefix', () => {
      expect(verifyCallback(json, SECRET, req({ 'x-signature': sign(body) }))).toBe(true);
      expect(verifyCallback(json, SECRET, req({ 'x-signature': `sha256=${sign(body).toUpperCase()}` }))).toBe(true);
      expect(verifyCallback({ ...json, signatureEncoding: 'base64' }, SECRET, req({ 'x-signature': sign(body, SECRET, 'base64') }))).toBe(true);
    });

    it('refuses a forged, missing or other-account signature, and a tampered body', () => {
      expect(verifyCallback(json, SECRET, req({}))).toBe(false);
      expect(verifyCallback(json, SECRET, req({ 'x-signature': 'deadbeef' }))).toBe(false);
      expect(verifyCallback(json, SECRET, req({ 'x-signature': sign(body, 'another-account-secret-0123456') }))).toBe(false);
      expect(verifyCallback(json, SECRET, req({ 'x-signature': sign(body) }, Buffer.from(body.toString().replace('undelivered', 'delivered'))))).toBe(false);
    });

    it('token auth: header or query, exact match only', () => {
      const token: CallbackConfig = { ...json, auth: 'token' };
      expect(verifyCallback(token, SECRET, req({ 'x-callback-token': SECRET }))).toBe(true);
      expect(verifyCallback(token, SECRET, req({}, body, { token: SECRET }))).toBe(true);
      expect(verifyCallback(token, SECRET, req({ 'x-callback-token': SECRET.slice(0, -1) }))).toBe(false);
      expect(verifyCallback(token, SECRET, req({ 'x-callback-token': `${SECRET}x` }))).toBe(false);
      expect(verifyCallback(token, SECRET, req({}, body, { token: ['a', 'b'] }))).toBe(false);
    });

    it('an account without a (long enough) secret accepts no callback at all', () => {
      expect(verifyCallback({ ...json, auth: 'token' }, undefined, req({ 'x-callback-token': '' }))).toBe(false);
      expect(verifyCallback({ ...json, auth: 'token' }, 'short', req({ 'x-callback-token': 'short' }))).toBe(false);
    });
  });

  describe('parseCallback', () => {
    it('maps batched events by configured paths and status lists', () => {
      expect(parseCallback(json, req({}))).toEqual([
        { messageId: 'm-1', outcome: 'delivered', address: null },
        { messageId: 'm-2', outcome: 'failed', address: null },
        { messageId: null, outcome: 'opted_out', address: '+919845012345' },
        { messageId: 'm-3', outcome: null, address: null },
      ]);
    });

    it('reads Twilio form posts and GET-style query reports (token never treated as data)', () => {
      const form = Buffer.from('MessageSid=SM1&MessageStatus=undelivered&To=%2B919845012345');
      expect(parseCallback(TWILIO_CALLBACK, { rawBody: form, headers: { 'content-type': 'application/x-www-form-urlencoded' }, query: { token: 'x' } })).toEqual([
        { messageId: 'SM1', outcome: 'failed', address: null },
      ]);
      const gupshup: CallbackConfig = { auth: 'token', messageIdPath: 'externalId', statusPath: 'status', delivered: ['SUCCESS'], failed: ['FAIL'], optedOut: [] };
      expect(parseCallback(gupshup, { rawBody: Buffer.alloc(0), headers: {}, query: { externalId: '4127', status: 'SUCCESS', token: 'x' } })).toEqual([
        { messageId: '4127', outcome: 'delivered', address: null },
      ]);
    });

    it('caps a batch at 500 events', () => {
      const many = Buffer.from(JSON.stringify({ events: Array.from({ length: 900 }, (_, i) => ({ id: `m${i}`, status: 'delivered' })) }));
      expect(parseCallback(json, req({}, many))).toHaveLength(500);
    });
  });

  describe('callback config', () => {
    it('Twilio has a built-in mapping; other providers need one configured', () => {
      expect(callbackFor('twilio', undefined)).toBe(TWILIO_CALLBACK);
      expect(callbackFor('http', undefined)).toBeNull();
      expect(callbackFor('http', json)).toBe(json);
      expect(callbackFor('http', { ...json, auth: 'none' })).toBeNull();
    });

    it.each([
      [{ ...json, auth: 'none' }],
      [{ ...json, signatureHeader: 'bad header' }],
      [{ ...json, messageIdPath: 'a b' }],
      [{ ...json, delivered: 'delivered' }],
      [{ ...json, failed: Array(21).fill('x') }],
    ])('refuses a bad mapping', (config) => expect(callbackConfigError(config)).not.toBeNull());
  });
});
