import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SmsAccountEditor, SmsSettingsScreen, accountInput, deliveryDetail, newCallbackSecret, secretNames, type SmsSettingsScreenProps } from './sms-settings';
import { ACCOUNTS, DELIVERIES, OVERVIEW, OVERVIEW_AT_LIMIT, OVERVIEW_PLATFORM, OVERVIEW_SHARED_ONLY } from './data';

function Screen(over: Partial<SmsSettingsScreenProps>) {
  return (
    <SmsSettingsScreen
      state="ready"
      overview={OVERVIEW}
      deliveries={DELIVERIES}
      deliveriesState="ready"
      hasMoreDeliveries={false}
      onLoadMoreDeliveries={vi.fn()}
      myMobile="+91••••••••45"
      myMobileHref="/yx/me/security"
      onSavePolicy={vi.fn().mockResolvedValue(undefined)}
      onSaveAccount={vi.fn().mockResolvedValue(undefined)}
      onDeleteAccount={vi.fn().mockResolvedValue(undefined)}
      onTestAccount={vi.fn().mockResolvedValue({ status: 'sent', to: '+91••••••••45', error: null })}
      {...over}
    />
  );
}

describe('SmsSettingsScreen', () => {
  it('shows this month’s use against the limit, the accounts in order and the masked delivery log', () => {
    render(<Screen />);
    expect(screen.getByRole('heading', { name: 'Text messages (SMS)' })).toBeTruthy();
    expect(screen.getByRole('meter', { name: 'Texts sent this month' }).getAttribute('aria-valuenow')).toBe('1284');
    expect(screen.getByText('1284 of 2000')).toBeTruthy();
    const accounts = screen.getByRole('table', { name: 'SMS accounts' });
    expect(within(accounts).getByText('Kaveri DLT gateway')).toBeTruthy();
    expect(within(accounts).getByText('Template pending')).toBeTruthy();
    const log = screen.getByRole('table', { name: 'SMS delivery log' });
    expect(within(log).getByText('No SMS opt-in for this number')).toBeTruthy();
    expect(log.textContent).not.toMatch(/\+91\d{10}/);
  });

  it('saves only what changed in the sending policy', async () => {
    const onSavePolicy = vi.fn().mockResolvedValue(undefined);
    render(<Screen onSavePolicy={onSavePolicy} />);
    const save = screen.getByRole('button', { name: 'Save changes' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(screen.getByRole('checkbox', { name: /Use the YukthiX shared account/ }));
    await userEvent.click(save);
    expect(onSavePolicy).toHaveBeenCalledWith({ useSharedAccount: false });
    expect(await screen.findByText('Saved.')).toBeTruthy();
  });

  it('warns when nothing would send: shared account off and no account of its own', async () => {
    render(<Screen overview={OVERVIEW_SHARED_ONLY} />);
    expect(screen.getByText('No accounts of your own.')).toBeTruthy();
    expect(screen.getByText('312 texts sent. No monthly limit.')).toBeTruthy();
    await userEvent.click(screen.getByRole('checkbox', { name: /Use the YukthiX shared account/ }));
    expect(screen.getByText('No texts will be sent')).toBeTruthy();
  });

  it('says when the monthly limit is reached', () => {
    render(<Screen overview={OVERVIEW_AT_LIMIT} />);
    expect(screen.getByText('Monthly limit reached')).toBeTruthy();
  });

  it('Send test is off, with the reason and the way to fix it, until the admin’s own number is verified', () => {
    render(<Screen myMobile={null} />);
    expect(screen.getByText('Send test is off')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Verify my number' }).getAttribute('href')).toBe('/yx/me/security');
    for (const b of screen.getAllByRole('button', { name: /^Send test from/ })) expect((b as HTMLButtonElement).disabled).toBe(true);
  });

  it('a test goes to the admin’s own number and the result is shown', async () => {
    const onTestAccount = vi.fn().mockResolvedValue({ status: 'fallback', to: '+91••••••••45', error: 'all_providers_failed: Kaveri DLT gateway: gateway refused the message (HTTP 400)' });
    render(<Screen onTestAccount={onTestAccount} />);
    await userEvent.click(screen.getByRole('button', { name: 'Send test from Kaveri DLT gateway' }));
    expect(onTestAccount).toHaveBeenCalledWith(ACCOUNTS[0].id);
    expect(await screen.findByText('Test from Kaveri DLT gateway not sent')).toBeTruthy();
    expect(screen.getByText(/Every gateway refused it\. Kaveri DLT gateway: gateway refused the message/)).toBeTruthy();
  });

  it('platform staff see the shared account, without a company policy', () => {
    render(<Screen overview={OVERVIEW_PLATFORM} />);
    expect(screen.getByRole('heading', { name: 'YukthiX shared SMS account' })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: /shared account/ })).toBeNull();
    expect(screen.getByText('YukthiX DLT (shared)')).toBeTruthy();
  });

  it('loading, error and no-access states', () => {
    const { rerender } = render(<Screen state="loading" overview={null} />);
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy();
    rerender(<Screen state="error" overview={null} onRetry={vi.fn()} />);
    expect(screen.getByText("We couldn't load the SMS settings.")).toBeTruthy();
    rerender(<Screen state="no-access" overview={null} />);
    expect(screen.getByText(/the SMS settings/)).toBeTruthy();
  });
});

describe('SmsAccountEditor', () => {
  it('never shows a saved secret: the field is empty and says it is saved', () => {
    render(<SmsAccountEditor account={ACCOUNTS[0]} open onOpenChange={vi.fn()} onSave={vi.fn()} />);
    const key = screen.getByLabelText('Secret: authkey') as HTMLInputElement;
    expect(key.value).toBe('');
    expect(key.type).toBe('password');
    expect(screen.getAllByText(/Saved\. It is never shown again/)).toHaveLength(2);
    expect(screen.getByDisplayValue(ACCOUNTS[0].callbackUrl)).toBeTruthy();
  });

  it('sends only secrets typed now; an edit with none keeps the saved ones', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<SmsAccountEditor account={ACCOUNTS[0]} open onOpenChange={vi.fn()} onSave={onSave} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({ name: 'Kaveri DLT gateway', secrets: {}, otpTemplate: { status: 'approved', variables: ['code', 'purpose', 'minutes'] } });
    expect(onSave.mock.calls[0][0]).not.toHaveProperty('provider');
    expect(onSave.mock.calls[0][0].config).not.toHaveProperty('secrets');
  });

  it('a new account must fill every secret its settings use and a well-formed template', async () => {
    const onSave = vi.fn();
    render(<SmsAccountEditor account={null} open onOpenChange={vi.fn()} onSave={onSave} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add account' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Fix these before saving')).toBeTruthy();
    expect(screen.getAllByText('Enter a name').length).toBeGreaterThan(0);
    expect(screen.getAllByText('The settings need a "url" starting with https://').length).toBeGreaterThan(0);
  });

  it('the generated callback secret is made in the browser and is long and random', () => {
    const a = newCallbackSecret();
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(newCallbackSecret()).not.toBe(a);
  });

  it('shows the save error from the API', async () => {
    render(<SmsAccountEditor account={ACCOUNTS[0]} open onOpenChange={vi.fn()} onSave={vi.fn().mockRejectedValue(new Error('The gateway URL must be a public https address'))} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('The gateway URL must be a public https address')).toBeTruthy();
  });
});

