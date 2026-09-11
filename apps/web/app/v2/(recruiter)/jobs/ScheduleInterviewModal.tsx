'use client';

// v2 Schedule-interview modal — re-skin of components/pipeline/ScheduleInterviewModal on the v2
// Dialog + primitives. All hooks, state, handlers, validation, constants, the exported
// zonedWallClockToUtcISO helper, SlotRow/newSlotRow/slotRowCounter, and mutation payloads are
// verbatim (format only).
import { useEffect, useRef, useState } from 'react';
import { Dialog, TextField, Combobox, Cb, Button, dt } from '../../../../components/ui-v2';
import { useToast } from '../../../../components/ui';
import { useCreateInterview, useSendInterview } from '../../../../lib/hooks/useInterviews';
import { useUsers } from '../../../../lib/hooks/useUsers';
import { useIntegrations } from '../../../../lib/hooks/useIntegrations';
import { useBusinessHours } from '../../../../lib/hooks/useBusinessHours';
import { evaluateSlot } from '../../../../lib/business-hours-eval';
import { useCurrentUser } from '../../../../lib/hooks/useCurrentUser';

interface ScheduleInterviewModalProps {
  entryId: string;
  candidateId: string;
  onClose: () => void;
}

// Small curated IANA list -- a free-text timezone field invites typos an ISO string can't catch.
const TIME_ZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern (America/New_York)' },
  { value: 'America/Chicago', label: 'Central (America/Chicago)' },
  { value: 'America/Denver', label: 'Mountain (America/Denver)' },
  { value: 'America/Los_Angeles', label: 'Pacific (America/Los_Angeles)' },
  { value: 'Europe/London', label: 'London (Europe/London)' },
  { value: 'Asia/Kolkata', label: 'India (Asia/Kolkata)' },
  { value: 'UTC', label: 'UTC' },
];

// Convert a bare 'YYYY-MM-DDTHH:mm' wall-clock (as produced by <input type="datetime-local">),
// interpreted as local time in `timeZone`, to the corresponding UTC ISO instant.
// Handles DST because the offset is computed at that specific date.
export function zonedWallClockToUtcISO(local: string, timeZone: string): string {
  // Treat the wall-clock as if it were UTC to get a stable reference instant...
  const naiveUtc = new Date(local + (local.length === 16 ? ':00Z' : 'Z'));
  // ...then measure how that same instant is displayed in the target zone vs UTC, and correct.
  const inZone = new Date(naiveUtc.toLocaleString('en-US', { timeZone }));
  const inUtc = new Date(naiveUtc.toLocaleString('en-US', { timeZone: 'UTC' }));
  const offsetMs = inUtc.getTime() - inZone.getTime();
  return new Date(naiveUtc.getTime() + offsetMs).toISOString();
}

interface SlotRow {
  key: number;
  start: string;
  end: string;
}

let slotRowCounter = 0;
function newSlotRow(): SlotRow {
  slotRowCounter += 1;
  return { key: slotRowCounter, start: '', end: '' };
}

