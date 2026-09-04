'use client';

import { useNotificationPreferences, useUpdateNotificationPreference, type NotificationPreference } from '../lib/hooks/useNotificationPreferences';
import { CollapsibleSection } from './ui';

const GROUP_LABELS: Record<NotificationPreference['group'], string> = {
  mentions: 'Mentions',
  assignments: 'Assignments',
  approvals: 'Approvals',
};
const GROUP_ORDER: NotificationPreference['group'][] = ['mentions', 'assignments', 'approvals'];

function PreferenceRow({ pref }: { pref: NotificationPreference }) {
  const update = useUpdateNotificationPreference();

  return (
    <label className="flex items-center gap-2.5 py-1 text-sm text-ink" style={{ cursor: update.isPending ? 'not-allowed' : 'pointer' }}>
      <input
        type="checkbox"
        checked={pref.emailEnabled}
        disabled={update.isPending}
        onChange={() => update.mutate({ type: pref.type, emailEnabled: !pref.emailEnabled })}
        aria-label={pref.label}
        style={{ width: 15, height: 15, accentColor: 'var(--color-primary, #0053e2)' }}
      />
      {pref.label}
    </label>
  );
}

export function NotificationEmailPreferences() {
  const { data: preferences, isLoading } = useNotificationPreferences();

  return (
    <CollapsibleSection title="Notification emails">
      <div className="flex flex-col gap-4 sm:col-span-2">
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