describe('accountInput', () => {
  const base = {
    name: 'Kaveri DLT',
    provider: 'http' as const,
    sender: 'KAVERI',
    dltEntityId: '1101234567890123456',
    priority: 10,
    active: true,
    httpConfig: JSON.stringify({ url: 'https://gw.example.in/send', bodyTemplate: 'k={secret.key}&m={message}' }),
    twilioSid: '',
    twilioFrom: '',
    simulate: '' as const,
    secrets: { key: 'typed-now' },
    template: { dltTemplateId: '1107000000000000001', body: '{#var#} is your code. -KAVERI', variables: ['code' as const], status: 'approved' as const },
  };
  const problems = (over: object, account = null) => accountInput({ ...base, ...over }, account).errors.map((e) => e.message);

  it('an edit never sends the gateway type, which the API refuses to change', () => {
    const account = { provider: 'http', secretsSet: ['secret.key'] } as unknown as Parameters<typeof accountInput>[1];
    expect(accountInput(base, account).input).not.toHaveProperty('provider');
  });

  it("keeps a development account's chosen failure, and sends none when it works", () => {
    expect(accountInput({ ...base, provider: 'dev', simulate: 'unavailable' }, null).input?.config).toEqual({ simulate: 'unavailable' });
    expect(accountInput({ ...base, provider: 'dev' }, null).input?.config).toEqual({});
  });

  it('builds the request from a valid draft', () => {
    expect(accountInput(base, null).input).toMatchObject({ provider: 'http', status: 'active', secrets: { key: 'typed-now' }, config: { url: 'https://gw.example.in/send' } });
  });

  it.each([
    [{ httpConfig: '{not json' }, 'The gateway settings are not valid JSON'],
    [{ httpConfig: JSON.stringify({ url: 'https://gw.example.in', secrets: { key: 'x' } }) }, 'Remove secrets from the settings and type it under Secrets'],
    [{ httpConfig: JSON.stringify({ url: 'http://gw.example.in' }) }, 'The settings need a "url" starting with https://'],
    [{ secrets: {} }, 'Type the value of key'],
    [{ template: { ...base.template, variables: [] } }, 'Choose a value for each {#var#}'],
    [{ template: { ...base.template, variables: ['purpose'] } }, 'The code must fill exactly one {#var#}'],
    [{ template: { ...base.template, dltTemplateId: null } }, 'Enter the DLT template id'],
    [{ sender: 'KAVERI FOODS' }, 'The sender is a DLT header like KAVERI or a number'],
    [{ provider: 'twilio' }, 'Enter the Account SID'],
  ])('refuses %j', (over, message) => {
    expect(problems(over)).toContain(message);
  });

  it('finds the {secret.name} placeholders a config uses', () => {
    expect(secretNames('{"h":"{secret.api_key}","b":"{secret.api_key}&{secret.user}"}')).toEqual(['api_key', 'user']);
  });

  it('turns the API’s reason into words', () => {
    expect(deliveryDetail({ status: 'fallback', error: 'over_monthly_cap' })).toBe('Monthly SMS limit reached');
    expect(deliveryDetail({ status: 'fallback', error: 'no_approved_template: Main: template is pending, not approved' })).toBe('No approved DLT template. Main: template is pending, not approved');
    expect(deliveryDetail({ status: 'sent', error: null })).toBeNull();
  });
});
