import { Injectable, Logger } from '@nestjs/common';
import { TenantPrismaService } from '@exam-platform/shared';
import { Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { companyKeyHolders } from '../access/key-holders';
import { NotificationsService } from '../notifications/notifications.service';
import { escapeHtml } from '../notifications/notification-email-render';
import { addMonthsIso, contractEndsOn, contractNoticeOn } from './asset-categories';

// IT assets part 2 (founder answer 2714): the asset managers of an asset's place are told once, a company-set number of
// days (asset.warranty_alert_days, 30 by default; "off" tells nobody) before its warranty ends. The warranty end told
// about is remembered on the asset (warranty_alerted_for), so a changed warranty is told again. Daily (scheduled sweeps).

/** The widest choice of asset.warranty_alert_days: the sweep looks no further ahead. */
const MAX_DAYS = 90;
/** The widest choice of asset.contract_alert_days (days before the notice date). */
const MAX_CONTRACT_LEAD = 30;
const iso = (d: Date) => d.toISOString().slice(0, 10);
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

  /**
   * The daily contract sweep (answers 2717 and 2714). First, an active contract past its end date renews for its length
   * (tacit; as many lengths as it takes to reach today) or ends (express), recorded and audited. Then the asset managers
   * of each contract's place (company-wide ones for a place-less contract) are told once per end date, a company-set
   * number of days before its notice date (asset.contract_alert_days: 0 = on the notice date; "off" tells nobody).
   * Returns how many contracts were renewed, ended or told about.
   */
  async contractSweep(): Promise<number> {
    const today = todayIst();
    const su = { organizationId: null, isSuperAdmin: true };
    let done = 0;
    const past = await this.tenantPrisma.forTenant(su, (tx) =>
      tx.$queryRaw<{ id: string; organization_id: string }[]>`SELECT id::text, organization_id::text FROM asset_contracts WHERE status = 'active' AND ends_on < ${today}::date LIMIT 2000`,
    );
    for (const org of [...new Set(past.map((r) => r.organization_id))]) {
      try {
        done += await inCompany(this.tenantPrisma, { organizationId: org, isSuperAdmin: false }, async (tx, c) => {
          let n = 0;
          for (const k of await tx.assetContract.findMany({ where: { organizationId: org, id: { in: past.filter((r) => r.organization_id === org).map((r) => r.id) } } })) {
            const from = iso(k.endsOn);
            if (k.renewal === 'tacit') {
              let renewals = k.renewals;
              let to = from;
              while (to < today && renewals < k.renewals + 1200) to = contractEndsOn(iso(k.startsOn), k.months, ++renewals);
              // Only the run that moves the end records it, even if two runs overlap.
              const u = await tx.assetContract.updateMany({ where: { organizationId: org, id: k.id, status: 'active', endsOn: k.endsOn }, data: { renewals, endsOn: new Date(`${to}T00:00:00Z`), version: { increment: 1 } } });
              if (!u.count) continue;
              await audit(tx, c, 'asset.contract.renewed', 'asset_contract', k.id, { from, to, times: renewals - k.renewals, renewals, months: k.months });
            } else {
              const u = await tx.assetContract.updateMany({ where: { organizationId: org, id: k.id, status: 'active', endsOn: k.endsOn }, data: { status: 'ended', version: { increment: 1 } } });
              if (!u.count) continue;
              await audit(tx, c, 'asset.contract.ended', 'asset_contract', k.id, { endsOn: from });
            }
            n++;
          }
          return n;
        });
      } catch (e) {
        this.logger.error(`Contract renewals for ${org} failed: ${(e as Error).message}`);
      }
    }
    // Contracts whose notice date (less the widest lead) has come, not yet told about for this end date.
    const due = await this.tenantPrisma.forTenant(su, (tx) =>
      tx.$queryRaw<{ id: string; organization_id: string }[]>`
        SELECT id::text, organization_id::text FROM asset_contracts
        WHERE status = 'active' AND ends_on >= ${today}::date AND (ends_on - notice_days - ${MAX_CONTRACT_LEAD}::int) <= ${today}::date
          AND notice_alerted_for IS DISTINCT FROM ends_on
        LIMIT 2000`,
    );
    for (const org of [...new Set(due.map((r) => r.organization_id))]) {
      try {
        const out = await inCompany(this.tenantPrisma, { organizationId: org, isSuperAdmin: false }, async (tx, c) => {
          const setting = await settingFor(tx, c, 'asset.contract_alert_days', { legalEntityId: '' });
          if (setting === 'off') return [];
          const lead = Number(setting) || 0;
          const notes = [];
          for (const k of await tx.assetContract.findMany({ where: { organizationId: org, id: { in: due.filter((r) => r.organization_id === org).map((r) => r.id) } } })) {
            const endsOn = iso(k.endsOn);
            const noticeOn = contractNoticeOn(endsOn, k.noticeDays);
            if (addDays(noticeOn, -lead) > today) continue;
            const n = await tx.assetContract.updateMany({ where: { organizationId: org, id: k.id, endsOn: k.endsOn, OR: [{ noticeAlertedFor: null }, { noticeAlertedFor: { not: k.endsOn } }] }, data: { noticeAlertedFor: k.endsOn } });
            if (!n.count) continue;
            const to = await assetManagers(tx, org, k, today);
            const supplier = (await tx.itSupplier.findFirst({ where: { organizationId: org, id: k.supplierId }, select: { name: true } }))?.name ?? 'its supplier';
            await audit(tx, c, 'asset.contract.notice.alerted', 'asset_contract', k.id, { noticeOn, endsOn, lead, told: to.length });
            const text =
              k.renewal === 'tacit'
                ? `Contract ${k.number} with ${supplier}: give notice by ${noticeOn} if it should not renew. It ends on ${endsOn} and otherwise renews by itself for another ${k.months} months.`
                : `Contract ${k.number} with ${supplier} ends on ${endsOn} (notice date ${noticeOn}). It does not renew by itself.`;
            if (to.length) notes.push({ id: k.id, to, text });
          }
          return notes;
        });
        for (const n of out) {
          await this.notifications
            .notifySystem({ organizationId: org, isSuperAdmin: false }, n.to, 'asset.contract.notice', { entityType: 'asset_contract', entityId: n.id, contextText: n.text, linkPath: `/yx/people/assets/contracts?open=${n.id}` }, { subject: 'An asset contract reaches its notice date', html: `<p>${escapeHtml(n.text)}</p>` })
            .catch((e: Error) => this.logger.warn(`contract notice: ${e.message}`));
          done++;
        }
      } catch (e) {
        this.logger.error(`Contract notices for ${org} failed: ${(e as Error).message}`);
      }
    }
    return done;
  }
}
