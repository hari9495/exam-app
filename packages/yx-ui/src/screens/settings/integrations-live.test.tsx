import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { SETTINGS_GROUPS } from './settings-groups';
import { allSettings } from './settings-logic';
import { ConnectionDrawer, ShownOnceDrawer, aiPage, calendarPage, developersPage, integrationsPage, type IntegrationsState } from './integrations-live';

// Settings S-10 (answer 1327): group 7 live.
const pageOf = (id: string) => SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === id)!;
const S: IntegrationsState = {
  smtpConfigured: false, smtpHost: null, smtpPort: null, emailFromAddress: null,
  aiKeyConfigured: false, aiProvider: 'anthropic', aiBaseUrl: null, aiModelFast: null, aiModelStandard: null,
  embeddingConfigured: false, embeddingBaseUrl: null, embeddingModel: null,
  apiKeyConfigured: true, apiKeyPrefix: 'pk_live_3f9a', apiKeyCreatedAt: '2026-11-01T09:00:00Z',
  webhookConfigured: true, webhookUrl: 'https://hooks.example.com/…a1b2',
  hrisExportConfigured: false, hrisExportEnabled: false, hrisProvider: 'generic', hrisTargetUrl: null,
};
const keys = (p: ReturnType<typeof aiPage>) => allSettings(p).map((d) => d.key);
const field = (p: ReturnType<typeof aiPage>, k: string) => allSettings(p).find((d) => d.key === k)!;

describe('group 7 live (S-10)', () => {
  it('7.7 shows only the key prefix and the masked webhook; 7.6 says whose AI is used; no drawn sample fields', () => {
    const dev = developersPage(pageOf('7.7'), S, [], null);
    expect(field(dev, 'dev.api_keys').rows).toEqual([['pk_live_3f9a…', expect.any(String)]]);
    expect(field(dev, 'dev.webhook.state').value).toBe('https://hooks.example.com/…a1b2');
    expect(keys(dev)).not.toContain('dev.oauth_apps');
    expect(field(aiPage(pageOf('7.6'), S), 'ai.current').value).toBe('YukthiX AI (counts against your AI credits)');
    expect(field(aiPage(pageOf('7.6'), { ...S, aiKeyConfigured: true }), 'ai.current').value).toBe('Your own key: Anthropic');
    expect(keys(aiPage(pageOf('7.6'), S)).some((k) => k.startsWith('ai.feature'))).toBe(false);
  });

  it('negative: with no API key there is nothing to revoke; 7.1 lists apps without their address; 7.5 is the viewer\'s own', () => {
    expect(keys(developersPage(pageOf('7.7'), { ...S, apiKeyConfigured: false }, [], null))).not.toContain('dev.key.revoke');
    const p = integrationsPage(pageOf('7.1'), { apps: [{ id: 'a', type: 'webhook', label: 'Ops', events: ['candidate.hired'], status: 'active', lastDeliveryAt: null, lastError: null }], state: S, sms: null, smsProviders: [], whatsapp: null, whatsappProviders: [] });
    expect(JSON.stringify(p)).not.toMatch(/https:\/\/[^"…]*hooks/);
    expect(field(p, 'integrations.connections').rows).toEqual([['Ops', 'Webhook', '1 event', 'On', '—']]);
    expect(field(calendarPage(pageOf('7.5'), [{ provider: 'google', connected: false, connectedEmail: null }]), 'calendar.connect.google')).toMatchObject({ linkLabel: 'Connect Google Calendar' });
  });

  it('the drawer refuses a missing or non-https address first, and never sends a blank secret it keeps', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <ToastProvider>
        <ConnectionDrawer title="Set up SMS" keepSecrets initial={{ url: 'http://x', token: '' }} fields={() => [{ key: 'url', label: 'Address', kind: 'url', required: true }, { key: 'token', label: 'Token', kind: 'secret', required: true }]} saveLabel="Save" onClose={() => {}} onSave={onSave} />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Give a full https address.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Saved. Leave it blank to keep it.')).toBeInTheDocument();
    await userEvent.clear(screen.getByRole('textbox', { name: /Address/ }));
    await userEvent.type(screen.getByRole('textbox', { name: /Address/ }), 'https://example.com/h');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ url: 'https://example.com/h' }));
  });

  it('a new key is shown once, with a warning to copy it now', () => {
    render(<ToastProvider><ShownOnceDrawer title="Your API key" value="pk_live_abc" onClose={() => {}} /></ToastProvider>);
    expect(screen.getByDisplayValue('pk_live_abc')).toBeInTheDocument();
    expect(screen.getByText('Copy it now. It is shown only this once.')).toBeInTheDocument();
  });
});
