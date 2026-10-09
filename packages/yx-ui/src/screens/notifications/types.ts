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
