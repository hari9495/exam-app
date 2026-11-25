import { useContext } from 'react';
import { act, render, screen } from '@testing-library/react';
import { AuthLanguageContext, ForgotPasswordScreen } from '@yukthix/ui/auth';
import { SIGN_IN_LANGUAGE_KEY, SignInLanguage } from './sign-in-language';

function Pick({ to }: { to: string }) {
  const lang = useContext(AuthLanguageContext)!;
  return (
    <button type="button" onClick={() => lang.onChange(to)}>
      pick {to}
    </button>
  );
}

const page = (extra?: React.ReactNode) => (
  <SignInLanguage>
    <ForgotPasswordScreen email="" onEmailChange={() => {}} onSubmit={() => {}} sent={false} signInHref="/yx/sign-in" />
    {extra}
  </SignInLanguage>
);

describe('sign-in language (this device only)', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => (document.documentElement.lang = ''));

  it('English by default, with the picker shown', () => {
    render(page());
    expect(screen.getByRole('heading', { level: 1, name: 'Reset your password' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Language' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
  });

  it('picking Hindi switches the page, sets the page language and is remembered on this device', () => {
    const { unmount } = render(page(<Pick to="hi" />));
    act(() => screen.getByRole('button', { name: 'pick hi' }).click());
    expect(screen.getByRole('heading', { level: 1, name: 'अपना पासवर्ड रीसेट करें' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('hi');
    expect(window.localStorage.getItem(SIGN_IN_LANGUAGE_KEY)).toBe('hi');
    unmount();
    render(page());
    expect(screen.getByRole('heading', { level: 1, name: 'अपना पासवर्ड रीसेट करें' })).toBeInTheDocument();
  });

  it('an unknown stored or picked value falls back to English', () => {
    window.localStorage.setItem(SIGN_IN_LANGUAGE_KEY, 'ta');
    render(page(<Pick to="xx" />));
    expect(screen.getByRole('heading', { level: 1, name: 'Reset your password' })).toBeInTheDocument();
    act(() => screen.getByRole('button', { name: 'pick xx' }).click());
    expect(window.localStorage.getItem(SIGN_IN_LANGUAGE_KEY)).toBe('en');
  });

  it('blocked storage: still English, and the picker still works for this visit', () => {
    const get = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(page(<Pick to="hi" />));
    act(() => screen.getByRole('button', { name: 'pick hi' }).click());
    expect(screen.getByRole('heading', { level: 1, name: 'अपना पासवर्ड रीसेट करें' })).toBeInTheDocument();
    get.mockRestore();
    set.mockRestore();
  });
});
