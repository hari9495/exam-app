import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SignInScreen, type SignInFields, type SignInMethod, type SignInScreenProps } from './sign-in';
import { MfaChallengeScreen, MfaEnrolScreen, StepUpDialog } from './mfa';
import { MeSecurityScreen, type MeSecurityScreenProps } from './me-security';
import { LoginActivityScreen, NO_FILTERS, type LoginActivityScreenProps } from './login-activity';
import { SecuritySettingsScreen, policyChanges, policyErrors, type SecuritySettingsScreenProps } from './security-settings';
import { deviceLabel, errorText } from './kit';
import { ADMINS, FLOOR, IDPS, MFA_ENROLLED, MFA_NONE, MY_HISTORY, MY_SESSIONS, NOW, ORG_EVENTS, ORG_SESSIONS, PEOPLE, POLICY, PROVIDERS, RECOVERY_CODES, TOTP_SETUP } from './data';

function SignIn(over: Partial<SignInScreenProps> & { start?: Partial<SignInFields> }) {
  const { start, ...rest } = over;
  const [fields, setFields] = useState<SignInFields>({ organization: 'kaveri-foods', email: '', password: '', identifier: '', code: '', ...start });
  const [method, setMethod] = useState<SignInMethod>(over.method ?? 'sso');
  return (
    <SignInScreen
      fields={fields}
      onFieldChange={(k, v) => setFields((f) => ({ ...f, [k]: v }))}
      providers={PROVIDERS}
      codeSent={false}
      onPasswordSubmit={vi.fn()}
      onSendCode={vi.fn()}
      onVerifyCode={vi.fn()}
      onCodeRestart={vi.fn()}
      onSso={vi.fn()}
      forgotPasswordHref="/forgot-password"
      {...rest}
      method={method}
      onMethodChange={setMethod}
    />
  );
}

