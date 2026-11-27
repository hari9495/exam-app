import { ForbiddenException, Injectable } from '@nestjs/common';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import type { ScopeUser } from '../access/scope';
import { settingFor } from '../people/probation';
import { taxDates, taxWindows } from '../payroll/tax.service';
import { taxYearOf } from '../payroll/tax';
import { closingSoon, pickReminders, reminderSetting, REMINDER_KINDS, type ReminderCard, type ReminderKind } from './home-reminders';

const day = (d: Date) => d.toISOString().slice(0, 10);
const shown = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * T2-E 51 (answer 2874): the signed-in person's Home cards for windows that are closing: the tax declaration and proof
 * windows (from 7 days before they close), the regime choice cut-off (7 days), a self-review or manager review due in 3
 * days, a survey of theirs closing in 2 days, and a request of theirs sent back to them. Only their own; each kind
 * behind a company setting (on by default); at most 2. Never while acting for someone else.
 */
@Injectable()
export class HomeRemindersService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async mine(ctx: TenantContext, user: ScopeUser): Promise<{ cards: ReminderCard[] }> {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = user.userId!;
      const today = todayIst();
      const on = new Map<ReminderKind, boolean>();
      for (const k of REMINDER_KINDS) on.set(k, (await settingFor(tx, c, reminderSetting(k), { legalEntityId: '' })) === 'on');
      const cards: ReminderCard[] = [];
      const employees = (await tx.employee.findMany({ where: { organizationId: org, userId: me }, select: { id: true } })).map((e) => e.id);
      if (on.get('sent_back')) {
        const back = await tx.wfRequest.findMany({ where: { organizationId: org, requesterUserId: me, status: 'sent_back' }, orderBy: { decidedAt: 'desc' }, take: 5, select: { id: true } });
        if (back.length) cards.push({ kind: 'sent_back', id: `sent_back:${back[0]!.id}`, title: back.length === 1 ? 'A request of yours was sent back' : `${back.length} requests of yours were sent back`, body: 'Change it and send it again, or withdraw it.', href: '/yx/me/requests', closesOn: null });
      }
      if (on.get('review') && employees.length) {
        const reviews = await tx.review.findMany({ where: { organizationId: org, status: 'open', OR: [{ employeeId: { in: employees }, stage: 'self' }, { managerEmployeeId: { in: employees }, stage: 'manager' }] }, select: { id: true, cycleId: true, stage: true }, take: 200 });
        const cycles = await tx.reviewCycle.findMany({ where: { organizationId: org, id: { in: [...new Set(reviews.map((r) => r.cycleId))] } }, select: { id: true, stages: true } });
        const due = reviews
          .map((r) => ({ r, dueOn: ((cycles.find((x) => x.id === r.cycleId)?.stages as { key: string; dueOn?: string }[] | null) ?? []).find((s) => s.key === r.stage)?.dueOn ?? null }))
          .filter((x): x is { r: (typeof reviews)[number]; dueOn: string } => Boolean(x.dueOn) && closingSoon('review', today, x.dueOn!))
          .sort((a, b) => a.dueOn.localeCompare(b.dueOn));
        if (due.length) {
          const x = due[0]!;
          cards.push({ kind: 'review', id: `review:${x.r.id}`, title: x.r.stage === 'self' ? `Your self-review is due on ${shown(x.dueOn)}` : `${due.length === 1 ? 'A review' : `${due.length} reviews`} of your team ${due.length === 1 ? 'is' : 'are'} due by ${shown(x.dueOn)}`, body: 'Finish it before it closes.', href: due.length === 1 ? `/yx/performance/reviews/${x.r.id}` : '/yx/performance/reviews', closesOn: x.dueOn });
        }
      }
      if ((on.get('tax_declarations') || on.get('tax_proofs') || on.get('tax_regime')) && employees.length) {
        const e = await tx.employment.findFirst({ where: { organizationId: org, employeeId: { in: employees }, joinedOn: { lte: new Date(`${today}T00:00:00Z`) }, OR: [{ exitedOn: null }, { exitedOn: { gte: new Date(`${today}T00:00:00Z`) } }] }, orderBy: { joinedOn: 'desc' }, select: { legalEntityId: true } });
        if (e) {
          const taxYear = taxYearOf(today.slice(0, 7));
          const dates = await taxDates(tx, c, e.legalEntityId, taxYear);
          const windows = await taxWindows(tx, org, e.legalEntityId, taxYear, dates, today);
          for (const w of windows) {
            const kind: ReminderKind = w.key === 'declarations' ? 'tax_declarations' : 'tax_proofs';
            if (on.get(kind) && w.open && closingSoon(kind, today, w.to)) cards.push({ kind, id: `${kind}:${taxYear}`, title: w.key === 'declarations' ? `Tax declarations close on ${shown(w.to)}` : `Tax proofs are due by ${shown(w.to)}`, body: w.key === 'declarations' ? 'Declare your investments so the right tax is taken.' : 'Upload your proofs; after the cut-off only verified amounts count.', href: '/yx/me/tax-declarations', closesOn: w.to });
          }
          if (on.get('tax_regime') && closingSoon('tax_regime', today, dates.regimeCutoff)) cards.push({ kind: 'tax_regime', id: `tax_regime:${taxYear}`, title: `Choose your tax regime by ${shown(dates.regimeCutoff)}`, body: 'After that only payroll can change it.', href: '/yx/me/tax-declarations', closesOn: dates.regimeCutoff });
        }
      }
      if (on.get('survey')) {
        const invites = await tx.engSurveyInvite.findMany({ where: { organizationId: org, userId: me, answered: false }, select: { surveyId: true } });
        const surveys = invites.length ? await tx.engSurvey.findMany({ where: { organizationId: org, id: { in: invites.map((i) => i.surveyId) }, launchedAt: { not: null }, closedAt: null, opensOn: { lte: new Date(`${today}T00:00:00Z`) } }, select: { id: true, name: true, closesOn: true }, orderBy: { closesOn: 'asc' } }) : [];
        const s = surveys.find((x) => closingSoon('survey', today, day(x.closesOn)));
        if (s) cards.push({ kind: 'survey', id: `survey:${s.id}`, title: `A survey closes on ${shown(day(s.closesOn))}`, body: `${s.name}: it takes a few minutes.`, href: `/yx/engage/surveys/${s.id}/take`, closesOn: day(s.closesOn) });
      }
      return { cards: pickReminders(cards, (k) => on.get(k) === true) };
    });
  }
}
