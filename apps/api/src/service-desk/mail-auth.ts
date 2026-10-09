import { createHmac, timingSafeEqual } from 'crypto';
import { promises as dns } from 'dns';
import { readFileSync } from 'fs';
import { authenticate } from 'mailauth';

// SD-1.19 / §14.3: who really sent an email. We check SPF, DKIM, DMARC and ARC ourselves with mailauth and never trust
// a provider's own verdict. The decision below is pure, so every row of the §14.3 table is unit tested:
//   DMARC fail with policy reject / quarantine            → held (an admin may release it)
//   DMARC fail with policy none, or no DMARC and SPF and
//   DKIM both fail                                       → "sender not verified": never linked to a known person
//   pass                                                 → verified
// Founder rule (8 Oct 2026): spoofed mail never becomes a trusted requester.

export type DnsResolver = (name: string, type: string) => Promise<string[][] | string[]>;

export interface Envelope {
  /** The connecting server's IP, as the receiving MTA saw it (part of the signed webhook body). */
  ip: string;
  helo?: string;
  /** SMTP MAIL FROM. */
  mailFrom?: string;
  /** Our receiving host name (for the Authentication-Results line). */
  mta?: string;
  /** Polled company mailboxes: the IP comes from the top Received header their own provider wrote. */
  trustReceived?: boolean;
}

export interface AuthFacts {
  fromDomain: string;
  spf: string;
  /** Best DKIM result: pass when any signature passed. */
  dkim: string;
  /** A passing DKIM signature whose domain aligns with the From domain. */
  dkimAligned: boolean;
  spfAligned: boolean;
  dmarc: string;
  dmarcPolicy: string | null;
  arc: string;
  /** Domain that sealed the latest ARC set, when the chain passed. */
  arcSealer: string | null;
  /** What the sealer saw for DMARC before it forwarded the mail. */
  arcDmarc: string | null;
}

export type SenderAction = 'accept' | 'hold' | 'reject';
export interface SenderVerdict {
  action: SenderAction;
  /** Proven sender: may be linked to a known person, thread by subject, use email commands, get auto replies. */
  verified: boolean;
  /** Cryptographically signed by the From domain (email commands need it). */
  signed: boolean;
  reason: string | null;
}

/** The §14.3 decision. ownDomains: the company's own sending and mailbox domains. */
export function senderVerdict(f: AuthFacts, opts: { ownDomains: readonly string[]; trustedForwarders: readonly string[] }): SenderVerdict {
  const signed = f.dkimAligned;
  // Mail that claims to come from our own domains must carry our signature.
  if (opts.ownDomains.map((d) => d.toLowerCase()).includes(f.fromDomain) && !signed) {
    return { action: 'reject', verified: false, signed, reason: 'Claims to come from your own domain but is not signed by it' };
  }
  if (f.dmarc === 'temperror' || f.spf === 'temperror') return { action: 'hold', verified: false, signed, reason: 'The sender could not be checked just now' };
  if (f.dmarc === 'pass') return { action: 'accept', verified: true, signed, reason: null };
  // A forwarder the company trusts saw the original mail pass DMARC before it changed the message.
  if (f.arc === 'pass' && f.arcSealer && f.arcDmarc === 'pass' && opts.trustedForwarders.map((d) => d.toLowerCase()).includes(f.arcSealer)) {
    return { action: 'accept', verified: true, signed, reason: null };
  }
  if (f.dmarc === 'fail') {
    if (f.dmarcPolicy === 'reject' || f.dmarcPolicy === 'quarantine') return { action: 'hold', verified: false, signed, reason: "Failed the sender's own anti-spoofing check (DMARC)" };
    return { action: 'accept', verified: false, signed, reason: 'Sender not verified (DMARC failed, the domain does not enforce it)' };
  }
  // No DMARC record: SPF or a DKIM signature of the From domain is enough.
  if ((f.spf === 'pass' && f.spfAligned) || f.dkimAligned) return { action: 'accept', verified: true, signed, reason: null };
  return { action: 'accept', verified: false, signed, reason: 'Sender not verified (no SPF or DKIM pass)' };
}

const lower = (s: unknown) => (typeof s === 'string' ? s.toLowerCase() : '');

