import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SmsConfigSection } from './SmsConfigSection';
import type { SmsConfigResponse, SmsProviderCatalogEntry } from '../../../../../lib/types';

const updateMutate = jest.fn();
let smsConfig: SmsConfigResponse | undefined;

const TWILIO: SmsProviderCatalogEntry = {
  id: 'twilio',
  label: 'Twilio',
  configFields: [
    { key: 'accountSid', label: 'Account SID', secret: false, required: true },
    { key: 'authToken', label: 'Auth Token', secret: true, required: true },
    { key: 'from', label: 'From number', secret: false, required: true },
  ],
};

const HTTP: SmsProviderCatalogEntry = {
  id: 'http',
  label: 'Generic HTTP',
  configFields: [
    { key: 'url', label: 'Webhook URL', secret: false, required: true, placeholder: 'https://example.com/sms' },
    { key: 'method', label: 'HTTP method', secret: false, required: false, placeholder: 'POST' },
    { key: 'authHeader', label: 'Authorization header', secret: true, required: false },
    { key: 'contentType', label: 'Content-Type', secret: false, required: false, placeholder: 'application/json' },
    { key: 'bodyTemplate', label: 'Body template', secret: false, required: true },
  ],
};

const CATALOG = [TWILIO, HTTP];

jest.mock('../../../../../lib/hooks/useSmsConfig', () => ({
  useSmsConfig: () => ({ data: smsConfig }),
  useSmsProviders: () => ({ data: CATALOG }),
  useUpdateSmsConfig: () => ({ mutate: updateMutate, isPending: false }),
}));

describe('SmsConfigSection', () => {
  beforeEach(() => {
    updateMutate.mockClear();
    smsConfig = undefined;
  });

  it('never renders a secret value, only the "Configured" note, when configured:true', async () => {
    smsConfig = { smsEnabled: true, smsProvider: 'twilio', configured: true, config: { accountSid: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', from: '+15551234567' } };
    render(<SmsConfigSection />);

    expect(screen.getByText(/Configured — Twilio/)).toBeInTheDocument();

    // Edit to reveal the form (secret fields only render while editing).
    await userEvent.click(screen.getByRole('button', { name: 'Edit SMS settings' }));

    // The non-secret accountSid IS shown (pre-filled from config); only the secret authToken
    // must never render a value.
    const authToken = screen.getByLabelText(/Auth Token/) as HTMLInputElement;
    expect(authToken.value).toBe('');
    expect(screen.getByText('Configured')).toBeInTheDocument();
  });

  it('switching the provider select renders that provider\'s fields', async () => {
    smsConfig = { smsEnabled: false, smsProvider: 'twilio', configured: false, config: {} };
    render(<SmsConfigSection />);

    expect(screen.getByLabelText('Account SID')).toBeInTheDocument();
    expect(screen.queryByLabelText('Webhook URL')).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Provider'), 'http');

    expect(screen.queryByLabelText('Account SID')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Webhook URL')).toBeInTheDocument();
    expect(screen.getByLabelText('Authorization header')).toBeInTheDocument();
  });

  it('submits smsProvider + config with the entered fields', async () => {
    smsConfig = { smsEnabled: false, smsProvider: 'twilio', configured: false, config: {} };
    render(<SmsConfigSection />);

    await userEvent.type(screen.getByLabelText('Account SID'), 'ACnew');
    await userEvent.type(screen.getByLabelText('Auth Token'), 'secret-token');
    await userEvent.type(screen.getByLabelText('From number'), '+15559876543');
    await userEvent.click(screen.getByRole('button', { name: 'Save SMS settings' }));

    expect(updateMutate).toHaveBeenCalledWith(
      { smsEnabled: false, smsProvider: 'twilio', config: { accountSid: 'ACnew', authToken: 'secret-token', from: '+15559876543' } },
      expect.anything(),
    );
  });

  it('omits a blank secret from the payload (keeps the existing value)', async () => {
    smsConfig = { smsEnabled: true, smsProvider: 'twilio', configured: true, config: { accountSid: 'ACold', from: '+15551112222' } };
    render(<SmsConfigSection />);

    await userEvent.click(screen.getByRole('button', { name: 'Edit SMS settings' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save SMS settings' }));

    expect(updateMutate).toHaveBeenCalledWith(
      { smsEnabled: true, smsProvider: 'twilio', config: { accountSid: 'ACold', from: '+15551112222' } },
      expect.anything(),
    );
  });

  it('sends the new provider + its fields after switching providers, dropping the old ones', async () => {
    smsConfig = { smsEnabled: true, smsProvider: 'twilio', configured: true, config: { accountSid: 'ACold', from: '+15551112222' } };
    render(<SmsConfigSection />);

    await userEvent.click(screen.getByRole('button', { name: 'Edit SMS settings' }));
    await userEvent.selectOptions(screen.getByLabelText('Provider'), 'http');
    await userEvent.type(screen.getByLabelText('Webhook URL'), 'https://example.com/sms');
    await userEvent.type(screen.getByLabelText('Body template'), 'plain body text');
    await userEvent.click(screen.getByRole('button', { name: 'Save SMS settings' }));

    expect(updateMutate).toHaveBeenCalledWith(
      {
        smsEnabled: true,
        smsProvider: 'http',
        config: { url: 'https://example.com/sms', method: '', contentType: '', bodyTemplate: 'plain body text' },
      },
      expect.anything(),
    );
  });
});
