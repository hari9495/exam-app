import mjml2html from 'mjml';
import { escapeHtml } from '../notifications/notification-email-render';

// YukthiX account and security emails (sign-in codes, password reset, sign-in alerts, locks,
// admin security notices): one branded layout, an HTML part and a plain-text part.
//
// Built with MJML (MIT): it compiles a small component markup into the table-based, Outlook-safe,
// responsive HTML that email clients need, so none of that is hand-written. Chosen over React Email
// because the API has no React/JSX toolchain; MJML is one dependency and plain strings.
//
// Safety: no caller value ever passes through the MJML parser. Each value becomes a numbered
// placeholder, the MJML (which then depends only on the email's structure) is compiled once and
// cached, and the values are HTML-escaped into the compiled HTML in a single pass.

export type Block =
  | { kind: 'text'; text: string }
  | { kind: 'code'; code: string }
  | { kind: 'button'; label: string; href: string }
  | { kind: 'details'; rows: [string, string][] }
  | { kind: 'note'; text: string };

export const text = (t: string): Block => ({ kind: 'text', text: t });
export const note = (t: string): Block => ({ kind: 'note', text: t });
export const button = (label: string, href: string): Block => ({ kind: 'button', label, href });
export const details = (rows: [string, string][]): Block => ({ kind: 'details', rows });

