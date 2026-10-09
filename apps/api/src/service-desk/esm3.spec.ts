import 'reflect-metadata';
import { createHmac } from 'crypto';
import { PATH_METADATA } from '@nestjs/common/constants';
import { PERMISSIONS_ANY_KEY, PERMISSIONS_KEY } from '../rbac/permissions.decorator';
import { STEP_UP_REQUIRED } from '../auth/step-up.decorator';
import { routeAgent, RouteCandidate, isAvailable } from './assignment';
import { forecast, perHour, presenceMinutes } from './forecast';
import { agentCommand, e164, fresh, inWindow, keyword, outgoing, parseInbound, signYukthix, verifySignature } from './messaging';
import { DeskEsm3Controller, InboundMsgController, MyMessagingController, WidgetPublicController } from './esm3.controller';
import { cleanOrigin } from './widget.service';

// Unit tests for the pure parts of 3b-2 batch 3: webhook signatures and replay windows, inbound parsing, the words people
// send, what may go out on a channel, push routing by skill / language / capacity, the forecast and the presence report,
// the widget's site list, and the permission declarations of the new routes.

const SECRET = 'a-very-long-test-secret-1234567890';
const NOW = Date.parse('2026-10-09T10:00:00Z');
const ts = String(Math.floor(NOW / 1000));

describe('webhook signatures (§14.4: constant time, replay window)', () => {
  const raw = Buffer.from(JSON.stringify({ id: 'm1', from: '+919812345678', text: 'hi', at: NOW }));

  it('our scheme: right secret and time pass; wrong secret, edited body, old or future time fail', () => {
    const h = { 'x-yukthix-timestamp': ts, 'x-yukthix-signature': signYukthix(SECRET, ts, raw) };
    expect(verifySignature('yukthix', SECRET, raw, h, NOW)).toBe(true);
    expect(verifySignature('yukthix', `${SECRET}x`, raw, h, NOW)).toBe(false);
    expect(verifySignature('yukthix', SECRET, Buffer.from(`${raw}x`), h, NOW)).toBe(false);
    expect(verifySignature('yukthix', SECRET, raw, h, NOW + 6 * 60_000)).toBe(false);
    expect(verifySignature('yukthix', SECRET, raw, h, NOW - 6 * 60_000)).toBe(false);
    expect(verifySignature('yukthix', SECRET, raw, { 'x-yukthix-signature': h['x-yukthix-signature'] }, NOW)).toBe(false);
    // No secret (or a short one) never verifies anything.
    expect(verifySignature('yukthix', null, raw, h, NOW)).toBe(false);
    expect(verifySignature('yukthix', 'short', raw, h, NOW)).toBe(false);
  });

  it('Meta: X-Hub-Signature-256 over the raw body', () => {
    const sig = `sha256=${createHmac('sha256', SECRET).update(raw).digest('hex')}`;
    expect(verifySignature('meta', SECRET, raw, { 'x-hub-signature-256': sig }, NOW)).toBe(true);
    expect(verifySignature('meta', SECRET, raw, { 'x-hub-signature-256': sig.replace(/.$/, '0') }, NOW)).toBe(false);
  });

  it('Slack: v0 signature with its request time inside 5 minutes', () => {
    const sig = `v0=${createHmac('sha256', SECRET).update(`v0:${ts}:${raw}`).digest('hex')}`;
    expect(verifySignature('slack', SECRET, raw, { 'x-slack-request-timestamp': ts, 'x-slack-signature': sig }, NOW)).toBe(true);
    expect(verifySignature('slack', SECRET, raw, { 'x-slack-request-timestamp': ts, 'x-slack-signature': sig }, NOW + 301_000)).toBe(false);
  });

  it('a message older than the window is a replay even when signed (Meta gets 15 minutes for its retries)', () => {
    expect(fresh(new Date(NOW - 4 * 60_000), 'yukthix', NOW)).toBe(true);
    expect(fresh(new Date(NOW - 6 * 60_000), 'yukthix', NOW)).toBe(false);
    expect(fresh(new Date(NOW - 14 * 60_000), 'meta', NOW)).toBe(true);
    expect(fresh(new Date(NOW - 16 * 60_000), 'meta', NOW)).toBe(false);
  });
});

