import { createHash, createHmac, timingSafeEqual } from 'crypto';

// SD-2.21 … SD-2.23 (US-B-133, US-B-134, US-G-057, US-G-058, §9.4, §14.4): the pure parts of the messaging channels, so
// they are unit tested on their own. One shape per inbound message whatever the provider, the signature check of each
// provider (constant time, with a replay window), the opt-out words, the WhatsApp 24-hour window and what an outside
// message may say (never the words of a sensitive or private ticket, YX-NTF-04).
//
// Signatures:
//   yukthix  our own scheme, for the dev transport and SMS gateways that relay to us: X-YukthiX-Timestamp (unix seconds)
//            and X-YukthiX-Signature = "sha256=" + HMAC-SHA256(secret, "<timestamp>.<raw body>"); 5-minute window.
//   meta     WhatsApp Cloud API: X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(app secret, raw body). Meta sends no
//            signed header time, so each message's own (signed) timestamp must be within the window, and every message
//            id is accepted once (the caller keeps the ids).
//   slack    Slack Events API: X-Slack-Signature = "v0=" + HMAC-SHA256(signing secret, "v0:<ts>:<raw body>") and
//            X-Slack-Request-Timestamp within 5 minutes.
//   teams    Bot Framework sends a Microsoft-signed JWT; checking it needs the YukthiX app registration (go-live). Until
//            then a Teams request is refused (fails closed) unless the dev transport signs it our way.

export type MsgKind = 'whatsapp' | 'sms' | 'teams' | 'slack';
export const MSG_KINDS: readonly MsgKind[] = ['whatsapp', 'sms', 'teams', 'slack'];
export type Scheme = 'yukthix' | 'meta' | 'slack';

export const REPLAY_SECONDS = 5 * 60;
/** Meta retries a webhook it could not deliver for a while: its messages may be this old (each id is still taken once). */
export const META_REPLAY_SECONDS = 15 * 60;
export const WINDOW_HOURS = 24;
export const MAX_TEXT = 2000;

export interface InboundMessage {
  /** The provider's id of this message (used once). */
  id: string;
  /** E.164 phone (WhatsApp, SMS) or the chat app's user reference (Teams, Slack). */
  from: string;
  text: string;
  at: Date;
}

export type Headers = Record<string, string | string[] | undefined>;
const header = (h: Headers, name: string) => {
  const v = h[name.toLowerCase()];
  return (Array.isArray(v) ? v[0] : v)?.slice(0, 500);
};
const digest = (v: string | Buffer) => createHash('sha256').update(v).digest();
/** Constant time over fixed-length digests, so neither the value nor its length leaks. */
export const sameSecret = (given: string, expected: string) => timingSafeEqual(digest(given), digest(expected));

export function signYukthix(secret: string, ts: string, raw: Buffer): string {
  return `sha256=${createHmac('sha256', secret).update(`${ts}.`).update(raw).digest('hex')}`;
}

/** True only for a request signed with this secret inside the replay window. */
export function verifySignature(scheme: Scheme, secret: string | null | undefined, raw: Buffer, h: Headers, now = Date.now()): boolean {
  if (typeof secret !== 'string' || secret.length < 16) return false;
  if (scheme === 'meta') {
    const given = header(h, 'x-hub-signature-256');
    return typeof given === 'string' && sameSecret(given, `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`);
  }
  const [tsName, sigName] = scheme === 'slack' ? ['x-slack-request-timestamp', 'x-slack-signature'] : ['x-yukthix-timestamp', 'x-yukthix-signature'];
  const ts = header(h, tsName);
  const given = header(h, sigName);
  if (!ts || !given || !/^\d{9,11}$/.test(ts) || Math.abs(now / 1000 - Number(ts)) > REPLAY_SECONDS) return false;
  const want = scheme === 'slack' ? `v0=${createHmac('sha256', secret).update(`v0:${ts}:`).update(raw).digest('hex')}` : signYukthix(secret, ts, raw);
  return sameSecret(given, want);
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const text = (x: unknown) => (typeof x === 'string' ? x.replace(/\u0000/g, '').trim().slice(0, MAX_TEXT) : '');

/** E.164 from what a provider sends ("919812345678", "+91 98123 45678"); null when it is not a phone number. */
export function e164(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/[\s()-]/g, '').replace(/^\+/, '');
  return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
}

const when = (x: unknown): Date | null => {
  const n = typeof x === 'number' ? x : typeof x === 'string' && /^\d+$/.test(x) ? Number(x) : typeof x === 'string' ? Date.parse(x) : NaN;
  if (!Number.isFinite(n)) return null;
  return new Date(n < 1e12 ? n * 1000 : n);
};

