import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import type { ScopeUser, Viewer } from '../access/scope';
import { localOf } from '../documents/payslip-languages';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StatutoryRulesService } from '../statutory/statutory.service';
import { inForce } from '../statutory/evaluator';
import { dateOf } from '../time/time-core';
import type { ConfirmationDto } from './dto';
import type { QueryRaiseDto, QueryUpdateDto } from './dto-5d';
import { entitiesFor, payHolders, payScope, payViewer, requireSelf, withPayScope } from './pay-access';
import { payslipValues, renderPayslipPdf, type SlipData } from './payslip-pdf';
import { sha256 } from './pay-file-store';

// Payslips to employees (M03-BUILD-DESIGN §9.8, §11.1, PAY-4.04 … 4.06): publish an approved run (step-up, typed phrase)
// with an in-app notice (no amounts outside the app, P04 Q6); the employee's own payslips and a single-use 60-second link
// to the PDF, rendered from the stored lines with a name / time watermark and audited with its hash; the PDF by email
// when the company turns it on (password protected, YX-NTF-15); payslip queries between the employee and payroll.

const LINK_SECONDS = 60;
const EMAIL_LINK_DAYS = 7;
const tokenHash = (t: string) => createHash('sha256').update(t).digest('hex');
const istNow = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 16).replace('T', ' ');
type Slip = Prisma.PayslipGetPayload<object>;
type Reply = { by: string; byName: string; side: 'employee' | 'payroll'; at: string; text: string };

@Injectable()
export class PayslipsService {
  private readonly logger = new Logger(PayslipsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly rules: StatutoryRulesService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
  ) {}

  private async viewer(user: ScopeUser) {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    requireSelf(v);
    return v;
  }

  /** The signed-in person's employee records (their login, or a person merged into it). */
  private async mine(tx: Tx): Promise<string[]> {
    const [{ ids }] = await tx.$queryRaw<{ ids: string[] }[]>`SELECT app_current_employee_ids()::text[] AS ids`;
    return ids ?? [];
  }

  /** Which of these runs are published (a definer function: the runs table is payroll staff's). */
  private async published(tx: Tx, org: string, runIds: string[]): Promise<Set<string>> {
    if (!runIds.length) return new Set();
    const [{ ids }] = await tx.$queryRaw<{ ids: string[] }[]>`SELECT payroll_runs_published(${org}::uuid, ${[...new Set(runIds)]}::uuid[])::text[] AS ids`;
    return new Set(ids ?? []);
  }

  /** The person's own published, approved payslip; anything else is "not found". */
  private async ownSlip(tx: Tx, c: CompanyContext, id: string) {
    const me = await this.mine(tx);
    const s = await tx.payslip.findFirst({ where: { organizationId: c.organizationId, id, employeeId: { in: me }, status: 'approved' } });
    if (!s || !s.runId || !(await this.published(tx, c.organizationId, [s.runId])).has(s.runId)) throw new NotFoundException('Not found');
    return s;
  }

  // ------------------------------------------------------------------------------------------ publish (PAY-4.04)

