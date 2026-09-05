'use client';

// v2 Settings -> Business hours. Edit the org's weekly open hours (used by evaluateSlot,
// packages/shared/src/scheduling/business-hours.ts, to flag interview slots booked outside
// hours or on a holiday) + the holiday list. Layout/card styling mirrors settings/pipelines
// (org-primary tokens, inline success/error notice); the (org-admin) layout already gates
// entry to org_admin / acting super_admin, so no extra role check is needed here (same as
// settings/sso).
import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { BusinessHours, Holiday, Weekday } from '../../../../../lib/types';
import { WEEKDAYS } from '../../../../../lib/types';
import { useBusinessHours, useUpdateBusinessHours } from '../../../../../lib/hooks/useBusinessHours';
// Imported directly from Button.tsx, not the ui-v2 barrel: the barrel re-exports DataTable,
// which pulls in @tanstack/react-table's ESM build and breaks under this repo's jest transform
// (see the "Cannot use import statement outside a module" failure that surfaces otherwise).
import { Button } from '../../../../../components/ui-v2/Button';

const muted = 'var(--muted)';
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--ink) 12%, var(--hair))', borderRadius: 14, padding: '18px 20px' };
const desc: React.CSSProperties = { fontSize: 13, color: muted, margin: '4px 0 0' };
const input: React.CSSProperties = { boxSizing: 'border-box', padding: '7px 10px', fontSize: 13, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--ink) 15%, var(--hair))', background: 'var(--paper)', color: 'var(--ink)', outline: 'none' };
const row: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--hair)' };
const iconBtn: React.CSSProperties = { display: 'inline-grid', placeItems: 'center', width: 30, height: 30, borderRadius: 7, border: '1px solid var(--hair)', background: 'var(--paper)', color: 'var(--danger)', cursor: 'pointer' };

const WEEKDAY_LABELS: Record<Weekday, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};

function defaultBusinessHours(): BusinessHours {
  return {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    days: WEEKDAYS.reduce((acc, day) => {
      const enabled = day !== 'sat' && day !== 'sun';
      acc[day] = { enabled, open: '09:00', close: '17:00' };
      return acc;
    }, {} as Record<Weekday, BusinessHours['days']['mon']>),
  };
}

const TIME_ZONES: string[] =
  typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [Intl.DateTimeFormat().resolvedOptions().timeZone];

type Notice = { type: 'success' | 'error'; text: string } | null;

