// T2-E 51 (answer 2874): Home cards for a window that is closing (tax declarations and proofs, the regime choice, a
// review due, a survey closing, a request sent back to me). At most 2 come from the API; each one is dismissable for
// the day ("Not today"), kept in this browser.
import { Button } from '../../components/button';
import { Card } from '../../components/shell';
import { Text } from '../../components/foundations';
import './platform.css';

export interface HomeReminder {
  kind: 'sent_back' | 'review' | 'tax_declarations' | 'tax_proofs' | 'tax_regime' | 'survey';
  id: string;
  title: string;
  body: string;
  href: string;
  closesOn: string | null;
}

const ACTION: Record<HomeReminder['kind'], string> = { sent_back: 'Open my requests', review: 'Open the review', tax_declarations: 'Declare now', tax_proofs: 'Upload proofs', tax_regime: 'Choose the regime', survey: 'Take the survey' };

export function HomeReminderCards({ cards, onDismiss }: { cards: HomeReminder[]; onDismiss?: (id: string) => void }) {
  if (!cards.length) return null;
  return (
    <>
      {cards.map((c) => (
        <Card key={c.id} title={c.title}>
          <Text as="p" size="sm" tone="secondary">
            {c.body}
          </Text>
          <div className="yx-plt-row">
            <Button size="sm" variant="primary" asChild>
              <a href={c.href}>{ACTION[c.kind]}</a>
            </Button>
            {onDismiss && (
              <Button size="sm" onClick={() => onDismiss(c.id)}>
                Not today
              </Button>
            )}
          </div>
        </Card>
      ))}
    </>
  );
}

/** "Not today": the ids dismissed today in this browser (a new day starts empty; blocked storage keeps them for this visit only). */
export const DISMISS_KEY = 'yx.home.reminders.dismissed';
export function dismissedToday(today: string): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(DISMISS_KEY) ?? 'null') as { on: string; ids: string[] } | null;
    return v && v.on === today ? v.ids : [];
  } catch {
    return [];
  }
}
export function dismissForToday(today: string, id: string): string[] {
  const ids = [...new Set([...dismissedToday(today), id])];
  try {
    window.localStorage.setItem(DISMISS_KEY, JSON.stringify({ on: today, ids }));
  } catch {
    /* storage blocked: the card stays hidden for this visit only */
  }
  return ids;
}
