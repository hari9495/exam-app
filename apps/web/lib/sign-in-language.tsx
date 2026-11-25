'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { AuthLanguageContext } from '@yukthix/ui/auth';

/** Where the sign-in language is kept: this device (browser) only, never the account or a cookie the server reads. */
export const SIGN_IN_LANGUAGE_KEY = 'yx.signInLanguage';

const known = (v: string | null | undefined): 'en' | 'hi' => (v === 'hi' ? 'hi' : 'en');

/**
 * The sign-in pages' language picker (SEC-01, founder answer 3 Nov 2026): English by default, Hindi when picked; the
 * choice is remembered on this device. Read after the first render, so the server's English page and the browser's
 * first render match.
 */
export function SignInLanguage({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<'en' | 'hi'>('en');
  useEffect(() => {
    try {
      setLang(known(window.localStorage.getItem(SIGN_IN_LANGUAGE_KEY)));
    } catch {
      // Storage blocked (private window): English, and the picker still works for this visit.
    }
  }, []);
  // Screen readers read the page in the language it is written in.
  useEffect(() => {
    const html = document.documentElement;
    const before = html.lang;
    html.lang = lang;
    return () => {
      html.lang = before;
    };
  }, [lang]);
  const onChange = (value: string) => {
    const next = known(value);
    setLang(next);
    try {
      window.localStorage.setItem(SIGN_IN_LANGUAGE_KEY, next);
    } catch {
      // Not kept; this visit still uses it.
    }
  };
  return <AuthLanguageContext.Provider value={{ value: lang, onChange }}>{children}</AuthLanguageContext.Provider>;
}