  async publish(ctx: TenantContext, user: ScopeUser, runId: string, confirmation: ConfirmationDto) {
    const v = await this.viewer(user);
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const ids = await entitiesFor(tx, c, v, 'payroll.payslip.publish');
      await payScope(tx, ids);
      await tx.$queryRaw`SELECT id FROM payroll_runs WHERE organization_id = ${org}::uuid AND id = ${runId}::uuid FOR UPDATE`;
      const run = await tx.payrollRun.findFirst({ where: { organizationId: org, id: runId } });
      if (!run || !ids.includes(run.legalEntityId)) throw new NotFoundException('Not found');
      if (!['approved', 'paid'].includes(run.status)) throw new ConflictException('Payslips are published once the payroll is approved.');
      if (run.publishedAt) throw new ConflictException('These payslips are already published.');
      const slips = await tx.payslip.findMany({ where: { organizationId: org, runId: run.id, calcVersion: run.calcVersion, status: 'approved' } });
      const phrase = `PUBLISH ${slips.length}`;
      if (confirmation.phrase !== phrase) throw new BadRequestException(`Type ${phrase} to confirm.`);
      await tx.payrollRun.update({ where: { id: run.id }, data: { publishedAt: new Date(), version: { increment: 1 } } });
      await audit(tx, c, 'payslip.published', 'payroll_run', run.id, { people: slips.length, confirmed: { phrase: confirmation.phrase, impact: confirmation.impact } });
      const people = await tx.employee.findMany({ where: { organizationId: org, id: { in: slips.map((s) => s.employeeId) } }, select: { id: true, userId: true } });
      const emailOn = (await settingFor(tx, c, 'payroll.payslip_email', { legalEntityId: run.legalEntityId })) === 'on';
      return { run, slips, users: people.map((p) => p.userId).filter((u): u is string => Boolean(u)), emailOn };
    });
    const org = ctx.organizationId!;
    const month = dateOf(out.run.periodStart).slice(0, 7);
    await this.notifications
      .notifySystem(
        { organizationId: org, isSuperAdmin: false },
        out.users,
        'payroll.payslip.published',
        { entityType: 'payroll_run', entityId: out.run.id, contextText: `Your payslip for ${month} is ready.`, linkPath: '/yx/me/payslips' },
        { subject: 'Your payslip is ready', html: '<p>Your payslip is ready. Open YukthiX to see it.</p>' },
      )
      .catch((e) => this.logger.warn(`payslip notices: ${(e as Error).message}`));
    const emailed = out.emailOn ? await this.emailAll(org, out.slips) : null;
    return { id: out.run.id, publishedPeople: out.slips.length, emailed };
  }

  /**
   * PAY-4.05 with founder decision 5e-D1 (9 Oct 2026): never a PDF by email. Each employee with an active sign-in gets a link
   * to their payslip in the app: it works only after they sign in, only for them, only for that payslip, and expires.
   * The email has no pay figures (P04 Q6).
   * ponytail: sent one by one after publishing; move to a queue if a run's emails take too long.
   */
  private async emailAll(org: string, slips: Slip[]) {
    const base = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '');
    let sent = 0;
    let noEmail = 0;
    for (const s of slips) {
      try {
        const r = await this.tenantPrisma.forTenant({ organizationId: org, isSuperAdmin: false }, async (tx) => {
          await payScope(tx, [s.legalEntityId]);
          const e = await tx.employee.findFirst({ where: { organizationId: org, id: s.employeeId }, select: { userId: true } });
          const u = e?.userId ? await tx.user.findFirst({ where: { organizationId: org, id: e.userId, status: 'active' }, select: { id: true, email: true } }) : null;
          if (!u?.email) return null;
          const token = randomBytes(32).toString('base64url');
          await tx.payslipLink.create({
            data: {
              organizationId: org,
              legalEntityId: s.legalEntityId,
              employeeId: s.employeeId,
              payslipId: s.id,
              tokenHash: tokenHash(token),
              userId: u.id,
              purpose: 'view',
              expiresAt: new Date(Date.now() + EMAIL_LINK_DAYS * 86_400_000),
            },
          });
          return { to: u.email, token };
        });
        if (!r) {
          noEmail++;
          continue;
        }
        const month = new Date(`${dateOf(s.periodStart).slice(0, 7)}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
        await this.email.send({
          to: r.to,
          subject: `Your payslip for ${month} is ready`,
          html: `<p>Your payslip for ${month} is ready in YukthiX.</p><p><a href="${base}/yx/me/payslips?open=${r.token}">Open your payslip</a> (you sign in first). The link works for ${EMAIL_LINK_DAYS} days and only for you.</p>`,
        });
        sent++;
      } catch (e) {
        noEmail++;
        this.logger.warn(`payslip email ${s.id}: ${(e as Error).message}`);
      }
    }
    return { sent, noEmail };
  }

  /** The emailed link (5e-D1): only the person it was sent to, once signed in, within its days; it opens that one payslip. */
  async openEmailLink(ctx: TenantContext, user: ScopeUser, token: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const l = await tx.payslipLink.findFirst({ where: { organizationId: c.organizationId, tokenHash: tokenHash(token), purpose: 'view' } });
      if (!l || l.userId !== v.userId || l.expiresAt < new Date()) throw new NotFoundException('This link has expired or is not yours. Your payslips are under Me › Payslips.');
      const s = await this.ownSlip(tx, c, l.payslipId);
      if (!l.usedAt) await tx.payslipLink.update({ where: { id: l.id }, data: { usedAt: new Date() } });
      await audit(tx, c, 'payroll.payslip.email_link_opened', 'payslip', s.id, { employeeId: s.employeeId });
      return { payslipId: s.id, month: dateOf(s.periodStart).slice(0, 7) };
    });
  }

  // ------------------------------------------------------------------------------------------ the employee's payslips

  async mySlips(ctx: TenantContext, user: ScopeUser) {
    await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const me = await this.mine(tx);
      const slips = await tx.payslip.findMany({
        where: { organizationId: c.organizationId, employeeId: { in: me }, status: 'approved', runId: { not: null } },
        orderBy: { periodStart: 'desc' },
        take: 120,
      });
      const pub = await this.published(
        tx,
        c.organizationId,
        slips.map((s) => s.runId!),
      );
      return slips
        .filter((s) => pub.has(s.runId!))
        .map((s) => ({
          id: s.id,
          month: dateOf(s.periodStart).slice(0, 7),
          runType: s.runType,
          gross: s.gross.toFixed(2),
          deductions: s.deductions.toFixed(2),
          net: s.net.toFixed(2),
          paymentStatus: s.paymentStatus,
          verify: s.verify,
        }));
    });
  }

  /** A single-use link (60 seconds) to the PDF of one's own published payslip; asking for it is audited. */
  async pdfLink(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await this.ownSlip(tx, c, id);
      const token = randomBytes(32).toString('base64url');
      await tx.payslipLink.create({
        data: {
          organizationId: c.organizationId,
          legalEntityId: s.legalEntityId,
          employeeId: s.employeeId,
          payslipId: s.id,
          tokenHash: tokenHash(token),
          userId: v.userId!,
          expiresAt: new Date(Date.now() + LINK_SECONDS * 1000),
        },
      });
      await audit(tx, c, 'payroll.payslip.link_issued', 'payslip', s.id, { employeeId: s.employeeId });
      return { path: `/payroll/payslip-downloads/${token}`, expiresInSeconds: LINK_SECONDS };
    });
  }

  /** Uses the link once, as the person it was made for; the PDF is drawn from the stored lines and watermarked. */
  async download(ctx: TenantContext, user: ScopeUser, token: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const gone = () => new NotFoundException('This link has been used or has expired. Ask for a new one.');
      const l = await tx.payslipLink.findFirst({ where: { organizationId: c.organizationId, tokenHash: tokenHash(token), purpose: 'pdf' } });
      if (!l || l.userId !== v.userId || l.usedAt || l.expiresAt < new Date()) throw gone();
      if (!(await tx.payslipLink.updateMany({ where: { id: l.id, usedAt: null }, data: { usedAt: new Date() } })).count) throw gone();
      const s = await this.ownSlip(tx, c, l.payslipId);
      const me = await tx.user.findFirst({ where: { organizationId: c.organizationId, id: v.userId! }, select: { name: true, email: true } });
      const file = await this.render(tx, c.organizationId, s, { watermark: `${me?.name || me?.email || 'Employee'} · downloaded ${istNow()} IST` });
      await audit(tx, c, 'payroll.payslip.downloaded', 'payslip', s.id, { employeeId: s.employeeId, sha256: sha256(file), resultHash: s.resultHash });
      return { file, name: `payslip-${dateOf(s.periodStart).slice(0, 7)}.pdf`, contentType: 'application/pdf' };
    });
  }

  /** Draws one payslip from its stored lines with the entity's active layout (every wage-slip particular shown). */
  private async render(tx: Tx, org: string, s: Slip, opts: { watermark?: string; password?: string }) {
    const month = dateOf(s.periodStart).slice(0, 7);
    const lines = await tx.payslipLine.findMany({ where: { organizationId: org, payslipId: s.id }, orderBy: { position: 'asc' } });
    const [entity, employee, employment, bank] = await Promise.all([
      tx.legalEntity.findFirstOrThrow({ where: { organizationId: org, id: s.legalEntityId }, select: { name: true } }),
      tx.employee.findFirstOrThrow({ where: { organizationId: org, id: s.employeeId }, select: { givenName: true, familyName: true } }),
      tx.employment.findFirstOrThrow({ where: { organizationId: org, id: s.employmentId }, select: { employeeCode: true } }),
      tx.employeeBankAccount.findFirst({ where: { organizationId: org, employeeId: s.employeeId, purpose: 'salary', validTo: null }, select: { accountLast4: true } }),
    ]);
    const asg = await tx.employeeAssignment.findFirst({
      where: { organizationId: org, employmentId: s.employmentId, supersededAt: null, validFrom: { lte: s.periodStart } },
      orderBy: { validFrom: 'desc' },
      select: { designationId: true },
    });
    const designation = asg ? ((await tx.designation.findFirst({ where: { organizationId: org, id: asg.designationId }, select: { name: true } }))?.name ?? '') : '';
    const layout = await withPayScope(tx, [s.legalEntityId], () =>
      tx.payslipLayout.findFirst({ where: { organizationId: org, legalEntityId: s.legalEntityId, status: 'active' }, orderBy: { version: 'desc' } }),
    );
    const mandatory = (inForce(await this.rules.published(), 'IN.WAGESLIP', ['IN'], `${month}-01`)?.values.mandatory as { key: string; label: string }[] | undefined) ?? [];
    const blocks = [...((layout?.blocks as { key: string; shown: boolean }[] | undefined) ?? [])];
    for (const m of mandatory) if (!blocks.some((b) => b.key === m.key && b.shown)) blocks.push({ key: m.key, shown: true });
    const data: SlipData = {
      employerName: entity.name,
      employeeName: [employee.givenName, employee.familyName].filter(Boolean).join(' '),
      employeeCode: employment.employeeCode,
      designation,
      month,
      gross: s.gross.toFixed(2),
      deductions: s.deductions.toFixed(2),
      net: s.net.toFixed(2),
      lines: lines.map((l) => ({ code: l.componentCode, name: l.name, kind: l.kind, amount: l.amount.toFixed(2), quantity: l.quantity?.toFixed(2) ?? null })),
      bankLast4: bank?.accountLast4 ?? null,
      resultHash: s.resultHash,
    };
    const labels = Object.fromEntries(mandatory.map((m) => [m.key, m.label]));
    return renderPayslipPdf(blocks, labels, localOf(layout?.languages), payslipValues(data), { title: `Payslip ${month}`, keywords: `result:${s.resultHash}`, ...opts });
  }

  // ------------------------------------------------------------------------------------------ payslip queries (PAY-4.06)

  async raise(ctx: TenantContext, user: ScopeUser, payslipId: string, dto: QueryRaiseDto) {
    const v = await this.viewer(user);
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await this.ownSlip(tx, c, payslipId);
      if (dto.lineCode && !(await tx.payslipLine.count({ where: { organizationId: c.organizationId, payslipId: s.id, componentCode: dto.lineCode } })))
        throw new BadRequestException('That line is not on this payslip.');
      const q = await tx.payslipQuery.create({
        data: { organizationId: c.organizationId, legalEntityId: s.legalEntityId, employeeId: s.employeeId, payslipId: s.id, lineCode: dto.lineCode ?? null, text: dto.text, raisedBy: v.userId! },
      });
      await audit(tx, c, 'payslip.query.raised', 'payslip_query', q.id, { payslipId: s.id, lineCode: q.lineCode });
      return { id: q.id, handlers: (await payHolders(tx, c.organizationId, 'payroll.query.handle', s.legalEntityId, todayIst())).filter((u) => u !== v.userId) };
    });
    await this.notifications
      .notifySystem(
        { organizationId: ctx.organizationId!, isSuperAdmin: false },
        out.handlers,
        'payslip.query.raised',
        { entityType: 'payslip_query', entityId: out.id, contextText: 'An employee asked about their payslip.', linkPath: '/yx/payroll/payslip-queries' },
        { subject: 'A payslip query is waiting', html: '<p>An employee asked about their payslip. Open YukthiX to answer.</p>' },
      )
      .catch(() => undefined);
    return { id: out.id, status: 'open' };
  }

  private view(q: Prisma.PayslipQueryGetPayload<object>, mine: boolean) {
    return {
      id: q.id,
      payslipId: q.payslipId,
      employeeId: q.employeeId,
      lineCode: q.lineCode,
      text: q.text,
      status: q.status,
      assigneeUserId: q.assigneeUserId,
      replies: q.replies,
      createdAt: q.createdAt,
      updatedAt: q.updatedAt,
      mine,
    };
  }

  /** Payroll staff see their entities' queries (not their own, which they see as the employee); everyone sees their own. */
  async list(ctx: TenantContext, user: ScopeUser, status?: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = await entitiesFor(tx, c, v, 'payroll.query.handle');
      await payScope(tx, ids);
      const me = await this.mine(tx);
      const rows = await tx.payslipQuery.findMany({
        where: { organizationId: c.organizationId, ...(status ? { status } : {}), OR: [{ legalEntityId: { in: ids } }, { employeeId: { in: me } }] },
        orderBy: { updatedAt: 'desc' },
        take: 300,
      });
      return rows.map((q) => this.view(q, me.includes(q.employeeId)));
    });
  }

  /** The employee adds a reply or closes their own query; payroll replies, assigns and closes others' (never their own). */
  async update(ctx: TenantContext, user: ScopeUser, id: string, dto: QueryUpdateDto) {
    const v = await this.viewer(user);
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const ids = await entitiesFor(tx, c, v, 'payroll.query.handle');
      await payScope(tx, ids);
      const me = await this.mine(tx);
      await tx.$queryRaw`SELECT id FROM payslip_queries WHERE organization_id = ${org}::uuid AND id = ${id}::uuid FOR UPDATE`;
      const q = await tx.payslipQuery.findFirst({ where: { organizationId: org, id } });
      if (!q) throw new NotFoundException('Not found');
      const own = me.includes(q.employeeId);
      const staff = !own && ids.includes(q.legalEntityId);
      if (!own && !staff) throw new NotFoundException('Not found');
      if (own && (dto.assigneeUserId || (dto.status && dto.status !== 'closed'))) throw new ForbiddenException('You can reply to or close your own query; payroll answers it.');
      if (!dto.reply && !dto.status && !dto.assigneeUserId) throw new BadRequestException('Reply, change the status or assign the query.');
      if (q.status === 'closed' && dto.status !== 'open') throw new ConflictException('This query is closed.');
      if (dto.reply && ((q.replies as Reply[]) ?? []).length >= 50) throw new ConflictException('This query has 50 replies; close it and raise a new one.');
      if (dto.assigneeUserId && !(await payHolders(tx, org, 'payroll.query.handle', q.legalEntityId, todayIst())).includes(dto.assigneeUserId))
        throw new BadRequestException('Assign the query to someone who handles payslip queries for this entity.');
      const name = (await tx.user.findFirst({ where: { organizationId: org, id: v.userId! }, select: { name: true, email: true } })) ?? { name: '', email: '' };
      const replies = [
        ...((q.replies as Reply[]) ?? []),
        ...(dto.reply ? [{ by: v.userId!, byName: name.name || name.email, side: own ? 'employee' : 'payroll', at: new Date().toISOString(), text: dto.reply } as Reply] : []),
      ];
      const status = dto.status ?? (dto.reply && staff && q.status === 'open' ? 'answered' : dto.reply && own && q.status === 'answered' ? 'open' : q.status);
      const row = await tx.payslipQuery.update({
        where: { id },
        data: { replies: replies as unknown as Prisma.InputJsonValue, status, assigneeUserId: dto.assigneeUserId ?? q.assigneeUserId, updatedAt: new Date() },
      });
      await audit(tx, c, 'payslip.query.updated', 'payslip_query', id, { status, replied: Boolean(dto.reply), assigned: dto.assigneeUserId ?? null, side: own ? 'employee' : 'payroll' });
      const to = staff ? [(await tx.employee.findFirst({ where: { organizationId: org, id: q.employeeId }, select: { userId: true } }))?.userId] : [q.assigneeUserId];
      return { view: this.view(row, own), to: to.filter((u): u is string => Boolean(u) && u !== v.userId), staff };
    });
    if (out.to.length)
      await this.notifications
        .notifySystem(
          { organizationId: ctx.organizationId!, isSuperAdmin: false },
          out.to,
          'payslip.query.updated',
          {
            entityType: 'payslip_query',
            entityId: id,
            contextText: out.staff ? 'Payroll answered your payslip query.' : 'An employee replied to a payslip query.',
            linkPath: out.staff ? '/yx/me/payslips' : '/yx/payroll/payslip-queries',
          },
          { subject: 'A payslip query was updated', html: '<p>A payslip query was updated. Open YukthiX to see it.</p>' },
        )
        .catch(() => undefined);
    return out.view;
  }
}
