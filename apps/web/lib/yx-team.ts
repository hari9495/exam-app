import type { Muster, TeamCalendar } from '@yukthix/ui/time';
import type { TeamMember as ApiMember } from '@yukthix/ui/workforce';
import type { Joiner, JourneyTask } from '@yukthix/ui/lifecycle';

// People › My team (PPL-08) from the live API: pure mapping, unit-tested. "Today" comes from the team muster,
// "Upcoming" from approved or asked leave (team calendar), probation ends and joining days.

export interface TeamRow {
  id: string;
  name: string;
  role: string;
  today: string;
  upcoming: string;
  reminded?: boolean;
}

const short = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
/** "9:05 am" in India time. */
export const clockText = (at: string) => new Date(at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }).toLowerCase().replace(/ /g, ' ');
/** "12 h 50 min", "40 min" (founder rule: never "770 min"). */
export const minutesText = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);

/** Today's line for one person, from the muster and the leave calendar. Empty when the company has no attendance for them. */
export function todayText(memberId: string, today: string, muster?: Muster, calendar?: TeamCalendar): string {
  const leave = calendar?.people.find((p) => p.id === memberId)?.days.find((d) => d.on === today && d.status === 'approved');
  const day = muster?.people.find((p) => p.id === memberId)?.days.find((d) => d.on === today);
  if (leave || day?.status === 'leave') return `On leave${leave ? ` (${leave.name.toLowerCase()})` : ''}`;
  if (!day) return '';
  if (day.status === 'holiday') return 'Holiday';
  if (day.status === 'weekly_off') return 'Weekly off';
  if (day.firstIn && (day.lateMinutes ?? 0) > 0) return `Late · in at ${clockText(day.firstIn)} (${minutesText(day.lateMinutes!)})`;
  if (day.firstIn) return `Present · in ${clockText(day.firstIn)}`;
  return 'Not checked in';
}

/** The next thing for one person: leave they asked for, the end of probation. */
export function upcomingText(m: ApiMember, today: string, calendar?: TeamCalendar): string {
  const next = calendar?.people.find((p) => p.id === m.id)?.days.filter((d) => d.on > today).sort((a, b) => a.on.localeCompare(b.on))[0];
  const parts: string[] = [];
  if (next) parts.push(`${next.name} ${short(next.on)}${next.status === 'pending' ? ' (asked)' : ''}`);
  if (m.status === 'probation' && m.probationEndsOn && m.probationEndsOn >= today) parts.push(`Probation ends ${short(m.probationEndsOn)}`);
  if (m.status === 'notice') parts.push('Serving notice');
  return parts.join(' · ');
}

/** Team rows: joiners first (they are not on the team until day one), then the team. */
export function teamRows(members: ApiMember[], joiners: Joiner[], today: string, muster?: Muster, calendar?: TeamCalendar): TeamRow[] {
  return [
    ...joiners.filter((j) => j.status === 'invited').map((j) => ({ id: `joiner:${j.journeyId ?? j.id}`, name: j.name, role: j.designation ?? '', today: `Joins ${short(j.joiningOn)}`, upcoming: j.openTasks ? `${j.openTasks} onboarding task${j.openTasks === 1 ? '' : 's'} open` : '' })),
    ...members.map((m) => ({
      id: m.id,
      name: m.name,
      role: [m.designation?.name, m.relation === 'dotted' ? 'dotted line' : m.relation === 'indirect' ? `through ${m.manager?.name ?? 'your team'}` : null].filter(Boolean).join(' · '),
      today: todayText(m.id, today, muster, calendar),
      upcoming: upcomingText(m, today, calendar),
      reminded: Boolean(muster?.people.find((p) => p.id === m.id)?.remindedOn?.includes(today)),
    })),
  ];
}

/** Onboarding and exit tasks the manager owns, open ones first by due date. */
export function teamTasks(tasks: JourneyTask[]): { id: string; journeyId: string | null; title: string; due: Date; kind: string }[] {
  const kind: Record<string, string> = { onboarding: 'Onboarding', offboarding: 'Exit' };
  // My team lists the tasks owned as someone's manager; HR's own checklist work (for people outside the team) stays
  // on My checklist tasks (PPL-08 audit).
  return tasks
    .filter((t) => (t.status === 'open' || t.status === 'waiting') && t.ownerType === 'manager')
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn))
    .map((t) => ({ id: t.id, journeyId: t.journeyId ?? null, title: t.person ? `${t.title} · ${t.person}` : t.title, due: new Date(`${t.dueOn}T00:00:00`), kind: kind[t.journeyKind ?? ''] ?? 'Life event' }));
}
