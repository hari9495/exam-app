import { createHmac, timingSafeEqual } from 'crypto';
import { publicOnlyLookup } from '../common/ssrf';

// SD-1.19 inbound adapters (§9.1, D5). Every way mail reaches a desk ends in the same pipeline (MailInService.accept):
//   hosted / forward  the mail provider (chosen with hosting, D5) posts the raw MIME to our webhook, signed per mailbox;
//   m365_oauth        Microsoft Graph, the company's own app registration (Mail.Read, app-only), raw MIME by $value;
//   gmail_oauth       the Gmail API (gmail.readonly) with the company's own OAuth client, format=raw;
//   imap              imapflow with an app password.
// The SDK clients are made by small factories so the pollers are unit tested with fakes; nothing here decides trust
// (the pipeline checks SPF / DKIM / DMARC itself).

export interface PolledMessage {
  /** Provider id, for logs. */
  id: string;
  raw: Buffer;
}
export interface PollResult {
  messages: PolledMessage[];
  /** Where to start next time (IMAP UID, Graph receivedDateTime, Gmail internalDate). */
  cursor: string | null;
}
export interface MailboxPoller {
  poll(cursor: string | null): Promise<PollResult>;
}
const BATCH = 25;

// ------------------------------------------------------------------------------------------ hosted webhook signature

export const SIGNATURE_HEADER = 'x-yukthix-signature';
export const TIMESTAMP_HEADER = 'x-yukthix-timestamp';
export const REPLAY_SECONDS = 5 * 60;

export interface WebhookEnvelope {
  ip: string;
  helo: string;
  mailFrom: string;
  rcptTo: string;
}

/** What the provider signs: timestamp, the envelope it saw, then the raw MIME bytes. */
export function webhookPayload(ts: string, env: WebhookEnvelope, raw: Buffer): Buffer {
  return Buffer.concat([Buffer.from(`${ts}\n${env.ip}\n${env.helo}\n${env.mailFrom}\n${env.rcptTo}\n`, 'utf8'), raw]);
}

export function signWebhook(secret: string, ts: string, env: WebhookEnvelope, raw: Buffer): string {
  return `sha256=${createHmac('sha256', secret).update(webhookPayload(ts, env, raw)).digest('hex')}`;
}

/** Constant-time check of the signature and a 5-minute replay window (§14.4 webhooks in). */
export function verifyWebhook(secret: string, ts: string | undefined, signature: string | undefined, env: WebhookEnvelope, raw: Buffer, now = Date.now()): boolean {
  if (!ts || !signature || !/^\d{9,11}$/.test(ts)) return false;
  if (Math.abs(now / 1000 - Number(ts)) > REPLAY_SECONDS) return false;
  const want = Buffer.from(signWebhook(secret, ts, env, raw));
  const got = Buffer.from(signature);
  return want.length === got.length && timingSafeEqual(want, got);
}

// ------------------------------------------------------------------------------------------ IMAP

export interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  /** TLS name when host is the checked address. */
  servername?: string;
}
/** The part of imapflow's ImapFlow we use. */
export interface ImapClientLike {
  connect(): Promise<void>;
  logout(): Promise<void>;
  mailboxOpen(path: string): Promise<{ uidValidity: bigint | number }>;
  fetchAll(range: string, query: { uid: boolean; source: boolean }, options: { uid: boolean }): Promise<{ uid: number; source?: Buffer }[]>;
}

export class ImapPoller implements MailboxPoller {
  constructor(
    private readonly config: ImapConfig,
    private readonly make: (c: ImapConfig) => ImapClientLike = (c) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ImapFlow } = require('imapflow');
      return new ImapFlow({ host: c.host, port: c.port, secure: c.secure, tls: { servername: c.servername }, auth: { user: c.user, pass: c.password }, logger: false }) as ImapClientLike;
    },
    /** §14.8: the company's IMAP host must be public; we connect to exactly the address we checked (no DNS rebinding). */
    private readonly lookup: (host: string) => Promise<string> = (host) =>
      new Promise((resolve, reject) => publicOnlyLookup(host, {}, (e, address) => (e ? reject(e) : resolve(String(address))))),
  ) {}

  /** Cursor "<uidValidity>:<last uid>". A changed UIDVALIDITY starts again from the newest messages only. */
  async poll(cursor: string | null): Promise<PollResult> {
    const client = this.make({ ...this.config, host: await this.lookup(this.config.host), servername: this.config.host });
    await client.connect();
    try {
      const box = await client.mailboxOpen('INBOX');
      const validity = String(box.uidValidity);
      const [v, last] = (cursor ?? '').split(':');
      const from = v === validity ? Number(last) + 1 : 1;
      const rows = await client.fetchAll(`${from}:*`, { uid: true, source: true }, { uid: true });
      // IMAP returns the last message for "n:*" even when n is past the end.
      const fresh = rows.filter((r) => r.uid >= from && r.source).sort((a, b) => a.uid - b.uid).slice(0, BATCH);
      const top = fresh.length ? fresh[fresh.length - 1].uid : from - 1;
      return { messages: fresh.map((r) => ({ id: String(r.uid), raw: r.source! })), cursor: `${validity}:${Math.max(0, top)}` };
    } finally {
      await client.logout().catch(() => undefined);
    }
  }
}

// ------------------------------------------------------------------------------------------ Microsoft 365 (Graph)

export interface GraphConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  /** The mailbox's user principal name or id. */
  user: string;
}
/** GET on Graph with the app token: JSON, or the raw bytes for $value. */
export interface GraphLike {
  getJson<T>(path: string): Promise<T>;
  getRaw(path: string): Promise<Buffer>;
}

