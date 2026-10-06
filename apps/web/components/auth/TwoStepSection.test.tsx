import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { startRegistration } from '@simplewebauthn/browser';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { TwoStepSection } from './TwoStepSection';

jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));
jest.mock('@simplewebauthn/browser', () => ({ startRegistration: jest.fn() }));
jest.mock('qrcode', () => ({ __esModule: true, default: { toDataURL: jest.fn(async () => 'data:image/png;base64,QR') } }));

const CODES = Array.from({ length: 10 }, (_, i) => `aaaa-bbbb-cccc-dd${String(i).padStart(2, '0')}`);

describe('TwoStepSection', () => {
  let factors: object[];
  let mobileNumber: string | null;
  const api = apiFetch as jest.Mock;

  beforeEach(() => {
    factors = [];
    mobileNumber = null;
    (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok' });
    api.mockReset().mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/auth/mfa') {
        return { factors, recoveryCodesRemaining: factors.length ? 10 : 0, required: true, enrolmentDueAt: '2026-10-20T00:00:00Z', allowedFactors: ['passkey', 'totp'], mobileNumber };
      }
      if (path === '/auth/otp/mobile' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({ mobileNumber: '98765 43210' });
        return { mobileNumber: '+919876543210', expiresInSeconds: 300 };
      }
      if (path === '/auth/otp/mobile/verify') {
        expect(JSON.parse(String(init?.body))).toEqual({ code: '246810' });
        mobileNumber = '+919876543210';
        return { mobileNumber };
      }
      if (path === '/auth/otp/mobile' && init?.method === 'DELETE') {
        mobileNumber = null;
        return null;
      }
      if (path === '/auth/mfa/totp/setup') return { secret: 'JBSWY3DPEHPK3PXP', otpauthUrl: 'otpauth://totp/YukthiX:me?secret=JBSWY3DPEHPK3PXP' };
      if (path === '/auth/mfa/totp/confirm') {
        expect(JSON.parse(String(init?.body))).toEqual({ code: '123456' });
        factors = [{ id: 'f1', type: 'totp', label: 'Authenticator app', createdAt: '2026-10-06T00:00:00Z', lastUsedAt: null }];
        return { factor: 'totp', recoveryCodes: CODES };
      }
      if (path === '/auth/mfa/passkeys/registration-options') return { challenge: 'reg' };
      if (path === '/auth/mfa/passkeys') {
        factors = [{ id: 'p1', type: 'passkey', label: 'Passkey', createdAt: '2026-10-06T00:00:00Z', lastUsedAt: null }];
        return { factor: 'passkey', recoveryCodes: CODES };
      }
      if (path.startsWith('/auth/mfa/authenticators/')) {
        factors = [];
        return null;
      }
      throw new Error(`unexpected ${path}`);
    });
  });

  it('tells a sensitive role it must enrol, and by when', async () => {
    render(<TwoStepSection />);
    expect(await screen.findByText(/Your role needs two-step verification/)).toBeInTheDocument();
  });

  it('sets up an authenticator app from its QR code and shows the recovery codes once', async () => {
    render(<TwoStepSection />);
    await userEvent.click(await screen.findByRole('button', { name: 'Use an authenticator app' }));
    expect(await screen.findByAltText('QR code for your authenticator app')).toHaveAttribute('src', 'data:image/png;base64,QR');
    expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('6-digit code'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Turn on' }));

    const list = await screen.findByRole('list', { name: 'Recovery codes' });
    expect(list.querySelectorAll('li')).toHaveLength(10);
    expect(await screen.findByText('Authenticator app')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'I have saved them' }));
    expect(screen.queryByRole('list', { name: 'Recovery codes' })).not.toBeInTheDocument();
  });

  it('registers a passkey through the browser', async () => {
    (startRegistration as jest.Mock).mockResolvedValue({ id: 'cred' });
    render(<TwoStepSection />);
    await userEvent.click(await screen.findByRole('button', { name: 'Add a passkey' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/auth/mfa/passkeys', { method: 'POST', body: JSON.stringify({ credential: { id: 'cred' }, label: 'Passkey' }) }, 'tok'),
    );
    expect(startRegistration).toHaveBeenCalledWith({ optionsJSON: { challenge: 'reg' } });
  });

  it('removes a factor and surfaces a refusal', async () => {
    factors = [{ id: 'f1', type: 'totp', label: 'Authenticator app', createdAt: '2026-10-06T00:00:00Z', lastUsedAt: null }];
    const realImpl = api.getMockImplementation()!;
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/auth/mfa/authenticators/f1') throw new Error('Two-step verification is required for your account. Add another factor before removing this one.');
      return realImpl(path, init);
    });
    render(<TwoStepSection />);
    await userEvent.click(await screen.findByRole('button', { name: 'Remove authenticator app' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Add another factor before removing this one');
  });

  it('verifies a mobile number with a texted code, and removes it', async () => {
    render(<TwoStepSection />);
    await userEvent.type(await screen.findByLabelText('Mobile number'), '98765 43210');
    await userEvent.click(screen.getByRole('button', { name: 'Text me a code' }));
    expect(await screen.findByText(/We texted a 6-digit code to \+919876543210/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Code from the text'), '246810');
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText('+919876543210')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Remove mobile number' }));
    expect(await screen.findByLabelText('Mobile number')).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith('/auth/otp/mobile', { method: 'DELETE' }, 'tok');
  });
});
