'use client';

import { useNotificationPreferences, useUpdateNotificationPreference, useDigestMode, useUpdateDigestMode, type NotificationPreference, type DigestMode } from '../lib/hooks/useNotificationPreferences';
import { CollapsibleSection, Checkbox } from './ui';

const GROUP_LABELS: Record<NotificationPreference['group'], string> = {
  mentions: 'Mentions',
  assignments: 'Assignments',
  approvals: 'Approvals',
};
const GROUP_ORDER: NotificationPreference['group'][] = ['mentions', 'assignments', 'approvals'];

function PreferenceRow({ pref }: { pref: NotificationPreference }) {
  const update = useUpdateNotificationPreference();

  return (
    <div className="py-1">
      <Checkbox
        label={pref.label}
        checked={pref.emailEnabled}
        disabled={update.isPending}
        onChange={() => update.mutate({ type: pref.type, emailEnabled: !pref.emailEnabled })}
      />
    </div>
  );
}

const DIGEST_OPTIONS: { value: DigestMode; label: string; hint: string }[] = [
  { value: 'immediate', label: 'Immediate', hint: 'One email per notification, as it happens.' },
  { value: 'daily', label: 'Daily digest', hint: 'One email a day summarizing everything new.' },
  { value: 'off', label: 'Off', hint: 'Never email me (the in-app bell still works).' },
];

function DigestModeControl() {
  const { data } = useDigestMode();
  const update = useUpdateDigestMode();
  const mode = data?.mode ?? 'immediate';
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Email delivery</h3>
      <div className="flex flex-col gap-1">
        {DIGEST_OPTIONS.map((opt) => (
          <label key={opt.value} className="flex items-start gap-2 py-0.5 text-sm">
            <input
              type="radio"
              name="digest-mode"
              value={opt.value}
              checked={mode === opt.value}
              disabled={update.isPending}
              onChange={() => update.mutate(opt.value)}
              className="mt-1"
            />
            <span>
              <span className="font-medium">{opt.label}</span>
              <span className="block text-xs text-muted">{opt.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

export function NotificationEmailPreferences() {
  const { data: preferences, isLoading } = useNotificationPreferences();

  return (
    <CollapsibleSection title="Notification emails">
      <div className="flex flex-col gap-4 sm:col-span-2">
        <DigestModeControl />
        {isLoading && <p className="text-sm text-muted">Loading…</p>}
        {!isLoading && (!preferences || preferences.length === 0) && (
          <p className="text-sm text-muted">No notification email settings available.</p>
        )}
        {!isLoading &&
          preferences &&
          preferences.length > 0 &&
          GROUP_ORDER.map((group) => {
            const rows = preferences.filter((p) => p.group === group);
            if (rows.length === 0) return null;
            return (
              <div key={group}>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                  {GROUP_LABELS[group]}
                </h3>
                <div className="flex flex-col">
                  {rows.map((pref) => (
                    <PreferenceRow key={pref.type} pref={pref} />
                  ))}
                </div>
              </div>
            );
          })}
      </div>
    </CollapsibleSection>
  );
}
