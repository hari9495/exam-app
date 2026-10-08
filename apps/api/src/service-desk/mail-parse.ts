import { AddressObject, simpleParser } from 'mailparser';
import { cleanHtml, htmlToText } from './rich-text';

// email-reply-parser 1.x is CommonJS without type declarations.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const EmailReplyParser = require('email-reply-parser') as new () => { parseReply(text: string): string };

// SD-1.19 §9.1 steps 4-7: parse the MIME with mailparser, keep only plain text (HTML goes through the sanitize-html
// allow-list first, so remote images and tracking pixels never survive), cut quoted history with email-reply-parser,
// and read delivery reports (bounces, complaints) so they update the bounce list instead of becoming tickets.

/** Everything above this line in our emails is the reply (we put it in every desk email). */
export const REPLY_MARKER = '##- Please type your reply above this line -##';
const MAX_ATTACHMENTS = 10;
const MAX_HEADER = 2000;

export interface ParsedEmail {
  messageId: string;
  from: { address: string; name: string } | null;
  to: string[];
  cc: string[];
  /** Delivered-To / X-Original-To: where a forwarded copy was really addressed. */
  deliveredTo: string[];
  subject: string;
  inReplyTo: string | null;
  references: string[];
  /** Lower-case header name → first value, each cut to 2,000 characters. */
  headers: Map<string, string>;
  /** The new text only (quoted history and signatures removed). */
  text: string;
  /** All of the text, for "show original". */
  fullText: string;
  attachments: { fileName: string; contentType: string; content: Buffer; inline: boolean }[];
  /** More files than we take. */
  droppedAttachments: number;
  report: { kind: 'bounce' | 'complaint'; recipients: string[]; detail: string } | null;
  /** Our own Message-IDs quoted anywhere in the email (a genuine delivery report quotes the mail it is about). */
  ourIds: string[];
}

const addresses = (a: AddressObject | AddressObject[] | undefined): string[] =>
  (Array.isArray(a) ? a : a ? [a] : [])
    .flatMap((x) => x.value)
    .flatMap((v) => (v.group ? v.group : [v]))
    .map((v) => (v.address ?? '').trim().toLowerCase())
    .filter((v) => /^[^@\s]+@[^@\s]+$/.test(v));

const ids = (v: unknown): string[] => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/\s+/) : []).map((x: string) => x.trim()).filter((x) => /^<[^<>\s]{1,290}>$/.test(x));

/** The reply part of a plain-text email (only the first 20,000 characters are looked at). */
export function visibleReply(text: string): string {
  const cut = text.split(REPLY_MARKER)[0].slice(0, 20_000);
  return new EmailReplyParser().parseReply(cut).trim();
}

/** Final-Recipient / Status lines of a delivery-status part, or the original recipient of a complaint. */
function readReport(type: string, parts: { contentType: string; content: Buffer }[], text: string): ParsedEmail['report'] {
  // mailparser keeps a message/delivery-status or feedback-report part as text, or as a file when it is encoded.
  const part = (t: string) => parts.find((p) => p.contentType === t)?.content.toString('utf8') ?? text;
  if (type === 'delivery-status') {
    const ds = part('message/delivery-status');
    const failed = ds.split(/\r?\n\r?\n/).filter((b) => /^Action:\s*failed/im.test(b) || /^Status:\s*5\./im.test(b));
    const recipients = failed.map((b) => /^Final-Recipient:\s*rfc822;\s*(\S+)/im.exec(b)?.[1]?.toLowerCase()).filter((x): x is string => Boolean(x));
    const status = failed.map((b) => /^Diagnostic-Code:\s*(.+)$/im.exec(b)?.[1] ?? /^Status:\s*(\S+)/im.exec(b)?.[1]).find(Boolean) ?? 'failed';
    return recipients.length ? { kind: 'bounce', recipients: [...new Set(recipients)], detail: status.slice(0, 300) } : null;
  }
  if (type === 'feedback-report') {
    const fr = part('message/feedback-report');
    const recipients = [...fr.matchAll(/^Original-Rcpt-To:\s*(\S+)/gim)].map((m) => m[1].toLowerCase());
    return recipients.length ? { kind: 'complaint', recipients: [...new Set(recipients)], detail: (/^Feedback-Type:\s*(\S+)/im.exec(fr)?.[1] ?? 'abuse').slice(0, 300) } : null;
  }
  return null;
}

export async function parseEmail(raw: Buffer): Promise<ParsedEmail> {
  const m = await simpleParser(raw, { skipImageLinks: true, skipTextToHtml: true, skipTextLinks: true, maxHtmlLengthToParse: 2_000_000 });
  const headers = new Map<string, string>();
  for (const line of m.headerLines) {
    if (headers.has(line.key)) continue;
    headers.set(line.key, line.line.slice(line.key.length + 1).trim().slice(0, MAX_HEADER));
  }
  const fromValue = m.from?.value?.[0];
  const from = fromValue?.address ? { address: fromValue.address.trim().toLowerCase(), name: (fromValue.name ?? '').replace(/[\r\n"]/g, '').trim().slice(0, 200) } : null;
  // Text first; HTML only through the allow-list (no images, no styles, no scripts), then as text.
  const fullText = (m.text?.trim() ? m.text : m.html ? htmlToText(cleanHtml(m.html)) : '').replace(/\r\n/g, '\n').slice(0, 100_000);
  const contentType = m.headers.get('content-type') as { value?: string; params?: Record<string, string> } | undefined;
  const reportType = contentType?.value === 'multipart/report' ? (contentType.params?.['report-type'] ?? '').toLowerCase() : '';
  const files = m.attachments.filter((a) => !['message/delivery-status', 'message/feedback-report', 'text/rfc822-headers'].includes(a.contentType));
  return {
    messageId: ids(m.messageId)[0] ?? '',
    from,
    to: addresses(m.to),
    cc: addresses(m.cc),
    deliveredTo: ['delivered-to', 'x-original-to', 'envelope-to']
      .map((k) => headers.get(k))
      .filter((v): v is string => Boolean(v))
      .map((v) => v.replace(/[<>]/g, '').trim().toLowerCase()),
    subject: (m.subject ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 300),
    inReplyTo: ids(m.inReplyTo)[0] ?? null,
    references: ids(m.references).slice(-20),
    headers,
    text: visibleReply(fullText),
    fullText,
    attachments: files.slice(0, MAX_ATTACHMENTS).map((a) => ({ fileName: a.filename ?? 'attachment', contentType: a.contentType, content: a.content, inline: a.related || a.contentDisposition === 'inline' })),
    droppedAttachments: Math.max(0, files.length - MAX_ATTACHMENTS),
    report: reportType ? readReport(reportType, m.attachments, m.text ?? '') : null,
    ourIds: reportType ? [...new Set([...raw.toString('latin1').matchAll(/<sd\.[0-9a-f-]{36}@[^<>\s]{1,200}>/gi)].map((x) => x[0]))].slice(0, 20) : [],
  };
}
