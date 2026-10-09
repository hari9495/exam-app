import { useState } from 'react';
import { BellRing, CalendarClock, ListChecks, Moon, Timer } from 'lucide-react';
import { Button } from '../../components/button';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { TextField } from '../../components/inputs';
import { Card } from '../../components/shell';
import { formatDate } from '../../lib/format';
import { useRun } from '../org/org-kit';
import { DeskPage, when } from './desk-kit';
import { TaskListCard } from './work';
import type { CalendarItem, LoadState, TaskView } from './types';

// My calendar (US-G-009, SD-1.11): reminders, snoozes waking up, tasks due and resolve-by times of my tickets, and a
// private iCal link for Outlook or Google Calendar. The link is a secret: shown once, replaced or switched off at once.

export interface MyCalendarScreenProps {
  state: LoadState;
  onRetry?: () => void;
  items: CalendarItem[];
  tasks: TaskView[];
  feed: { createdAt: string } | null;
  onOpenTicket: (id: string) => void;
  onNewFeed: () => Promise<string>;
  onRevokeFeed: () => Promise<void>;
}

const ICON = { reminder: BellRing, snooze: Moon, task: ListChecks, sla: Timer } as const;

export function MyCalendarScreen(p: MyCalendarScreenProps) {
  const { busy, error, run } = useRun();
  const [link, setLink] = useState<string | null>(null);
  const days = new Map<string, CalendarItem[]>();
  for (const it of p.items) {
    const key = formatDate(new Date(it.at));
    days.set(key, [...(days.get(key) ?? []), it]);
  }
  return (
    <DeskPage title="My calendar" description="Your reminders, tasks and resolve-by times for the next weeks." state={p.state} onRetry={p.onRetry} what="your calendar">
      <div className="yx-ops-ws">
        <div className="yx-ops-ws__main">
          <Card title="Coming up">
            {p.items.length === 0 ? (
              <EmptyState compact title="Nothing coming up." description="Set a reminder or snooze a ticket from its page." />
            ) : (
              [...days].map(([d, list]) => (
                <div key={d}>
                  <p className="yx-desk-cal-day">{d}</p>
                  <ul className="yx-ops-list">
                    {list.map((it) => {
                      const Icon = ICON[it.kind];
                      return (
                        <li key={it.id} className="yx-ops-list__item">
                          <span className="yx-ops-row">
                            <Icon aria-hidden size={14} />
                            <span>{when(it.at).split(', ')[1]}</span>
                            {it.ticketId ? (
                              <button type="button" className="yx-desk-link" onClick={() => p.onOpenTicket(it.ticketId!)}>
                                {it.title}
                              </button>
                            ) : (
                              <span>{it.title}</span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </Card>
          <TaskListCard tasks={p.tasks} onOpenTicket={p.onOpenTicket} />
        </div>
        <div className="yx-ops-ws__rail">
          <Card title="Add to my calendar app">
            <div className="yx-ops-stack" data-gap="sm">
              <p className="yx-ops-muted">A private link your calendar app reads every 15 minutes. Private and sensitive tickets show only their number.</p>
              {error && <InlineAlert tone="danger">{error}</InlineAlert>}
              {p.feed && !link && <p>A link is on since {when(p.feed.createdAt)}.</p>}
              {link && (
                <FormField label="Your private link" helper="Copy it now: it is shown only once. Anyone with it sees these items.">
                  <TextField value={link} readOnly onFocus={(e) => e.currentTarget.select()} />
                </FormField>
              )}
              <span className="yx-ops-row">
                <Button icon={CalendarClock} loading={busy === 'new'} onClick={() => void run('new', async () => setLink(await p.onNewFeed()))}>
                  {p.feed ? 'Make a new link (the old one stops)' : 'Make my link'}
                </Button>
                {p.feed && (
                  <Button loading={busy === 'off'} onClick={() => void run('off', async () => { await p.onRevokeFeed(); setLink(null); })}>
                    Switch the link off
                  </Button>
                )}
              </span>
            </div>
          </Card>
        </div>
      </div>
    </DeskPage>
  );
}
