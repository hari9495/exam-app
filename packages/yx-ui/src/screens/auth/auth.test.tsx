import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ForgotPasswordScreen, ResetPasswordScreen, SignInScreen, type SignInFields, type SignInScreenProps, type SignInStep } from './sign-in';
import { MfaChallengeScreen, MfaEnrolScreen, StepUpDialog } from './mfa';
import { MeSecurityScreen, type MeSecurityScreenProps } from './me-security';
import { LoginActivityScreen, NO_FILTERS, type LoginActivityScreenProps } from './login-activity';
import { SecuritySettingsScreen, policyChanges, policyErrors, type SecuritySettingsScreenProps } from './security-settings';
import { deviceLabel, errorText } from './kit';
import { ADMINS, COMPANIES, FLOOR, IDPS, MFA_ENROLLED, MFA_NONE, MY_HISTORY, MY_SESSIONS, NOW, ORG_EVENTS, ORG_SESSIONS, PEOPLE, POLICY, PROVIDERS, RECOVERY_CODES, TOTP_SETUP } from './data';

function SignIn(over: Partial<SignInScreenProps> & { start?: Partial<SignInFields> }) {
  const { start, ...rest } = over;
  const [fields, setFields] = useState<SignInFields>({ identifier: '', mobile: '', password: '', code: '', ...start });
  const [step, setStep] = useState<SignInStep>(over.step ?? 'identify');
  return (
    <SignInScreen
      fields={fields}
      onFieldChange={(k, v) => setFields((f) => ({ ...f, [k]: v }))}
      providers={[]}
      onIdentify={() => setStep('password')}
      onPasswordSubmit={vi.fn()}
      onSendCode={vi.fn()}
      onVerifyCode={vi.fn()}
      onRestart={() => setStep('identify')}
      onSso={vi.fn()}
      onPickCompany={vi.fn()}
      forgotPasswordHref="/forgot-password"
      {...rest}
      step={step}
    />
  );
}

const DIVYA = { identifier: 'divya.r@kaverifoods.in' };
const KAVERI = { name: 'Kaveri Foods Pvt Ltd', logoUrl: null };
const ALL_WAYS = { google: true, microsoft: true, sms: true, whatsapp: true, emailCode: true };