/**
 * The messages in a verified body. Anything that is not a plain text message (delivery statuses, reactions, joins, bot
 * echoes) is skipped. `slack_challenge` is Slack's URL check, answered by the caller.
 */
export function parseInbound(kind: MsgKind, scheme: Scheme, body: unknown): { messages: InboundMessage[]; challenge?: string } {
  if (!isObj(body)) return { messages: [] };
  const out: InboundMessage[] = [];
  if (scheme === 'meta') {
    for (const e of Array.isArray(body.entry) ? body.entry.slice(0, 20) : []) {
      for (const c of isObj(e) && Array.isArray(e.changes) ? e.changes.slice(0, 20) : []) {
        const v = isObj(c) && isObj(c.value) ? c.value : null;
        for (const m of v && Array.isArray(v.messages) ? v.messages.slice(0, 50) : []) {
          if (!isObj(m) || m.type !== 'text' || !isObj(m.text)) continue;
          const from = e164(m.from);
          const at = when(m.timestamp);
          if (from && at && typeof m.id === 'string' && text(m.text.body)) out.push({ id: m.id.slice(0, 200), from, text: text(m.text.body), at });
        }
      }
    }
    return { messages: out };
  }
  if (scheme === 'slack') {
    if (body.type === 'url_verification' && typeof body.challenge === 'string') return { messages: [], challenge: body.challenge.slice(0, 200) };
    const ev = isObj(body.event) ? body.event : null;
    // Only people writing to the app (no bots, no edits, no joins) count.
    if (body.type !== 'event_callback' || !ev || ev.type !== 'message' || ev.subtype || ev.bot_id || typeof ev.user !== 'string') return { messages: [] };
    const team = typeof body.team_id === 'string' ? body.team_id : '';
    const at = when(typeof ev.ts === 'string' ? Math.floor(Number(ev.ts)) : null);
    if (typeof body.event_id === 'string' && at && text(ev.text)) out.push({ id: body.event_id.slice(0, 200), from: `${team}:${ev.user}`.slice(0, 200), text: text(ev.text), at });
    return { messages: out };
  }
  // Our own shape (dev transport, SMS gateways relaying for us): one message or { messages: [...] }.
  const list = Array.isArray(body.messages) ? body.messages.slice(0, 50) : [body];
  for (const m of list) {
    if (!isObj(m) || typeof m.id !== 'string') continue;
    const from = kind === 'whatsapp' || kind === 'sms' ? e164(m.from) : typeof m.from === 'string' && /^[A-Za-z0-9:_@.-]{3,200}$/.test(m.from) ? m.from : null;
    const at = when(m.at);
    if (from && at && text(m.text)) out.push({ id: m.id.slice(0, 200), from, text: text(m.text), at });
  }
  return { messages: out };
}

/** A message older (or newer) than the window is a replay, even with a good signature. */
export function fresh(at: Date, scheme: Scheme, now = Date.now()): boolean {
  return Math.abs(now - at.getTime()) <= (scheme === 'meta' ? META_REPLAY_SECONDS : REPLAY_SECONDS) * 1000;
}

// ------------------------------------------------------------------------------------------ words people send

export type Keyword = { kind: 'stop' } | { kind: 'start' } | { kind: 'help' } | { kind: 'join'; code: string } | { kind: 'new'; text: string } | null;
const STOP = new Set(['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit', 'optout']);

/** Opt-out and opt-in words (carrier and WhatsApp practice), "HELP", "JOIN <code>" and "NEW <text>". */
export function keyword(raw: string): Keyword {
  const t = raw.trim();
  const word = t.toLowerCase().replace(/[^a-z]/g, '');
  if (STOP.has(word)) return { kind: 'stop' };
  if (word === 'start' || word === 'unstop') return { kind: 'start' };
  if (word === 'help') return { kind: 'help' };
  const join = /^join\s+([A-Za-z0-9]{6,12})$/i.exec(t);
  if (join) return { kind: 'join', code: join[1].toUpperCase() };
  const n = /^new\s+([\s\S]+)$/i.exec(t);
  if (n) return { kind: 'new', text: n[1].trim() };
  return null;
}

// ------------------------------------------------------------------------------------------ agent commands in chat

export type AgentCommand =
  | { kind: 'list' }
  | { kind: 'view'; number: string }
  | { kind: 'claim'; number: string }
  | { kind: 'reply' | 'note'; number: string; text: string }
  | { kind: 'agent_help' }
  | null;

