// Settings map · Group 7 · Integrations & Developers (APX-D §3). One story per page plus a read-only variant.
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SettingsGroupScreen, SettingsPageScreen } from './settings-screens';
import { SETTINGS_GROUPS } from './settings-groups';
import { ConnectionDrawer, ShownOnceDrawer, aiPage, calendarPage, developersPage, integrationsPage, type IntegrationsState } from './integrations-live';
import './settings.css';

const meta: Meta = {
  title: 'Screens/Settings/Group 7 · Integrations & Developers',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type S = StoryObj;

export const Overview: S = { name: 'Group 7 · Integrations & Developers', render: () => <SettingsGroupScreen groups={SETTINGS_GROUPS} groupId={7} /> };
export const OverviewLoading: S = { name: 'Group 7 · loading', render: () => <SettingsGroupScreen groups={SETTINGS_GROUPS} groupId={7} state="loading" /> };

export const P7_1: S = { name: '7.1 Integrations', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="7.1" /> };
export const P7_1_ReadOnly: S = { name: '7.1 Integrations · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="7.1" readOnly /> };
export const P7_2: S = { name: '7.2 Biometric devices', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="7.2" /> };
export const P7_2_ReadOnly: S = { name: '7.2 Biometric devices · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="7.2" readOnly /> };
export const P7_3: S = { name: '7.3 Payouts, banks & accounting', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="7.3" /> };
export const P7_3_ReadOnly: S = { name: '7.3 Payouts, banks & accounting · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="7.3" readOnly /> };
export const P7_4: S = { name: '7.4 Verification', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="7.4" /> };
export const P7_4_ReadOnly: S = { name: '7.4 Verification · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="7.4" readOnly /> };
export const P7_5: S = { name: '7.5 Calendar & chat', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="7.5" /> };
export const P7_5_ReadOnly: S = { name: '7.5 Calendar & chat · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="7.5" readOnly /> };
export const P7_6: S = { name: '7.6 AI', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="7.6" /> };
export const P7_6_ReadOnly: S = { name: '7.6 AI · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="7.6" readOnly /> };
export const P7_7: S = { name: '7.7 Developers', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="7.7" /> };
export const P7_7_ReadOnly: S = { name: '7.7 Developers · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="7.7" readOnly /> };
export const P7_8: S = { name: '7.8 Analytics', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="7.8" /> };
export const P7_8_ReadOnly: S = { name: '7.8 Analytics · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="7.8" readOnly /> };
export const P7_9: S = { name: '7.9 Deepfake detection', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="7.9" /> };
export const P7_9_ReadOnly: S = { name: '7.9 Deepfake detection · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="7.9" readOnly /> };

// Settings S-10 (answer 1327): group 7 live on the checked routes; secrets written, never read back.
const STATE: IntegrationsState = {
  smtpConfigured: true, smtpHost: 'smtp.kaverifoods.in', smtpPort: 587, emailFromAddress: 'hr@kaverifoods.in',
  aiKeyConfigured: true, aiProvider: 'anthropic', aiBaseUrl: null, aiModelFast: null, aiModelStandard: null,
  embeddingConfigured: false, embeddingBaseUrl: null, embeddingModel: null,
  apiKeyConfigured: true, apiKeyPrefix: 'pk_live_3f9a', apiKeyCreatedAt: '2026-11-01T09:00:00Z',
  webhookConfigured: true, webhookUrl: 'https://hooks.kaverifoods.in/…a1b2',
  hrisExportConfigured: false, hrisExportEnabled: false, hrisProvider: 'generic', hrisTargetUrl: null,
};
const g7 = (id: string) => SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === id)!;
const live = (id: string, page: ReturnType<typeof aiPage>) => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId={id} live={{ page, canEdit: false, lastChange: null, onSave: async () => undefined }} />;
const SMS = [{ id: 'twilio', label: 'Twilio', configFields: [{ key: 'accountSid', label: 'Account SID', secret: false, required: true }, { key: 'authToken', label: 'Auth token', secret: true, required: true }] }];
export const P7_1_Live: S = { name: '7.1 Integrations · live', render: () => live('7.1', integrationsPage(g7('7.1'), { apps: [{ id: 'a1', type: 'slack', label: 'Hiring alerts', events: ['candidate.applied', 'offer.accepted'], status: 'active', lastDeliveryAt: '2026-11-12T10:00:00Z', lastError: null }], state: STATE, sms: { enabled: true, provider: 'twilio', configured: true, config: { accountSid: 'AC12' } }, smsProviders: SMS, whatsapp: null, whatsappProviders: [] })) };
export const P7_5_Live: S = { name: '7.5 Calendar & chat · live', render: () => live('7.5', calendarPage(g7('7.5'), [{ provider: 'google', connected: true, connectedEmail: 'lakshmi@kaverifoods.in' }, { provider: 'microsoft', connected: false, connectedEmail: null }])) };
export const P7_6_Live: S = { name: '7.6 AI · live', render: () => live('7.6', aiPage(g7('7.6'), STATE)) };
export const P7_7_Live: S = { name: '7.7 Developers · live', render: () => live('7.7', developersPage(g7('7.7'), STATE, [{ id: 'd1', eventType: 'candidate.hired', status: 'delivered', httpStatusCode: 200, createdAt: '2026-11-12T10:00:00Z' }], { totals: { requests: 1240, throttled: 3 }, byEndpoint: [{ endpoint: 'GET /public/candidates', requests: 1200, throttled: 3 }] })) };
export const ConnectionSecretKept: S = { name: '7.1 · Set up SMS (secret kept)', render: () => <ConnectionDrawer title="Set up SMS" keepSecrets initial={{ enabled: true, provider: 'twilio', accountSid: 'AC12' }} fields={() => [{ key: 'enabled', label: 'Send SMS messages', kind: 'toggle' }, { key: 'accountSid', label: 'Account SID', kind: 'text', required: true }, { key: 'authToken', label: 'Auth token', kind: 'secret', required: true }]} saveLabel="Save SMS" onClose={() => {}} onSave={async () => undefined} /> };
export const SecretShownOnce: S = { name: '7.7 · API key shown once', render: () => <ShownOnceDrawer title="Your API key" value="pk_live_3f9a0c1d…" onClose={() => {}} /> };
