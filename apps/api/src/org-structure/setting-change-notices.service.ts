import { Injectable, Logger } from '@nestjs/common';
import { AuditService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { NotificationsService } from '../notifications/notifications.service';
import { escapeHtml } from '../notifications/notification-email-render';
import { todayIst } from './org-validation';
import { LAPSE_DAYS_KEY, SETTINGS } from './settings-registry';
import type { Tx } from './org-structure.service';

const LOOKUP: TenantContext = { organizationId: null, isSuperAdmin: true };
const KEY = 'org.settings.manage';

/** The Settings page a payroll setting is on (S-3), for the notice's link. */
const pageOf = (key: string) => (key.startsWith('tax.') ? '/yx/settings/payroll/tax' : key === 'payroll.payslip_email' || key === 'payroll.document_retention_years' ? '/yx/settings/payroll/payslip-layout' : '/yx/settings/payroll/payroll-policies');
const labelOf = (key: string) => SETTINGS[key]?.label ?? key;

/**
 * Answers 1522 and 1523: who hears about payroll setting changes that wait for a second person (S-3, answer 1325).
 * The others with HR's settings key get a bell notice and an email when a change waits (never the person who asked);
 * the person who asked hears the decision, or that it lapsed. Waiting changes lapse after payroll.settings.lapse_days
 * (default 14) in IST days, by the nightly sweep, audited as the system.
 */
@Injectable()
export class SettingChangeNoticesService {
  private readonly logger = new Logger(SettingChangeNoticesService.name);
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Active people who hold HR's settings key: System Admins, profiles with it, and role grants in force today. */
  private async holders(tx: Tx, org: string): Promise<string[]> {
    const today = todayIst();
    const like = `%"${KEY}"%`;
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT u.id::text FROM users u WHERE u.organization_id = ${org}::uuid AND u.status = 'active' AND u.role = 'org_admin'
      UNION
      SELECT u.id::text FROM users u JOIN permission_profiles p ON p.organization_id = u.organization_id AND p.id = u.permission_profile_id
      WHERE u.organization_id = ${org}::uuid AND u.status = 'active' AND p.permissions_json LIKE ${like}
      UNION
      SELECT g.user_id::text FROM role_grants g
      JOIN permission_profiles p ON p.organization_id = g.organization_id AND p.id = g.permission_profile_id
      JOIN users u ON u.organization_id = g.organization_id AND u.id = g.user_id AND u.status = 'active'
      WHERE g.organization_id = ${org}::uuid AND g.status = 'active' AND p.permissions_json LIKE ${like}
        AND g.valid_from <= ${today}::date AND (g.valid_to IS NULL OR g.valid_to >= ${today}::date)`;
    return rows.map((r) => r.id);
  }

  /** 1522: a change waits; everyone else with HR's settings key is told (notify never tells the actor). */
  async waiting(ctx: TenantContext, requesterId: string, req: { id: string; key: string; value: string }) {
    try {
      const { to, name } = await this.tenantPrisma.forTenant(ctx, async (tx) => ({
        to: (await this.holders(tx, ctx.organizationId!)).filter((u) => u !== requesterId),
        name: (await tx.user.findFirst({ where: { id: requesterId }, select: { name: true } }))?.name ?? 'Someone',
      }));
      const text = `${name} asks to change "${labelOf(req.key)}" to ${req.value}. Another person with HR's settings key approves or rejects it.`;
      await this.notifications.notify(ctx, requesterId, to, 'settings.change.waiting', { entityType: 'setting_change_request', entityId: req.id, contextText: text, linkPath: pageOf(req.key) });
    } catch (e) {
      this.logger.error(`Telling HR about a waiting payroll setting change failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** 1522: the person who asked hears the decision (a withdrawal is their own: notify skips them). */
  async decided(ctx: TenantContext, deciderId: string, req: { id: string; key: string; value: string; requestedBy: string }, outcome: 'approved' | 'rejected') {
    const text = outcome === 'approved' ? `Your change to "${labelOf(req.key)}" (${req.value}) was approved and applies now.` : `Your change to "${labelOf(req.key)}" (${req.value}) was rejected. Nothing changed.`;
    await this.notifications
      .notify(ctx, deciderId, [req.requestedBy], 'settings.change.decided', { entityType: 'setting_change_request', entityId: req.id, contextText: text, linkPath: pageOf(req.key) })
      .catch((e: unknown) => this.logger.error(e));
  }

  /**
   * 1523 (nightly sweep 'settings-change-lapse', 02:00 IST): a change still waiting more than N IST days after it was
   * asked (N = the company's payroll.settings.lapse_days, default 14) lapses: nothing changes, audited as the system, and
   * the person who asked is told. A rerun finds nothing new (only waiting changes are touched).
   */
  async lapseSweep(now = new Date(), only?: string[]): Promise<number> {
    const orgs = await this.tenantPrisma.forTenant(LOOKUP, (tx) => tx.settingChangeRequest.groupBy({ by: ['organizationId'], where: { status: 'pending', ...(only ? { organizationId: { in: only } } : {}) } }));
    let lapsed = 0;
    for (const { organizationId } of orgs) {
      const ctx: TenantContext = { organizationId, isSuperAdmin: false };
      try {
        const out = await this.tenantPrisma.forTenant(ctx, async (tx) => {
          const v = (await tx.setting.findFirst({ where: { organizationId, key: LAPSE_DAYS_KEY, scopeType: 'tenant', validFrom: null } }))?.value;
          const days = Number(v ?? SETTINGS[LAPSE_DAYS_KEY]!.default);
          const cutoff = todayIst(new Date(now.getTime() - days * 86_400_000));
          const due = (await tx.settingChangeRequest.findMany({ where: { organizationId, status: 'pending' } })).filter((r) => todayIst(r.requestedAt) < cutoff);
          const done: typeof due = [];
          for (const r of due) {
            const { count } = await tx.settingChangeRequest.updateMany({ where: { id: r.id, status: 'pending' }, data: { status: 'lapsed', decidedAt: now } });
            if (!count) continue;
            await AuditService.recordIn(tx, ctx, { actorUserId: null, action: 'org.setting.change_lapsed', entityType: 'setting_change_request', entityId: r.id, metadata: { key: r.key, to: r.value, requestedBy: r.requestedBy, [LAPSE_DAYS_KEY]: days } });
            done.push(r);
          }
          return { done, days };
        });
        for (const r of out.done) {
          const text = `Your change to "${labelOf(r.key)}" (${String(r.value)}) lapsed: nobody decided it within ${out.days} days. Nothing changed; ask again if it is still needed.`;
          await this.notifications
            .notifySystem(ctx, [r.requestedBy], 'settings.change.decided', { entityType: 'setting_change_request', entityId: r.id, contextText: text, linkPath: pageOf(r.key) }, { subject: 'A payroll setting change lapsed', html: `<p>${escapeHtml(text)}</p>` })
            .catch((e: unknown) => this.logger.error(e));
          lapsed++;
        }
      } catch (e) {
        this.logger.error(`Lapsing payroll setting changes failed for ${organizationId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return lapsed;
  }
}
