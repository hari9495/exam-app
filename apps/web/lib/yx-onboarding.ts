import { joinerCard, type KanbanColumn } from '@yukthix/ui/frame';
import type { Joiner, OwnerType, ReadyOffer } from '@yukthix/ui/lifecycle';

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
