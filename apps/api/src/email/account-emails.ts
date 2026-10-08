import mjml2html from 'mjml';
import { escapeHtml } from '../notifications/notification-email-render';
import { WORDING_FIELDS, Wording, fill } from './email-wording';

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
  /** A company's logo (our own signed URL) and button colour (#RRGGBB, checked against white text). */
  brand?: { logoUrl?: string | null; accentColor?: string | null };
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
  /** The From display name ("Kaveri Foods via YukthiX"); the address is always YukthiX's own. */
  fromName?: string;
  replyTo?: string;
}

const SAFETY = 'YukthiX will never ask for your password or a sign-in code.';
const FONT = "'IBM Plex Sans', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

// The card is 600 px wide; on any screen too narrow for it plus a 12 px gutter each side (a phone,
// a 600 px preview pane) it keeps that gutter instead of touching the edges.
const CARD_WIDTH = 600;
const CARD_GUTTER = 12;

// Design system §3: Azure 500 primary, slate neutrals; dark-mode tokens for clients that honour
// prefers-color-scheme (Apple Mail, Outlook for Mac/iOS, some webmail).
const style = (accent: string) => `
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  .yx-code-digits span { margin-left: 0.4em; }
  @media only screen and (max-width: ${CARD_WIDTH + 2 * CARD_GUTTER - 1}px) {
    .yx-card { margin: 0 ${CARD_GUTTER}px !important; width: auto !important; }
  }
  @media (prefers-color-scheme: dark) {
    body, .yx-page, div[role="article"] { background-color: #0B1220 !important; }
    .yx-card, .yx-card table, .yx-card td { background-color: #111A2B !important; border-color: #1E293B !important; }
    .yx-card .yx-code table, .yx-card .yx-code td { background-color: #1A2747 !important; border-radius: 10px; }
    .yx-ink, .yx-ink div, .yx-ink h1, .yx-ink td { color: #E2E8F0 !important; }
    .yx-muted div, .yx-muted td { color: #94A3B8 !important; }
    .yx-x { color: #8FA4F0 !important; }
    .yx-card .yx-btn table td, .yx-card .yx-btn a { background-color: ${accent} !important; color: #FFFFFF !important; }
  }`;

const PRIMARY = '#3B5FE3';
const HEX = /^#[0-9A-F]{6}$/i;
const compiled = new Map<string, Promise<string>>();