describe('SignInScreen (work email first, no company code)', () => {
  it('asks only for a work email first, never a company code', async () => {
    const onIdentify = vi.fn();
    render(<SignIn onIdentify={onIdentify} />);
    expect(screen.queryByLabelText(/company/i)).toBeNull();
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    const go = screen.getByRole('button', { name: 'Continue' });
    expect(go).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Work email/), '+919845012345');
    expect(go).toBeDisabled();
    await userEvent.clear(screen.getByLabelText(/Work email/));
    await userEvent.type(screen.getByLabelText(/Work email/), DIVYA.identifier);
    await userEvent.click(go);
    expect(onIdentify).toHaveBeenCalledOnce();
  });

  it("then 'or' and the other ways in, in the founder's order, each with its mark", async () => {
    const onMobile = vi.fn();
    const onSocial = vi.fn();
    render(<SignIn options={ALL_WAYS} onMobile={onMobile} onSocial={onSocial} />);
    expect(screen.getByRole('separator')).toHaveTextContent('or');
    const ways = within(screen.getByRole('group', { name: 'Other ways to sign in' })).getAllByRole('button');
    expect(ways.map((b) => b.textContent)).toEqual(['Continue with mobile', 'Continue with Microsoft', 'Continue with Google']);
    // Bordered buttons (R2), each with its decorative mark.
    for (const b of ways) {
      expect(b).toHaveAttribute('data-variant', 'secondary');
      expect(b.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    }
    expect(ways[1].querySelectorAll('rect')).toHaveLength(4);
    expect([...ways[2].querySelectorAll('path')].map((p) => p.getAttribute('class'))).toEqual(['yx-mark-google-red', 'yx-mark-google-blue', 'yx-mark-google-yellow', 'yx-mark-google-green']);
    await userEvent.click(ways[0]);
    expect(onMobile).toHaveBeenCalledOnce();
    await userEvent.click(ways[1]);
    expect(onSocial).toHaveBeenLastCalledWith('microsoft');
    await userEvent.click(ways[2]);
    expect(onSocial).toHaveBeenLastCalledWith('google');
  });

  it("hides each way that is off, and the 'or' when none is on", () => {
    const { unmount } = render(<SignIn options={{ ...ALL_WAYS, sms: false, whatsapp: false, google: false }} onMobile={vi.fn()} onSocial={vi.fn()} />);
    const ways = within(screen.getByRole('group', { name: 'Other ways to sign in' })).getAllByRole('button');
    expect(ways.map((b) => b.textContent)).toEqual(['Continue with Microsoft']);
    unmount();
    render(<SignIn options={{ google: false, microsoft: false, sms: false, whatsapp: false, emailCode: true }} onMobile={vi.fn()} onSocial={vi.fn()} />);
    expect(screen.queryByRole('separator')).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it("a company's own Google provider replaces YukthiX's Google button", async () => {
    const onSso = vi.fn();
    const onSocial = vi.fn();
    render(<SignIn company={KAVERI} providers={PROVIDERS} options={ALL_WAYS} onSocial={onSocial} onSso={onSso} />);
    const ways = within(screen.getByRole('group', { name: 'Other ways to sign in' })).getAllByRole('button');
    expect(ways.map((b) => b.textContent)).toEqual(['Continue with Microsoft', 'Continue with Google', 'Continue with Kaveri staff directory']);
    await userEvent.click(ways[1]);
    expect(onSso).toHaveBeenCalledWith(PROVIDERS[0].id);
    expect(onSocial).not.toHaveBeenCalled();
  });

  it('mobile: the number, then a code by SMS or WhatsApp, and a way back to the email', async () => {
    const onSendCode = vi.fn();
    render(<SignIn step="mobile" options={ALL_WAYS} onSendCode={onSendCode} />);
    const text = screen.getByRole('button', { name: 'Text me a code' });
    expect(text).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Mobile number/), '98450 12345');
    await userEvent.click(text);
    expect(onSendCode).toHaveBeenLastCalledWith('sms');
    await userEvent.click(screen.getByRole('button', { name: 'Send a code on WhatsApp' }));
    expect(onSendCode).toHaveBeenLastCalledWith('whatsapp');
    await userEvent.click(screen.getByRole('button', { name: 'Use my work email instead' }));
    expect(screen.getByLabelText(/Work email/)).toBeInTheDocument();
  });

  it('mobile with WhatsApp only: WhatsApp is the main button', async () => {
    const onSendCode = vi.fn();
    render(<SignIn step="mobile" options={{ ...ALL_WAYS, sms: false }} onSendCode={onSendCode} start={{ mobile: '9845012345' }} />);
    expect(screen.queryByRole('button', { name: 'Text me a code' })).toBeNull();
    const wa = screen.getByRole('button', { name: 'Send a code on WhatsApp' });
    expect(wa).toHaveAttribute('data-variant', 'primary');
    await userEvent.click(wa);
    expect(onSendCode).toHaveBeenLastCalledWith('whatsapp');
  });

  it('the mobile code: the number shown, how it went, and a new code by the same way', async () => {
    const onSendCode = vi.fn();
    const onVerifyCode = vi.fn();
    render(<SignIn step="mobile-code" codeChannel="whatsapp" options={ALL_WAYS} start={{ mobile: '+91 98450 12345' }} onSendCode={onSendCode} onVerifyCode={onVerifyCode} />);
    expect(screen.getByText('+91 98450 12345')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('by WhatsApp');
    await userEvent.click(screen.getByRole('button', { name: 'Send a new code' }));
    expect(onSendCode).toHaveBeenLastCalledWith('whatsapp');
    await userEvent.type(screen.getByLabelText(/6-digit code/), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(onVerifyCode).toHaveBeenCalledOnce();
  });

  it('then the password, with the email shown and a way back', async () => {
    const onPasswordSubmit = vi.fn();
    render(<SignIn onPasswordSubmit={onPasswordSubmit} />);
    await userEvent.type(screen.getByLabelText(/Work email/), DIVYA.identifier);
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText(DIVYA.identifier)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/^Password/), 'correct horse battery');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(onPasswordSubmit).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: 'Forgot your password?' })).toHaveAttribute('href', '/forgot-password');
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(screen.getByLabelText(/Work email/)).toBeInTheDocument();
  });

  it('offers an emailed code instead only where it is on', async () => {
    const onSendCode = vi.fn();
    const { unmount } = render(<SignIn step="password" start={DIVYA} onSendCode={onSendCode} />);
    await userEvent.click(screen.getByRole('button', { name: 'Email me a code instead' }));
    expect(onSendCode).toHaveBeenCalledOnce();
    expect(onSendCode.mock.lastCall?.[0]).toBeUndefined(); // by email
    unmount();
    // The known company turned email codes off: no button that would silently send nothing.
    render(<SignIn step="password" start={DIVYA} options={{ ...ALL_WAYS, emailCode: false }} onSendCode={onSendCode} />);
    expect(screen.queryByRole('button', { name: 'Email me a code instead' })).toBeNull();
  });

  it('shows the remembered company with "Not your company?", and its providers', async () => {
    const onForgetCompany = vi.fn();
    const onSso = vi.fn();
    render(<SignIn company={KAVERI} onForgetCompany={onForgetCompany} providers={PROVIDERS} onSso={onSso} />);
    expect(screen.getByRole('status')).toHaveTextContent('Signing in to Kaveri Foods Pvt Ltd');
    await userEvent.click(screen.getByRole('button', { name: 'Not your company?' }));
    expect(onForgetCompany).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(onSso).toHaveBeenCalledWith(PROVIDERS[0].id);
  });

  it('a company from the web address has no "Not your company?" button', () => {
    render(<SignIn company={KAVERI} />);
    expect(screen.queryByRole('button', { name: 'Not your company?' })).toBeNull();
  });

  it('"Choose your company" lists the companies by name and picks one', async () => {
    const onPickCompany = vi.fn();
    render(<SignIn step="choose-company" start={DIVYA} companies={COMPANIES} onPickCompany={onPickCompany} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Choose your company' })).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Companies' });
    expect(within(list).getAllByRole('button')).toHaveLength(COMPANIES.length);
    for (const c of COMPANIES) expect(within(list).getByRole('button', { name: c.name })).toBeInTheDocument();
    await userEvent.click(within(list).getByRole('button', { name: COMPANIES[1].name }));
    expect(onPickCompany).toHaveBeenCalledWith(COMPANIES[1].id);
  });

  it('says where it is going: the company sign-in page, or Google / Microsoft', () => {
    const { unmount } = render(<SignIn step="redirecting" />);
    expect(screen.getByRole('status')).toHaveTextContent("Taking you to your company's sign-in page");
    unmount();
    render(<SignIn step="redirecting" redirectingTo="Microsoft" />);
    expect(screen.getByRole('status')).toHaveTextContent('Taking you to Microsoft');
  });

  it('asks for the code after one was sent', async () => {
    const onVerifyCode = vi.fn();
    render(<SignIn step="code" start={DIVYA} onVerifyCode={onVerifyCode} />);
    await userEvent.type(screen.getByLabelText(/6-digit code/), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(onVerifyCode).toHaveBeenCalledOnce();
  });

  it('announces errors', () => {
    render(<SignIn step="password" start={DIVYA} error="Invalid email or password." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password.');
  });
});