export interface AccountEmailInput {
  to: string;
  /** The company (tenant) name; null when it isn't known. */
  company?: string | null;
  subject: string;
  /** Inbox preview line. */
  preheader: string;
  heading: string;
  blocks: Block[];
  /** Footer safety line; null to leave it out (the code email has its own). */
  safety?: string | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const SAFETY = 'YukthiX will never ask for your password or a sign-in code.';
const FONT = "'IBM Plex Sans', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

// Design system §3: Azure 500 primary, slate neutrals; dark-mode tokens for clients that honour
// prefers-color-scheme (Apple Mail, Outlook for Mac/iOS, some webmail).
const STYLE = `
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  .yx-code-digits span { margin-left: 0.4em; }
  @media only screen and (max-width: 480px) {
    .yx-card { margin: 0 12px !important; width: auto !important; }
  }
  @media (prefers-color-scheme: dark) {
    body, .yx-page, div[role="article"] { background-color: #0B1220 !important; }
    .yx-card, .yx-card table, .yx-card td { background-color: #111A2B !important; border-color: #1E293B !important; }
    .yx-card .yx-code table, .yx-card .yx-code td { background-color: #1A2747 !important; border-radius: 10px; }
    .yx-ink, .yx-ink div, .yx-ink h1, .yx-ink td { color: #E2E8F0 !important; }
    .yx-muted div, .yx-muted td { color: #94A3B8 !important; }
    .yx-x { color: #8FA4F0 !important; }
    .yx-card .yx-btn table td, .yx-card .yx-btn a { background-color: #3B5FE3 !important; color: #FFFFFF !important; }
  }`;

const compiled = new Map<string, Promise<string>>();

function compile(source: string): Promise<string> {
  let html = compiled.get(source);
  if (!html) {
    html = mjml2html(source, { validationLevel: 'strict', keepComments: false }).then((r) => r.html);
    html.catch(() => compiled.delete(source));
    compiled.set(source, html);
  }
  return html;
}

// "532112" -> "532" + spaced "112": the gap is CSS, so copying the code gives the bare digits.
const codeMarkup = (slot: (v: string) => string, code: string) =>
  code.length === 6 ? `${slot(code.slice(0, 3))}<span>${slot(code.slice(3))}</span>` : slot(code);

export async function renderAccountEmail(input: AccountEmailInput): Promise<RenderedEmail> {
  const values: string[] = [];
  const slot = (v: string) => `%%${values.push(v) - 1}%%`;
  const section = (inner: string, padding = '0 32px') => `<mj-section padding="${padding}"><mj-column>${inner}</mj-column></mj-section>`;

  const blocks = input.blocks
    .map((b) => {
      switch (b.kind) {
        case 'text':
          return section(`<mj-text css-class="yx-ink">${slot(b.text)}</mj-text>`);
        case 'note':
          return section(`<mj-text css-class="yx-muted" color="#475569" font-size="13px" line-height="20px">${slot(b.text)}</mj-text>`);
        case 'button':
          return section(
            `<mj-button css-class="yx-btn" href="${slot(b.href)}" align="left" background-color="#3B5FE3" color="#FFFFFF" border-radius="8px" font-size="15px" font-weight="500" inner-padding="12px 24px" padding="4px 0 24px">${slot(b.label)}</mj-button>`,
          );
        case 'details':
          return section(
            `<mj-table css-class="yx-muted" padding="0 0 20px" font-size="14px" line-height="20px" color="#0B1220">` +
              b.rows
                .map(([k, v]) => `<tr><td style="padding:6px 16px 6px 0;color:#475569;width:96px;vertical-align:top;border-top:1px solid #E2E8F0">${slot(k)}</td><td class="yx-ink" style="padding:6px 0;vertical-align:top;border-top:1px solid #E2E8F0">${slot(v)}</td></tr>`)
                .join('') +
              '</mj-table>',
          );
        case 'code':
          return (
            `<mj-section padding="4px 32px 24px"><mj-column css-class="yx-code" background-color="#EEF2FD" border-radius="10px" padding="20px 12px">` +
            `<mj-text css-class="yx-ink yx-code-digits" align="center" padding="0" font-family="${MONO}" font-size="34px" line-height="40px" font-weight="600" letter-spacing="4px" color="#0B1220">${codeMarkup(slot, b.code)}</mj-text>` +
            '</mj-column></mj-section>'
          );
      }
    })
    .join('');

  const sentTo = ['Sent to ' + slot(input.to), ...(input.company ? [slot(input.company)] : []), 'YukthiX'].join(' &middot; ');
  const safety = input.safety === undefined ? SAFETY : input.safety;

  const source = `<mjml lang="en" dir="ltr">
  <mj-head>
    <mj-title>${slot(input.subject)}</mj-title>
    <mj-preview>${slot(input.preheader)}</mj-preview>
    <mj-attributes>
      <mj-all font-family="${FONT}" />
      <mj-text color="#0B1220" font-size="15px" line-height="24px" padding="0 0 16px" />
    </mj-attributes>
    <mj-raw><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"></mj-raw>
    <mj-style>${STYLE}</mj-style>
  </mj-head>
  <mj-body background-color="#F7F8FA" width="600px" css-class="yx-page">
    <mj-section padding="32px 24px 16px">
      <mj-column>
        <mj-text css-class="yx-ink" padding="0" font-size="22px" line-height="28px" font-weight="600" letter-spacing="-0.01em">Yukthi<span class="yx-x" style="color:#3B5FE3">X</span></mj-text>
      </mj-column>
    </mj-section>
    <mj-wrapper css-class="yx-card" background-color="#FFFFFF" border="1px solid #E2E8F0" border-radius="12px" padding="32px 0 12px">
      ${section(`<mj-text css-class="yx-ink" padding="0 0 16px"><h1 style="margin:0;font-size:22px;line-height:28px;font-weight:600;letter-spacing:-0.01em">${slot(input.heading)}</h1></mj-text>`)}
      ${blocks}
    </mj-wrapper>
    <mj-section padding="20px 24px 40px">
      <mj-column>
        <mj-text css-class="yx-muted" color="#475569" font-size="12px" line-height="18px" padding="0 0 4px">${sentTo}</mj-text>
        ${safety ? `<mj-text css-class="yx-muted" color="#475569" font-size="12px" line-height="18px" padding="0">${slot(safety)}</mj-text>` : ''}
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

  const html = (await compile(source)).replace(/%%(\d+)%%/g, (_, i: string) => escapeHtml(values[Number(i)]));
  return { subject: input.subject, html, text: plainText(input, safety) };
}

function plainText(input: AccountEmailInput, safety: string | null): string {
  const lines = [input.heading, ''];
  for (const b of input.blocks) {
    if (b.kind === 'text' || b.kind === 'note') lines.push(b.text, '');
    else if (b.kind === 'code') lines.push(b.code, '');
    else if (b.kind === 'button') lines.push(`${b.label}: ${b.href}`, '');
    else lines.push(...b.rows.map(([k, v]) => `${k}: ${v}`), '');
  }
  lines.push('--', ['Sent to ' + input.to, ...(input.company ? [input.company] : []), 'YukthiX'].join(' · '));
  if (safety) lines.push(safety);
  return lines.join('\n');
}

// ---- formatting helpers ------------------------------------------------------------------------

const DEFAULT_TIME_ZONE = 'Asia/Kolkata';

/** "7 Oct 2026, 3:42 pm IST" in the given IANA zone (IST when unknown or invalid). */
export function formatWhen(date: Date, timeZone?: string | null): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short' };
  try {
    return new Intl.DateTimeFormat('en-IN', { ...opts, timeZone: timeZone || DEFAULT_TIME_ZONE }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-IN', { ...opts, timeZone: DEFAULT_TIME_ZONE }).format(date);
  }
}

/** "Chrome on Windows" from a user agent; null when nothing is recognised. */
export function describeDevice(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const ua = userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\/|CriOS\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : null;
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os;
}

/** "India" from "IN"; null when unknown. */
export function countryName(code: string | null | undefined): string | null {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return null;
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase()) ?? null;
  } catch {
    return null;
  }
}

export const appUrl = (path: string) => `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}${path}`;

// ---- the emails ----------------------------------------------------------------------------------

export type CodePurpose = 'sign_in' | 'mfa' | 'mobile';

const CODE_COPY: Record<CodePurpose, { noun: string; heading: string; action: (where: string) => string; notYou: string }> = {
  sign_in: {
    noun: 'sign-in code',
    heading: 'Your sign-in code',
    action: (where) => `Enter this code to sign in to ${where}.`,
    notYou: "Didn't try to sign in? You can ignore this email; someone may have typed your address by mistake. Your account is safe.",
  },
  mfa: {
    noun: 'verification code',
    heading: 'Your verification code',
    action: (where) => `Enter this code to confirm it's you at ${where}.`,
    notYou: "Didn't try to sign in? Someone may know your password. Change it after you sign in.",
  },
  mobile: {
    noun: 'verification code',
    heading: 'Verify your mobile number',
    action: (where) => `Enter this code to verify your mobile number at ${where}.`,
    notYou: "Didn't add a mobile number? You can ignore this email. Your account is safe.",
  },
};

