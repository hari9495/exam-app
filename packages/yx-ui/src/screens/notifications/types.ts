// Shapes of the SMS channel API (P04, apps/api/src/sms-channel). The screens take these as props; the
// host app fetches them.

export type SmsProvider = 'http' | 'twilio' | 'dev';
export type SmsTemplateVariable = 'code' | 'purpose' | 'minutes' | 'app';
export type SmsTemplateStatus = 'approved' | 'pending' | 'rejected';

export interface SmsTemplate {
  dltTemplateId: string | null;
  body: string;
  variables: SmsTemplateVariable[];
  status: SmsTemplateStatus;
}

export interface SmsAccount {
  id: string;
  name: string;
  provider: SmsProvider;
  sender: string | null;
  dltEntityId: string | null;
  priority: number;
  status: 'active' | 'disabled';
  /** Non-secret settings only. */
  config: Record<string, unknown>;
  /** Names of the secrets that are set ("authToken", "callbackSecret", "secret.authkey"); never values. */
  secretsSet: string[];
  otpTemplate: SmsTemplate | null;
  callbackUrl: string;
  updatedAt: string;
}

export interface SmsOverview {
  /** company: a company's settings; platform: the YukthiX shared account (platform staff). */
  scope: 'company' | 'platform';
  accounts: SmsAccount[];
  policy: { useSharedAccount: boolean; monthlyCap: number | null } | null;
  usage: { month: string; sent: number; cap: number | null } | null;
  sharedAccountAvailable: boolean;
}

/** What the editor sends: POST /notifications/sms/accounts or PATCH .../accounts/:id. */
export interface SmsAccountInput {
  name: string;
  provider: SmsProvider;
  sender: string | null;
  dltEntityId: string | null;
  priority: number;
  status: 'active' | 'disabled';
  config: Record<string, unknown>;
  /** Only secrets typed now; the others stay as they are. */
  secrets: Record<string, string>;
  otpTemplate: SmsTemplate;
}

export type SmsDeliveryStatus = 'pending' | 'sent' | 'delivered' | 'failed' | 'fallback' | 'unknown' | 'opted_out';

export interface SmsDeliveryRow {
  id: string;
  createdAt: string;
  kind: 'otp' | 'test';
  /** Masked number. */
  to: string;
  status: SmsDeliveryStatus;
  /** Account name; "YukthiX shared" for the shared account. */
  account: string | null;
  attempts: number;
  /** "reason: detail" from the API. */
  error: string | null;
}

export interface SmsTestResult {
  status: 'sent' | 'fallback' | 'unknown' | 'duplicate';
  to: string | null;
  error: string | null;
}

// ---- Settings › Notifications › Email (P04 Q5, apps/api/src/email-templates) ----

export type EmailField = 'subject' | 'heading' | 'intro' | 'buttonLabel' | 'footer';
export type EmailWording = Record<EmailField, string>;

export interface EmailBranding {
  showLogo: boolean;
  /** #RRGGBB; null = YukthiX blue. */
  accentColor: string | null;
  /** Shown as "<name> via YukthiX"; null = the company name. */
  senderName: string | null;
  replyTo: string | null;
}

export interface EmailTypeRow {
  type: string;
  group: string;
  name: string;
  sentWhen: string;
  button: boolean;
  /** Placeholders this email may use. */
  variables: string[];
  /** What always stays, in plain words. */
  locked: string[];
  defaults: EmailWording;
  /** The company's wording; null = YukthiX wording. */
  custom: EmailWording | null;
  updatedAt: string | null;
}

export interface EmailOverview {
  companyName: string;
  /** The company logo from Branding settings, if any. */
  logoUrl: string | null;
  /** The button colour when the company picks none (YukthiX blue). */
  defaultAccent: string;
  branding: EmailBranding;
  /** Placeholder name -> plain words. */
  variables: Record<string, string>;
  emails: EmailTypeRow[];
}

export interface EmailPreview {
  subject: string;
  html: string;
  fromName?: string;
  to: string;
}

export interface EmailDraft {
  wording: EmailWording;
  branding?: EmailBranding;
}