describe('SecuritySettingsScreen email domains', () => {
  it('shows each domain, the TXT record to add, and checks it', async () => {
    const onVerifyDomain = vi.fn().mockRejectedValueOnce(new Error('No TXT record on kaveri.co.in yet.')).mockResolvedValueOnce(undefined);
    const domains = [
      { domain: 'kaverifoods.in', verifiedAt: '2026-09-20T10:00:00+05:30', txtRecord: { name: 'kaverifoods.in', value: 'yukthix-domain-verification=a' } },
      { domain: 'kaveri.co.in', verifiedAt: null, txtRecord: { name: 'kaveri.co.in', value: 'yukthix-domain-verification=b' } },
    ];
    render(<SecuritySettingsScreen state="ready" policy={POLICY} floor={FLOOR} providers={IDPS} admins={ADMINS} providersHref="#" onSave={vi.fn()} domains={domains} onVerifyDomain={onVerifyDomain} />);
    const list = screen.getByRole('list', { name: 'Email domains' });
    expect(within(list).getByText('Verified')).toBeInTheDocument();
    expect(within(list).getByText('yukthix-domain-verification=b')).toBeInTheDocument();
    expect(within(list).queryByText('yukthix-domain-verification=a')).toBeNull();
    const check = within(list).getByRole('button', { name: 'Check record' });
    await userEvent.click(check);
    expect(onVerifyDomain).toHaveBeenCalledWith('kaveri.co.in');
    expect(await screen.findByText('No TXT record on kaveri.co.in yet.')).toBeInTheDocument();
    await userEvent.click(check);
    expect(onVerifyDomain).toHaveBeenCalledTimes(2);
  });

  it('shows a lapsed domain as lapsed, with its TXT record and a way to check it again', async () => {
    const onVerifyDomain = vi.fn().mockResolvedValue(undefined);
    const domains = [
      { domain: 'kaverifoods.in', verifiedAt: null, lapsedAt: '2026-10-05T12:00:00+05:30', txtRecord: { name: 'kaverifoods.in', value: 'yukthix-domain-verification=a' } },
    ];
    render(<SecuritySettingsScreen state="ready" policy={POLICY} floor={FLOOR} providers={IDPS} admins={ADMINS} providersHref="#" onSave={vi.fn()} domains={domains} onVerifyDomain={onVerifyDomain} />);
    const list = screen.getByRole('list', { name: 'Email domains' });
    expect(within(list).getByText('Lapsed')).toBeInTheDocument();
    expect(within(list).queryByText('Verified')).toBeNull();
    expect(within(list).getByText(/sign-ins no longer go to your identity provider/)).toHaveTextContent('lapsed 5 Oct 2026');
    expect(within(list).getByText('yukthix-domain-verification=a')).toBeInTheDocument();
    await userEvent.click(within(list).getByRole('button', { name: 'Check record' }));
    expect(onVerifyDomain).toHaveBeenCalledWith('kaverifoods.in');
  });
});

