import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { AuditService, TenantPrismaService, holdsConfidential } from '@exam-platform/shared';
import { ROLE_TEMPLATES } from './role-templates';
import { TEMPLATE_HISTORY } from './role-template-history';

// Role templates reach existing companies (P02 §4.2, Q5; migration 20261113000000_role_template_follow). A company role
// made from a template follows it until someone edits its keys; at start-up every following role gets the keys its
// template has gained since (additions only), each change recorded in the audit log. A role made before roles
// remembered their template is recognised once: its keys equal a past (or the current) version of a template exactly.
// Confidential keys are never added to a role people hold (P02 §4.6: those go through a role grant another admin approves).

const key = (keys: readonly string[]) => JSON.stringify([...new Set(keys)].sort());

/** The template a set of keys is an unchanged copy of, and which version. */
export function templateOf(keys: readonly string[]): { template: string; set: string[] } | null {
  const k = key(keys);
  for (const t of ROLE_TEMPLATES) {
    const versions = [...(TEMPLATE_HISTORY[t.key] ?? []), [...t.permissions]];
    const hit = versions.find((v) => key(v) === k);
    if (hit) return { template: t.key, set: JSON.parse(k) };
  }
  return null;
}

/** What a following role gains from its template now: the new keys, less Confidential ones when people hold it. */
export function upgrade(current: readonly string[], template: readonly string[], held: boolean) {
  const have = new Set(current);
  const added = [...new Set(template)].filter((k) => !have.has(k)).sort();
  const skipped = held ? added.filter((k) => holdsConfidential([k])) : [];
  const granted = added.filter((k) => !skipped.includes(k));
  return { granted, skipped, keys: JSON.parse(key([...current, ...granted])) as string[] };
}

@Injectable()
export class TemplateSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TemplateSyncService.name);

  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async onApplicationBootstrap() {
    await this.syncAll().catch((e: Error) => this.logger.warn(`role template sync: ${e.message}`));
  }

  async syncAll() {
    const orgs = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.permissionProfile.findMany({ where: { OR: [{ templateChecked: false }, { templateKey: { not: null } }] }, select: { organizationId: true }, distinct: ['organizationId'] }),
    );
    let changed = 0;
    for (const o of orgs) changed += await this.syncOrg(o.organizationId);
    return changed;
  }

  /** One company's roles: recognise unchanged copies once, then bring following roles up to their template. */
  async syncOrg(organizationId: string): Promise<number> {
    const ctx = { organizationId, isSuperAdmin: false };
    return this.tenantPrisma.forTenant(ctx, async (tx) => {
      let changed = 0;
      for (const p of await tx.permissionProfile.findMany({ where: { organizationId, OR: [{ templateChecked: false }, { templateKey: { not: null } }] } })) {
        let templateKey = p.templateKey;
        let templateSet = p.templateSet;
        const keys = JSON.parse(p.permissionsJson) as string[];
        if (!p.templateChecked) {
          const hit = templateOf(keys);
          templateKey = hit?.template ?? null;
          templateSet = hit ? JSON.stringify(hit.set) : null;
          await tx.permissionProfile.update({ where: { id: p.id }, data: { templateChecked: true, templateKey, templateSet } });
        }
        const t = ROLE_TEMPLATES.find((x) => x.key === templateKey);
        // Still following: its keys are what the template last gave it (an edit would have cleared templateKey).
        if (!t || !templateSet || key(keys) !== key(JSON.parse(templateSet) as string[])) continue;
        const held = (await tx.user.count({ where: { permissionProfileId: p.id } })) + (await tx.roleGrant.count({ where: { organizationId, permissionProfileId: p.id, status: { in: ['active', 'pending'] } } })) > 0;
        const u = upgrade(keys, t.permissions, held);
        if (!u.granted.length) continue;
        const done = await tx.permissionProfile.updateMany({ where: { id: p.id, permissionsJson: p.permissionsJson }, data: { permissionsJson: JSON.stringify(u.keys), templateSet: JSON.stringify(u.keys) } });
        if (!done.count) continue;
        await AuditService.recordIn(tx, ctx, { actorUserId: null, action: 'access.role.template_synced', entityType: 'permission_profile', entityId: p.id, metadata: { template: t.key, role: p.name, added: u.granted, notAddedConfidential: u.skipped } });
        changed++;
      }
      return changed;
    });
  }
}