export function ScheduleInterviewModal({ entryId, candidateId, onClose }: ScheduleInterviewModalProps) {
  const createInterview = useCreateInterview(entryId, candidateId);
  const sendInterview = useSendInterview(candidateId);
  const { data: users } = useUsers({ pageSize: 50 });
  const { data: currentUser } = useCurrentUser();
  // Best-effort, same as CreateOfferModal: a plain recruiter gets a 403 on this org-admin
  // endpoint, so isSuccess just stays false and the banner quietly doesn't render.
  const { data: integrations, isSuccess: integrationsLoaded } = useIntegrations();
  // Non-blocking recruiter-facing hint only -- tolerate a null config or a failed fetch (e.g. a
  // plain recruiter without org:manage_settings still gets a 200 here since GET is
  // authenticated-only, but any other failure should just render no hints, not break the modal).
  const { data: businessHoursData, isError: businessHoursErrored } = useBusinessHours();
  const businessHours = businessHoursErrored ? null : businessHoursData?.businessHours ?? null;
  const holidays = businessHoursErrored ? [] : businessHoursData?.holidays ?? [];
  const { toast } = useToast();

  const [mode, setMode] = useState<'proposed' | 'self_book'>('proposed');
  const [slots, setSlots] = useState<SlotRow[]>([newSlotRow()]);
  const [bookingWindowStart, setBookingWindowStart] = useState('');
  const [bookingWindowEnd, setBookingWindowEnd] = useState('');
  const [slotDurationMinutes, setSlotDurationMinutes] = useState(30);
  const [panelistIds, setPanelistIds] = useState<string[]>([]);
  const [timeZone, setTimeZoneState] = useState(
    () => currentUser?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  );
  // currentUser can arrive after mount (query still loading on first render); seed the default
  // from it once it loads, but never clobber a zone the recruiter already picked by hand.
  const zoneManuallyChanged = useRef(false);
  const userZoneSeeded = useRef(Boolean(currentUser?.timeZone));
  useEffect(() => {
    if (!zoneManuallyChanged.current && !userZoneSeeded.current && currentUser?.timeZone) {
      userZoneSeeded.current = true;
      setTimeZoneState(currentUser.timeZone);
    }
  }, [currentUser?.timeZone]);
  function setTimeZone(value: string) {
    zoneManuallyChanged.current = true;
    setTimeZoneState(value);
  }
  const [location, setLocation] = useState('');
  const [recruiterNote, setRecruiterNote] = useState('');
  // The curated list won't have every zone a user's profile can hold -- append it so the
  // Combobox can still display (and keep) the seeded/selected value.
  const timeZoneOptions = TIME_ZONE_OPTIONS.some((o) => o.value === timeZone)
    ? TIME_ZONE_OPTIONS
    : [...TIME_ZONE_OPTIONS, { value: timeZone, label: timeZone }];

  const staff = users?.data ?? [];
  const completeSlots = slots.filter((slot) => slot.start && slot.end);
  const canSubmit = Boolean(
    mode === 'proposed'
      ? completeSlots.length > 0 && panelistIds.length > 0 && location.trim()
      : bookingWindowStart && bookingWindowEnd && panelistIds.length > 0 && location.trim(),
  );

  function updateSlot(key: number, field: 'start' | 'end', value: string) {
    setSlots((current) => current.map((slot) => (slot.key === key ? { ...slot, [field]: value } : slot)));
  }

  function togglePanelist(userId: string, checked: boolean) {
    setPanelistIds((current) => (checked ? [...current, userId] : current.filter((id) => id !== userId)));
  }

  async function handleSend() {
    try {
      const created = await createInterview.mutateAsync(
        mode === 'proposed'
          ? {
              slots: completeSlots.map((slot) => ({
                startsAt: zonedWallClockToUtcISO(slot.start, timeZone),
                endsAt: zonedWallClockToUtcISO(slot.end, timeZone),
              })),
              panelistUserIds: panelistIds,
              location: location.trim(),
              timeZone,
              recruiterNote: recruiterNote.trim() || undefined,
            }
          : {
              bookingMode: 'self_book',
              bookingWindowStart: zonedWallClockToUtcISO(bookingWindowStart, timeZone),
              bookingWindowEnd: zonedWallClockToUtcISO(bookingWindowEnd, timeZone),
              slotDurationMinutes,
              panelistUserIds: panelistIds,
              location: location.trim(),
              timeZone,
              recruiterNote: recruiterNote.trim() || undefined,
            },
      );
      await sendInterview.mutateAsync(created.id);
      toast('Interview invite sent.');
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Failed to send interview invite.', 'error');
    }
  }

  const busy = createInterview.isPending || sendInterview.isPending;

  const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', fontSize: 13, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--ink) 15%, var(--hair))', background: 'var(--paper)', color: 'var(--ink)', outline: 'none' };

  return (
    <Dialog open onClose={onClose} title="Schedule interview" width={680}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {integrationsLoaded && integrations?.smtpConfigured === false && (
          <div style={{ borderRadius: 8, border: '1px solid color-mix(in srgb, #a16207 30%, var(--hair))', background: 'color-mix(in srgb, #a16207 8%, var(--paper))', padding: '10px 12px', fontSize: 12.5, color: 'var(--ink)' }}>
            Candidate emails won&apos;t send until SMTP is configured in Organization settings.
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => setMode('proposed')}
            className="v2-hoverbtn"
            aria-pressed={mode === 'proposed'}
            style={{ ...dt.toolBtn, ...(mode === 'proposed' ? { background: 'var(--org-primary)', color: '#fff' } : {}) }}
          >
            Propose specific times
          </button>
          <button
            type="button"
            onClick={() => setMode('self_book')}
            className="v2-hoverbtn"
            aria-pressed={mode === 'self_book'}
            style={{ ...dt.toolBtn, ...(mode === 'self_book' ? { background: 'var(--org-primary)', color: '#fff' } : {}) }}
          >
            Let candidate pick a time
          </button>
        </div>

        {mode === 'self_book' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="v2-label" style={{ marginBottom: 0 }}>Booking window</span>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                <label htmlFor="booking-window-start" className="v2-label" style={{ fontSize: 11 }}>
                  Window start
                </label>
                <input
                  id="booking-window-start"
                  type="datetime-local"
                  value={bookingWindowStart}
                  onChange={(e) => setBookingWindowStart(e.target.value)}
                  style={input}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                <label htmlFor="booking-window-end" className="v2-label" style={{ fontSize: 11 }}>
                  Window end
                </label>
                <input
                  id="booking-window-end"
                  type="datetime-local"
                  value={bookingWindowEnd}
                  onChange={(e) => setBookingWindowEnd(e.target.value)}
                  style={input}
                />
              </div>
            </div>
            <div>
              <label htmlFor="slot-duration" className="v2-label" style={{ fontSize: 11 }}>
                Slot duration
              </label>
              <select
                id="slot-duration"
                value={slotDurationMinutes}
                onChange={(e) => setSlotDurationMinutes(Number(e.target.value))}
                style={input}
              >
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={45}>45 minutes</option>
                <option value={60}>60 minutes</option>
              </select>
            </div>
          </div>
        ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="v2-label" style={{ marginBottom: 0 }}>Proposed times</span>
          {slots.map((slot, index) => {
            // Purely presentational: never disables Add/Send, never affects the submit payload.
            const slotWarning = slot.start
              ? evaluateSlot(zonedWallClockToUtcISO(slot.start, timeZone), businessHours, holidays)
              : null;
            return (
            <div key={slot.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                  <label htmlFor={`interview-slot-start-${slot.key}`} className="v2-label" style={{ fontSize: 11 }}>
                    Start {index + 1}
                  </label>
                  <input
                    id={`interview-slot-start-${slot.key}`}
                    type="datetime-local"
                    value={slot.start}
                    onChange={(e) => updateSlot(slot.key, 'start', e.target.value)}
                    style={input}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                  <label htmlFor={`interview-slot-end-${slot.key}`} className="v2-label" style={{ fontSize: 11 }}>
                    End {index + 1}
                  </label>
                  <input
                    id={`interview-slot-end-${slot.key}`}
                    type="datetime-local"
                    value={slot.end}
                    onChange={(e) => updateSlot(slot.key, 'end', e.target.value)}
                    style={input}
                  />
                </div>
                {slots.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setSlots((current) => current.filter((s) => s.key !== slot.key))}
                    style={{ background: 'none', border: 'none', fontSize: 12.5, fontWeight: 500, color: 'var(--danger)', cursor: 'pointer', paddingBottom: 9 }}
                  >
                    Remove
                  </button>
                )}
              </div>
              {slotWarning && (slotWarning.outsideHours || slotWarning.holiday) && (
                <p style={{ margin: 0, fontSize: 11.5, color: '#a16207' }}>
                  {slotWarning.outsideHours && <span>Outside business hours</span>}
                  {slotWarning.outsideHours && slotWarning.holiday && <span> &middot; </span>}
                  {slotWarning.holiday && <span>On a holiday: {slotWarning.holiday}</span>}
                </p>
              )}
            </div>
            );
          })}
          <div>
            <button type="button" onClick={() => setSlots((current) => [...current, newSlotRow()])} className="v2-hoverbtn" style={dt.toolBtn}>Add slot</button>
          </div>
        </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="v2-label" style={{ marginBottom: 0 }}>Panel</span>
          {staff.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>No staff available.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {staff.map((user) => (
                <label key={user.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--ink)', cursor: 'pointer' }}>
                  <Cb checked={panelistIds.includes(user.id)} onChange={(c) => togglePanelist(user.id, c)} />
                  {user.name ?? user.email}
                </label>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="v2-label">Time zone</label>
          <Combobox width="100%" value={timeZone} onChange={setTimeZone} options={timeZoneOptions} />
        </div>

        <TextField id="interview-location" label="Location" value={location} onChange={setLocation} placeholder="e.g. Zoom link or office address" required />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="interview-note" className="v2-label">Note (optional)</label>
          <textarea
            id="interview-note"
            value={recruiterNote}
            onChange={(e) => setRecruiterNote(e.target.value)}
            rows={3}
            style={{ ...input, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button type="button" onClick={onClose} className="v2-hoverbtn" style={dt.toolBtn}>Cancel</button>
        <Button onClick={handleSend} loading={busy} disabled={!canSubmit || busy}>Send</Button>
      </div>
    </Dialog>
  );
}