describe('ForgotPasswordScreen', () => {
  it('asks for the work email only, and answers the same whether or not an account exists', async () => {
    const onSubmit = vi.fn();
    function Forgot() {
      const [email, setEmail] = useState('');
      const [sent, setSent] = useState(false);
      return <ForgotPasswordScreen email={email} onEmailChange={setEmail} onSubmit={() => (onSubmit(), setSent(true))} sent={sent} signInHref="/yx/sign-in" />;
    }
    render(<Forgot />);
    expect(screen.queryByLabelText(/company/i)).toBeNull();
    await userEvent.type(screen.getByLabelText(/Work email/), 'divya.r@kaverifoods.in');
    await userEvent.click(screen.getByRole('button', { name: 'Email me a reset link' }));
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent('If divya.r@kaverifoods.in has a YukthiX account, we sent it a reset link.');
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

  it('unlocks a locked person only with a reason, and only on rows that show a lock', async () => {
    const onUnlock = vi.fn().mockResolvedValue(undefined);
    render(<Activity onUnlock={onUnlock} />);
    // o-2 is the only row showing a lock for a known person.
    expect(screen.getAllByRole('button', { name: /^Unlock / })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Unlock ramesh.g@kaverifoods.in' }));
    const dialog = screen.getByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Unlock account' });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/Reason/), 'too short');
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/Reason/), ' - called him back on his desk phone');
    await userEvent.click(confirm);
    expect(onUnlock).toHaveBeenCalledWith(ORG_EVENTS.data[1], 'too short - called him back on his desk phone');
  });

  it('offers no Unlock without the permission (no handler)', () => {
    render(<Activity />);
    expect(screen.queryByRole('button', { name: /^Unlock / })).toBeNull();
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
    expect(screen.getByText(/YukthiX minimum: lock by the 10th wrong try\. Allowed: 3 to 10\./)).toBeInTheDocument();
    expect(screen.getByText(/YukthiX minimum: 15 minutes\. Allowed: 15 minutes to 24 hours\./)).toBeInTheDocument();
  });

  it('saves a stricter lockout', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<Settings onSave={onSave} />);
    await userEvent.clear(screen.getByLabelText('Lock after'));
    await userEvent.type(screen.getByLabelText('Lock after'), '3');
    await userEvent.clear(screen.getByLabelText('Lock for'));
    await userEvent.type(screen.getByLabelText('Lock for'), '60');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).toHaveBeenCalledWith({ maxFailedAttempts: 3, lockMinutes: 60 });
  });

  it('refuses a lockout laxer than YukthiX allows', async () => {
    const onSave = vi.fn();
    render(<Settings onSave={onSave} />);
    await userEvent.clear(screen.getByLabelText('Lock after'));
    await userEvent.type(screen.getByLabelText('Lock after'), '11');
    await userEvent.clear(screen.getByLabelText('Lock for'));
    await userEvent.type(screen.getByLabelText('Lock for'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Lock after must be between 3 and 10');
    expect(screen.getByRole('alert')).toHaveTextContent('Lock for must be between 15 and 1440');
  });

  it('turns "Continue with Google / Microsoft" on per provider and saves only that', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<Settings onSave={onSave} />);
    const googleSwitch = screen.getByRole('switch', { name: 'Allow sign-in with Google' });
    expect(googleSwitch).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'Allow sign-in with Microsoft' })).not.toBeChecked();
    await userEvent.click(googleSwitch);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).toHaveBeenCalledWith({ googleSignIn: true });
  });

  it('with sign-in only through the identity provider, the switches are off and say why', () => {
    render(<Settings policy={{ ...POLICY, ssoOnly: true, googleSignIn: true, breakGlassUserIds: [ADMINS[0].id, ADMINS[1].id] }} />);
    const googleSwitch = screen.getByRole('switch', { name: 'Allow sign-in with Google' });
    expect(googleSwitch).toBeDisabled();
    expect(googleSwitch).not.toBeChecked();
    expect(screen.getAllByText('Off while sign-in is only through your identity provider.')).toHaveLength(2);
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
    expect(policyErrors({ ...POLICY, maxFailedAttempts: 2, lockMinutes: 10 }, FLOOR, IDPS).map((e) => e.fieldId)).toEqual(['sec-lock-after', 'sec-lock-for']);
    expect(policyErrors({ ...POLICY, maxFailedAttempts: 11, lockMinutes: 1441 }, FLOOR, IDPS).map((e) => e.fieldId)).toEqual(['sec-lock-after', 'sec-lock-for']);
    expect(policyErrors(POLICY, FLOOR, IDPS)).toEqual([]);
  });

  it('names devices and errors in plain words', () => {
    expect(deviceLabel(MY_SESSIONS[0].userAgent)).toBe('Chrome on Windows');
    expect(deviceLabel(null)).toBe('Unknown device');
    expect(errorText(new Error('Too many attempts'))).toBe('Too many attempts');
  });
});