export function graphClient(c: GraphConfig): GraphLike {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ConfidentialClientApplication } = require('@azure/msal-node');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Client } = require('@microsoft/microsoft-graph-client');
  const msal = new ConfidentialClientApplication({ auth: { clientId: c.clientId, clientSecret: c.clientSecret, authority: `https://login.microsoftonline.com/${encodeURIComponent(c.tenantId)}` } });
  const client = Client.init({
    authProvider: (done: (e: unknown, token: string | null) => void) => {
      msal
        .acquireTokenByClientCredential({ scopes: ['https://graph.microsoft.com/.default'] })
        .then((r: { accessToken: string } | null) => done(null, r?.accessToken ?? null))
        .catch((e: unknown) => done(e, null));
    },
  });
  return {
    getJson: (path) => client.api(path).get(),
    getRaw: async (path) => {
      const res = await client.api(path).responseType('arraybuffer').get();
      return Buffer.from(res as ArrayBuffer);
    },
  };
}

export class GraphPoller implements MailboxPoller {
  constructor(
    private readonly config: GraphConfig,
    private readonly make: (c: GraphConfig) => GraphLike = graphClient,
    /** SD-2.24: an agent's mailbox reads 'sentitems' too (their own replies in a matched thread). */
    private readonly folder: 'inbox' | 'sentitems' = 'inbox',
  ) {}

  /** Cursor = receivedDateTime of the newest message taken (Graph has no UIDs for app-only polling of a folder). */
  async poll(cursor: string | null): Promise<PollResult> {
    const g = this.make(this.config);
    const user = encodeURIComponent(this.config.user);
    const since = cursor && !Number.isNaN(Date.parse(cursor)) ? new Date(cursor).toISOString() : new Date(Date.now() - 3_600_000).toISOString();
    const list = await g.getJson<{ value: { id: string; receivedDateTime: string }[] }>(
      `/users/${user}/mailFolders/${this.folder}/messages?$select=id,receivedDateTime&$orderby=receivedDateTime asc&$top=${BATCH}&$filter=receivedDateTime gt ${since}`,
    );
    const messages: PolledMessage[] = [];
    for (const m of list.value ?? []) messages.push({ id: m.id, raw: await g.getRaw(`/users/${user}/messages/${encodeURIComponent(m.id)}/$value`) });
    const last = list.value?.[list.value.length - 1]?.receivedDateTime;
    return { messages, cursor: last ?? cursor ?? since };
  }
}

// ------------------------------------------------------------------------------------------ Gmail

export interface GmailConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}
export interface GmailLike {
  list(q: string, max: number): Promise<{ id: string }[]>;
  raw(id: string): Promise<{ raw: string; internalDate: string }>;
}

export function gmailClient(c: GmailConfig): GmailLike {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { gmail, auth } = require('@googleapis/gmail');
  const oauth = new auth.OAuth2(c.clientId, c.clientSecret);
  oauth.setCredentials({ refresh_token: c.refreshToken });
  const api = gmail({ version: 'v1', auth: oauth });
  return {
    list: async (q, max) => ((await api.users.messages.list({ userId: 'me', q, maxResults: max })).data.messages ?? []).map((m: { id: string }) => ({ id: m.id })),
    raw: async (id) => {
      const r = (await api.users.messages.get({ userId: 'me', id, format: 'raw' })).data;
      return { raw: r.raw ?? '', internalDate: r.internalDate ?? '0' };
    },
  };
}

export class GmailPoller implements MailboxPoller {
  constructor(
    private readonly config: GmailConfig,
    private readonly make: (c: GmailConfig) => GmailLike = gmailClient,
    /** SD-2.24: an agent's mailbox reads sent mail too. */
    private readonly where = 'in:inbox',
  ) {}

  /** Cursor = internalDate (ms) of the newest message taken; Gmail's "after:" works in whole seconds. */
  async poll(cursor: string | null): Promise<PollResult> {
    const g = this.make(this.config);
    const sinceMs = cursor && /^\d+$/.test(cursor) ? Number(cursor) : Date.now() - 3_600_000;
    const ids = await g.list(`${this.where} after:${Math.floor(sinceMs / 1000)}`, BATCH);
    const got: { id: string; raw: Buffer; at: number }[] = [];
    for (const { id } of ids) {
      const m = await g.raw(id);
      const at = Number(m.internalDate);
      if (at <= sinceMs) continue;
      got.push({ id, raw: Buffer.from(m.raw, 'base64url'), at });
    }
    got.sort((a, b) => a.at - b.at);
    return { messages: got.map(({ id, raw }) => ({ id, raw })), cursor: String(got.length ? got[got.length - 1].at : sinceMs) };
  }
}

/** The poller for a mailbox kind and its decrypted settings. Hosted and forward mailboxes are not polled. */
export function pollerFor(kind: string, config: unknown): MailboxPoller | null {
  const c = config as Record<string, unknown>;
  if (kind === 'imap') return new ImapPoller({ host: String(c.host), port: Number(c.port ?? 993), secure: c.secure !== false, user: String(c.user), password: String(c.password) });
  if (kind === 'm365_oauth') return new GraphPoller({ tenantId: String(c.tenantId), clientId: String(c.clientId), clientSecret: String(c.clientSecret), user: String(c.user) });
  if (kind === 'gmail_oauth') return new GmailPoller({ clientId: String(c.clientId), clientSecret: String(c.clientSecret), refreshToken: String(c.refreshToken) });
  return null;
}