export function codeEmail(i: { to: string; code: string; purpose: CodePurpose; company?: string | null; minutes: number; insteadOfText?: boolean }): Promise<RenderedEmail> {
  const c = CODE_COPY[i.purpose];
  return renderAccountEmail({
    to: i.to,
    company: i.company,
    subject: `${i.code} is your YukthiX ${c.noun}`,
    preheader: `It works once and expires in ${i.minutes} minutes.`,
    heading: c.heading,
    safety: null,
    blocks: [
      ...(i.insteadOfText ? [text("We couldn't send this code by text message, so here it is by email.")] : []),
      { kind: 'code', code: i.code },
      text(`${c.action(i.company || 'YukthiX')} It works once and expires in ${i.minutes} minutes.`),
      text(c.notYou),
      note('YukthiX will never ask you for this code by phone, email or chat.'),
    ],
  });
}

export function passwordResetEmail(i: { to: string; link: string; company?: string | null; minutes: number }): Promise<RenderedEmail> {
  return renderAccountEmail({
    to: i.to,
    company: i.company,
    subject: i.company ? `Reset your ${i.company} password` : 'Reset your YukthiX password',
    preheader: `This link expires in ${i.minutes} minutes.`,
    heading: 'Reset your password',
    blocks: [
      text(`We got a request to reset the password for your ${i.company ? `${i.company} account on YukthiX` : 'YukthiX account'}. The link works once and expires in ${i.minutes} minutes.`),
      button('Reset password', i.link),
      text("Didn't ask for this? Ignore this email; your password stays the same."),
      note(`Button not working? Paste this link into your browser: ${i.link}`),
    ],
  });
}

export interface SignInFacts {
  when: Date;
  timeZone?: string | null;
  userAgent?: string | null;
  country?: string | null;
  ip?: string | null;
}