/** Runs mailauth over the raw message and boils the result down to the facts the decision needs. */
export async function checkSender(raw: Buffer, env: Envelope, fromAddress: string, resolver?: DnsResolver): Promise<AuthFacts> {
  const fromDomain = lower(fromAddress.split('@')[1] ?? '');
  const r = await authenticate(raw, { ip: env.ip || undefined, helo: env.helo || undefined, sender: env.mailFrom || undefined, mta: env.mta ?? 'yukthix', resolver, disableBimi: true, trustReceived: Boolean(env.trustReceived) });
  const dkims = r.dkim?.results ?? [];
  const dkimPass = dkims.find((d) => d.status?.result === 'pass');
  const dkimAligned = dkims.some((d) => d.status?.result === 'pass' && Boolean(d.status.aligned) && lower(d.status.aligned) === fromDomain);
  const spf = r.spf ? (r.spf.status?.result ?? 'none') : 'none';
  const spfDomain = r.spf ? lower(r.spf.domain) : '';
  const dmarc = r.dmarc ? r.dmarc : null;
  const arcSet = r.arc && r.arc.status?.result === 'pass' ? r.arc : null;
  const arcAar = (arcSet?.authenticationResults ?? {}) as { dmarc?: { result?: string } };
  return {
    fromDomain,
    spf,
    dkim: dkimPass ? 'pass' : (dkims[0]?.status?.result ?? 'none'),
    dkimAligned,
    spfAligned: spf === 'pass' && (spfDomain === fromDomain || spfDomain.endsWith(`.${fromDomain}`) || fromDomain.endsWith(`.${spfDomain}`)),
    dmarc: dmarc ? (dmarc.status?.result ?? 'none') : 'none',
    dmarcPolicy: dmarc ? lower((dmarc as { policy?: string }).policy) || null : null,
    arc: r.arc ? (r.arc.status?.result ?? 'none') : 'none',
    arcSealer: arcSet?.signature ? lower(arcSet.signature.signingDomain) : null,
    arcDmarc: arcAar.dmarc?.result ? lower(arcAar.dmarc.result) : null,
  };
}

/**
 * DNS for the checks. On a laptop, SD_MAIL_DEV_DNS may point at a JSON file of TXT records ({"TXT:_dmarc.x.test":
 * ["v=DMARC1; p=reject"]}) so signed test mail can be proven without real DNS; refused in production.
 */
export function resolverFromEnv(env = process.env): DnsResolver | undefined {
  if (!env.SD_MAIL_DEV_DNS) return undefined;
  if (env.NODE_ENV === 'production') throw new Error('SD_MAIL_DEV_DNS is for laptops only.');
  const file = env.SD_MAIL_DEV_DNS;
  return async (name, type) => {
    // Read on every look-up, so a test can add records while the API runs.
    const zone = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string[]>;
    const hit = zone[`${type}:${name.toLowerCase()}`];
    if (hit) return type === 'TXT' ? hit.map((x) => [x]) : hit;
    if (type === 'TXT' || type === 'MX' || type === 'A' || type === 'AAAA') {
      const e = new Error(`${name} not in the dev zone`) as Error & { code: string };
      e.code = 'ENOTFOUND';
      throw e;
    }
    return dns.resolve(name, type as 'TXT') as Promise<string[][]>;
  };
}

// ------------------------------------------------------------------------------------------ loops and auto replies

/** §9.1 step 3: an automatic message (out of office, list mail, bounces). No ticket and never an acknowledgement. */
export function autoReplyReason(headers: Map<string, string>, from: string): string | null {
  const h = (k: string) => (headers.get(k) ?? '').toLowerCase().trim();
  if (h('auto-submitted') && h('auto-submitted') !== 'no') return `Auto-Submitted: ${h('auto-submitted')}`;
  if (['bulk', 'junk', 'list', 'auto_reply'].includes(h('precedence'))) return `Precedence: ${h('precedence')}`;
  for (const k of ['x-autoreply', 'x-autorespond', 'x-auto-response-suppress', 'list-id', 'list-unsubscribe', 'x-autogenerated']) {
    // X-Auto-Response-Suppress is set by Exchange on its own automatic mail; on ordinary mail it is "OOF" at most.
    if (headers.has(k) && !(k === 'x-auto-response-suppress' && !/all|autoreply/i.test(h(k)))) return `${k} header`;
  }
  if (/^(mailer-daemon|postmaster|no-?reply|do-?not-?reply)@/i.test(from)) return 'Sent by an automatic address';
  return null;
}

// ------------------------------------------------------------------------------------------ reply-to tokens

/**
 * §9.1 step 6a: our reply-to address carries the ticket number and an HMAC, e.g. support+t.it-1042.3f9a0c1b2d@acme.com.
 * Lower case, because mail servers may lower-case the local part. The HMAC binds company, mailbox and ticket.
 */
export function replyToken(secret: string, organizationId: string, number: string): string {
  const n = number.toLowerCase();
  return `t.${n}.${createHmac('sha256', secret).update(`${organizationId}:${n}`).digest('hex').slice(0, 12)}`;
}

/** The ticket number in a token found in any of these addresses, or null when none is genuine. */
export function readReplyToken(secret: string, organizationId: string, addresses: readonly string[]): string | null {
  for (const a of addresses) {
    const m = /^[^@+]+\+t\.([a-z0-9-]{2,40})\.([0-9a-f]{12})@/i.exec(a.trim());
    if (!m) continue;
    const want = Buffer.from(replyToken(secret, organizationId, m[1]).slice(-12));
    const got = Buffer.from(m[2].toLowerCase());
    if (want.length === got.length && timingSafeEqual(want, got)) return m[1].toUpperCase();
  }
  return null;
}

/** support@acme.com + token → support+t.…@acme.com */
export const withToken = (address: string, token: string) => address.replace('@', `+${token}@`);