describe('inbound parsing', () => {
  it('Meta: text messages only, phone numbers as E.164', () => {
    const body = { entry: [{ changes: [{ value: { messages: [{ id: 'wamid.1', from: '919812345678', timestamp: ts, type: 'text', text: { body: ' My laptop ' } }, { id: 'wamid.2', from: '919812345678', timestamp: ts, type: 'image' }], statuses: [{ id: 'x' }] } }] }] };
    expect(parseInbound('whatsapp', 'meta', body).messages).toEqual([{ id: 'wamid.1', from: '+919812345678', text: 'My laptop', at: new Date(Number(ts) * 1000) }]);
  });

  it('Slack: the URL check, and only people (no bots, edits or joins)', () => {
    expect(parseInbound('slack', 'slack', { type: 'url_verification', challenge: 'abc' }).challenge).toBe('abc');
    const ev = (event: object) => ({ type: 'event_callback', team_id: 'T1', event_id: 'Ev1', event: { type: 'message', ts: `${ts}.0001`, ...event } });
    expect(parseInbound('slack', 'slack', ev({ user: 'U1', text: 'help me' })).messages[0]).toMatchObject({ id: 'Ev1', from: 'T1:U1', text: 'help me' });
    expect(parseInbound('slack', 'slack', ev({ user: 'U1', text: 'x', bot_id: 'B1' })).messages).toEqual([]);
    expect(parseInbound('slack', 'slack', ev({ user: 'U1', text: 'x', subtype: 'message_changed' })).messages).toEqual([]);
  });

  it('our shape: a bad phone or an empty text is skipped', () => {
    expect(parseInbound('sms', 'yukthix', { messages: [{ id: 'a', from: '12', text: 'x', at: NOW }, { id: 'b', from: '+919812345678', text: '  ', at: NOW }] }).messages).toEqual([]);
    expect(e164('+91 98123 45678')).toBe('+919812345678');
    expect(e164('0000')).toBeNull();
  });
});

describe('words people send', () => {
  it('opt-out and opt-in words, help, join and new', () => {
    for (const w of ['STOP', 'stop', 'Unsubscribe', 'STOPALL', 'cancel.']) expect(keyword(w)).toEqual({ kind: 'stop' });
    expect(keyword('START')).toEqual({ kind: 'start' });
    expect(keyword('help')).toEqual({ kind: 'help' });
    expect(keyword('join abcd2345')).toEqual({ kind: 'join', code: 'ABCD2345' });
    expect(keyword('NEW my mouse broke')).toEqual({ kind: 'new', text: 'my mouse broke' });
    expect(keyword('please stop the alarm')).toBeNull();
  });

  it('agent commands in Teams / Slack', () => {
    expect(agentCommand('tickets')).toEqual({ kind: 'list' });
    expect(agentCommand('view it-1001')).toEqual({ kind: 'view', number: 'IT-1001' });
    expect(agentCommand('reply IT-1001 Restarted it, try now')).toEqual({ kind: 'reply', number: 'IT-1001', text: 'Restarted it, try now' });
    expect(agentCommand('reply IT-1001')).toBeNull();
    expect(agentCommand('my laptop is slow')).toBeNull();
  });
});