export default function V2BusinessHoursSettingsPage() {
  const { data, isLoading, isError } = useBusinessHours();
  const update = useUpdateBusinessHours();
  const [hours, setHours] = useState<BusinessHours>(defaultBusinessHours);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [notice, setNotice] = useState<Notice>(null);
  const notify = (type: 'success' | 'error', text: string) => { setNotice({ type, text }); setTimeout(() => setNotice(null), 4000); };

  useEffect(() => {
    if (!data) return;
    setHours(data.businessHours ?? defaultBusinessHours());
    setHolidays(data.holidays);
  }, [data]);

  function updateDay(day: Weekday, patch: Partial<BusinessHours['days']['mon']>) {
    setHours((prev) => ({ ...prev, days: { ...prev.days, [day]: { ...prev.days[day], ...patch } } }));
  }

  function addHoliday() {
    setHolidays((prev) => [...prev, { date: '', name: '' }]);
  }

  function updateHoliday(index: number, patch: Partial<Holiday>) {
    setHolidays((prev) => prev.map((h, i) => (i === index ? { ...h, ...patch } : h)));
  }

  function removeHoliday(index: number) {
    setHolidays((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSave() {
    update.mutate(
      { businessHours: hours, holidays },
      {
        onSuccess: () => notify('success', 'Business hours saved.'),
        onError: (err) => notify('error', err instanceof Error ? err.message : 'Failed to save business hours.'),
      },
    );
  }

  return (
    <div style={{ maxWidth: 780 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Business hours</h1>
        <p style={{ ...desc, marginTop: 6 }}>Set weekly open hours and holidays used to flag interviews booked outside hours.</p>
      </div>

      {notice && (
        <div role="status" style={{ marginBottom: 12, fontSize: 13, padding: '9px 13px', borderRadius: 9, border: `1px solid ${notice.type === 'success' ? 'color-mix(in srgb, #15803d 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)'}`, background: notice.type === 'success' ? 'color-mix(in srgb, #15803d 8%, transparent)' : 'color-mix(in srgb, var(--danger) 8%, transparent)', color: notice.type === 'success' ? '#15803d' : 'var(--danger)' }}>
          {notice.text}
        </div>
      )}

      {isLoading && <p style={{ fontSize: 13, color: muted }}>Loading…</p>}
      {isError && <p style={{ fontSize: 13, color: 'var(--danger)' }}>Failed to load business hours.</p>}

      <div style={{ ...card, marginBottom: 16 }}>
        <label className="v2-label" htmlFor="business-hours-timezone">Time zone</label>
        <select
          id="business-hours-timezone"
          aria-label="Time zone"
          value={hours.timeZone}
          onChange={(e) => setHours((prev) => ({ ...prev, timeZone: e.target.value }))}
          style={{ ...input, marginTop: 6, display: 'block', width: '100%', maxWidth: 360 }}
        >
          {(TIME_ZONES.includes(hours.timeZone) ? TIME_ZONES : [hours.timeZone, ...TIME_ZONES]).map((tz) => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>

        <div style={{ marginTop: 16 }}>
          {WEEKDAYS.map((day) => {
            const label = WEEKDAY_LABELS[day];
            const d = hours.days[day];
            return (
              <div key={day} style={row}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 130, fontSize: 13, color: 'var(--ink)' }}>
                  <input
                    type="checkbox" aria-label={`${label} enabled`} checked={d.enabled}
                    onChange={(e) => updateDay(day, { enabled: e.target.checked })}
                    style={{ width: 15, height: 15, accentColor: 'var(--org-primary)' }}
                  />
                  {label}
                </label>
                <input
                  type="time" aria-label={`${label} open time`} value={d.open} disabled={!d.enabled}
                  onChange={(e) => updateDay(day, { open: e.target.value })} style={input}
                />
                <span style={{ fontSize: 13, color: muted }}>to</span>
                <input
                  type="time" aria-label={`${label} close time`} value={d.close} disabled={!d.enabled}
                  onChange={(e) => updateDay(day, { close: e.target.value })} style={input}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ ...card, marginBottom: 16 }}>
        <h2 style={{ fontFamily: 'var(--font-disp)', fontSize: 15, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>Holidays</h2>
        <p style={desc}>Dates the office is closed, regardless of weekday hours.</p>

        <div style={{ marginTop: 10 }}>
          {holidays.map((h, i) => (
            <div key={i} style={row}>
              <input
                type="date" aria-label={`Holiday ${i + 1} date`} value={h.date}
                onChange={(e) => updateHoliday(i, { date: e.target.value })} style={input}
              />
              <input
                type="text" aria-label={`Holiday ${i + 1} name`} value={h.name} placeholder="Holiday name"
                onChange={(e) => updateHoliday(i, { name: e.target.value })} style={{ ...input, flex: '1 1 200px' }}
              />
              <button type="button" style={iconBtn} onClick={() => removeHoliday(i)} aria-label={`Remove holiday ${i + 1}`}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <button
            type="button" className="v2-hoverbtn" onClick={addHoliday}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 12.5, fontWeight: 500, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--org-primary)', background: 'var(--paper)', color: 'var(--org-primary)', cursor: 'pointer' }}
          >
            <Plus size={13} /> Add holiday
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button onClick={handleSave} loading={update.isPending}>Save</Button>
      </div>
    </div>
  );
}
