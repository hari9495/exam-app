'use client';

import { useState } from 'react';
import { Modal, Button, Input, Checkbox, Select, useToast } from '../ui';
import { useCreateInterview, useSendInterview } from '../../lib/hooks/useInterviews';
import { useUsers } from '../../lib/hooks/useUsers';
import { useIntegrations } from '../../lib/hooks/useIntegrations';

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

  return (
    <Modal
      open
      title="Schedule interview"
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSend} loading={busy} disabled={!canSubmit || busy}>
            Send
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {integrationsLoaded && integrations?.smtpConfigured === false && (
          <div className="rounded-md bg-status-warning-bg p-3 text-sm text-status-warning">
            Candidate emails won&apos;t send until SMTP is configured in Organization settings.
          </div>
        )}

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-gray-700">Proposed times</span>
          {slots.map((slot, index) => (
            <div key={slot.key} className="flex items-end gap-2">
              <div className="flex flex-col gap-1">
                <label htmlFor={`interview-slot-start-${slot.key}`} className="text-xs text-gray-500">
                  Start {index + 1}
                </label>
                <input
                  id={`interview-slot-start-${slot.key}`}
                  type="datetime-local"
                  value={slot.start}
                  onChange={(e) => updateSlot(slot.key, 'start', e.target.value)}
                  className="rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor={`interview-slot-end-${slot.key}`} className="text-xs text-gray-500">
                  End {index + 1}
                </label>
                <input
                  id={`interview-slot-end-${slot.key}`}
                  type="datetime-local"
                  value={slot.end}
                  onChange={(e) => updateSlot(slot.key, 'end', e.target.value)}
                  className="rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              {slots.length > 1 && (
                <button
                  type="button"
                  onClick={() => setSlots((current) => current.filter((s) => s.key !== slot.key))}
                  className="mb-2 text-sm font-medium text-primary hover:underline"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          <div>
            <Button variant="secondary" size="sm" onClick={() => setSlots((current) => [...current, newSlotRow()])}>
              Add slot
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-gray-700">Panel</span>
          {staff.length === 0 ? (
            <p className="text-sm text-muted">No staff available.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {staff.map((user) => (
                <Checkbox
                  key={user.id}
                  label={user.name ?? user.email}
                  checked={panelistIds.includes(user.id)}
                  onChange={(checked) => togglePanelist(user.id, checked)}
                />
              ))}
            </div>
          )}
        </div>

        <Select label="Time zone" value={timeZone} onChange={setTimeZone} options={TIME_ZONE_OPTIONS} required />
        <Input label="Location" value={location} onChange={setLocation} placeholder="e.g. Zoom link or office address" required />
        <div className="flex flex-col gap-1">
          <label htmlFor="interview-note" className="text-sm font-medium text-gray-700">
            Note (optional)
          </label>
          <textarea
            id="interview-note"
            value={recruiterNote}
            onChange={(e) => setRecruiterNote(e.target.value)}
            rows={3}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>
      </div>
    </Modal>
  );
}
