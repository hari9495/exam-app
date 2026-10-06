// Fictional sample data for the SMS settings stories and tests. Story world "today": 29 Sep 2026 (IST).
import type { SmsAccount, SmsDeliveryRow, SmsOverview } from './types';

export const OTP_TEMPLATE = {
  dltTemplateId: '1107169876543210987',
  body: '{#var#} is your Kaveri Foods {#var#}. Valid for {#var#} minutes. Do not share. -KAVERI',
  variables: ['code', 'purpose', 'minutes'],
  status: 'approved',
} as const;

const httpConfig = {
  url: 'https://api.msg91.com/api/sendhttp.php',
  method: 'POST',
  contentType: 'application/x-www-form-urlencoded',
  bodyTemplate: 'authkey={secret.authkey}&mobiles={to_digits}&message={message}&sender={sender}&route=4&country=91&DLT_TE_ID={dlt_template_id}&response=json',
  response: { successPath: 'type', successValues: ['success'], messageIdPath: 'message' },
  callback: { auth: 'token', messageIdPath: 'requestId', statusPath: 'status', delivered: ['1'], failed: ['2', '16'], optedOut: ['26'] },
};

export const ACCOUNTS: SmsAccount[] = [
  {
    id: '7c1e0a52-0000-4000-8000-000000000001',
    name: 'Kaveri DLT gateway',
    provider: 'http',
    sender: 'KAVERI',
    dltEntityId: '1101234567890123456',
    priority: 10,
    status: 'active',
    config: httpConfig,
    secretsSet: ['callbackSecret', 'secret.authkey'],
    otpTemplate: { ...OTP_TEMPLATE, variables: [...OTP_TEMPLATE.variables] },
    callbackUrl: 'https://api.yukthix.example/api/v1/notifications/sms/callbacks/7c1e0a52-0000-4000-8000-000000000001',
    updatedAt: '2026-09-22T15:10:00+05:30',
  },
  {
    id: '7c1e0a52-0000-4000-8000-000000000002',
    name: 'Kaveri backup (Exotel)',
    provider: 'http',
    sender: 'KAVERI',
    dltEntityId: '1101234567890123456',
    priority: 20,
    status: 'active',
    config: { ...httpConfig, url: 'https://api.exotel.com/v1/Accounts/kaverifoods1/Sms/send.json', bodyTemplate: 'From={sender}&To={to}&Body={message}&DltEntityId={dlt_entity_id}&DltTemplateId={dlt_template_id}', headers: { Authorization: 'Basic {secret.basic}' } },
    secretsSet: ['secret.basic'],
    otpTemplate: { ...OTP_TEMPLATE, variables: [...OTP_TEMPLATE.variables], status: 'pending' },
    callbackUrl: 'https://api.yukthix.example/api/v1/notifications/sms/callbacks/7c1e0a52-0000-4000-8000-000000000002',
    updatedAt: '2026-09-25T11:40:00+05:30',
  },
];

export const OVERVIEW: SmsOverview = {
  scope: 'company',
  accounts: ACCOUNTS,
  policy: { useSharedAccount: true, monthlyCap: 2000 },
  usage: { month: '2026-09-01', sent: 1284, cap: 2000 },
  sharedAccountAvailable: true,
};

export const OVERVIEW_SHARED_ONLY: SmsOverview = { ...OVERVIEW, accounts: [], policy: { useSharedAccount: true, monthlyCap: null }, usage: { month: '2026-09-01', sent: 312, cap: null } };

export const OVERVIEW_AT_LIMIT: SmsOverview = { ...OVERVIEW, usage: { month: '2026-09-01', sent: 2000, cap: 2000 } };

export const OVERVIEW_PLATFORM: SmsOverview = {
  scope: 'platform',
  accounts: [{ ...ACCOUNTS[0], id: '7c1e0a52-0000-4000-8000-0000000000aa', name: 'YukthiX DLT (shared)', sender: 'YKTHIX', dltEntityId: '1101000000000000001' }],
  policy: null,
  usage: null,
  sharedAccountAvailable: true,
};

const row = (id: string, createdAt: string, status: SmsDeliveryRow['status'], extra: Partial<SmsDeliveryRow> = {}): SmsDeliveryRow => ({
  id,
  createdAt,
  kind: 'otp',
  to: '+91••••••••45',
  status,
  account: 'Kaveri DLT gateway',
  attempts: 1,
  error: null,
  ...extra,
});

export const DELIVERIES: SmsDeliveryRow[] = [
  row('d-1', '2026-09-29T10:52:00+05:30', 'delivered'),
  row('d-2', '2026-09-29T10:31:00+05:30', 'sent', { to: '+91••••••••12', account: 'Kaveri backup (Exotel)', attempts: 2, error: 'Kaveri DLT gateway: gateway busy (HTTP 503)' }),
  row('d-3', '2026-09-29T09:58:00+05:30', 'fallback', { to: '+91••••••••07', account: null, error: 'no_channel_consent' }),
  row('d-4', '2026-09-29T09:14:00+05:30', 'delivered', { kind: 'test', to: '+91••••••••45' }),
  row('d-5', '2026-09-28T18:40:00+05:30', 'unknown', { to: '+91••••••••88', error: 'Kaveri DLT gateway: no answer from the gateway (ETIMEDOUT)' }),
  row('d-6', '2026-09-28T17:05:00+05:30', 'failed', { to: '+91••••••••63' }),
  row('d-7', '2026-09-28T09:30:00+05:30', 'delivered', { account: 'YukthiX shared', to: '+91••••••••31' }),
];