describe('what may go out (YX-NTF-04, YX-NTF-07)', () => {
  const base = { number: 'IT-1001', agentName: 'Farah', replyText: 'Your salary slip is attached', neutral: false, lastInbound: new Date(NOW - 3_600_000), template: null };
  const wa = { name: 'desk_reply_notice', language: 'en', status: 'approved' };

  it('WhatsApp inside the 24-hour window: the reply itself; a sensitive ticket: a notice only', () => {
    expect(outgoing('whatsapp', base, NOW)).toEqual({ mode: 'text', text: 'Farah replied on IT-1001:\nYour salary slip is attached' });
    const n = outgoing('whatsapp', { ...base, neutral: true }, NOW);
    expect(n).toMatchObject({ mode: 'text' });
    expect(JSON.stringify(n)).not.toMatch(/salary/);
  });

  it('WhatsApp outside the window: only an approved template, never the words', () => {
    const late = { ...base, lastInbound: new Date(NOW - 25 * 3_600_000) };
    expect(outgoing('whatsapp', late, NOW)).toEqual({ mode: 'none', reason: 'no_approved_template' });
    expect(outgoing('whatsapp', { ...late, template: { ...wa, status: 'pending' } }, NOW)).toEqual({ mode: 'none', reason: 'no_approved_template' });
    const t = outgoing('whatsapp', { ...late, template: wa }, NOW);
    expect(t).toMatchObject({ mode: 'template', params: ['IT-1001'] });
    expect(JSON.stringify(t)).not.toMatch(/salary/);
    expect(inWindow(null, NOW)).toBe(false);
  });

  it('SMS: always the registered template, the reply cut to 30 characters, a sensitive ticket says nothing of it', () => {
    const tpl = { dltTemplateId: '1107000000000000001', body: 'New reply on {#var#}: {#var#} Reply here or open YukthiX.', status: 'approved' };
    const o = outgoing('sms', { ...base, template: tpl }, NOW);
    expect(o).toMatchObject({ mode: 'template', text: 'New reply on IT-1001: Your salary slip is attached Reply here or open YukthiX.' });
    const s = outgoing('sms', { ...base, neutral: true, template: tpl }, NOW);
    expect(JSON.stringify(s)).not.toMatch(/salary/);
    expect(outgoing('sms', { ...base, replyText: 'x'.repeat(80), template: tpl }, NOW)).toMatchObject({ text: expect.stringContaining(`${'x'.repeat(29)}…`) });
    expect(outgoing('sms', base, NOW)).toEqual({ mode: 'none', reason: 'no_approved_template' });
  });
});

describe('push routing (US-G-075, US-G-239)', () => {
  const c = (userId: string, o: Partial<RouteCandidate> = {}): RouteCandidate => ({ userId, open: 0, skills: [], languages: [], capacity: null, ...o });

  it('skills and language first, the reason says why', () => {
    const r = routeAgent('load', [c('a', { skills: ['network'] }), c('b', { skills: ['network'], languages: ['hi'] }), c('c', { languages: ['hi'] })], { skills: ['network'], language: 'hi' }, null, null);
    expect(r).toEqual({ userId: 'b', reason: 'Routed by skills network and language hi; fewest open tickets' });
  });

  it('falls back to skills, then language, then anyone free', () => {
    expect(routeAgent('load', [c('a', { skills: ['network'] }), c('c', { languages: ['hi'] })], { skills: ['network'], language: 'hi' }, null, null).userId).toBe('a');
    expect(routeAgent('load', [c('c', { languages: ['hi'] })], { skills: ['network'], language: 'hi' }, null, null).userId).toBe('c');
    expect(routeAgent('load', [c('d')], { skills: ['network'], language: 'hi' }, null, null)).toMatchObject({ userId: 'd', reason: expect.stringMatching(/nobody free matches/) });
  });

  it('an agent at their own capacity gets nothing; all at capacity waits in the queue', () => {
    expect(routeAgent('load', [c('a', { open: 3, capacity: 3, skills: ['network'] }), c('b', { open: 9 })], { skills: ['network'], language: null }, null, null).userId).toBe('b');
    expect(routeAgent('load', [c('a', { open: 3, capacity: 3 })], { skills: [], language: null }, null, null)).toEqual({ userId: null, reason: 'Everyone free is at capacity: waiting in the team queue' });
  });

  it('busy and offline agents get no pushed work', () => {
    const s = { awayUntil: null, shiftStartMinute: null, shiftEndMinute: null, shiftDays: [1, 2, 3, 4, 5], shiftTimeZone: null };
    expect(isAvailable({ ...s, status: 'busy' }, new Date(NOW))).toBe(false);
    expect(isAvailable({ ...s, status: 'offline' }, new Date(NOW))).toBe(false);
    expect(isAvailable({ ...s, status: 'available' }, new Date(NOW))).toBe(true);
  });
});

