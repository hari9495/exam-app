import { evaluateSlot, BusinessHours, Holiday } from '@exam-platform/shared';

export interface BusyInterval {
  startsAt: string; // ISO
  endsAt: string; // ISO
}

export interface BookableSlotsInput {
  windowStart: string; // ISO
  windowEnd: string; // ISO
  slotDurationMinutes: number;
  businessHours: BusinessHours | null;
  holidays: Holiday[];
  busyIntervals: BusyInterval[]; // panelists' confirmed slots
  now: string; // ISO (injected for testability)
  leadTimeMinutes?: number; // default 60
}

const DEFAULT_LEAD_TIME_MINUTES = 60;

export function generateBookableSlots(
  input: BookableSlotsInput,
): { startsAt: string; endsAt: string }[] {
  const {
    windowStart,
    windowEnd,
    slotDurationMinutes,
    businessHours,
    holidays,
    busyIntervals,
    now,
    leadTimeMinutes = DEFAULT_LEAD_TIME_MINUTES,
  } = input;

  const durationMs = slotDurationMinutes * 60_000;
  const windowEndMs = new Date(windowEnd).getTime();
  const earliestStartMs = new Date(now).getTime() + leadTimeMinutes * 60_000;

  const slots: { startsAt: string; endsAt: string }[] = [];

  for (
    let startMs = new Date(windowStart).getTime();
    startMs + durationMs <= windowEndMs;
    startMs += durationMs
  ) {
    const endMs = startMs + durationMs;

    if (startMs < earliestStartMs) continue;

    const startIso = new Date(startMs).toISOString();
    const endIso = new Date(endMs).toISOString();
    const endMinusOneMinuteIso = new Date(endMs - 60_000).toISOString();

    const hoursStart = evaluateSlot(startIso, businessHours, holidays);
    const hoursEnd = evaluateSlot(endMinusOneMinuteIso, businessHours, holidays);
    if (hoursStart.outsideHours || hoursEnd.outsideHours) continue;
    if (hoursStart.holiday !== null || hoursEnd.holiday !== null) continue;

    const conflicts = busyIntervals.some((b) => {
      const busyStartMs = new Date(b.startsAt).getTime();
      const busyEndMs = new Date(b.endsAt).getTime();
      return startMs < busyEndMs && endMs > busyStartMs;
    });
    if (conflicts) continue;

    slots.push({ startsAt: startIso, endsAt: endIso });
  }

  return slots;
}
