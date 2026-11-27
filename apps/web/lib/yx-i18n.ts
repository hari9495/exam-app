import { createTranslator } from 'next-intl';
import { KIT_MESSAGES, overlay, type YxLocale } from '@yukthix/ui/i18n';
import { notificationText } from './notification-text';
import type { NotificationView } from './types';
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

const BELL: Record<string, string> = { mention: 'mention', assigned: 'assigned', 'approval.requested': 'approvalRequested', 'approval.approved': 'approvalApproved', 'approval.rejected': 'approvalRejected', 'approval.cancelled': 'approvalCancelled', 'approval.step_skipped': 'approvalSkipped', 'workflow.approval.needed': 'approvalNeeded', 'workflow.approval.reminder': 'approvalReminder' };

/** A bell line in the reader's language: the English line as built, or in Hindi where the kind is written in Hindi. */
export function bellText(locale: YxLocale): (n: NotificationView) => string {
  if (locale === 'en') return notificationText;
  type Say = ((k: string, v?: Record<string, string>) => string) & { has: (k: string) => boolean };
  const t = createTranslator({ locale, messages: WEB_MESSAGES[locale], namespace: 'bell' }) as unknown as Say;
  const kind = createTranslator({ locale, messages: WEB_MESSAGES[locale], namespace: 'bellKind' }) as unknown as Say;
  return (n) => {
    const on = n.contextText ? t('on', { what: n.contextText }) : '';
    const key = BELL[n.type];
    if (key) return t(key, { who: n.actorName ?? t('teammate'), on });
    const k = n.type.replace(/\./g, '_');
    if (kind.has(k) && (hi as { bellKind?: Record<string, string> }).bellKind?.[k]) return n.contextText ? t('kind', { kind: kind(k), what: n.contextText }) : kind(k);
    return notificationText(n);
  };
}