describe('forecast and availability (US-G-076, US-G-077)', () => {
  it('a weekday is the average of the same weekday over the last 8 weeks; staff = ceil(volume ÷ per agent)', () => {
    // 8 weeks of Fridays at 30 and other days at 10, starting 8 weeks before Friday 9 Oct 2026.
    const history = Array.from({ length: 56 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 7, 14 + i));
      return { day: d.toISOString().slice(0, 10), created: d.getUTCDay() === 5 ? 30 : 10 };
    });
    const f = forecast(history, '2026-10-09', 7, 20);
    expect(f[0]).toEqual({ day: '2026-10-09', weekday: 5, expected: 30, staffNeeded: 2, basis: 8 });
    expect(f[1]).toMatchObject({ day: '2026-10-10', expected: 10, staffNeeded: 1 });
    // No history: zero, never a guess.
    expect(forecast([], '2026-10-09', 1, 20)[0]).toMatchObject({ expected: 0, staffNeeded: 0, basis: 0 });
  });

  it('presence minutes are clipped to the window; replies per online hour', () => {
    const from = new Date(NOW);
    const to = new Date(NOW + 4 * 3_600_000);
    const m = presenceMinutes(
      [
        { status: 'available', startedAt: new Date(NOW - 3_600_000), endedAt: new Date(NOW + 2 * 3_600_000) },
        { status: 'away', startedAt: new Date(NOW + 2 * 3_600_000), endedAt: null },
      ],
      from,
      to,
      new Date(NOW + 3 * 3_600_000),
    );
    expect(m).toEqual({ available: 120, away: 60, busy: 0, offline: 0 });
    expect(perHour(6, 120)).toBe(3);
    expect(perHour(6, 0)).toBeNull();
  });
});

describe('widget sites (SD-2.20)', () => {
  it('https origins only (http for localhost), no paths', () => {
    expect(cleanOrigin('https://shop.example.com')).toBe('https://shop.example.com');
    expect(cleanOrigin('https://shop.example.com/')).toBe('https://shop.example.com');
    expect(cleanOrigin('http://localhost:5173')).toBe('http://localhost:5173');
    expect(cleanOrigin('http://shop.example.com')).toBeNull();
    expect(cleanOrigin('https://shop.example.com/help')).toBeNull();
    expect(cleanOrigin('javascript:alert(1)')).toBeNull();
  });
});

describe('every batch-3 staff route declares its key (YX-SEC-01)', () => {
  const routes = (c: { prototype: object }) => Object.getOwnPropertyNames(c.prototype).filter((m) => m !== 'constructor' && Reflect.getMetadata(PATH_METADATA, (c.prototype as Record<string, object>)[m]) !== undefined);
  const keyed = (c: { prototype: object }, m: string) => [...(Reflect.getMetadata(PERMISSIONS_KEY, (c.prototype as Record<string, object>)[m]) ?? []), ...(Reflect.getMetadata(PERMISSIONS_ANY_KEY, (c.prototype as Record<string, object>)[m]) ?? [])];

  it('staff routes', () => {
    expect(routes(DeskEsm3Controller).length).toBeGreaterThan(20);
    expect(routes(DeskEsm3Controller).filter((m) => !keyed(DeskEsm3Controller, m).length)).toEqual([]);
    expect(keyed(DeskEsm3Controller, 'addChannel')).toEqual(['desk.channel.manage']);
    expect(keyed(DeskEsm3Controller, 'routing')).toEqual(['desk.ticket.assign']);
    expect(keyed(DeskEsm3Controller, 'forecast')).toEqual(['desk.report.view']);
  });

  it('new secrets need a fresh second factor', () => {
    for (const m of ['rotateChannel', 'rotateWidget'] as const) expect(Reflect.getMetadata(STEP_UP_REQUIRED, DeskEsm3Controller.prototype[m])).toBe(true);
  });

  it('only the person’s own channels, the signed webhooks and the widget sign-in are keyless', () => {
    expect(routes(MyMessagingController).sort()).toEqual(['devOutbox', 'devSend', 'join', 'mine', 'unlink']);
    expect(routes(InboundMsgController).sort()).toEqual(['company', 'shared', 'verify']);
    expect(routes(WidgetPublicController).sort()).toEqual(['config', 'session']);
  });
});
