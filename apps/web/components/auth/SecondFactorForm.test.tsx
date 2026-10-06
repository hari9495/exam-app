import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { startAuthentication } from '@simplewebauthn/browser';
import { SecondFactorForm } from './SecondFactorForm';

jest.mock('@simplewebauthn/browser', () => ({ startAuthentication: jest.fn() }));

describe('SecondFactorForm', () => {
  const submit = jest.fn();
  const getPasskeyOptions = jest.fn();

  beforeEach(() => {
    submit.mockReset().mockResolvedValue(undefined);
    getPasskeyOptions.mockReset().mockResolvedValue({ challenge: 'c1' });
    (startAuthentication as jest.Mock).mockReset();
  });

  it('submits the authenticator-app code', async () => {
    render(<SecondFactorForm factors={['totp', 'recovery_code']} getPasskeyOptions={getPasskeyOptions} submit={submit} />);
    await userEvent.type(screen.getByLabelText('Code from your authenticator app'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(submit).toHaveBeenCalledWith({ factor: 'totp', code: '123456' });
    expect(screen.queryByRole('button', { name: 'Use your passkey' })).not.toBeInTheDocument();
  });

  it('switches to a recovery code', async () => {
    render(<SecondFactorForm factors={['totp', 'recovery_code']} getPasskeyOptions={getPasskeyOptions} submit={submit} />);
    await userEvent.click(screen.getByRole('button', { name: 'Use a recovery code instead' }));
    await userEvent.type(screen.getByLabelText('Recovery code'), ' abcd-efgh-ijkm-npqr ');
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(submit).toHaveBeenCalledWith({ factor: 'recovery_code', code: 'abcd-efgh-ijkm-npqr' });
  });

  it('signs with the passkey over the server challenge', async () => {
    (startAuthentication as jest.Mock).mockResolvedValue({ id: 'cred-1' });
    render(<SecondFactorForm factors={['passkey', 'recovery_code']} getPasskeyOptions={getPasskeyOptions} submit={submit} />);
    await userEvent.click(screen.getByRole('button', { name: 'Use your passkey' }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith({ factor: 'passkey', credential: { id: 'cred-1' } }));
    expect(startAuthentication).toHaveBeenCalledWith({ optionsJSON: { challenge: 'c1' } });
  });

  it('shows the server refusal, and a plain message when the browser prompt is dismissed', async () => {
    submit.mockRejectedValue(new Error('That verification did not work. Try again.'));
    render(<SecondFactorForm factors={['passkey', 'totp']} getPasskeyOptions={getPasskeyOptions} submit={submit} />);
    await userEvent.type(screen.getByLabelText('Code from your authenticator app'), '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That verification did not work. Try again.');

    (startAuthentication as jest.Mock).mockRejectedValue(Object.assign(new Error('The operation either timed out or was not allowed.'), { name: 'NotAllowedError' }));
    await userEvent.click(screen.getByRole('button', { name: 'Use your passkey' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That did not work. Try again.');
  });
});
