import type { ScheduledRow } from '@yukthix/ui/frame';
import type { ChangeRecord, PersonOption } from '@yukthix/ui/history';

// People › Change action and Scheduled changes (PPL-04, PPL-05) from the live API: pure mapping, unit-tested.

export const CHANGE_LABEL: Record<ChangeRecord['changeType'], string> = {
  join: 'Joining',
  promotion: 'Promotion',
  transfer: 'Transfer',
  entity_transfer: 'Inter-entity transfer',
  redesignation: 'New designation',
  manager_change: 'Manager change',
  salary_revision: 'Salary revision',
  employment_type_change: 'Employment type or hours',
  confirmation: 'Confirmation',
  correction: 'Correction',
  notice: 'Notice period',
  notice_withdrawal: 'Resignation withdrawn',
  exit: 'Leaving',
};

const money = (v: string | null) => {
  const m = v?.match(/^([A-Z]{3}) (\S+)$/);
  return m ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: m[1], maximumFractionDigits: 0 }).format(Number(m[2])) : (v ?? '—');
};

/** Pay the reader may not see (the design's masked amount). */
export const PAY_MASK = '₹ •••';

/**
 * "Quality Lead · G6" for several new values, "Bengaluru → Chennai" for one; pay apart (shown only on "Show pay",
 * masked without pay access). A change still waiting has no impact yet: its new values by name, never the reason.
 */
export function changeWords(c: ChangeRecord): { summary: string; pay?: string } {
  const facts = c.impact?.facts ?? [];
  const summary = facts.length === 1 ? `${facts[0].from ?? '—'} → ${facts[0].to ?? '—'}` : facts.length ? facts.map((f) => f.to ?? '—').join(' · ') : c.newValues?.length ? c.newValues.join(' · ') : '—';
  const comp = c.payload?.compensation;
  const pay =
    c.impact && c.impact.pay !== 'hidden' && c.impact.pay.length
      ? c.impact.pay.map((p) => `${money(p.from)} → ${money(p.to)}`).join(' · ')
      : comp?.annualCtc
        ? `→ ${money(`${comp.currency ?? 'INR'} ${comp.annualCtc}`)}`
        : comp?.increasePercent
          ? `${Number(comp.increasePercent) >= 0 ? '+' : ''}${comp.increasePercent}%`
          : c.touchesPay
            ? PAY_MASK
            : undefined;
  return { summary, ...(pay ? { pay } : {}) };
}

/** Changes still to come (waiting or scheduled, today or later) as the designed table's rows. */
export function scheduledRows(rows: ChangeRecord[], people: PersonOption[], today: string): ScheduledRow[] {
  return rows
    .filter((c) => (c.status === 'scheduled' || c.status === 'pending') && c.effectiveDate >= today)
    .map((c) => ({
      id: c.id,
      name: c.employeeName ?? 'Employee',
      code: people.find((p) => p.id === c.employeeId)?.employeeCode ?? '',
      type: CHANGE_LABEL[c.changeType],
      effective: new Date(`${c.effectiveDate}T00:00:00`),
      ...changeWords(c),
      raisedBy: c.requestedByName ?? '',
      status: c.status === 'pending' ? ('Pending approval' as const) : ('Scheduled' as const),
    }));
}
