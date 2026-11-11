import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService, TenantPrismaService } from '@exam-platform/shared';
import { PLATFORM, platformRead } from './platform.service';

// Console staff roles (founder answers 1058, 1086): five roles, each a fixed set of platform.* keys (platform_role_keys,
// set by migrations). A member of staff holds the keys of their roles; nobody holds every key by default. Only a
// Security lead changes roles, with the security key again (the route), never their own, and the last active Security
// lead keeps the role (all three also in platform_set_staff_roles). Every change is in the platform audit log.

export const STAFF_ROLES = ['support_agent', 'customer_success', 'rules_editor', 'finance', 'security_lead'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  support_agent: 'Support agent',
  customer_success: 'Customer success',
  rules_editor: 'Rules editor',
  finance: 'Finance',
  security_lead: 'Security lead',
};

/** The database's refusals in plain words with the right status. */
function refusal(e: unknown): never {
  const m = (e as Error).message ?? '';
  if (/YX_STAFF_SELF/.test(m)) throw new ForbiddenException('You cannot change your own roles. Ask another Security lead.');
  if (/YX_STAFF_NOT_LEAD/.test(m)) throw new ForbiddenException('Only a Security lead changes staff roles.');
  if (/YX_STAFF_NOT_FOUND/.test(m)) throw new NotFoundException('No such member of staff.');
  if (/YX_STAFF_LAST_LEAD/.test(m)) throw new ConflictException('The last Security lead keeps the role. Make someone else a Security lead first.');
  if (/YX_STAFF_ROLE/.test(m)) throw new BadRequestException('Choose from the five staff roles.');
  throw e;
}

@Injectable()
export class StaffRolesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /** Every staff account with its roles, and what each role holds (who holds what, answer 1058). */
  async list(actorUserId: string) {
    return platformRead(this.tenantPrisma, actorUserId, 'staff.roles', async (tx) => {
      const [staff, roles, keys] = await Promise.all([
        tx.user.findMany({ where: { organizationId: null, role: 'super_admin' }, select: { id: true, name: true, email: true, status: true }, orderBy: [{ name: 'asc' }, { email: 'asc' }] }),
        tx.platformStaffRole.findMany({ select: { userId: true, role: true } }),
        tx.platformRoleKey.findMany({ orderBy: [{ role: 'asc' }, { key: 'asc' }] }),
      ]);
      const leads = new Set(roles.filter((r) => r.role === 'security_lead').map((r) => r.userId));
      const activeLeads = staff.filter((s) => s.status === 'active' && leads.has(s.id)).length;
      return {
        roles: STAFF_ROLES.map((r) => ({ role: r, label: STAFF_ROLE_LABEL[r], keys: keys.filter((k) => k.role === r).map((k) => k.key) })),
        staff: staff.map((s) => ({
          id: s.id,
          name: s.name?.trim() || s.email,
          email: s.email,
          active: s.status === 'active',
          me: s.id === actorUserId,
          roles: STAFF_ROLES.filter((r) => roles.some((x) => x.userId === s.id && x.role === r)),
          lastLead: s.status === 'active' && leads.has(s.id) && activeLeads === 1,
        })),
      };
    });
  }

  /** A Security lead sets another member of staff's roles (never their own; the last Security lead keeps it). */
  async setRoles(actorUserId: string, userId: string, roles: StaffRole[], reason: string) {
    const want = [...new Set(roles)];
    if (want.some((r) => !STAFF_ROLES.includes(r))) throw new BadRequestException('Choose from the five staff roles.');
    return this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      let before: string[];
      try {
        const [row] = await tx.$queryRaw<{ before: string[] }[]>`SELECT platform_set_staff_roles(${userId}::uuid, ${want}::text[], ${actorUserId}::uuid) AS before`;
        before = row!.before;
      } catch (e) {
        refusal(e);
      }
      await AuditService.recordIn(tx, PLATFORM, { actorUserId, action: 'platform.staff.roles_changed', entityType: 'user', entityId: userId, metadata: { from: before, to: STAFF_ROLES.filter((r) => want.includes(r)), reason } });
      return { id: userId, roles: STAFF_ROLES.filter((r) => want.includes(r)) };
    });
  }
}
