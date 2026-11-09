import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { audit, inCompany, Tx, CompanyContext } from '../org-structure/org-structure.service';
import { isTimeZone, todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { InterviewsService } from '../interviews/interviews.service';
import { assignDay, freeCells, memberOnTwoPanels, slotProblem, type AssignMode } from './interview-day-rules';
import type { InterviewDayDto } from './interviewing-dto';

/**
 * HIR-27 bulk interview day. A day is a job's hiring day: the candidates in one stage, several panels (members and a
 * room each) and fixed slots. Auto-assign gives each candidate a panel and slot by the company setting
 * hiring.interview_day.assign; the slot length is hiring.interview_day.slot_minutes when the day is made. Sending
 * makes each candidate an ordinary interview through the HIR-06 InterviewsService (panel as panellists, the job's
 * scorecard, the same invite emails) and sends it; every row is tried on its own, so one bad row never blocks or
 * half-sends the others, and each row keeps its own result. A row already sent is never sent again; a row whose
 * interview was made but whose email failed is resent on the same interview.
 */
@Injectable()
export class InterviewDaysService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly interviews: InterviewsService,
  ) {}

  /** Days of the company, newest day first, with what the picker and the list need. */
  list(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const days = await tx.interviewDay.findMany({ where: { organizationId: c.organizationId }, orderBy: [{ day: 'desc' }, { createdAt: 'desc' }], take: 200, include: { _count: { select: { rows: true } } } });
      const jobs = await this.jobNames(tx, c, days.map((d) => d.jobId));
      return days.map((d) => ({ id: d.id, name: d.name, day: iso(d.day), status: d.status, jobTitle: jobs.get(d.jobId) ?? '', candidates: d._count.rows }));
    });
  }

  /** The choices for planning a day: open jobs with their pipeline's stages, people who can sit on a panel, the settings. */
  options(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const jobs = await tx.job.findMany({ where: { organizationId: org, deletedAt: null, status: 'open', pipelineId: { not: null } }, orderBy: { title: 'asc' }, take: 500, select: { id: true, title: true, pipelineId: true } });
      const stages = await tx.pipelineStage.findMany({ where: { organizationId: org, pipelineId: { in: jobs.map((j) => j.pipelineId!) }, category: { notIn: ['rejected', 'archived', 'hired'] } }, orderBy: { position: 'asc' }, select: { id: true, name: true, pipelineId: true } });
      const people = await tx.user.findMany({ where: { organizationId: org, status: 'active' }, orderBy: [{ name: 'asc' }, { email: 'asc' }], take: 1000, select: { id: true, name: true, email: true } });
      return {
        jobs: jobs.map((j) => ({ value: j.id, label: j.title, stages: stages.filter((s) => s.pipelineId === j.pipelineId).map((s) => ({ value: s.id, label: s.name })) })),
        people: people.map((u) => ({ value: u.id, label: u.name || u.email })),
        slotMinutes: Number(await settingFor(tx, c, 'hiring.interview_day.slot_minutes', { legalEntityId: '' })),
        today: todayIst(),
      };
    });
  }

  async create(ctx: TenantContext, dto: InterviewDayDto) {
    const tz = dto.timeZone ?? 'Asia/Kolkata';
    if (!isTimeZone(tz)) throw new BadRequestException('Choose a valid time zone.');
    if (dto.day < todayIst()) throw new BadRequestException('An interview day cannot be in the past.');
    const twice = memberOnTwoPanels(dto.panels);
    if (twice) throw new BadRequestException('A person is on two panels. Each panel sits at the same times, so put them on one panel only.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const slotMinutes = Number(await settingFor(tx, c, 'hiring.interview_day.slot_minutes', { legalEntityId: '' }));
      const bad = slotProblem(dto.slots, slotMinutes);
      if (bad) throw new BadRequestException(bad);
      const job = await tx.job.findFirst({ where: { id: dto.jobId, organizationId: org, deletedAt: null }, select: { id: true, pipelineId: true, status: true } });
      if (!job) throw new NotFoundException('Job not found.');
      if (job.status !== 'open') throw new BadRequestException('Only an open job can have an interview day. Open the job first.');
      if (!job.pipelineId || !(await tx.pipelineStage.findFirst({ where: { id: dto.stageId, organizationId: org, pipelineId: job.pipelineId }, select: { id: true } })))
        throw new BadRequestException('Choose a stage of this job’s pipeline.');
      const members = [...new Set(dto.panels.flatMap((p) => p.memberUserIds))];
      if ((await tx.user.count({ where: { organizationId: org, status: 'active', id: { in: members } } })) !== members.length)
        throw new BadRequestException('Every panel member must be an active person of your company. Choose them from the list.');
      const day = await tx.interviewDay.create({
        data: {
          organizationId: org,
          jobId: job.id,
          stageId: dto.stageId,
          name: dto.name,
          day: new Date(`${dto.day}T00:00:00Z`),
          timeZone: tz,
          slots: [...dto.slots].sort((a, b) => a - b),
          slotMinutes,
          createdBy: c.userId ?? null,
          panels: { create: dto.panels.map((p, i) => ({ organizationId: org, position: i, name: p.name, room: p.room, memberUserIds: [...new Set(p.memberUserIds)] })) },
        },
      });
      await audit(tx, c, 'ats.interview_day.created', 'interview_day', day.id, { jobId: job.id, day: dto.day, panels: dto.panels.length, slots: dto.slots.length });
      return { id: day.id };
    });
  }

  /** One day with its panels and rows; another company's day reads as not found. */
  get(ctx: TenantContext, id: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const day = await tx.interviewDay.findFirst({ where: { id, organizationId: org }, include: { panels: { orderBy: { position: 'asc' } }, rows: true } });
      if (!day) throw new NotFoundException('Interview day not found.');
      const users = new Map((await tx.user.findMany({ where: { organizationId: org, id: { in: [...new Set(day.panels.flatMap((p) => p.memberUserIds))] } }, select: { id: true, name: true, email: true } })).map((u) => [u.id, u.name || u.email]));
      const entries = await tx.pipelineEntry.findMany({ where: { organizationId: org, id: { in: day.rows.map((r) => r.pipelineEntryId) } }, select: { id: true, candidate: { select: { name: true, erasedAt: true } } } });
      const name = new Map(entries.map((e) => [e.id, e.candidate.erasedAt ? 'Erased candidate' : e.candidate.name]));
      const stage = await tx.pipelineStage.findFirst({ where: { id: day.stageId, organizationId: org }, select: { name: true } });
      const job = (await this.jobNames(tx, c, [day.jobId])).get(day.jobId) ?? '';
      return {
        id: day.id,
        name: day.name,
        jobId: day.jobId,
        jobTitle: job,
        stageName: stage?.name ?? '',
        day: iso(day.day),
        timeZone: day.timeZone,
        slots: day.slots,
        slotMinutes: day.slotMinutes,
        status: day.status,
        sending: Boolean(day.sendingAt && Date.now() - day.sendingAt.getTime() < SEND_CLAIM_MS),
        panels: day.panels.map((p) => ({ id: p.id, name: p.name, room: p.room, members: p.memberUserIds.map((u) => users.get(u) ?? 'Someone who left').join(', ') })),
        rows: day.rows
          .map((r) => ({ id: r.id, entryId: r.pipelineEntryId, candidate: name.get(r.pipelineEntryId) ?? 'Candidate', panelId: r.panelId, start: r.slotStart, status: r.status, error: r.error, interviewId: r.interviewId, sentAt: r.sentAt }))
          .sort((a, b) => (a.start ?? 1e9) - (b.start ?? 1e9) || a.candidate.localeCompare(b.candidate)),
      };
    });
  }

  /**
   * Auto-assign: the job's candidates now in the day's stage (not rejected, archived or erased), oldest in the stage
   * first, into the free cells. Rows that already became an interview keep their place; every other row is placed
   * again, and candidates who left the stage are dropped. Refused while invites are being sent.
   */
  async assign(ctx: TenantContext, id: string) {
    await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`interview_day:${id}`}))`;
      const day = await tx.interviewDay.findFirst({ where: { id, organizationId: org }, include: { panels: { orderBy: { position: 'asc' } }, rows: true } });
      if (!day) throw new NotFoundException('Interview day not found.');
      if (day.sendingAt && Date.now() - day.sendingAt.getTime() < SEND_CLAIM_MS) throw new ConflictException('Invites are being sent for this day. Wait a moment and reload.');
      const mode = (await settingFor(tx, c, 'hiring.interview_day.assign', { legalEntityId: '' })) as AssignMode;
      const fixed = day.rows.filter((r) => r.interviewId);
      const entries = await tx.pipelineEntry.findMany({
        where: { organizationId: org, jobId: day.jobId, rejected: false, archivedAt: null, status: { stageId: day.stageId }, candidate: { erasedAt: null }, id: { notIn: fixed.map((r) => r.pipelineEntryId) } },
        orderBy: [{ stageEnteredAt: 'asc' }, { id: 'asc' }],
        take: 1000,
        select: { id: true },
      });
      const cells = freeCells(day.panels.map((p) => p.id), day.slots, mode, fixed.filter((r) => r.panelId != null && r.slotStart != null).map((r) => ({ panelId: r.panelId!, start: r.slotStart! })));
      const plan = assignDay(entries.map((e) => e.id), cells);
      await tx.interviewDayRow.deleteMany({ where: { organizationId: org, dayId: id, interviewId: null } });
      await tx.interviewDayRow.createMany({
        data: [
          ...plan.assigned.map((a) => ({ organizationId: org, dayId: id, pipelineEntryId: a.candidate, panelId: a.panelId, slotStart: a.start, status: 'assigned' })),
          ...plan.unassigned.map((e) => ({ organizationId: org, dayId: id, pipelineEntryId: e, status: 'unassigned' })),
        ],
      });
      await audit(tx, c, 'ats.interview_day.assigned', 'interview_day', id, { assigned: plan.assigned.length, unassigned: plan.unassigned.length, kept: fixed.length, mode });
    });
    return this.get(ctx, id);
  }

  /**
   * Sends the invites of every placed row not yet sent, each on its own. The day is claimed first (a double click or a
   * second person gets 409, never a second send). Each row: still in the hiring process, then its interview is made
   * once (kept on the row before the email, so a retry never makes a second interview) and sent through the HIR-06 send.
   */
  async send(ctx: TenantContext, actorUserId: string, id: string) {
    const org = ctx.organizationId as string;
    const claimed = await inCompany(this.tenantPrisma, ctx, (tx) =>
      tx.interviewDay.updateMany({ where: { id, organizationId: org, OR: [{ sendingAt: null }, { sendingAt: { lt: new Date(Date.now() - SEND_CLAIM_MS) } }] }, data: { sendingAt: new Date() } }),
    );
    if (!claimed.count) {
      const exists = await inCompany(this.tenantPrisma, ctx, (tx) => tx.interviewDay.findFirst({ where: { id, organizationId: org }, select: { id: true } }));
      if (!exists) throw new NotFoundException('Interview day not found.');
      throw new ConflictException('Invites are already being sent for this day. Wait a moment and reload.');
    }
    let sent = 0;
    let failed = 0;
    try {
      const day = await inCompany(this.tenantPrisma, ctx, (tx) => tx.interviewDay.findFirstOrThrow({ where: { id, organizationId: org }, include: { panels: true, rows: { where: { status: { in: ['assigned', 'failed'] }, panelId: { not: null }, slotStart: { not: null } } } } }));
      if (!day.rows.length) throw new BadRequestException('Nobody is waiting for an invite on this day. Use Auto-assign first.');
      for (const row of day.rows) {
        try {
          const panel = day.panels.find((p) => p.id === row.panelId)!;
          const live = await inCompany(this.tenantPrisma, ctx, (tx) => tx.pipelineEntry.findFirst({ where: { id: row.pipelineEntryId, organizationId: org, rejected: false, archivedAt: null }, select: { id: true } }));
          if (!live) throw new BadRequestException('No longer in the hiring process (rejected or archived).');
          let interviewId = row.interviewId;
          if (!interviewId) {
            const start = DateTime.fromISO(`${iso(day.day)}T00:00`, { zone: day.timeZone }).plus({ minutes: row.slotStart! });
            const made = await this.interviews.createInterview(ctx, actorUserId, row.pipelineEntryId, {
              panelistUserIds: panel.memberUserIds,
              location: panel.room,
              timeZone: day.timeZone,
              slots: [{ startsAt: start.toUTC().toISO()!, endsAt: start.plus({ minutes: day.slotMinutes }).toUTC().toISO()! }],
            });
            interviewId = made.id;
            await inCompany(this.tenantPrisma, ctx, (tx) => tx.interviewDayRow.update({ where: { id: row.id }, data: { interviewId } }));
          }
          const result = await this.interviews.sendInvite(ctx, actorUserId, interviewId);
          if (!result.sentAt) throw new Error('The invite email did not go. Send again.');
          await inCompany(this.tenantPrisma, ctx, (tx) => tx.interviewDayRow.update({ where: { id: row.id }, data: { status: 'sent', error: null, sentAt: result.sentAt } }));
          sent++;
        } catch (e) {
          failed++;
          const msg = e instanceof Error && e.message ? e.message : 'That row did not send. Send again.';
          await inCompany(this.tenantPrisma, ctx, (tx) => tx.interviewDayRow.update({ where: { id: row.id }, data: { status: 'failed', error: msg.slice(0, 300) } }));
        }
      }
    } finally {
      await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
        await tx.interviewDay.update({ where: { id }, data: { sendingAt: null, ...(sent ? { status: 'sent' } : {}) } });
        if (sent || failed) await audit(tx, c, 'ats.interview_day.sent', 'interview_day', id, { sent, failed });
      });
    }
    return { sent, failed, day: await this.get(ctx, id) };
  }

  private async jobNames(tx: Tx, c: CompanyContext, ids: string[]) {
    return new Map((await tx.job.findMany({ where: { organizationId: c.organizationId, id: { in: [...new Set(ids)] } }, select: { id: true, title: true } })).map((j) => [j.id, j.title]));
  }
}

/** A send claim older than this is a crashed run and may be taken over. */
const SEND_CLAIM_MS = 10 * 60_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