function signInRows(f: SignInFacts): [string, string][] {
  const place = countryName(f.country);
  return [
    ['When', formatWhen(f.when, f.timeZone)],
    ['Device', describeDevice(f.userAgent) ?? 'Unknown device'],
    ...(place ? [['Place', `${place} (approximate)`] as [string, string]] : []),
    ...(f.ip ? [['IP address', f.ip] as [string, string]] : []),
  ];
}

export function newSignInEmail(i: { to: string; company?: string | null; facts: SignInFacts; newCountry?: boolean }): Promise<RenderedEmail> {
  const where = i.company || 'YukthiX';
  return renderAccountEmail({
    to: i.to,
    company: i.company,
    subject: i.newCountry ? 'Sign-in to your YukthiX account from a new country' : 'New sign-in to your YukthiX account',
    preheader: `${describeDevice(i.facts.userAgent) ?? 'A new device'} signed in to ${where}.`,
    heading: i.newCountry ? 'Sign-in from a new country' : 'New sign-in to your account',
    blocks: [
      text(
        i.newCountry
          ? `Your ${where} account was just used from a country it hasn't been used from before.`
          : `Your ${where} account was just signed in to from a device we haven't seen before.`,
      ),
      details(signInRows(i.facts)),
      text('If this was you, there is nothing to do.'),
      text("If it wasn't, open My security, sign out the sessions you don't know and change your password."),
      button('This wasn’t me', appUrl('/yx/me/security')),
    ],
  });
}

export function accountLockedEmail(i: { to: string; company?: string | null; facts: SignInFacts; lockedForSeconds?: number | null }): Promise<RenderedEmail> {
  const unlocksAt = i.lockedForSeconds ? new Date(i.facts.when.getTime() + i.lockedForSeconds * 1000) : null;
  return renderAccountEmail({
    to: i.to,
    company: i.company,
    subject: 'Sign-in to your YukthiX account was temporarily locked',
    preheader: unlocksAt ? `It unlocks at ${formatWhen(unlocksAt, i.facts.timeZone)}.` : 'It unlocks on its own shortly.',
    heading: 'Sign-in is paused for a while',
    blocks: [
      text(`There were too many wrong tries to sign in to your ${i.company || 'YukthiX'} account, so we paused sign-in to keep it safe.`),
      details([...(unlocksAt ? [['Unlocks', formatWhen(unlocksAt, i.facts.timeZone)] as [string, string]] : []), ...signInRows(i.facts)]),
      text(`${unlocksAt ? 'After that time' : 'In a little while'} you can sign in again as usual. Can't wait? Reset your password or ask your administrator to unlock your account.`),
      text("If this wasn't you, change your password after you sign in."),
      button('Reset password', appUrl('/yx/forgot-password')),
    ],
  });
}

/** A change to the person's own account (MFA, recovery codes, mobile number, unlock...). */
export function securityChangeEmail(i: { to: string; company?: string | null; subject: string; what: string; when: Date; timeZone?: string | null }): Promise<RenderedEmail> {
  return renderAccountEmail({
    to: i.to,
    company: i.company,
    subject: i.subject,
    preheader: i.what,
    heading: i.subject.replace(/ (on|to|from) your YukthiX account$/, ''),
    blocks: [
      text(i.what),
      details([['When', formatWhen(i.when, i.timeZone)]]),
      text("Didn't expect this? Contact your administrator now, and check your sessions in My security."),
      button('Open My security', appUrl('/yx/me/security')),
    ],
  });
}

/** Any other account notice: admin alerts (break-glass use, SSO changes, a lapsed domain), password advice... */
export function noticeEmail(i: {
  to: string;
  company?: string | null;
  subject: string;
  heading: string;
  blocks: Block[];
}): Promise<RenderedEmail> {
  return renderAccountEmail({ to: i.to, company: i.company, subject: i.subject, preheader: firstText(i.blocks) ?? i.heading, heading: i.heading, blocks: i.blocks });
}

const firstText = (blocks: Block[]) => blocks.find((b): b is { kind: 'text'; text: string } => b.kind === 'text')?.text;
