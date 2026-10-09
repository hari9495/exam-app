// SD-1.12 / YX-SD-15: personal data in ticket text is found and masked before it is stored. The masked text is what
// search, email, notifications and (later) AI ever see; the original goes to sd_sensitive_values, encrypted. Pure, so it
// is unit tested on its own. Checksums (Verhoeff for Aadhaar, Luhn for cards) keep ordinary numbers from being masked.

export type PiiKind = 'aadhaar' | 'pan' | 'card' | 'bank' | 'password' | 'health';
export interface PiiFound {
  kind: PiiKind;
  value: string;
  masked: string;
}

const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

export function verhoeffValid(digits: string): boolean {
  let c = 0;
  [...digits].reverse().forEach((ch, i) => (c = VERHOEFF_D[c][VERHOEFF_P[i % 8][Number(ch)]]));
  return c === 0;
}

export function luhnValid(digits: string): boolean {
  let sum = 0;
  [...digits].reverse().forEach((ch, i) => {
    let n = Number(ch);
    if (i % 2 === 1) n = n * 2 > 9 ? n * 2 - 9 : n * 2;
    sum += n;
  });
  return sum % 10 === 0;
}

// Health words are masked on save everywhere (YX-SD-15). Founder decision 8 Oct 2026: on an HR desk, the desk's own
// agents see them again on a ticket that is already restricted (sensitive or private), through unmaskHealth below;
// Aadhaar, PAN, card, bank and passwords stay masked for everyone (step-up unmask only).
const HEALTH = ['hiv', 'aids', 'cancer', 'tuberculosis', 'diabetes', 'pregnant', 'pregnancy', 'miscarriage', 'depression', 'hepatitis', 'chemotherapy', 'dialysis'];
const tail = (s: string, n = 4) => s.slice(-n);
const LABEL: Record<PiiKind, string> = { aadhaar: 'Aadhaar', pan: 'PAN', card: 'Card', bank: 'Bank account', password: 'Password', health: 'Health detail' };
const maskOf = (kind: PiiKind, v: string) => (kind === 'password' || kind === 'health' ? `[${LABEL[kind]} hidden]` : `[${LABEL[kind]} ••${tail(kind === 'pan' ? v : v.replace(/\D/g, ''))}]`);

// Order matters: the most specific patterns run first and their matches are masked before the next one looks.
const RULES: { kind: PiiKind; re: RegExp; ok?: (m: RegExpExecArray) => boolean; value?: (m: RegExpExecArray) => string; keep?: (m: RegExpExecArray) => string }[] = [
  // "password: xyz", "pwd is xyz", "otp 123456": the secret after the word.
  { kind: 'password', re: /\b(password|passcode|pwd|pin|otp)(\s*(?:is|:|=|-)\s*)(\S{3,64})/gi, value: (m) => m[3], keep: (m) => `${m[1]}${m[2]}` },
  { kind: 'card', re: /\b(?:\d[ -]?){12,18}\d\b/g, ok: (m) => luhnValid(m[0].replace(/\D/g, '')) && /^\d{13,19}$/.test(m[0].replace(/\D/g, '')) },
  { kind: 'aadhaar', re: /\b[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}\b/g, ok: (m) => verhoeffValid(m[0].replace(/\D/g, '')) },
  { kind: 'pan', re: /\b[A-Z]{3}[PCHFATBLJG][A-Z]\d{4}[A-Z]\b/g },
  // A bank account: 9-18 digits next to the words account / a/c, or after an IFSC code.
  { kind: 'bank', re: /\b((?:account|a\/c|acct)(?:\s*(?:no\.?|number|#))?\s*[:\-]?\s*)(\d{9,18})\b/gi, value: (m) => m[2], keep: (m) => m[1] },
  { kind: 'bank', re: /\b([A-Z]{4}0[A-Z0-9]{6}\W{1,3})(\d{9,18})\b/g, value: (m) => m[2], keep: (m) => m[1] },
  { kind: 'health', re: new RegExp(`\\b(${HEALTH.join('|')})\\b`, 'gi') },
];

/** Masks personal data in plain text. Returns the masked text and what was found (originals, for encrypted storage). */
export function maskPii(text: string): { text: string; found: PiiFound[] } {
  const found: PiiFound[] = [];
  let out = text;
  for (const rule of RULES) {
    out = out.replace(rule.re, (...args) => {
      const m = Object.assign([...args.slice(0, -2)], { index: args[args.length - 2], input: out }) as unknown as RegExpExecArray;
      if (rule.ok && !rule.ok(m)) return m[0];
      const value = rule.value ? rule.value(m) : m[0];
      const masked = maskOf(rule.kind, value);
      found.push({ kind: rule.kind, value, masked });
      return `${rule.keep ? rule.keep(m) : ''}${masked}`;
    });
  }
  return { text: out, found };
}

/** The same masking over cleaned HTML: only text between tags changes, never tags or attributes. */
export function maskPiiHtml(html: string): { html: string; found: PiiFound[] } {
  const found: PiiFound[] = [];
  const out = html
    .split(/(<[^>]*>)/)
    .map((part) => {
      if (part.startsWith('<')) return part;
      const r = maskPii(part);
      found.push(...r.found);
      return r.text;
    })
    .join('');
  return { html: out, found };
}

export const HEALTH_MASK = maskOf('health', '');

/** Puts health words back, in the order they were found (sd_sensitive_values.seq). Every other mask stays. */
export function unmaskHealth(html: string, words: readonly string[]): string {
  let i = 0;
  const esc = (w: string) => w.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  return html.split(HEALTH_MASK).reduce((out, part, n) => (n === 0 ? part : out + (i < words.length ? esc(words[i++]) : HEALTH_MASK) + part), '');
}
