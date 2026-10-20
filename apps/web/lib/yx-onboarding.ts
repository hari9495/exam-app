import { joinerCard, type BatchRow, type KanbanColumn, type ProbRow, type ReadyRow } from '@yukthix/ui/frame';
import type { ProbationRow } from '@yukthix/ui/workforce';
import type { Batch, Joiner, OwnerType, ReadyOffer } from '@yukthix/ui/lifecycle';

// People › Onboarding board (PPL-11) from the live API: pure mapping, unit-tested. The stage follows the dates:
// an accepted offer waiting to become a joiner, pre-boarding before the joining day, day 1 on (or after) the joining
// day until the joiner is marked joined, the first 30 days, and done once every task is done.

export const OWNER_LABEL: Record<OwnerType, string> = { hr: 'HR', it: 'IT', admin: 'Admin', finance: 'Finance', payroll: 'Payroll', manager: 'Manager', person: 'New hire', buddy: 'Buddy', user: 'A named person', group: 'A team' };

const short = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const daysFrom = (iso: string | null | undefined, today: string) => (iso ? Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${iso}T00:00:00Z`)) / 86_400_000)) : 0);

/** Board columns: offers (HR who onboards sees them), then joiners by stage. */
export function boardColumns(joiners: Joiner[], offers: ReadyOffer[] | null, today: string): KanbanColumn[] {
  const card = (j: Joiner, days: number) =>
    joinerCard(
      j.journeyId ?? j.id,
      j.name,
      j.designation ?? '',
      `${j.status === 'joined' ? 'joined' : 'joins'} ${short(j.joiningOn)}${j.personType === 'rehire' ? ' (rehire)' : ''}`,
      j.progress,
      days,
      j.location,
      j.nextTask ? { text: `${j.nextTask.title} · ${short(j.nextTask.dueOn)}`, owner: OWNER_LABEL[j.nextTask.ownerType] ?? 'HR', overdue: j.nextTask.dueOn < today } : { text: 'All tasks done', owner: '' },
    );
  const open = joiners.filter((j) => j.status !== 'cancelled');
  const pre = open.filter((j) => j.status === 'invited' && j.joiningOn > today);
  const day1 = open.filter((j) => j.status === 'invited' && j.joiningOn <= today);
  const first30 = open.filter((j) => j.status === 'joined' && j.progress < 100);
  const done = open.filter((j) => j.status === 'joined' && j.progress >= 100);
  return [
    ...(offers
      ? [
          {
            id: 'offer',
            title: 'Offer accepted',
            emptyText: 'No accepted offers waiting',
            cards: offers
              .filter((o) => o.personType !== 'internal')
              .map((o) => joinerCard(`offer:${o.offerId}`, o.name, o.jobTitle, `joins ${short(o.startDate)}${o.personType === 'ex_employee' ? ' (rehire)' : ''}`, 0, daysFrom(o.acceptedOn, today), '', { text: 'Create the joiner', owner: 'HR', overdue: o.startDate <= today })),
          },
        ]
      : []),
    { id: 'pre', title: 'Pre-boarding', slaDays: 30, cards: pre.map((j) => card(j, daysFrom(j.addedOn, today))), emptyText: 'No one in pre-boarding' },
    { id: 'day1', title: 'Day 1', cards: day1.map((j) => card(j, daysFrom(j.joiningOn, today))), emptyText: 'No one joins today' },
    { id: 'first30', title: 'First 30 days', slaDays: 30, cards: first30.map((j) => card(j, daysFrom(j.joiningOn, today))), emptyText: 'No one in their first 30 days' },
    { id: 'done', title: 'Done', cards: done.map((j) => card(j, daysFrom(j.joiningOn, today))), emptyText: 'No one finished yet' },
  ];
}

const day = (iso: string) => new Date(`${iso}T00:00:00`);
const TYPE: Record<ReadyOffer['personType'], string> = { new: 'New person', ex_employee: 'Ex-employee rehire', internal: 'Current employee' };

/** An accepted offer as the designed queue's row. */
export function readyRow(o: ReadyOffer): ReadyRow {
  return {
    id: o.offerId,
    name: o.name,
    role: o.jobTitle,
    dept: '',
    location: '',
    entity: '',
    manager: '',
    joining: day(o.startDate),
    offerAccepted: day(o.acceptedOn ?? o.startDate),
    personType: TYPE[o.personType],
    source: 'Accepted offer',
    note: o.personType === 'internal' ? 'Moves by a job change' : o.personType === 'ex_employee' ? 'Worked here before' : '',
    live: { offerId: o.offerId, email: o.email, internal: o.personType === 'internal' },
  };
}


/** Batches as the designed table's rows: progress is the members' average checklist progress. */
export function batchRows(batches: Batch[], joiners: Joiner[], entities: { value: string; label: string }[]): BatchRow[] {
  return batches.map((b) => {
    const mine = joiners.filter((j) => j.batchId === b.id);
    return {
      id: b.id,
      name: b.name,
      entity: entities.find((e) => e.value === b.legalEntityId)?.label ?? '',
      location: '',
      joining: day(b.joiningOn),
      members: b.members.length,
      completion: mine.length ? Math.round(mine.reduce((n, j) => n + j.progress, 0) / mine.length) : 0,
      loi: b.lettersOfIntent ?? 0,
      offers: b.offersIssued ?? 0,
    };
  });
}

const PROB_STATE: Record<ProbationRow['stage'], 'running' | 'review due' | 'overdue' | 'waiting'> = { running: 'running', extended: 'running', review_due: 'review due', overdue: 'overdue', awaiting_approval: 'waiting', confirmed: 'running' };
/** Months a probation runs, start to planned end inclusive (the server checks the exact limit). */
const monthsRun = (r: ProbationRow) => Math.round((Date.parse(`${r.plannedEndOn}T00:00:00Z`) - Date.parse(`${r.startOn}T00:00:00Z`) + 86_400_000) / 86_400_000 / 30.44);

/** Open probations as the designed queue's rows (recently confirmed ones are left out). */
export function probationRows(rows: ProbationRow[]): ProbRow[] {
  return rows
    .filter((r) => r.stage !== 'confirmed')
    .map((r) => ({
      id: r.employeeId,
      name: r.name,
      role: r.designation ?? '',
      manager: r.manager ?? '',
      start: day(r.startOn),
      end: day(r.plannedEndOn),
      extended: r.extendedMonths,
      reviewDone: false,
      live: { stage: r.stage === 'overdue' && r.escalatedOn ? 'escalated' : PROB_STATE[r.stage], reviewDueOn: day(r.reviewDueOn), canReview: Boolean(r.canReview), maxMonthsLeft: Math.max(0, r.maxTotalMonths - monthsRun(r)) },
    }));
}

/** The design's rating words as the review's 1 to 5 score. */
export const RATING_SCORE: Record<string, number> = { Below: 2, Meets: 3, Exceeds: 4 };
