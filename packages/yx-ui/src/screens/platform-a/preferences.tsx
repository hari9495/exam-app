import { useState } from 'react';
import { PageHeader, Card } from '../../components/shell';
import { ErrorState, InlineAlert, Skeleton } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Segment } from '../../components/segment';
import { Switch } from '../../components/choice';
import { DesktopFrame } from '../_kit/frames';
import { homePanel } from './platform-kit';

/**
 * PLT-65 · Notification preferences (designed 15 Oct 2026; the Me panel always listed it, no screen existed). What
 * YukthiX emails you about: how often (as it happens, a daily summary, or never) and, per kind of notification, email on
 * or off. Everything still shows in Notifications and the bell. Each change saves at once (switches, §16).
 */
export type DigestMode = 'immediate' | 'daily' | 'off';

export interface NotificationPreference {
  type: string;
  group: 'approvals' | 'assignments' | 'mentions' | 'reminders';
  label: string;
  emailEnabled: boolean;
}

export interface NotificationPreferencesProps {
  state?: 'ready' | 'loading' | 'error';
  onRetry?: () => void;
  types: NotificationPreference[];
  digest: DigestMode;
  onToggle: (type: string, emailEnabled: boolean) => Promise<void> | void;
  onDigest: (mode: DigestMode) => Promise<void> | void;
  /** "Done" messages (toasts in the live app). */
  onDone?: (text: string) => void;
}

const GROUPS: { id: NotificationPreference['group']; title: string; description: string }[] = [
  { id: 'approvals', title: 'Approvals', description: 'Requests waiting for you, and decisions on what you sent.' },
  { id: 'assignments', title: 'Given to you', description: 'Tasks, tickets, letters and other things given to you or your team.' },
  { id: 'mentions', title: 'Mentions and feedback', description: 'When someone mentions you or gives you feedback.' },
  { id: 'reminders', title: 'Reminders', description: 'Due dates, things still waiting, and changes you follow.' },
];

const DIGEST_OPTIONS: { value: DigestMode; label: string }[] = [
  { value: 'immediate', label: 'As it happens' },
  { value: 'daily', label: 'Daily summary' },
  { value: 'off', label: 'Never' },
];

export function NotificationPreferencesBody({ state = 'ready', onRetry, types, digest, onToggle, onDigest, onDone }: NotificationPreferencesProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const save = async (key: string, task: () => Promise<void> | void, done: string) => {
    setBusy(key);
    setFailed(null);
    try {
      await task();
      onDone?.(done);
    } catch (e) {
      setFailed(e instanceof Error && e.message ? e.message : 'Not saved. Try again.');
    } finally {
      setBusy(null);
    }
  };
  if (state === 'loading')
    return (
      <div className="yx-plt-stack" role="status" aria-label="Loading your preferences">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={96} />
        ))}
      </div>
    );
  if (state === 'error') return <ErrorState title="Your preferences didn't load" description="Check your connection and try again." onRetry={onRetry ?? (() => {})} />;
  const off = digest === 'off';
  return (
    <div className="yx-plt-stack">
      {failed && (
        <InlineAlert tone="danger" title="Not saved">
          {failed}
        </InlineAlert>
      )}
      <Card title="Email">
        <FormField label="Email me" helper={off ? 'No email at all. Notifications and the bell still show everything.' : 'Turn off any kind below that you don’t need by email.'}>
          <Segment label="Email me" options={DIGEST_OPTIONS} value={digest} onChange={(m) => m !== digest && void save('digest', () => onDigest(m), m === 'off' ? 'Email is off. Notifications still show everything.' : m === 'daily' ? 'Saved. You get one email a day.' : 'Saved. Emails come as things happen.')} />
        </FormField>
      </Card>
      {GROUPS.map((g) => {
        const rows = types.filter((t) => t.group === g.id);
        if (!rows.length) return null;
        return (
          <Card key={g.id} title={g.title}>
            <p className="yx-plt-muted">{g.description}</p>
            <ul className="yx-plt-list">
              {rows.map((t) => (
                <li key={t.type}>
                  <Switch
                    label={t.label}
                    description={t.emailEnabled && !off ? 'Email and in YukthiX' : 'In YukthiX only'}
                    checked={t.emailEnabled && !off}
                    disabled={off || busy === t.type}
                    onChange={(on) => void save(t.type, () => onToggle(t.type, on), on ? 'Saved. You get an email for this again.' : 'Saved. No email for this; it still shows in Notifications.')}
                  />
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

// PLT-65 · Notification preferences (desktop). Personal page: no company button.
export function NotificationPreferencesScreen(props: NotificationPreferencesProps) {
  return (
    <DesktopFrame area="home" panelTitle="Home" panel={homePanel('Notification preferences')} scope="none">
      <PageHeader title="Notification preferences" description="Choose what YukthiX emails you about. Everything still shows in Notifications and the bell." />
      <NotificationPreferencesBody {...props} />
    </DesktopFrame>
  );
}