describe('SignInScreen', () => {
  it('offers each identity provider and routes by email domain', async () => {
    const onSso = vi.fn();
    render(<SignIn onSso={onSso} />);
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(onSso).toHaveBeenCalledWith(PROVIDERS[0].id);
    const go = screen.getByRole('button', { name: 'Continue' });
    expect(go).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Work email'), 'divya.r@kaverifoods.in');
    await userEvent.click(go);
    expect(onSso).toHaveBeenLastCalledWith();
  });

  it('is a pick-one segment, and hides single sign-on when the company has none', async () => {
    render(<SignIn providers={[]} method="password" />);
    const group = screen.getByRole('radiogroup', { name: 'Sign in with' });
    expect(within(group).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Password', 'One-time code']);
    expect(screen.queryByRole('button', { name: /Continue with/ })).toBeNull();
  });

  it('submits the password form', async () => {
    const onPasswordSubmit = vi.fn();
    render(<SignIn method="password" onPasswordSubmit={onPasswordSubmit} />);
    await userEvent.type(screen.getByLabelText(/Work email/), 'divya.r@kaverifoods.in');
    await userEvent.type(screen.getByLabelText(/^Password/), 'correct horse battery');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(onPasswordSubmit).toHaveBeenCalledOnce();
  });

  it('texts a code to a mobile number, or sends it on WhatsApp', async () => {
    const onSendCode = vi.fn();
    render(<SignIn method="code" onSendCode={onSendCode} />);
    await userEvent.type(screen.getByLabelText(/Work email or mobile number/), '+919845012345');
    await userEvent.click(screen.getByRole('button', { name: 'Text me a code' }));
    expect(onSendCode).toHaveBeenCalledWith('sms');
    await userEvent.click(screen.getByRole('button', { name: 'Send it on WhatsApp' }));
    expect(onSendCode).toHaveBeenLastCalledWith('whatsapp');
  });

  it('announces errors', () => {
    render(<SignIn method="password" error="Invalid email or password." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password.');
  });
});

describe('second step', () => {
  it('signs in with a passkey proof', async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    render(<MfaChallengeScreen factors={['passkey', 'totp']} getPasskey={async () => ({ id: 'cred' })} submit={submit} onStartAgain={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Use my passkey' }));
    expect(submit).toHaveBeenCalledWith({ factor: 'passkey', credential: { id: 'cred' } });
  });

  it('sends an authenticator code and shows a refusal', async () => {
    const submit = vi.fn().mockRejectedValue(new Error('That code is not right.'));
    render(<MfaChallengeScreen factors={['passkey', 'totp']} getPasskey={vi.fn()} submit={submit} onStartAgain={vi.fn()} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Authenticator app' }));
    await userEvent.type(screen.getByLabelText(/6-digit code/), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(submit).toHaveBeenCalledWith({ factor: 'totp', code: '123456' });
    expect(await screen.findByRole('alert')).toHaveTextContent('That code is not right.');
  });

  it('explains a closed passkey prompt without blaming the person', async () => {
    const cancelled = Object.assign(new Error('The operation either timed out or was not allowed.'), { name: 'NotAllowedError' });
    render(<MfaChallengeScreen factors={['passkey']} getPasskey={() => Promise.reject(cancelled)} submit={vi.fn()} onStartAgain={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Use my passkey' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('closed or timed out');
  });

  it('offers a texted code only where the API allows it', async () => {
    const sendCode = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(<MfaChallengeScreen factors={['totp']} getPasskey={vi.fn()} submit={vi.fn()} sendCode={sendCode} onStartAgain={vi.fn()} />);
    expect(screen.queryByRole('radio', { name: 'Text message' })).toBeNull();
    rerender(<MfaChallengeScreen factors={['totp', 'otp']} getPasskey={vi.fn()} submit={vi.fn()} sendCode={sendCode} onStartAgain={vi.fn()} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Text message' }));
    await userEvent.click(screen.getByRole('button', { name: 'Text me a code' }));
    expect(sendCode).toHaveBeenCalledWith('sms');
    expect(await screen.findByText(/We sent a code by SMS/)).toBeInTheDocument();
  });

  it('step-up never offers a texted code', () => {
    render(<StepUpDialog open onCancel={vi.fn()} factors={['totp', 'otp']} getPasskey={vi.fn()} submit={vi.fn()} setupHref="/yx/me/security" />);
    expect(screen.getByRole('dialog', { name: "Confirm it's you" })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Text message' })).toBeNull();
  });

  it('step-up without a factor points to set-up', () => {
    render(<StepUpDialog open onCancel={vi.fn()} factors={[]} getPasskey={vi.fn()} submit={vi.fn()} setupHref="/yx/me/security" />);
    expect(screen.getByRole('link', { name: /Set one up/ })).toHaveAttribute('href', '/yx/me/security');
  });
});

describe('MfaEnrolScreen', () => {
  const base = { allowedFactors: ['passkey', 'totp'], onStartTotp: async () => TOTP_SETUP, onConfirmTotp: async () => ({ recoveryCodes: RECOVERY_CODES }), now: NOW };

  it('shows the recovery codes once and continues only after they are saved', async () => {
    const onContinue = vi.fn();
    render(<MfaEnrolScreen {...base} dueAt="2026-10-08T00:00:00+05:30" onAddPasskey={async () => ({ recoveryCodes: RECOVERY_CODES })} onContinue={onContinue} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add a passkey' }));
    const list = await screen.findByRole('list', { name: 'Recovery codes' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(10);
    const go = screen.getByRole('button', { name: 'Continue' });
    expect(go).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: 'I have saved my recovery codes' }));
    await userEvent.click(go);
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it('sets up an authenticator app from the QR code', async () => {
    const onConfirmTotp = vi.fn().mockResolvedValue({ recoveryCodes: RECOVERY_CODES });
    render(<MfaEnrolScreen {...base} onConfirmTotp={onConfirmTotp} dueAt="2026-10-08T00:00:00+05:30" onAddPasskey={vi.fn()} onContinue={vi.fn()} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Authenticator app' }));
    await userEvent.click(screen.getByRole('button', { name: 'Show the QR code' }));
    expect(await screen.findByRole('img', { name: /QR code/ })).toBeInTheDocument();
    expect(screen.getByText(TOTP_SETUP.secret)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/6-digit code/), '654321');
    await userEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    expect(onConfirmTotp).toHaveBeenCalledWith('654321');
  });

  it('allows "Remind me later" only during the grace period', () => {
    const { rerender } = render(<MfaEnrolScreen {...base} dueAt="2026-10-08T00:00:00+05:30" onAddPasskey={vi.fn()} onContinue={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Remind me later' })).toBeInTheDocument();
    rerender(<MfaEnrolScreen {...base} dueAt="2026-09-20T00:00:00+05:30" onAddPasskey={vi.fn()} onContinue={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Remind me later' })).toBeNull();
  });
});

function Me(over: Partial<MeSecurityScreenProps>) {
  return (
    <MeSecurityScreen
      state="ready"
      mfa={MFA_ENROLLED}
      sessions={MY_SESSIONS}
      history={MY_HISTORY}
      historyState="ready"
      historyFilter="all"
      onHistoryFilter={vi.fn()}
      onHistoryPage={vi.fn()}
      onAddPasskey={vi.fn()}
      onStartTotp={vi.fn()}
      onConfirmTotp={vi.fn()}
      onRemoveFactor={vi.fn()}
      onNewRecoveryCodes={vi.fn()}
      onSendMobileCode={vi.fn()}
      onVerifyMobile={vi.fn()}
      onRemoveMobile={vi.fn()}
      onSignOutSession={vi.fn()}
      onSignOutOthers={vi.fn()}
      now={NOW}
      {...over}
    />
  );
}

describe('MeSecurityScreen', () => {
  it('lists second steps, sessions and history', () => {
    render(<Me />);
    expect(within(screen.getByRole('list', { name: 'Your second steps' })).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('This browser')).toBeInTheDocument();
    expect(screen.getAllByText('New device').length).toBeGreaterThan(0);
  });

  it('removes a factor after confirming', async () => {
    const onRemoveFactor = vi.fn().mockResolvedValue(undefined);
    render(<Me onRemoveFactor={onRemoveFactor} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Office laptop' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }));
    expect(onRemoveFactor).toHaveBeenCalledWith(MFA_ENROLLED.factors[0]);
  });

  it("won't remove the only factor when the role needs one", () => {
    render(<Me mfa={{ ...MFA_ENROLLED, factors: MFA_ENROLLED.factors.slice(0, 1) }} />);
    expect(screen.getByRole('button', { name: 'Remove Office laptop' })).toBeDisabled();
  });

  it('warns when the role needs a second step and none is set up', () => {
    render(<Me mfa={MFA_NONE} />);
    expect(screen.getByText(/Set this up by 8 Oct 2026/)).toBeInTheDocument();
  });

  it('signs out another session, never the current one', async () => {
    const onSignOutSession = vi.fn().mockResolvedValue(undefined);
    render(<Me onSignOutSession={onSignOutSession} />);
    const buttons = screen.getAllByRole('button', { name: /^Sign out Safari on iOS/ });
    expect(buttons).toHaveLength(1);
    await userEvent.click(buttons[0]);
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sign out' }));
    expect(onSignOutSession).toHaveBeenCalledWith(MY_SESSIONS[1]);
  });

  it('shows new recovery codes once', async () => {
    render(<Me onNewRecoveryCodes={async () => RECOVERY_CODES} />);
    await userEvent.click(screen.getByRole('button', { name: /New recovery codes/ }));
    expect(await screen.findByRole('list', { name: 'Recovery codes' })).toBeInTheDocument();
  });

  it('verifies a mobile number by text', async () => {
    const onSendMobileCode = vi.fn().mockResolvedValue('+919845012345');
    const onVerifyMobile = vi.fn().mockResolvedValue(undefined);
    render(<Me mfa={{ ...MFA_ENROLLED, mobileNumber: null }} onSendMobileCode={onSendMobileCode} onVerifyMobile={onVerifyMobile} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Mobile number' }), '+91 98450 12345');
    await userEvent.click(screen.getByRole('button', { name: 'Text me a code' }));
    expect(onSendMobileCode).toHaveBeenCalledWith('+91 98450 12345');
    await userEvent.type(await screen.findByLabelText(/Code from the text/), '112233');
    await userEvent.click(screen.getByRole('button', { name: 'Verify number' }));
    expect(onVerifyMobile).toHaveBeenCalledWith('112233');
  });

  it('has loading and error states', () => {
    const { rerender } = render(<Me state="error" onRetry={vi.fn()} />);
    expect(screen.getByText("We couldn't load your security settings.")).toBeInTheDocument();
    rerender(<Me state="loading" />);
    expect(screen.queryByText('Two-step verification')).toBeNull();
  });
});

function Activity(over: Partial<LoginActivityScreenProps>) {
  return (
    <LoginActivityScreen
      tab="events"
      onTabChange={vi.fn()}
      events={ORG_EVENTS}
      eventsState="ready"
      filters={NO_FILTERS}
      onFiltersChange={vi.fn()}
      onEventsPage={vi.fn()}
      failedLast24h={2}
      people={PEOPLE}
      sessions={ORG_SESSIONS}
      sessionsState="ready"
      onSessionsPage={vi.fn()}
      onRevokeSession={vi.fn()}
      {...over}
    />
  );
}

describe('LoginActivityScreen', () => {
  it('shows attempts with person, result and method', () => {
    render(<Activity />);
    expect(screen.getAllByText('ramesh.g@kaverifoods.in').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Blocked').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Code by SMS').length).toBeGreaterThan(0);
  });

  it('flags a spike of failed attempts and filters to them', async () => {
    const onFiltersChange = vi.fn();
    render(<Activity failedLast24h={46} onFiltersChange={onFiltersChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Show failed attempts' }));
    expect(onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ result: 'failed' }));
  });

  it('signs a person out after confirming', async () => {
    const onRevokeSession = vi.fn().mockResolvedValue(undefined);
    render(<Activity tab="sessions" onRevokeSession={onRevokeSession} />);
    await userEvent.click(screen.getByRole('button', { name: /^Sign out Suresh Pillai/ }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sign out' }));
    expect(onRevokeSession).toHaveBeenCalledWith(ORG_SESSIONS.data[2]);
  });

  it('says what to do when filters match nothing', () => {
    render(<Activity events={{ data: [], total: 0, page: 1, pageSize: 25 }} filters={{ ...NO_FILTERS, result: 'locked' }} />);
    expect(screen.getByText(/No results/)).toBeInTheDocument();
  });
});

function Settings(over: Partial<SecuritySettingsScreenProps>) {
  return <SecuritySettingsScreen state="ready" policy={POLICY} floor={FLOOR} providers={IDPS} admins={ADMINS} providersHref="/v2/settings/sso" onSave={vi.fn()} {...over} />;
}

describe('SecuritySettingsScreen', () => {
  it('shows the YukthiX minimum next to each limit', () => {
    render(<Settings />);
    expect(screen.getByText('Minimum allowed: people in sensitive roles.')).toBeInTheDocument();
    expect(screen.getByText(/Minimum allowed: 12 characters/)).toBeInTheDocument();
    expect(screen.getByText(/maximum allowed: 12 hours/)).toBeInTheDocument();
    expect(screen.getByText(/Allowed: 5 minutes to 8 hours/)).toBeInTheDocument();
  });

  it('saves only the changed fields', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<Settings onSave={onSave} />);
    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: 'Everyone' }));
    await userEvent.type(screen.getByLabelText(/Sign out on the web after no activity/), '15');
    await userEvent.click(save);
    expect(onSave).toHaveBeenCalledWith({ mfaScope: 'all', sessionIdleMinutes: 15 });
    expect(await screen.findByText(/Saved\./)).toBeInTheDocument();
  });

  it('blocks a laxer or inconsistent policy and lists why', async () => {
    const onSave = vi.fn();
    render(<Settings onSave={onSave} />);
    await userEvent.click(screen.getByRole('checkbox', { name: /^Passkey/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /^Authenticator app/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Keep passkey or authenticator app allowed');
  });

  it('needs two emergency admins for single sign-on only', async () => {
    const onSave = vi.fn();
    render(<Settings onSave={onSave} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sign in only through your identity provider' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Name at least 2 emergency admins');
  });

  it("can't turn on single sign-on only without an active provider", () => {
    render(<Settings providers={IDPS.map((p) => ({ ...p, status: 'disabled' as const }))} />);
    expect(screen.getByRole('checkbox', { name: 'Sign in only through your identity provider' })).toBeDisabled();
  });

  it('shows a refused save', async () => {
    render(<Settings onSave={() => Promise.reject(new Error('203.0.113.0/33 is not a valid IP address or range.'))} />);
    await userEvent.type(screen.getByLabelText('Web app'), '203.0.113.0/33');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('not a valid IP address');
  });

  it('has no-access, loading and error states', () => {
    const { rerender } = render(<Settings state="no-access" policy={null} floor={null} />);
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    rerender(<Settings state="error" policy={null} floor={null} onRetry={vi.fn()} />);
    expect(screen.getByText("We couldn't load the security settings.")).toBeInTheDocument();
  });
});

describe('helpers', () => {
  it('diffs and validates a policy against the floor', () => {
    expect(policyChanges(POLICY, { ...POLICY, ipAllowlistDesk: ['10.0.0.0/8'] })).toEqual({ ipAllowlistDesk: ['10.0.0.0/8'] });
    expect(policyErrors({ ...POLICY, sessionIdleMinutes: 300, sessionAbsoluteMinutes: 120 }, FLOOR, IDPS).map((e) => e.fieldId)).toEqual(['sec-idle']);
    expect(policyErrors({ ...POLICY, sessionIdleMinutes: 481 }, FLOOR, IDPS).map((e) => e.fieldId)).toContain('sec-idle');
    expect(policyErrors({ ...POLICY, passwordMinLength: 8 }, FLOOR, IDPS).map((e) => e.fieldId)).toEqual(['sec-password']);
    expect(policyErrors(POLICY, FLOOR, IDPS)).toEqual([]);
  });

  it('names devices and errors in plain words', () => {
    expect(deviceLabel(MY_SESSIONS[0].userAgent)).toBe('Chrome on Windows');
    expect(deviceLabel(null)).toBe('Unknown device');
    expect(errorText(new Error('Too many attempts'))).toBe('Too many attempts');
  });
});

