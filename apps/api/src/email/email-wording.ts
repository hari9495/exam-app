import Handlebars from 'handlebars';

// A company's wording for an account email (P04 Q5): plain-text fields with {{variable}} placeholders.
//
// Parsed and filled by Handlebars (MIT, proven), but only its simplest form is accepted: text and bare
// {{name}} placeholders from the email type's whitelist. Blocks, helpers, partials, paths ({{a.b}}, {{../x}},
// {{@root}}), triple-stash and comments are refused when saved and again when sent. Filling runs in strict
// mode (an unknown name throws) with no HTML escaping, because the result is plain text: account-emails.ts
// escapes every value into the HTML. Customers can never supply markup, script or a link.

export const WORDING_FIELDS = ['subject', 'heading', 'intro', 'buttonLabel', 'footer'] as const;
export type WordingField = (typeof WORDING_FIELDS)[number];
export type Wording = Record<WordingField, string>;

export const WORDING_MAX: Record<WordingField, number> = { subject: 150, heading: 120, intro: 1000, buttonLabel: 40, footer: 500 };
const MULTI_LINE: ReadonlySet<WordingField> = new Set(['intro', 'footer']);

// Control characters (newlines allowed only where noted) and bidirectional overrides that can disguise text.
const CONTROL = /[\u0000-\u0009\u000B-\u001F\u007F‪-‮⁦-⁩]/;
// Links come only from the locked button: no URLs, web or email addresses (mail apps turn them into links), no markup.
const LINKISH = /(:\/\/|\bwww\.|\bhttps?:|\bmailto:|[<>@]|\b[a-z0-9-]{2,}\.[a-z]{2,}\b)/i;

/** What is wrong with one field's text, or null. `allowed` is the email type's variable whitelist. */
export function checkField(field: WordingField, text: string, allowed: readonly string[], required: boolean): string | null {
  if (required && !text.trim()) return 'Enter some text.';
  if (text.length > WORDING_MAX[field]) return `Keep it to ${WORDING_MAX[field]} characters.`;
  if (CONTROL.test(text) || (!MULTI_LINE.has(field) && /\n/.test(text))) return MULTI_LINE.has(field) ? 'Remove the hidden characters.' : 'Keep it on one line.';
  if (LINKISH.test(text)) return 'Web addresses, email addresses and < > are not allowed. The button carries the link.';
  let ast: hbs.AST.Program;
  try {
    ast = Handlebars.parse(text);
  } catch {
    return 'A {{placeholder}} is not closed properly.';
  }
  for (const node of ast.body) {
    if (node.type === 'ContentStatement') continue;
    if (node.type !== 'MustacheStatement') return 'Only simple placeholders such as {{firstName}} are allowed.';
    const m = node as hbs.AST.MustacheStatement;
    const path = m.path as hbs.AST.PathExpression;
    const plain = m.escaped && m.params.length === 0 && !m.hash && path.type === 'PathExpression' && !path.data && path.depth === 0 && path.parts.length === 1;
    if (!plain) return 'Only simple placeholders such as {{firstName}} are allowed.';
    if (!allowed.includes(path.original)) return `{{${path.original}}} can't be used in this email.`;
  }
  return null;
}

/** Fills placeholders. Throws if the text breaks the rules (the caller then uses the YukthiX wording). */
export function fill(field: WordingField, text: string, allowed: readonly string[], values: Record<string, string>): string {
  const problem = checkField(field, text, allowed, false);
  if (problem) throw new Error(`Template ${field}: ${problem}`);
  const scope = Object.fromEntries(allowed.map((k) => [k, values[k] ?? '']));
  return Handlebars.compile(text, { strict: true, noEscape: true, knownHelpersOnly: true, knownHelpers: {} })(scope);
}

/** WCAG 2.x contrast ratio of a #RRGGBB colour against white (button text). AA for text needs 4.5. */
export function contrastWithWhite(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05);
}
