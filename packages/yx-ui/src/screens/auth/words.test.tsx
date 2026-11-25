import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ForgotPasswordScreen, SignInScreen, type SignInFields } from './sign-in';
import { MfaChallengeScreen } from './mfa';
import { AUTH_LANGUAGES, AuthLanguageContext, authError, authWords } from './words';

const FIELDS: SignInFields = { identifier: '', mobile: '', password: '', code: '' };
const noop = () => {};
const signInProps = { fields: FIELDS, onFieldChange: noop, providers: [], onIdentify: noop, onPasswordSubmit: noop, onSendCode: noop, onVerifyCode: noop, onRestart: noop, onSso: noop, onPickCompany: noop, forgotPasswordHref: '#' };

/** The live pages' provider, in miniature: starts in English, the picker changes it. */
function Picked({ start = 'en', children, onChange }: { start?: string; children: React.ReactNode; onChange?: (l: string) => void }) {
  const [value, setValue] = useState(start);
  return <AuthLanguageContext.Provider value={{ value, onChange: (l) => (setValue(l), onChange?.(l)) }}>{children}</AuthLanguageContext.Provider>;
}

const devanagari = /[ऀ-ॿ]/;
const flat = (o: unknown): string[] => (typeof o === 'string' ? (o ? [o] : []) : typeof o === 'function' ? [String((o as (...a: string[]) => unknown)('X', 'Y'))] : o && typeof o === 'object' ? Object.values(o).flatMap(flat) : []);

describe('sign-in words (English and Hindi)', () => {
  it('every Hindi sentence is written in Devanagari (no English left behind)', () => {
    const hi = flat({ ...authWords('hi'), lang: undefined });
    expect(hi.length).toBe(flat({ ...authWords('en'), lang: undefined }).length);
    for (const s of hi) expect(s, s).toMatch(devanagari);
  });

  it('anti-enumeration answers stay conditional in Hindi ("अगर … तो"), never "we sent" outright', () => {
    const hi = authWords('hi');
    for (const s of [hi.codeSentEmail('a@b.in'), hi.codeSentMobile('98450 12345', 'SMS'), hi.linkSent('a@b.in')]) expect(s).toMatch(/^अगर .+, तो /);
    // A wrong password and an unknown email read the same in English, so they read the same in Hindi.
    expect(authError('hi', 'Invalid email or password.')).toBe(authError('hi', 'Invalid credentials'));
  });

  it('errors: known ones in Hindi, the wait in Hindi units, unknown ones left in English, English untouched', () => {
    expect(authError('hi', "That code didn't work. Check it and try again.")).toBe('यह कोड काम नहीं किया। इसे जाँचकर फिर से कोशिश करें।');
    expect(authError('hi', 'Too many tries. Try again in 14 min 32 sec.')).toBe('बहुत ज़्यादा कोशिशें हो गईं। 14 मिनट 32 सेकंड बाद फिर से कोशिश करें।');
    expect(authError('hi', 'Too many tries. Try again in 1 hour.')).toBe('बहुत ज़्यादा कोशिशें हो गईं। 1 घंटे बाद फिर से कोशिश करें।');
    expect(authError('hi', 'Your access is paused for block leave until 7 Nov 2026. Ask HR if you need access sooner.')).toContain('7 Nov 2026 तक');
    expect(authError('hi', 'Something new from the API.')).toBe('Something new from the API.');
    expect(authError('en', 'Invalid email or password.')).toBe('Invalid email or password.');
  });

  it('offers only English and Hindi, English first', () => {
    expect(AUTH_LANGUAGES.map((l) => l.value)).toEqual(['en', 'hi']);
  });
});

describe('sign-in language picker', () => {
  it('English by default; picking Hindi turns the page into Hindi and tells the page to keep it', async () => {
    const onChange = vi.fn();
    render(
      <Picked onChange={onChange}>
        <SignInScreen {...signInProps} step="identify" />
      </Picked>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('combobox', { name: 'Language' }));
    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['English', 'हिन्दी (Hindi)']);
    await userEvent.click(screen.getByRole('option', { name: 'हिन्दी (Hindi)' }));
    expect(onChange).toHaveBeenCalledWith('hi');
    expect(screen.getByRole('heading', { level: 1, name: 'साइन इन करें' })).toBeInTheDocument();
    expect(screen.getByLabelText(/कार्य ईमेल/)).toBeInTheDocument();
    expect(screen.getByText('केवल कंपनी के कर्मचारियों के लिए')).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'कानूनी सूचनाएँ' })).getByRole('link', { name: 'गोपनीयता सूचना' })).toHaveAttribute('href', '/yx/legal/privacy');
    // The kit's own words follow the page too: the field tag, the picker's name and "Powered by".
    expect(screen.getByText('आवश्यक')).toBeInTheDocument();
    expect(screen.queryByText('Required')).toBeNull();
    expect(screen.getByRole('combobox', { name: 'भाषा (Language)' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'YukthiX द्वारा संचालित' })).toBeInTheDocument();
    expect(document.querySelector('.yx-signin')).toHaveAttribute('lang', 'hi');
  });

  it('Hindi: pressed too early, the field says what is missing in Hindi; the code-sent line stays conditional', async () => {
    const { unmount } = render(
      <Picked start="hi">
        <SignInScreen {...signInProps} step="identify" />
      </Picked>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'आगे बढ़ें' }));
    expect(screen.getByText('अपना कार्य ईमेल लिखें।')).toBeInTheDocument();
    unmount();
    render(
      <Picked start="hi">
        <SignInScreen {...signInProps} step="code" fields={{ ...FIELDS, identifier: 'divya@kaveri.in' }} error="Invalid email or password." />
      </Picked>,
    );
    expect(screen.getByText(/^अगर divya@kaveri.in कोड से साइन इन कर सकता है, तो/)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('ईमेल या पासवर्ड गलत है।');
  });

  it("Hindi: \"Confirm it's you\" and forgot password", () => {
    render(
      <Picked start="hi">
        <MfaChallengeScreen factors={['passkey', 'totp']} getPasskey={vi.fn()} submit={vi.fn()} onStartAgain={noop} />
      </Picked>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'पुष्टि करें कि यह आप ही हैं' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'पुष्टि करने के तरीके' })).toBeInTheDocument();
    expect(screen.getByText('पासकी')).toBeInTheDocument();
  });

  it('forgot password: the "link sent" answer is the same words whether or not the account exists', () => {
    render(
      <Picked start="hi">
        <ForgotPasswordScreen email="nobody@kaveri.in" onEmailChange={noop} onSubmit={noop} sent signInHref="#" />
      </Picked>,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/^अगर nobody@kaveri.in का YukthiX खाता है, तो/);
  });

  it('without a provider (in the app: step-up, My security) the words are English and there is no picker', () => {
    render(<SignInScreen {...signInProps} step="identify" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByText('Required')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Language' })).toBeNull();
  });
});
