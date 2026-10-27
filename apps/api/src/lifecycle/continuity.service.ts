import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit } from '../org-structure/org-structure.service';
import type { ScopeUser } from '../access/scope';
import type { ChangePayload, TransferOptions } from '../employee-history/history-rules';
import { AutomationService } from '../rules-engine/automation.service';
import { LifecycleJourneysService } from './journeys.service';
import { STARTERS } from './starters';

// PPL-10 (P01 YX-ORG-17; founder 27 Oct 2026): a move to another legal entity starts its continuity checklist, the
// payroll, finance and HR tasks that carry the person over (PF UAN, ESI IP, Form 12B, declarations, loans, leave,
// gratuity). It runs on the journey engine (kind "continuity"): the company's own active checklist, else a copy of
// the YukthiX starter made on first use (HR edits or turns it off in Settings › Checklists). Tasks the transfer's
// options make moot close themselves with the reason. Payroll pre-flight warns while items are open.

const iso = (d: Date) => d.toISOString().slice(0, 10);

@Injectable()
export class ContinuityService implements OnModuleInit {
  private readonly logger = new Logger(ContinuityService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly automation: AutomationService,
    private readonly journeys: LifecycleJourneysService,
  ) {}

  onModuleInit() {
    this.automation.subscribe(async (ev) => {
      if (ev.type !== 'employee.entity_transferred' || typeof ev.payload.changeId !== 'string') return;
      await this.start(ev.organizationId, ev.payload.changeId).catch((e: unknown) => this.logger.warn(`continuity ${String(ev.payload.changeId)}: ${(e as Error).message}`));
    });
  }

  /** Starts the checklist of one move (once; none when the company turned its checklists off). */
  async start(organizationId: string, changeId: string): Promise<string | null> {
    const ctx: CompanyContext = { organizationId, isSuperAdmin: false };
    const id = await this.tenantPrisma.forTenant(ctx, (tx) => this.startIn(tx, ctx, changeId));
    if (id) await this.journeys.afterStart(ctx, id, null, 'inter-entity transfer');
    return id;
  }

  private async startIn(tx: Tx, c: CompanyContext, changeId: string): Promise<string | null> {
    const org = c.organizationId;
    if (await tx.journey.findFirst({ where: { organizationId: org, kind: 'continuity', subjectId: changeId }, select: { id: true } })) return null;
    const ch = await tx.employeeChange.findFirst({ where: { organizationId: org, id: changeId, changeType: 'entity_transfer', status: 'effective' } });
    const t = (ch?.payload as ChangePayload | undefined)?.transfer;
    if (!ch || !t) return null;
    const date = iso(ch.effectiveDate);
    const next = await tx.employment.findFirst({ where: { organizationId: org, employeeId: ch.employeeId, rehireOf: ch.employmentId }, orderBy: { joinedOn: 'desc' } });
    const emp = await tx.employee.findFirst({ where: { organizationId: org, id: ch.employeeId }, select: { personId: true, userId: true } });
    const asg = next ? await tx.employeeAssignment.findFirst({ where: { organizationId: org, employmentId: next.id, supersededAt: null }, orderBy: { validFrom: 'asc' } }) : null;
    if (!emp || !asg) return null;
    await this.ensureTemplate(tx, c);
    const place = { legalEntityId: asg.legalEntityId, locationId: asg.locationId, departmentId: asg.departmentId };
    const template = await this.journeys.pickTemplate(tx, org, 'continuity', place).catch(() => null);
    if (!template) return null; // the company turned its continuity checklists off
    const j = await this.journeys.startIn(tx, c, { kind: 'continuity', personId: emp.personId, subjectType: 'employee_change', subjectId: ch.id, anchorOn: date, templateId: template.id, place, ownerUserId: ch.decidedBy ?? template.createdBy, managerEmployeeId: asg.managerEmployeeId, personUserId: emp.userId });
    const o = t.options as TransferOptions;
    const openLoans = await tx.loan.count({ where: { organizationId: org, employmentId: ch.employmentId, status: 'active', outstanding: { gt: 0 } } });
    const moot: Record<string, string | null> = {
      leave: o.leave === 'carry' ? 'Carried over: the balance stays on the person’s leave ledger.' : null,
      gratuity: o.service === 'continue' ? 'Service continues: one payout at the final exit.' : null,
      settlement: o.settlement === 'none' ? 'None: amounts move over.' : null,
      structure: o.structure === 'keep' ? 'The salary structure is kept.' : null,
      loans: openLoans ? null : 'No open loans or advances.',
    };
    for (const [key, note] of Object.entries(moot)) {
      if (!note) continue;
      await tx.journeyTask.updateMany({ where: { organizationId: org, journeyId: j.id, key, status: { in: ['open', 'waiting'] } }, data: { status: 'done', completedAt: new Date(), answers: { note } as Prisma.InputJsonValue, version: { increment: 1 } } });
    }
    await this.journeys.refresh(tx, c, j.id);
    return j.id;
  }

  /** The starter as the company's checklist the first time it is needed (always on); never again once there is one. */
  private async ensureTemplate(tx: Tx, c: CompanyContext) {
    const org = c.organizationId;
    if (await tx.journeyTemplate.findFirst({ where: { organizationId: org, kind: 'continuity' }, select: { id: true } })) return;
    const s = STARTERS.find((x) => x.key === 'continuity_standard')!;
    const t = await tx.journeyTemplate.create({ data: { organizationId: org, kind: s.kind, name: s.name.replace(' (starter)', ''), starterKey: s.key, active: true } });
    await tx.journeyTemplateTask.createMany({
      data: s.tasks.map((x, i) => ({ organizationId: org, templateId: t.id, key: x.key, title: x.title, ownerType: x.ownerType, kind: x.kind, config: {}, dueOffsetDays: x.dueOffsetDays, dependsOn: [], required: x.required ?? true, locked: false, sortOrder: i })),
    });
    await audit(tx, c, 'journey.template.created', 'journey_template', t.id, { kind: s.kind, tasks: s.tasks.length, starterKey: s.key });
  }

  /** PPL-10: the checklist of a move with the move's header (who sees it: as the journey says). */
  async view(ctx: TenantContext, user: ScopeUser, changeId: string) {
    const head = await this.tenantPrisma.forTenant(ctx, async (tx) => {
      const org = ctx.organizationId!;
      const j = await tx.journey.findFirst({ where: { organizationId: org, kind: 'continuity', subjectId: changeId }, select: { id: true } });
      const ch = await tx.employeeChange.findFirst({ where: { organizationId: org, id: changeId, changeType: 'entity_transfer' } });
      const from = ch ? await tx.employment.findFirst({ where: { organizationId: org, id: ch.employmentId }, select: { legalEntityId: true } }) : null;
      const to = (ch?.payload as ChangePayload | undefined)?.transfer?.legalEntityId;
      const names = await tx.legalEntity.findMany({ where: { organizationId: org, id: { in: [from?.legalEntityId ?? '', to ?? ''].filter(Boolean) } }, select: { id: true, name: true } });
      return j && ch ? { journeyId: j.id, effectiveDate: iso(ch.effectiveDate), status: ch.status, from: names.find((n) => n.id === from?.legalEntityId)?.name ?? '', to: names.find((n) => n.id === to)?.name ?? '' } : null;
    });
    if (!head) throw new NotFoundException('No such checklist.');
    const { journeyId, ...move } = head;
    return { move, journey: await this.journeys.journey(ctx, user, journeyId) };
  }
}
