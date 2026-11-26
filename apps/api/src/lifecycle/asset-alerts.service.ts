import { Injectable, Logger } from '@nestjs/common';
import { TenantPrismaService } from '@exam-platform/shared';
import { Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { companyKeyHolders } from '../access/key-holders';
import { NotificationsService } from '../notifications/notifications.service';
import { escapeHtml } from '../notifications/notification-email-render';
import { addMonthsIso } from './asset-categories';

// IT assets part 2 (founder answer 2714): the asset managers of an asset's place are told once, a company-set number of
// days (asset.warranty_alert_days, 30 by default; "off" tells nobody) before its warranty ends. The warranty end told
// about is remembered on the asset (warranty_alerted_for), so a changed warranty is told again. Daily (scheduled sweeps).

/** The widest choice of asset.warranty_alert_days: the sweep looks no further ahead. */
const MAX_DAYS = 90;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Active people with asset.manage over this place today: company-wide, or a grant on its legal entity or location. */
export async function assetManagers(tx: Tx, org: string, place: { legalEntityId: string | null; locationId: string | null }, today: string): Promise<string[]> {
  const like = '%"asset.manage"%';
  const placed = await tx.$queryRaw<{ id: string }[]>`
    SELECT g.user_id::text AS id FROM role_grants g JOIN permission_profiles p ON p.organization_id = g.organization_id AND p.id = g.permission_profile_id
    JOIN users u ON u.organization_id = g.organization_id AND u.id = g.user_id AND u.status = 'active'
    WHERE g.organization_id = ${org}::uuid AND g.status = 'active' AND p.permissions_json LIKE ${like}
      AND g.valid_from <= ${today}::date AND (g.valid_to IS NULL OR g.valid_to >= ${today}::date)
      AND ((g.scope_type = 'legal_entity' AND g.legal_entity_id = ${place.legalEntityId}::uuid) OR (g.scope_type = 'location' AND g.location_id = ${place.locationId}::uuid))
    LIMIT 50`;
  return [...new Set([...(await companyKeyHolders(tx, org, 'asset.manage', today)), ...placed.map((r) => r.id)])];
}

@Injectable()
export class AssetAlertsService {
  private readonly logger = new Logger(AssetAlertsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** The daily warranty sweep; returns how many assets were told about. */
  async warrantySweep(): Promise<number> {
    const today = todayIst();
    // Warranties ending from today to the widest lead, not yet told about for that end (Postgres month arithmetic clamps
    // the 31st to the month's last day, like addMonthsIso).
    const due = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.$queryRaw<{ id: string; organization_id: string }[]>`
        SELECT id::text, organization_id::text FROM assets
        WHERE purchased_on IS NOT NULL AND warranty_months IS NOT NULL AND status NOT IN ('retired', 'lost')
          AND (purchased_on + make_interval(months => warranty_months))::date BETWEEN ${today}::date AND ${addDays(today, MAX_DAYS)}::date
          AND warranty_alerted_for IS DISTINCT FROM (purchased_on + make_interval(months => warranty_months))::date
        LIMIT 2000`,
    );
    let sent = 0;
    for (const org of [...new Set(due.map((r) => r.organization_id))]) {
      try {
        const out = await inCompany(this.tenantPrisma, { organizationId: org, isSuperAdmin: false }, async (tx, c) => {
          const setting = await settingFor(tx, c, 'asset.warranty_alert_days', { legalEntityId: '' });
          if (setting === 'off') return [];
          const days = Number(setting) || 30;
          const assets = await tx.asset.findMany({ where: { organizationId: org, id: { in: due.filter((r) => r.organization_id === org).map((r) => r.id) } } });
          const notes = [];
          for (const a of assets) {
            const endsOn = addMonthsIso(a.purchasedOn!.toISOString().slice(0, 10), a.warrantyMonths!);
            if (endsOn > addDays(today, days)) continue;
            // Once per warranty end, even if two runs overlap: only the run that moves the mark sends.
            const n = await tx.asset.updateMany({ where: { organizationId: org, id: a.id, OR: [{ warrantyAlertedFor: null }, { warrantyAlertedFor: { not: new Date(`${endsOn}T00:00:00Z`) } }] }, data: { warrantyAlertedFor: new Date(`${endsOn}T00:00:00Z`) } });
            if (!n.count) continue;
            const to = await assetManagers(tx, org, a, today);
            await audit(tx, c, 'asset.warranty.alerted', 'asset', a.id, { endsOn, days, told: to.length });
            if (to.length) notes.push({ id: a.id, to, text: `The warranty of ${a.name} (${a.tag}) ends on ${endsOn}.` });
          }
          return notes;
        });
        for (const n of out) {
          await this.notifications
            .notifySystem({ organizationId: org, isSuperAdmin: false }, n.to, 'asset.warranty.ending', { entityType: 'asset', entityId: n.id, contextText: n.text, linkPath: `/yx/people/assets/${n.id}` }, { subject: 'An asset warranty ends soon', html: `<p>${escapeHtml(n.text)}</p>` })
            .catch((e: Error) => this.logger.warn(`warranty notice: ${e.message}`));
          sent++;
        }
      } catch (e) {
        this.logger.error(`Warranty alerts for ${org} failed: ${(e as Error).message}`);
      }
    }
    return sent;
  }
}
