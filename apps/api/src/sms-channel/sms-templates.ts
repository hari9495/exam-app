// DLT-registered SMS templates (P04 §4.4, APX-A §4.3, YX-NTF-07). A channel account keeps, per message
// type, the exact registered text with its {#var#} placeholders, which of our values fills each one (in
// order), the DLT template id and whether the template is approved. Only an approved, well-formed
// template is ever sent; anything else falls back to another channel and the reason is logged.

export const TEMPLATE_VARIABLES = ['code', 'purpose', 'minutes', 'app'] as const;
export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];
export const TEMPLATE_STATUSES = ['approved', 'pending', 'rejected'] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

export interface SmsTemplate {
  /** The DLT content template id (India); required when the account has a DLT entity id. */
  dltTemplateId?: string | null;
  /** The text exactly as registered, with one {#var#} per variable. */
  body: string;
  variables: TemplateVariable[];
  status: TemplateStatus;
}

/** Message types an account can hold a template for. One-time codes first; the engine adds more. */
export const TEMPLATE_TYPES = ['otp'] as const;
export type TemplateType = (typeof TEMPLATE_TYPES)[number];

const PLACEHOLDER = '{#var#}';
export const TEMPLATE_BODY_MAX = 1000;
/** DLT limit per {#var#} value (APX-A §4.3 rule 4): longer values are cut with "…", never refused. */
export const VAR_MAX = 30;

const count = (text: string) => text.split(PLACEHOLDER).length - 1;

/** What is wrong with the template's shape, or null. Status is not checked here (a pending one may be saved). */
export function templateShapeError(template: unknown, needsDltId: boolean): string | null {
  if (!template || typeof template !== 'object' || Array.isArray(template)) return 'no template';
  const t = template as Partial<SmsTemplate>;
  if (typeof t.body !== 'string' || !t.body.trim() || t.body.length > TEMPLATE_BODY_MAX) return `the text must be 1 to ${TEMPLATE_BODY_MAX} characters`;
  if (/[\r\n]{3,}/.test(t.body)) return 'the text has too many blank lines';
  if (!Array.isArray(t.variables) || t.variables.some((v) => !(TEMPLATE_VARIABLES as readonly string[]).includes(v))) {
    return `each variable must be one of ${TEMPLATE_VARIABLES.join(', ')}`;
  }
  if (count(t.body) !== t.variables.length) return `the text has ${count(t.body)} {#var#} but ${t.variables.length} variables are mapped`;
  if (t.variables.filter((v) => v === 'code').length !== 1) return 'the code must appear exactly once';
  if (!(TEMPLATE_STATUSES as readonly string[]).includes(t.status as string)) return `status must be one of ${TEMPLATE_STATUSES.join(', ')}`;
  if (t.dltTemplateId != null && !/^\d{1,30}$/.test(t.dltTemplateId)) return 'the DLT template id is digits only';
  if (needsDltId && !t.dltTemplateId) return 'the DLT template id is missing';
  return null;
}

/** Why this template can't be sent, or null when it is approved and well formed (YX-NTF-07). */
export function templateProblem(template: unknown, needsDltId: boolean): string | null {
  const shape = templateShapeError(template, needsDltId);
  if (shape) return shape === 'no template' ? 'no approved template' : `template: ${shape}`;
  const status = (template as SmsTemplate).status;
  return status === 'approved' ? null : `template is ${status}, not approved`;
}

const cut = (value: string) => (value.length > VAR_MAX ? `${value.slice(0, VAR_MAX - 1)}…` : value);

/** The message text and the ordered {#var#} values (some gateways take the values, not the text). */
export function renderTemplate(template: SmsTemplate, values: Record<TemplateVariable, string>): { text: string; vars: string[] } {
  const vars = template.variables.map((name) => cut(values[name]));
  let i = 0;
  const text = template.body.split(PLACEHOLDER).reduce((out, part, index) => (index === 0 ? part : out + vars[i++] + part), '');
  return { text, vars };
}

// GSM 03.38 basic set (+ extension table): anything else makes the message UCS-2 (70 characters a part).
const GSM7 = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà^{}\\[~\]|€]*$/;

/** Billable SMS parts for the text (cost_units). */
export function smsSegments(text: string): number {
  const gsm = GSM7.test(text);
  const length = gsm ? [...text].reduce((n, ch) => n + ('^{}\\[~]|€'.includes(ch) ? 2 : 1), 0) : text.length;
  const [single, multi] = gsm ? [160, 153] : [70, 67];
  return length <= single ? 1 : Math.ceil(length / multi);
}

/** The built-in development template (the dev shared account; never in production). */
export const DEV_OTP_TEMPLATE: SmsTemplate = {
  dltTemplateId: null,
  body: '{#var#} is your YukthiX {#var#}. It expires in {#var#} minutes. Never share it.',
  variables: ['code', 'purpose', 'minutes'],
  status: 'approved',
};