describe('ResetPasswordScreen', () => {
  function Harness({ onSubmit = vi.fn(), error = null as string | null }) {
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    return <ResetPasswordScreen password={password} confirm={confirm} onPasswordChange={setPassword} onConfirmChange={setConfirm} onSubmit={onSubmit} done={false} error={error} signInHref="/yx/sign-in" forgotHref="/yx/forgot-password" />;
  }

  it('sends only when both passwords match', async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/New password/), 'Kaveri-Recruit-Oct26');
    await userEvent.type(screen.getByLabelText(/Type it again/), 'Kaveri-Recruit-Oct2');
    expect(screen.getByText('The two passwords are not the same')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save new password' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Type it again/), '6');
    await userEvent.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('offers a new link when this one has expired', () => {
    render(<Harness error="This reset link is invalid or has expired" />);
    expect(screen.getByRole('link', { name: 'Get a new link' })).toHaveAttribute('href', '/yx/forgot-password');
  });
});

describe('LoginActivityScreen results and access', () => {
  it('names a sent code in words, never the raw "code_sent"', () => {
    const sent = { ...ORG_EVENTS.data[0], id: 'e-code', result: 'code_sent' as const, method: 'otp_email' };
    render(<Activity events={{ ...ORG_EVENTS, data: [sent], total: 1 }} />);
    expect(screen.getByText('Code sent')).toBeInTheDocument();
    expect(screen.queryByText('code_sent')).toBeNull();
  });

  it('says "no access" without the permission, with no tabs or retry', () => {
    render(<Activity noAccess events={null} eventsState="error" />);
    expect(screen.getByText("You don't have access to login activity")).toBeInTheDocument();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByRole('button', { name: /Retry/ })).toBeNull();
  });
});

describe('My security second steps', () => {
  it('says which entry is a passkey, not only the device name', () => {
    render(<Me />);
    const list = screen.getByRole('list', { name: 'Your second steps' });
    const passkey = MFA_ENROLLED.factors.find((f) => f.type === 'passkey')!;
    expect(within(list).getByText(`Passkey · ${passkey.label}`)).toBeInTheDocument();
  });
});
