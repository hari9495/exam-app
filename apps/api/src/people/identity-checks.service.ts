import { ForbiddenException, Injectable } from '@nestjs/common';
import { TenantContext } from '@exam-platform/shared';
import { audit, CompanyContext, Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { EmployeeHistoryService, Key, Viewer } from '../employee-history/employee-history.service';
import { NotificationsService } from '../notifications/notifications.service';

// PPL-34 Identity panel (Special class, P02 §4.4): the identity checks on a person across joining and after it.
//   day 1         HR's check of the original ID when the joiner was marked joined (pre-boarding, YX-LC-31)
//   attested      HR checked the original ID again
//   requested     HR asked the person for a fresh copy of a photo ID (they upload it in My documents)
// Only HR holding the Special key for the person sees it, never the person or anyone acting for someone else,
// and every look is recorded for "Who accessed my data". No face image or ID number is ever returned.

/** The photo IDs HR may ask a fresh copy of. */
export const ID_TYPES = ['aadhaar', 'passport', 'pan_card'] as const;
const SPECIAL: Key = 'employee.aadhaar.view';

@Injectable()
export class IdentityChecksService {
  constructor(
    private readonly history: EmployeeHistoryService,
    private readonly notifications: NotificationsService,
  ) {}

  /** The person behind the record, when the viewer holds every key for them (never their own record). */
  private async personOf(tx: Tx, c: CompanyContext, v: Viewer, employeeId: string, keys: Key[]) {
    const a = await this.history.access(tx, c, v, employeeId);
    if (a.self || v.actingForOther) throw new ForbiddenException('The identity panel is for HR.');
    for (const key of keys) if (!(await this.history.reaches(tx, c, v, key, employeeId, todayIst()))) throw new ForbiddenException('The identity panel needs a Special data grant for this person.');
    return (await tx.employee.findFirstOrThrow({ where: { organizationId: c.organizationId, id: employeeId }, select: { personId: true } })).personId;
  }

  view(ctx: TenantContext, v: Viewer, employeeId: string) {
    return this.history.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const personId = await this.personOf(tx, c, v, employeeId, [SPECIAL]);
      const joins = await tx.preboarding.findMany({ where: { organizationId: org, personId, identityAttestedAt: { not: null } }, select: { identityAttestedAt: true, identityAttestedBy: true } });
      const rows = await tx.personIdentityCheck.findMany({ where: { organizationId: org, personId }, orderBy: { checkedAt: 'asc' } });
      const ids = [...joins.map((j) => j.identityAttestedBy), ...rows.map((r) => r.byUserId)].filter((x): x is string => Boolean(x));
      const users = await tx.user.findMany({ where: { organizationId: org, id: { in: ids } }, select: { id: true, name: true, email: true } });
      const by = (id: string | null) => (id ? (users.find((u) => u.id === id)?.name || users.find((u) => u.id === id)?.email || null) : null);
      const types = await tx.documentType.findMany({ where: { key: { in: [...ID_TYPES] }, active: true, OR: [{ organizationId: null }, { organizationId: org }] }, select: { key: true, name: true } });
      await audit(tx, c, 'employee.identity_checks.viewed', 'employee', employeeId);
      return {
        checks: [
          ...joins.map((j) => ({ kind: 'day1' as const, at: j.identityAttestedAt!.toISOString(), by: by(j.identityAttestedBy), note: null })),
          ...rows.map((r) => ({ kind: r.result as 'attested' | 'requested', at: r.checkedAt.toISOString(), by: by(r.byUserId), note: r.note })),
        ].sort((x, y) => x.at.localeCompare(y.at)),
        idTypes: types.map((t) => ({ key: t.key, name: t.name })),
        canManage: await this.history.reaches(tx, c, v, 'employee.identity.manage', employeeId, todayIst()),
      };
    });
  }

  /** HR checked the original ID against the person (P05 YX-LC-31, again after joining). */
  attest(ctx: TenantContext, v: Viewer, employeeId: string, note: string | undefined) {
    return this.history.run(ctx, async (tx, c) => {
      const personId = await this.personOf(tx, c, v, employeeId, [SPECIAL, 'employee.identity.manage']);
      const row = await tx.personIdentityCheck.create({ data: { organizationId: c.organizationId, personId, result: 'attested', note: note?.trim() || null, byUserId: c.userId ?? null } });
      await audit(tx, c, 'employee.identity.attested', 'employee', employeeId, { checkId: row.id });
      return { id: row.id };
    });
  }

  /** HR asks the person for a fresh copy of a photo ID; they are told in the app and by email. */
  async reverify(ctx: TenantContext, v: Viewer, employeeId: string, typeKey: string) {
    const out = await this.history.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const personId = await this.personOf(tx, c, v, employeeId, [SPECIAL, 'employee.identity.manage']);
      const type = await tx.documentType.findFirstOrThrow({ where: { key: typeKey, OR: [{ organizationId: null }, { organizationId: org }] }, select: { name: true } });
      const row = await tx.personIdentityCheck.create({ data: { organizationId: org, personId, result: 'requested', note: type.name, byUserId: c.userId ?? null } });
      await audit(tx, c, 'employee.identity.reverify_requested', 'employee', employeeId, { checkId: row.id, typeKey });
      const user = (await tx.employee.findFirstOrThrow({ where: { organizationId: org, id: employeeId }, select: { userId: true } })).userId;
      return { id: row.id, user, typeName: type.name };
    });
    if (out.user && v.userId) void this.notifications.notify(ctx, v.userId, [out.user], 'document.requested', { entityType: 'employee', entityId: employeeId, contextText: `Please upload a fresh copy of your ${out.typeName} to verify your identity again`, linkPath: '/yx/me/documents' }).catch(() => undefined);
    return { id: out.id };
  }
}
