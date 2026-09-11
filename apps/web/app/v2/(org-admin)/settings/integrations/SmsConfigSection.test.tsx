import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SmsConfigSection } from './SmsConfigSection';

const updateMutate = jest.fn();
let smsConfig: { smsEnabled: boolean; smsAccountSid: string | null; smsFromNumber: string | null; configured: boolean } | undefined;

jest.mock('../../../../../lib/hooks/useSmsConfig', () => ({
  useSmsConfig: () => ({ data: smsConfig }),
  useUpdateSmsConfig: () => ({ mutate: updateMutate, isPending: false }),
}));

describe('SmsConfigSection', () => {
  beforeEach(() => {
    updateMutate.mockClear();
    smsConfig = undefined;
  });

  it('never renders an auth token, only the "Configured" summary', () => {
    smsConfig = { smsEnabled: true, smsAccountSid: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', smsFromNumber: '+15551234567', configured: true };
    render(<SmsConfigSection />);

    expect(screen.getByText(/Configured/)).toBeInTheDocument();
    expect(screen.getByText(/ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/)).toBeInTheDocument();
    // No secret value anywhere in the rendered summary/form -- the API response the hook is
    // mocked with never carries a token field, so there is nothing to leak; the auth token
    // input itself starts blank (write-only, matching how the SMTP password field works).
    expect(screen.queryByDisplayValue(/^AC/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Auth Token/)).not.toBeInTheDocument();
  });

  it('submits enabled/accountSid/fromNumber plus a non-blank auth token', async () => {
    smsConfig = { smsEnabled: false, smsAccountSid: null, smsFromNumber: null, configured: false };
    render(<SmsConfigSection />);

    await userEvent.type(screen.getByLabelText('Account SID'), 'ACnew');
    await userEvent.type(screen.getByLabelText('Auth Token'), 'secret-token');
    await userEvent.type(screen.getByLabelText('From Number'), '+15559876543');
    await userEvent.click(screen.getByRole('button', { name: 'Save SMS settings' }));

    expect(updateMutate).toHaveBeenCalledWith(
      { smsEnabled: false, smsAccountSid: 'ACnew', smsFromNumber: '+15559876543', smsAuthToken: 'secret-token' },
      expect.anything(),
    );
  });

  it('omits smsAuthToken from the payload when left blank (keeps the existing token)', async () => {
    smsConfig = { smsEnabled: true, smsAccountSid: 'ACold', smsFromNumber: '+15551112222', configured: true };
    render(<SmsConfigSection />);

    await userEvent.click(screen.getByRole('button', { name: 'Edit SMS settings' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save SMS settings' }));

    expect(updateMutate).toHaveBeenCalledWith(
      { smsEnabled: true, smsAccountSid: 'ACold', smsFromNumber: '+15551112222' },
      expect.anything(),
    );
  });
});
