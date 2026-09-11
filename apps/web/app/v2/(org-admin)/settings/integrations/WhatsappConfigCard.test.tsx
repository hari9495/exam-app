import { render, screen, fireEvent } from '@testing-library/react';
import { WhatsappConfigCard } from './WhatsappConfigCard';
import { useWhatsappProviders, useWhatsappConfig, useUpdateWhatsappConfig } from '../../../../../lib/hooks/useWhatsappConfig';

jest.mock('../../../../../lib/hooks/useWhatsappConfig');

const mockUseWhatsappProviders = useWhatsappProviders as jest.Mock;
const mockUseWhatsappConfig = useWhatsappConfig as jest.Mock;
const mockUseUpdateWhatsappConfig = useUpdateWhatsappConfig as jest.Mock;

const PROVIDERS = [
  {
    id: 'twilio',
    label: 'Twilio WhatsApp',
    configFields: [
      { key: 'accountSid', label: 'Account SID', secret: false, required: true },
      { key: 'authToken', label: 'Auth Token', secret: true, required: true },
      { key: 'from', label: 'From number', secret: false, required: true },
    ],
  },
  {
    id: 'http',
    label: 'Generic HTTP',
    configFields: [
      { key: 'url', label: 'Webhook URL', secret: false, required: true, placeholder: 'https://example.com/whatsapp' },
      { key: 'authHeader', label: 'Authorization header', secret: true, required: false },
      { key: 'bodyTemplate', label: 'Body template', secret: false, required: true },
    ],
  },
];

let mutateMock: jest.Mock;

function setup(config: { whatsappEnabled: boolean; whatsappProvider: string; configured: boolean; config: Record<string, unknown> }) {
  mockUseWhatsappProviders.mockReturnValue({ data: PROVIDERS });
  mockUseWhatsappConfig.mockReturnValue({ data: config });
  mutateMock = jest.fn();
  mockUseUpdateWhatsappConfig.mockReturnValue({ mutate: mutateMock, isPending: false });
  return render(<WhatsappConfigCard />);
}

describe('WhatsappConfigCard', () => {
  it('renders the current provider fields and switches to the other provider fields on select', () => {
    setup({ whatsappEnabled: true, whatsappProvider: 'twilio', configured: true, config: { accountSid: 'AC123', from: '+1555' } });

    // Twilio fields pre-filled from the non-secret config.
    expect(screen.getByLabelText('Account SID')).toHaveValue('AC123');
    expect(screen.getByLabelText('From number')).toHaveValue('+1555');
    expect(screen.queryByLabelText('Webhook URL')).not.toBeInTheDocument();

    // Open the provider combobox (button shows the current provider's label) and pick the other one.
    fireEvent.click(screen.getByText('Twilio WhatsApp'));
    fireEvent.click(screen.getByText('Generic HTTP'));

    // Now the HTTP provider's own fields render instead.
    expect(screen.getByLabelText('Webhook URL')).toBeInTheDocument();
    expect(screen.getByLabelText('Body template')).toBeInTheDocument();
    expect(screen.queryByLabelText('Account SID')).not.toBeInTheDocument();
  });

  it('never shows a value in a secret field, even when the org is configured', () => {
    setup({ whatsappEnabled: true, whatsappProvider: 'twilio', configured: true, config: { accountSid: 'AC123', from: '+1555' } });
    const authToken = screen.getByLabelText('Auth Token') as HTMLInputElement;
    expect(authToken.value).toBe('');
    expect(authToken.type).toBe('password');
    fireEvent.change(authToken, { target: { value: 'should-still-not-leak-anything' } });
    // Typing into it is fine (it's how you'd set a new secret) -- what must never happen is the
    // field arriving pre-filled with the stored value, which the above initial assertion covers.
    expect(authToken.value).toBe('should-still-not-leak-anything');
  });

  it('submits a PUT payload carrying whatsappProvider and config', () => {
    setup({ whatsappEnabled: false, whatsappProvider: 'twilio', configured: false, config: {} });

    fireEvent.change(screen.getByLabelText('Account SID'), { target: { value: 'AC999' } });
    fireEvent.change(screen.getByLabelText('Auth Token'), { target: { value: 'secret-token' } });
    fireEvent.change(screen.getByLabelText('From number'), { target: { value: '+1999' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /enable whatsapp messaging/i }));
    fireEvent.click(screen.getByRole('button', { name: /save whatsapp settings/i }));

    expect(mutateMock).toHaveBeenCalledTimes(1);
    const [payload] = mutateMock.mock.calls[0];
    expect(payload.whatsappProvider).toBe('twilio');
    expect(payload.whatsappEnabled).toBe(true);
    expect(payload.config).toEqual({ accountSid: 'AC999', authToken: 'secret-token', from: '+1999' });
  });
});
