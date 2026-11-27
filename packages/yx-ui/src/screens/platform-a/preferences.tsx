import { useState } from 'react';
import { PageHeader, Card } from '../../components/shell';
import { ErrorState, InlineAlert, Skeleton } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Segment } from '../../components/segment';
import { Switch } from '../../components/choice';
import { Select } from '../../components/select';
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
  /** T2-E 52 (2877): push for this kind (on by default for approvals, off for the rest). */
  pushEnabled?: boolean;
}

/**
 * T2-E 52 (answers 2875 to 2878): push through the installable web app. `available` is false when the company switched
 * push off or the server has no push keys. `device` is this browser: on, off, blocked (the browser refuses),
 * unsupported, or 'ios-install' (an iPhone needs YukthiX added to the Home Screen first).
 */
export interface PushPreferences {
  available: boolean;
  device: 'on' | 'off' | 'blocked' | 'unsupported' | 'ios-install';
  paused: boolean;
  quietFrom: string;
  quietTo: string;
  onDevice: (on: boolean) => Promise<void> | void;
  onPause: (paused: boolean) => Promise<void> | void;
  onQuiet: (from: string, to: string) => Promise<void> | void;
  onTogglePush: (type: string, on: boolean) => Promise<void> | void;
}
const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);

export interface NotificationPreferencesProps {
  state?: 'ready' | 'loading' | 'error';
  onRetry?: () => void;
  types: NotificationPreference[];
  digest: DigestMode;
  onToggle: (type: string, emailEnabled: boolean) => Promise<void> | void;
  onDigest: (mode: DigestMode) => Promise<void> | void;
  /** "Done" messages (toasts in the live app). */
  onDone?: (text: string) => void;
  /** T2-E 52: push (absent: no push column). */
  push?: PushPreferences;
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

export function NotificationPreferencesBody({ state = 'ready', onRetry, types, digest, onToggle, onDigest, onDone, push }: NotificationPreferencesProps) {
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
      {push && (
        <Card title="Push on this device">
          {!push.available ? (
            <p className="yx-plt-muted">Push is switched off for your company. Email and the bell still work.</p>
          ) : push.device === 'ios-install' ? (
            <InlineAlert tone="info" title="Add YukthiX to your Home Screen to get push">
              On an iPhone, open YukthiX in Safari, tap Share, then Add to Home Screen, and open it from there. Until then you get email.
            </InlineAlert>
          ) : push.device === 'unsupported' ? (
            <p className="yx-plt-muted">This browser cannot show push notifications. You still get email.</p>
          ) : push.device === 'blocked' ? (
            <InlineAlert tone="warning" title="Notifications are blocked">
              Allow notifications for YukthiX in this browser's site settings, then come back here.
            </InlineAlert>
          ) : (
            <div className="yx-plt-stack">
              <Switch label="Push on this device" description="A short note only, never figures or names. Tap it to open the page after you sign in." checked={push.device === 'on'} disabled={busy === 'device'} onChange={(on) => void save('device', () => push.onDevice(on), on ? 'Push is on for this device.' : 'Push is off for this device.')} />
              <Switch label="Pause push" description="Nothing is pushed until you turn this off. Email and the bell carry on." checked={push.paused} disabled={busy === 'pause'} onChange={(on) => void save('pause', () => push.onPause(on), on ? 'Push is paused.' : 'Push is on again.')} />
              <div className="yx-plt-row">
                <FormField label="Quiet from" helper="India time. No push in these hours; it waits in the bell.">
                  <Select value={push.quietFrom} onChange={(v) => v && void save('quiet', () => push.onQuiet(v, push.quietTo), 'Quiet hours saved.')} options={HOURS.map((h) => ({ value: h, label: h }))} />
                </FormField>
                <FormField label="Until">
                  <Select value={push.quietTo} onChange={(v) => v && void save('quiet', () => push.onQuiet(push.quietFrom, v), 'Quiet hours saved.')} options={HOURS.map((h) => ({ value: h, label: h }))} />
                </FormField>
              </div>
            </div>
          )}
        </Card>
      )}
      {GROUPS.map((g) => {
        const rows = types.filter((t) => t.group === g.id);
        if (!rows.length) return null;
        return (
          <Card key={g.id} title={g.title}>
            <p className="yx-plt-muted">{g.description}</p>
            <ul className="yx-plt-list">
              {rows.map((t) => (
                <li key={t.type} className={push?.available ? 'yx-plt-row' : undefined}>
                  <Switch
                    label={t.label}
                    description={t.emailEnabled && !off ? 'Email and in YukthiX' : 'In YukthiX only'}
                    checked={t.emailEnabled && !off}
                    disabled={off || busy === t.type}
                    onChange={(on) => void save(t.type, () => onToggle(t.type, on), on ? 'Saved. You get an email for this again.' : 'Saved. No email for this; it still shows in Notifications.')}
                  />
                  {push?.available && (
                    <Switch
                      label={
                        <>
                          Push<span className="yx-visually-hidden">: {t.label}</span>
                        </>
                      }
                      checked={Boolean(t.pushEnabled)}
                      disabled={busy === `push:${t.type}`}
                      onChange={(on) => void save(`push:${t.type}`, () => push.onTogglePush(t.type, on), on ? 'Saved. This comes as a push too.' : 'Saved. No push for this.')}
                    />
                  )}
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
