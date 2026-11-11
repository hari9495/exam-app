import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService, resolvePermissionGrants } from '@exam-platform/shared';
import { inCompany } from '../org-structure/org-structure.service';
import { settingFor } from '../people/probation';
import { WhatsNewService, type NewsReader } from './whats-new.service';

type Tx = Prisma.TransactionClient;
export type TourId = 'employee' | 'manager' | 'payroll' | 'admin';
export type TourStatus = 'in_progress' | 'completed' | 'skipped';

/**
 * The four tours (answer 944): the version (a new version shows once more) and the page each first shows on. The words
 * are the kit's (`TOURS` in screens/settings/help.tsx); a change to them that matters to people raises the version.
 */
export const TOUR_DEFS: Record<TourId, { version: number; page: string; steps: number }> = {
  employee: { version: 1, page: '/yx/home', steps: 3 },
  manager: { version: 1, page: '/yx/approvals', steps: 3 },
  payroll: { version: 1, page: '/yx/payroll/runs', steps: 3 },
  // Answer 1001: version 2 on the set-up hub (H-6); everyone who saw version 1 sees it once more.
  admin: { version: 2, page: '/yx/settings/setup-hub', steps: 3 },
};
const ORDER: TourId[] = ['admin', 'employee', 'manager', 'payroll'];
const PAYROLL_KEYS = ['payroll.run.prepare', 'payroll.run.view'];
/** Who sets up the company: the set-up hub's own key (answer 952). */
const SETUP_KEY = 'org.settings.manage';

/**
 * Help H-5, founder answer 944: first-run tours. A tour applies once its event has happened (employee: has an employee
 * record; manager: an approval has come to them; payroll: a pay run exists and they work runs; admin: they can open
 * the set-up hub, org.settings.manage, answer 1001), shows once per tour version on its page, and can be resumed or replayed from Help › Tours. The company
 * setting help.tours.show (default on) stops every tour at the company; each person can stop them for themselves.
 */
@Injectable()
export class ToursService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly news: WhatsNewService,
  ) {}

  /** The tours whose event has happened for this person. */
  private async ready(tx: Tx, org: string, me: NewsReader): Promise<TourId[]> {
    const audiences = await this.news.audiences(tx, org, me);
    const out: TourId[] = [];
    const keys = await resolvePermissionGrants(this.prisma, this.tenantPrisma, { role: me.role ?? '', organizationId: org, permissionProfileId: me.permissionProfileId ?? null, userId: me.userId }, [...PAYROLL_KEYS, SETUP_KEY]);
    // Answer 1001: the admin tour is on the set-up hub, so it is for whoever can open the hub.
    if (keys.has(SETUP_KEY)) out.push('admin');
    if (audiences.includes('employee')) out.push('employee');
    if (await tx.wfTask.findFirst({ where: { organizationId: org, assigneeUserId: me.userId }, select: { id: true } })) out.push('manager');
    if (PAYROLL_KEYS.some((k) => keys.has(k)) && (await tx.payrollRun.findFirst({ where: { organizationId: org }, select: { id: true } }))) out.push('payroll');
    return ORDER.filter((t) => out.includes(t));
  }

  mine(ctx: TenantContext, me: NewsReader) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      if ((await settingFor(tx, c, 'help.tours.show', { legalEntityId: '' })) !== 'on') return { show: false, stopped: false, tours: [] };
      const ready = await this.ready(tx, c.organizationId, me);
      const rows = await tx.tourProgress.findMany({ where: { organizationId: c.organizationId, userId: me.userId } });
      const stopped = rows.some((r) => r.tourId === 'all' && r.status === 'stopped');
      return {
        show: true,
        stopped,
        tours: ready.map((id) => {
          const d = TOUR_DEFS[id];
          const p = rows.find((r) => r.tourId === id && r.version === d.version);
          return { id, version: d.version, page: d.page, status: (p?.status ?? null) as TourStatus | null, step: p?.step ?? 0 };
        }),
      };
    });
  }

  /** Saves where the person is in a tour (only a tour that applies to them, at its current version). */
  async save(ctx: TenantContext, me: NewsReader, id: string, dto: { version: number; status: TourStatus; step: number }) {
    const def = TOUR_DEFS[id as TourId];
    if (!def) throw new BadRequestException('No such tour.');
    if (dto.version !== def.version) throw new BadRequestException('This tour has changed. Open Help › Tours again.');
    if (dto.step >= def.steps) throw new BadRequestException(`This tour has ${def.steps} steps.`);
    await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      if (!(await this.ready(tx, c.organizationId, me)).includes(id as TourId)) throw new BadRequestException('This tour is not for you yet.');
      const key = { organizationId: c.organizationId, userId: me.userId, tourId: id, version: def.version };
      await tx.tourProgress.upsert({ where: { organizationId_userId_tourId_version: key }, create: { ...key, status: dto.status, step: dto.step }, update: { status: dto.status, step: dto.step } });
    });
    return this.mine(ctx, me);
  }

  /** The person stops tours for themselves (or starts them again). Replay from Help still works while stopped. */
  async setStopped(ctx: TenantContext, me: NewsReader, stopped: boolean) {
    await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const key = { organizationId: c.organizationId, userId: me.userId, tourId: 'all', version: 0 };
      if (stopped) await tx.tourProgress.upsert({ where: { organizationId_userId_tourId_version: key }, create: { ...key, status: 'stopped' }, update: { status: 'stopped' } });
      else await tx.tourProgress.deleteMany({ where: key });
    });
    return this.mine(ctx, me);
  }
}
