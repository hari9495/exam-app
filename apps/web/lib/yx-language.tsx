'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { AuthLanguageContext } from '@yukthix/ui/auth';
import { apiFetch } from './api-client';

// The language picker on the sign-in and legal pages (SEC-01). The pick is a per-browser convenience until the person
// signs in; then it becomes their Me › Language (G1 people.language), which is what YukthiX translates: the company's
// own words (leave names, job titles, journey steps). The sign-in text itself has no translations yet.
const KEY = 'yx-language';
const PICKED = 'yx-language-picked';

export function YxLanguageProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState('en');
  useEffect(() => {
    try {
      setValue(window.localStorage.getItem(KEY) ?? 'en');
    } catch {
      /* storage blocked: English */
    }
  }, []);
  const onChange = (lang: string) => {
    setValue(lang);
    try {
      window.localStorage.setItem(KEY, lang);
      window.localStorage.setItem(PICKED, '1');
    } catch {
      /* storage blocked: this visit only */
    }
  };
  return <AuthLanguageContext.Provider value={{ value, onChange }}>{children}</AuthLanguageContext.Provider>;
}

/** After sign-in: a language picked on the sign-in pages is saved as the person's language, once. */
export async function savePickedLanguage(accessToken: string): Promise<void> {
  let lang: string | null;
  try {
    if (!window.localStorage.getItem(PICKED)) return;
    lang = window.localStorage.getItem(KEY);
    window.localStorage.removeItem(PICKED);
  } catch {
    return;
  }
  if (!lang) return;
  // No employee record (an admin-only login): there is no language to keep, and that's fine.
  await apiFetch('/global/me/language', { method: 'PUT', body: JSON.stringify({ language: lang }) }, accessToken).catch(() => undefined);
}