/** US-G-057: what an agent types to the Teams / Slack app. Anything else is a requester's message. */
export function agentCommand(raw: string): AgentCommand {
  const t = raw.trim();
  if (/^(my\s+)?(tickets|queue|list)$/i.test(t)) return { kind: 'list' };
  if (/^agent\s+help$/i.test(t)) return { kind: 'agent_help' };
  const m = /^(view|claim|reply|note)\s+([A-Za-z][A-Za-z0-9]{0,9}-\d{1,9})(?:\s+([\s\S]+))?$/i.exec(t);
  if (!m) return null;
  const kind = m[1].toLowerCase() as 'view' | 'claim' | 'reply' | 'note';
  const number = m[2].toUpperCase();
  if (kind === 'reply' || kind === 'note') return m[3]?.trim() ? { kind, number, text: m[3].trim().slice(0, MAX_TEXT) } : null;
  return { kind, number };
}

export const AGENT_HELP = 'Agent commands: "tickets" (your open tickets), "view IT-123", "claim IT-123", "reply IT-123 <text>", "note IT-123 <text>". Approvals arrive as cards.';
export const REQUESTER_HELP = 'Write your question and we make a request for you. "NEW <text>" starts a new request. Send STOP to stop messages here.';

// ------------------------------------------------------------------------------------------ what goes out

/** WhatsApp lets a business write freely only within 24 hours of the person's last message (YX-NTF-07). */
export function inWindow(lastInbound: Date | null, now = Date.now()): boolean {
  return lastInbound !== null && now - lastInbound.getTime() < WINDOW_HOURS * 3_600_000;
}

export interface Template {
  /** WhatsApp: the approved template's name and language; SMS: the DLT template id and registered text. */
  name?: string;
  language?: string;
  dltTemplateId?: string | null;
  body?: string;
  status?: string;
}

export type Outgoing =
  | { mode: 'text'; text: string }
  | { mode: 'template'; template: Template; params: string[]; text: string }
  | { mode: 'none'; reason: 'no_approved_template' | 'not_linked' };

// DECISION NEEDED: India's DLT allows 30 characters per {#var#}, so an SMS reply carries only the start of the agent's
// words (then "…", and "open YukthiX"). Alternative: send a notice only, never words, by SMS.
/** DLT limit per {#var#} value (APX-A §4.3): longer values are cut with "…". */
export const DLT_VAR_MAX = 30;
const cut = (v: string, n: number) => (v.length > n ? `${v.slice(0, n - 1)}…` : v);

/** Fills an SMS template's {#var#} in order: the ticket number, then (when the template has a second) the reply. */
export function fillDlt(body: string, values: string[]): string {
  let i = 0;
  return body.replace(/\{#var#\}/g, () => cut(values[i++] ?? '', DLT_VAR_MAX));
}

/**
 * What one outside message says. A sensitive or private ticket, and anything outside the WhatsApp window or on SMS,
 * says only that there is a reply and where to read it; only an open, ordinary ticket's reply text goes out as words.
 */
export function outgoing(kind: MsgKind, o: { number: string; agentName: string; replyText: string; neutral: boolean; lastInbound: Date | null; template: Template | null }, now = Date.now()): Outgoing {
  const notice = `There is a new reply on your request ${o.number}. Open YukthiX to read it.`;
  const words = o.neutral ? notice : `${o.agentName} replied on ${o.number}:\n${cut(o.replyText.trim(), 1500)}`;
  if (kind === 'teams' || kind === 'slack') return { mode: 'text', text: words };
  const approved = o.template?.status === 'approved' ? o.template : null;
  if (kind === 'whatsapp') {
    if (inWindow(o.lastInbound, now)) return { mode: 'text', text: words };
    if (!approved?.name) return { mode: 'none', reason: 'no_approved_template' };
    return { mode: 'template', template: approved, params: [o.number], text: notice };
  }
  // SMS: always a registered template (India DLT); a second {#var#} carries the start of an ordinary reply.
  if (!approved?.body || !/\{#var#\}/.test(approved.body)) return { mode: 'none', reason: 'no_approved_template' };
  const values = [o.number, o.neutral ? 'Open YukthiX to read it' : o.replyText.replace(/\s+/g, ' ').trim()];
  return { mode: 'template', template: approved, params: values, text: fillDlt(approved.body, values) };
}

/** A phone number as it may be shown: +91••••••78. */
export const maskPhone = (e: string) => `${e.slice(0, 3)}${'•'.repeat(Math.max(0, e.length - 5))}${e.slice(-2)}`;