function compile(source: string): Promise<string> {
  let html = compiled.get(source);
  if (!html) {
    // One entry per email structure and accent colour; ponytail: crude cap, an LRU if companies number in the thousands.
    if (compiled.size > 500) compiled.clear();
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

  // The accent is a validated hex (never a raw caller string in the MJML); anything else falls back to Azure 500.
  const accent = input.brand?.accentColor && HEX.test(input.brand.accentColor) ? input.brand.accentColor.toUpperCase() : PRIMARY;
  const logoUrl = input.brand?.logoUrl && /^https?:\/\//.test(input.brand.logoUrl) ? input.brand.logoUrl : null;
  const blocks = input.blocks
    .map((b) => {
      switch (b.kind) {
        case 'text':
          return section(`<mj-text css-class="yx-ink">${slot(b.text)}</mj-text>`);
        case 'note':
          return section(`<mj-text css-class="yx-muted" color="#475569" font-size="13px" line-height="20px">${slot(b.text)}</mj-text>`);
        case 'button':
          return section(
            `<mj-button css-class="yx-btn" href="${slot(b.href)}" align="left" background-color="${accent}" color="#FFFFFF" border-radius="8px" font-size="15px" font-weight="500" inner-padding="12px 24px" padding="4px 0 24px">${slot(b.label)}</mj-button>`,
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
    <mj-style>${style(accent)}</mj-style>
  </mj-head>
  <mj-body background-color="#F7F8FA" width="${CARD_WIDTH}px" css-class="yx-page">
    <mj-section padding="32px 24px 16px">
      <mj-column>
        ${
          logoUrl
            ? `<mj-text padding="0"><img src="${slot(logoUrl)}" alt="${slot(input.company || 'Company logo')}" height="40" style="display:block;height:40px;width:auto;max-width:240px;border:0"></mj-text>`
            : `<mj-text css-class="yx-ink" padding="0" font-size="22px" line-height="28px" font-weight="600" letter-spacing="-0.01em">Yukthi<span class="yx-x" style="color:${PRIMARY}">X</span></mj-text>`
        }
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

// ---- company look (P04 Q5 / §4 Editing & Branding) -------------------------------------------------

/** A company's branding and wording for one email type, loaded by EmailLookService. Null = YukthiX's own. */
export interface CompanyLook {
  logoUrl: string | null;
  accentColor: string | null;
  senderName: string | null;
  replyTo: string | null;
  wording: Partial<Wording> | null;
}

export const VARIABLE_LABELS: Record<string, string> = {
  firstName: 'First name ("there" when unknown)',
  companyName: 'Company name',
  code: 'The code',
  minutes: 'Minutes it works',
  device: 'Device, such as "Chrome on Windows"',
  change: 'What changed (sentence)',
  changeShort: 'What changed (short)',
};
const COMMON = ['firstName', 'companyName'];

export type EmailGroup = 'Sign-in codes' | 'Your account' | 'Security alerts' | 'Alerts to System Admins';

export interface EmailTypeDef {
  group: EmailGroup;
  name: string;
  sentWhen: string;
  /** Placeholders the editable text may use. */
  variables: string[];
  /** Has a button (its label is editable, its link never). */
  button: boolean;
  /** The YukthiX starter wording (D17). */
  defaults: Wording;
  /** What stays fixed, in plain words, for the editor. */
  locked: string[];
}

const def = (group: EmailGroup, name: string, sentWhen: string, extra: string[], defaults: Partial<Wording> & Pick<Wording, 'subject' | 'heading'>, locked: string[]): EmailTypeDef => ({
  group,
  name,
  sentWhen,
  variables: [...COMMON, ...extra],
  button: Boolean(defaults.buttonLabel),
  defaults: { intro: '', buttonLabel: '', footer: '', ...defaults },
  locked,
});

const CODE_LOCKED = ['The code', 'How long the code works', 'The "Didn\'t try to sign in?" safety line', 'YukthiX never asks for codes'];
const LINK_LOCKED = ['Where the button goes', 'How long the link works', 'The link to paste if the button fails'];
const SIGN_IN_LOCKED = ['When, device, place and IP address', "What to do if it wasn't you", 'Where the button goes'];
const ADMIN_LOCKED = ['What happened and the details', 'What to check', 'Where the button goes'];

/** Every account email a company may brand and re-word. YukthiX's own emails (staff, new-company welcome) are not here. */
export const EMAIL_TYPES = {
  sign_in_code: def('Sign-in codes', 'Sign-in code', 'Someone signs in with a code sent by email.', ['code', 'minutes'], { subject: '{{code}} is your YukthiX sign-in code', heading: 'Your sign-in code', intro: 'Enter this code to sign in to {{companyName}}.' }, CODE_LOCKED),
  verification_code: def('Sign-in codes', 'Verification code', "Someone confirms it's them with a code sent by email.", ['code', 'minutes'], { subject: '{{code}} is your YukthiX verification code', heading: 'Your verification code', intro: "Enter this code to confirm it's you at {{companyName}}." }, CODE_LOCKED),
  mobile_code: def('Sign-in codes', 'Mobile number code', 'Someone adds a mobile number and gets the code by email.', ['code', 'minutes'], { subject: '{{code}} is your YukthiX verification code', heading: 'Verify your mobile number', intro: 'Enter this code to verify your mobile number at {{companyName}}.' }, CODE_LOCKED),
  invite: def('Your account', 'Invitation', 'An admin adds a person, who then sets their password.', ['minutes'], { subject: "You're invited to {{companyName}} on YukthiX", heading: 'Welcome to {{companyName}}', intro: 'Hi {{firstName}}, you have a new account at {{companyName}}. Set your password to get started.', buttonLabel: 'Set your password' }, LINK_LOCKED),
  password_reset: def('Your account', 'Password reset', 'Someone asks to reset their password.', ['minutes'], { subject: 'Reset your {{companyName}} password', heading: 'Reset your password', intro: 'We got a request to reset the password for your {{companyName}} account on YukthiX.', buttonLabel: 'Reset password' }, [...LINK_LOCKED, 'The "Didn\'t ask for this?" safety line']),
  password_breached: def('Your account', 'Password found in a breach', "A person's password turns up in a known data breach.", [], { subject: 'Change your YukthiX password', heading: 'Time for a new password', buttonLabel: 'Open My security' }, ['Why the password must change', 'Where the button goes']),
  new_sign_in: def('Security alerts', 'New sign-in', 'An account is signed in to from a new device.', ['device'], { subject: 'New sign-in to your YukthiX account', heading: 'New sign-in to your account', intro: "Your {{companyName}} account was just signed in to from a device we haven't seen before.", buttonLabel: 'This wasn’t me' }, SIGN_IN_LOCKED),
  new_country_sign_in: def('Security alerts', 'Sign-in from a new country', "An account is used from a country it hasn't been used from before.", ['device'], { subject: 'Sign-in to your YukthiX account from a new country', heading: 'Sign-in from a new country', intro: "Your {{companyName}} account was just used from a country it hasn't been used from before.", buttonLabel: 'This wasn’t me' }, SIGN_IN_LOCKED),
  account_locked: def('Security alerts', 'Sign-in paused', 'Too many wrong tries pause sign-in for a while.', [], { subject: 'Sign-in to your YukthiX account was temporarily locked', heading: 'Sign-in is paused for a while', intro: 'There were too many wrong tries to sign in to your {{companyName}} account, so we paused sign-in to keep it safe.', buttonLabel: 'Reset password' }, ['When it unlocks and the sign-in details', 'The "If this wasn\'t you" safety line', 'Where the button goes']),
  security_change: def('Security alerts', 'Two-step and account changes', 'Two-step verification, passkeys, recovery codes or the mobile number change.', ['change', 'changeShort'], { subject: '{{change}}', heading: '{{changeShort}}', buttonLabel: 'Open My security' }, ['What changed and when', 'The "Didn\'t expect this?" safety line', 'Where the button goes']),
  break_glass_used: def('Alerts to System Admins', 'Break-glass sign-in', 'The break-glass account signs in while SSO-only is on.', [], { subject: 'Break-glass sign-in to your YukthiX organisation', heading: 'Break-glass account used', buttonLabel: 'Open Login activity' }, ADMIN_LOCKED),
  break_glass_failures: def('Alerts to System Admins', 'Failed break-glass sign-ins', 'Someone keeps failing to sign in to the break-glass account.', [], { subject: 'Repeated failed sign-ins to a break-glass account', heading: 'Repeated failed sign-ins', buttonLabel: 'Open Login activity' }, ADMIN_LOCKED),
  sso_changed: def('Alerts to System Admins', 'Single sign-on changed', 'Single sign-on settings change.', [], { subject: 'Single sign-on settings changed in your YukthiX organisation', heading: 'Single sign-on settings changed', buttonLabel: 'Open security settings' }, ADMIN_LOCKED),
  domain_lapsed: def('Alerts to System Admins', 'Verified domain lapsed', 'The proof that you own an email domain disappears.', [], { subject: 'A verified email domain lapsed in your YukthiX organisation', heading: 'A verified domain lapsed', buttonLabel: 'Open security settings' }, ADMIN_LOCKED),
  support_requested: def('Alerts to System Admins', 'Support access request', 'YukthiX support asks to look at your company.', [], { subject: 'YukthiX support asks to see your company data', heading: 'A support session needs your approval', buttonLabel: 'Review the request' }, ["Who asks, why and for how long", "What support can and can't see", 'Where the button goes']),
  sms_limit_reached: def('Alerts to System Admins', 'SMS limit reached', 'Your company reaches its monthly text message limit.', [], { subject: 'Your organisation has reached its monthly SMS limit', heading: 'Monthly SMS limit reached' }, ['The limit and what happens now']),
} satisfies Record<string, EmailTypeDef>;
export type EmailType = keyof typeof EMAIL_TYPES;
export const isEmailType = (t: string): t is EmailType => Object.prototype.hasOwnProperty.call(EMAIL_TYPES, t);

const firstNameOf = (name: string | null | undefined) => name?.trim().split(/\s+/)[0] || 'there';
const paragraphs = (s: string) => s.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

/** The wording in force: the company's, field by field, else YukthiX's. A field that fails the rules falls back. */
export function wordingFor(type: EmailType, custom: Partial<Wording> | null | undefined, values: Record<string, string>): Wording {
  const d: EmailTypeDef = EMAIL_TYPES[type];
  const out = {} as Wording;
  for (const f of WORDING_FIELDS) {
    const own = custom?.[f];
    let v: string | null = null;
    if (own != null) {
      try {
        v = fill(f, own, d.variables, values);
      } catch {
        v = null;
      }
    }
    // A required field (subject, heading, a button's label) is never left empty.
    if (v === null || (!v.trim() && (f === 'subject' || f === 'heading' || (f === 'buttonLabel' && d.button)))) v = fill(f, d.defaults[f], d.variables, values);
    out[f] = f === 'intro' || f === 'footer' ? v : oneLine(v);
  }
  return out;
}

/** "Kaveri Foods HR via YukthiX": always "via YukthiX", so a company can't pass as YukthiX or anyone else. */
export function fromNameFor(company: string | null | undefined, look: CompanyLook | null | undefined): string {
  const name = oneLine(look?.senderName || company || '').replace(/["<>@\\]/g, '');
  return name ? `${name} via YukthiX` : 'YukthiX';
}

/** An action whose label is the company's button wording; the link is fixed here. */
export const action = (href: string): Block => ({ kind: 'button', label: '', href });

interface CompanyEmailInput {
  to: string;
  company?: string | null;
  firstName?: string | null;
  look?: CompanyLook | null;
  values?: Record<string, string>;
  preheader?: string;
  /** The locked part: facts, codes, safety lines, the action. */
  facts: Block[];
  safety?: string | null;
}

/** One company-brandable account email: editable intro and footer around the locked facts. */
export async function companyEmail(type: EmailType, i: CompanyEmailInput): Promise<RenderedEmail> {
  const values = { firstName: firstNameOf(i.firstName), companyName: i.company || 'YukthiX', ...i.values };
  const w = wordingFor(type, i.look?.wording, values);
  const intro = paragraphs(w.intro).map(text);
  const mail = await renderAccountEmail({
    to: i.to,
    company: i.company,
    subject: w.subject,
    preheader: i.preheader ?? firstText(intro) ?? w.heading,
    heading: w.heading,
    blocks: [...intro, ...i.facts.map((b) => (b.kind === 'button' ? { ...b, label: w.buttonLabel } : b)), ...paragraphs(w.footer).map(note)],
    safety: i.safety,
    brand: i.look ? { logoUrl: i.look.logoUrl, accentColor: i.look.accentColor } : undefined,
  });
  return { ...mail, fromName: fromNameFor(i.company, i.look), ...(i.look?.replyTo ? { replyTo: i.look.replyTo } : {}) };
}

// ---- the emails ----------------------------------------------------------------------------------

export type CodePurpose = 'sign_in' | 'mfa' | 'mobile';

const CODE_TYPE: Record<CodePurpose, EmailType> = { sign_in: 'sign_in_code', mfa: 'verification_code', mobile: 'mobile_code' };
const NOT_YOU: Record<CodePurpose, string> = {
  sign_in: "Didn't try to sign in? You can ignore this email; someone may have typed your address by mistake. Your account is safe.",
  mfa: "Didn't try to sign in? Someone may know your password. Change it after you sign in.",
  mobile: "Didn't add a mobile number? You can ignore this email. Your account is safe.",
};

interface Personal {
  to: string;
  company?: string | null;
  firstName?: string | null;
  look?: CompanyLook | null;
}

export function codeEmail(i: Personal & { code: string; purpose: CodePurpose; minutes: number; insteadOfText?: boolean }): Promise<RenderedEmail> {
  const expiry = `It works once and expires in ${i.minutes} minutes.`;
  return companyEmail(CODE_TYPE[i.purpose], {
    ...i,
    values: { code: i.code, minutes: String(i.minutes) },
    preheader: expiry,
    safety: null,
    facts: [
      ...(i.insteadOfText ? [text("We couldn't send this code by text message, so here it is by email.")] : []),
      { kind: 'code', code: i.code },
      text(expiry),
      text(NOT_YOU[i.purpose]),
      note('YukthiX will never ask you for this code by phone, email or chat.'),
    ],
  });
}

const pasteLink = (link: string) => note(`Button not working? Paste this link into your browser: ${link}`);

export function passwordResetEmail(i: Personal & { link: string; minutes: number }): Promise<RenderedEmail> {
  return companyEmail('password_reset', {
    ...i,
    values: { minutes: String(i.minutes) },
    preheader: `This link expires in ${i.minutes} minutes.`,
    facts: [text(`The link works once and expires in ${i.minutes} minutes.`), action(i.link), text("Didn't ask for this? Ignore this email; your password stays the same."), pasteLink(i.link)],
  });
}

/** A person an admin added: set a password to get in (the link is a one-time reset link). */
export function inviteEmail(i: Personal & { link: string; minutes: number }): Promise<RenderedEmail> {
  return companyEmail('invite', {
    ...i,
    values: { minutes: String(i.minutes) },
    preheader: `Set your password within ${i.minutes} minutes.`,
    facts: [
      action(i.link),
      text(`The link works once and expires in ${i.minutes} minutes. If it has expired, choose Forgot password on the sign-in page to get a new one.`),
      pasteLink(i.link),
    ],
  });
}

export function passwordBreachedEmail(i: Personal): Promise<RenderedEmail> {
  return companyEmail('password_breached', {
    ...i,
    facts: [
      text('The password on your account appears in a known data breach, so others can guess it easily.'),
      text("You'll be asked to choose a new one the next time you sign in. You can also change it now in My security. Pick a password you don't use anywhere else."),
      action(appUrl('/yx/me/security')),
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

export function newSignInEmail(i: Personal & { facts: SignInFacts; newCountry?: boolean }): Promise<RenderedEmail> {
  const device = describeDevice(i.facts.userAgent) ?? 'A new device';
  return companyEmail(i.newCountry ? 'new_country_sign_in' : 'new_sign_in', {
    ...i,
    values: { device },
    preheader: `${device} signed in to ${i.company || 'YukthiX'}.`,
    facts: [
      details(signInRows(i.facts)),
      text('If this was you, there is nothing to do.'),
      text("If it wasn't, open My security, sign out the sessions you don't know and change your password."),
      action(appUrl('/yx/me/security')),
    ],
  });
}

export function accountLockedEmail(i: Personal & { facts: SignInFacts; lockedForSeconds?: number | null }): Promise<RenderedEmail> {
  const unlocksAt = i.lockedForSeconds ? new Date(i.facts.when.getTime() + i.lockedForSeconds * 1000) : null;
  return companyEmail('account_locked', {
    ...i,
    preheader: unlocksAt ? `It unlocks at ${formatWhen(unlocksAt, i.facts.timeZone)}.` : 'It unlocks on its own shortly.',
    facts: [
      details([...(unlocksAt ? [['Unlocks', formatWhen(unlocksAt, i.facts.timeZone)] as [string, string]] : []), ...signInRows(i.facts)]),
      text(`${unlocksAt ? 'After that time' : 'In a little while'} you can sign in again as usual. Can't wait? Reset your password or ask your administrator to unlock your account.`),
      text("If this wasn't you, change your password after you sign in."),
      action(appUrl('/yx/forgot-password')),
    ],
  });
}

/** A change to the person's own account (MFA, recovery codes, mobile number, unlock...). `what` is a sentence. */
export function securityChangeEmail(i: Personal & { subject: string; what: string; when: Date; timeZone?: string | null }): Promise<RenderedEmail> {
  return companyEmail('security_change', {
    ...i,
    values: { change: i.subject, changeShort: i.subject.replace(/ (on|to|from) your YukthiX account$/, '') },
    preheader: i.what,
    facts: [
      text(i.what),
      details([['When', formatWhen(i.when, i.timeZone)]]),
      text("Didn't expect this? Contact your administrator now, and check your sessions in My security."),
      action(appUrl('/yx/me/security')),
    ],
  });
}

/** An alert to a company's System Admins: the facts are locked; subject, heading and button come from the type. */
export function adminAlertEmail(type: EmailType, i: Personal & { facts: Block[] }): Promise<RenderedEmail> {
  return companyEmail(type, { ...i, preheader: firstText(i.facts) });
}

/** Any other YukthiX account notice (YukthiX-owned wording). */
export function noticeEmail(i: { to: string; company?: string | null; subject: string; heading: string; blocks: Block[] }): Promise<RenderedEmail> {
  return renderAccountEmail({ to: i.to, company: i.company, subject: i.subject, preheader: firstText(i.blocks) ?? i.heading, heading: i.heading, blocks: i.blocks });
}

/** YukthiX's welcome to a new company's first System Admin (YukthiX-owned, not company-editable). */
export async function companyWelcomeEmail(i: { to: string; adminName?: string | null; company: string; link: string; minutes: number }): Promise<RenderedEmail> {
  const mail = await renderAccountEmail({
    to: i.to,
    company: i.company,
    subject: `${i.company} is ready on YukthiX`,
    preheader: 'Set your password to sign in and get started.',
    heading: 'Welcome to YukthiX',
    blocks: [
      text(`Hi ${firstNameOf(i.adminName)}, we've set up ${i.company} on YukthiX, and you're its first System Admin.`),
      text('Set your password to sign in. Then add your company details, invite your team and choose who can do what.'),
      button('Set your password', i.link),
      text(`The link works once and expires in ${i.minutes} minutes. If it has expired, choose Forgot password on the sign-in page to get a new one.`),
      pasteLink(i.link),
    ],
  });
  return { ...mail, fromName: 'YukthiX' };
}

const firstText = (blocks: Block[]) => blocks.find((b): b is { kind: 'text'; text: string } => b.kind === 'text')?.text;
