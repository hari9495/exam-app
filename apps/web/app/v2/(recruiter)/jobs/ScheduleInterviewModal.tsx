'use client';

// v2 Schedule-interview modal — re-skin of components/pipeline/ScheduleInterviewModal on the v2
// Dialog + primitives. All hooks, state, handlers, validation, constants, the exported
// zonedWallClockToUtcISO helper, SlotRow/newSlotRow/slotRowCounter, and mutation payloads are
// verbatim (format only).
import { useState } from 'react';
import { Dialog, TextField, Combobox, Cb, Button, dt } from '../../../../components/ui-v2';
import { useToast } from '../../../../components/ui';
import { useCreateInterview, useSendInterview } from '../../../../lib/hooks/useInterviews';
import { useUsers } from '../../../../lib/hooks/useUsers';
import { useIntegrations } from '../../../../lib/hooks/useIntegrations';

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
  // Best-effort, same as CreateOfferModal: a plain recruiter gets a 403 on this org-admin
  // endpoint, so isSuccess just stays false and the banner quietly doesn't render.
  const { data: integrations, isSuccess: integrationsLoaded } = useIntegrations();
  const { toast } = useToast();

  const [slots, setSlots] = useState<SlotRow[]>([newSlotRow()]);
  const [panelistIds, setPanelistIds] = useState<string[]>([]);
  const [timeZone, setTimeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [location, setLocation] = useState('');
  const [recruiterNote, setRecruiterNote] = useState('');

  const staff = users?.data ?? [];
  const completeSlots = slots.filter((slot) => slot.start && slot.end);
  const canSubmit = Boolean(completeSlots.length > 0 && panelistIds.length > 0 && location.trim());

  function updateSlot(key: number, field: 'start' | 'end', value: string) {
    setSlots((current) => current.map((slot) => (slot.key === key ? { ...slot, [field]: value } : slot)));
  }

  function togglePanelist(userId: string, checked: boolean) {
    setPanelistIds((current) => (checked ? [...current, userId] : current.filter((id) => id !== userId)));
  }

  async function handleSend() {
    try {
      const created = await createInterview.mutateAsync({
        slots: completeSlots.map((slot) => ({
          startsAt: zonedWallClockToUtcISO(slot.start, timeZone),
          endsAt: zonedWallClockToUtcISO(slot.end, timeZone),
        })),
        panelistUserIds: panelistIds,
        location: location.trim(),
        timeZone,
        recruiterNote: recruiterNote.trim() || undefined,
      });
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="v2-label" style={{ marginBottom: 0 }}>Proposed times</span>
          {slots.map((slot, index) => (
            <div key={slot.key} style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
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
          ))}
          <div>
            <button type="button" onClick={() => setSlots((current) => [...current, newSlotRow()])} style={dt.toolBtn}>Add slot</button>
          </div>
        </div>

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
          <Combobox width="100%" value={timeZone} onChange={setTimeZone} options={TIME_ZONE_OPTIONS} />
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
        <button type="button" onClick={onClose} style={dt.toolBtn}>Cancel</button>
        <Button onClick={handleSend} loading={busy} disabled={!canSubmit || busy}>Send</Button>
      </div>
    </Dialog>
  );
}
