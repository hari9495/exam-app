import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createTranslator } from 'use-intl';
import { EN, HI } from './messages';

// T2-G 84b (answer 2743): Hindi for the self-service screens, on next-intl's core (use-intl): the web sets the reader's
// language once (YxI18nProvider beside next-intl's NextIntlClientProvider); a kit screen reads its words with useYxT.
// English is the default (no provider: stories, tests, admin pages) and the fallback for any word not yet in Hindi.

export type YxLocale = 'en' | 'hi';
export type YxNamespace = keyof typeof EN;

type Tree = { [k: string]: string | Tree };
/** English with the Hindi words laid over it: every key exists, missing Hindi words stay English. */
export function overlay(base: Tree, over: Tree | undefined): Tree {
  if (!over) return base;
  return Object.fromEntries(Object.entries(base).map(([k, v]) => [k, typeof v === 'string' ? (typeof over[k] === 'string' ? over[k] : v) : overlay(v, over[k] as Tree | undefined)]));
}

export const KIT_MESSAGES: Record<YxLocale, Tree> = { en: EN as unknown as Tree, hi: overlay(EN as unknown as Tree, HI as Tree) };

const LocaleContext = createContext<YxLocale>('en');

export function YxI18nProvider({ locale, children }: { locale: YxLocale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export const useYxLocale = () => useContext(LocaleContext);

/** The screen's words in the reader's language: t('title'), t('helper', { company: 'English' }). */
export function useYxT<N extends YxNamespace>(namespace: N) {
  const locale = useYxLocale();
  return useMemo(() => {
    const t = createTranslator({ locale, messages: KIT_MESSAGES[locale], namespace: namespace as string, timeZone: 'Asia/Kolkata', onError: () => undefined, getMessageFallback: ({ key }) => key });
    return (key: keyof (typeof EN)[N] & string, values?: Record<string, string | number>) => (t as unknown as (k: string, v?: Record<string, string | number>) => string)(key, values);
  }, [locale, namespace]);
}

/** A date in Indian style in the reader's language: "3 Dec 2026" or "3 दिस॰ 2026". */
export function formatDateIn(locale: YxLocale, d: Date): string {
  return new Intl.DateTimeFormat(locale === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(d);
}

/** A number in Indian grouping (12,34,567) in the reader's language. */
export function formatNumberIn(locale: YxLocale, n: number): string {
  return new Intl.NumberFormat(locale === 'hi' ? 'hi-IN' : 'en-IN').format(n);
}
