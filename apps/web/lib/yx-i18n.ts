import { createTranslator } from 'next-intl';
import { KIT_MESSAGES, overlay, type YxLocale } from '@yukthix/ui/i18n';
import en from '../messages/en.json';
import hi from '../messages/hi.json';

// T2-G 84b (answer 2743): Hindi for the self-service screens with next-intl. The reader's language comes from GET
// /org/display (their own choice, else their entity's or company's, and only while the company offers Hindi). English is
// the default and the fallback for every word not yet in Hindi (messages/hi.json may leave any out, never add one).

type Tree = { [k: string]: string | Tree };
export const WEB_MESSAGES: Record<YxLocale, Tree> = { en: en as Tree, hi: overlay(en as Tree, hi as Tree) };

/** Everything NextIntlClientProvider gets: the web's words and, under "kit", the kit's. */
export const messagesFor = (locale: YxLocale): Tree => ({ ...WEB_MESSAGES[locale], kit: KIT_MESSAGES[locale] });

/** A menu link's label in the reader's language: the self-service links are written in Hindi; the rest stay as built. */
export function navLabel(locale: YxLocale): (id: string, label: string) => string {
  if (locale === 'en') return (_id, label) => label;
  const t = createTranslator({ locale, messages: WEB_MESSAGES[locale], namespace: 'nav' });
  const english = (en as { nav: Record<string, string> }).nav;
  // Only a link whose English label is the one translated (an id reused with other words keeps them).
  return (id, label) => (english[id] === label && t.has(id as never) ? t(id as never) : label);
}
