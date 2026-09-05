import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UserGroupsService } from './user-groups.service';

describe('UserGroupsService', () => {
  let service: UserGroupsService;
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  let tx: {
    userGroup: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock; delete: jest.Mock };
    userGroupMember: { findMany: jest.Mock; createMany: jest.Mock; deleteMany: jest.Mock };
    user: { findMany: jest.Mock };
  };
  const context = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(() => {
    tx = {
      userGroup: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      userGroupMember: { findMany: jest.fn(), createMany: jest.fn(), deleteMany: jest.fn() },
      user: { findMany: jest.fn() },
    };
    tenantPrisma = { forTenant: jest.fn().mockImplementation((_c, fn) => fn(tx)) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new UserGroupsService(tenantPrisma as any, audit as any);

    // Defaults so hydrate() doesn't blow up in tests that don't care about it.
    tx.userGroupMember.findMany.mockResolvedValue([]);
    tx.user.findMany.mockResolvedValue([]);
  });

  describe('create', () => {
    it('rejects a duplicate name within the org', async () => {
      tx.userGroup.findFirst.mockResolvedValue({ id: 'g-existing' });

      await expect(service.create(context, 'actor-1', { name: 'Interviewers' } as any)).rejects.toThrow(BadRequestException);
      await expect(service.create(context, 'actor-1', { name: 'Interviewers' } as any)).rejects.toThrow(/already exists/i);
      expect(tx.userGroup.create).not.toHaveBeenCalled();
    });

    it('validates member users are same-org + active (rejects on count mismatch)', async () => {
      tx.userGroup.findFirst.mockResolvedValue(null);
      tx.userGroup.create.mockResolvedValue({ id: 'g1', name: 'Interviewers', description: null });
      // Only one of two requested member ids resolves as active/same-org.
      tx.user.findMany.mockResolvedValue([{ id: 'u1' }]);

      await expect(
        service.create(context, 'actor-1', { name: 'Interviewers', memberUserIds: ['u1', 'u2'] } as any),
      ).rejects.toThrow(BadRequestException);
      expect(tx.userGroupMember.createMany).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('creates the group, applies members, records audit, and returns hydrated group', async () => {
      tx.userGroup.findFirst.mockResolvedValue(null);
      tx.userGroup.create.mockResolvedValue({ id: 'g1', name: 'Interviewers', description: null });
      tx.user.findMany
        .mockResolvedValueOnce([{ id: 'u1' }, { id: 'u2' }]) // applyMembers validation
        .mockResolvedValueOnce([
          { id: 'u1', name: 'Alice', email: 'alice@x.com' },
          { id: 'u2', name: 'Bob', email: 'bob@x.com' },
        ]); // hydrate lookup
      tx.userGroupMember.findMany
        .mockResolvedValueOnce([]) // applyMembers current members (none yet)
        .mockResolvedValueOnce([
          { groupId: 'g1', userId: 'u1' },
          { groupId: 'g1', userId: 'u2' },
        ]); // hydrate

      const result = await service.create(context, 'actor-1', { name: 'Interviewers', memberUserIds: ['u1', 'u2'] } as any);

      expect(tx.userGroup.create).toHaveBeenCalledWith({
        data: { organizationId: 'org-1', name: 'Interviewers', description: null },
        select: { id: true, name: true, description: true },
      });
      expect(tx.userGroupMember.createMany).toHaveBeenCalledWith({
        data: [
          { organizationId: 'org-1', groupId: 'g1', userId: 'u1' },
          { organizationId: 'org-1', groupId: 'g1', userId: 'u2' },
        ],
      });
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'user_group.created', entityId: 'g1' }));
      expect(result).toEqual({
        id: 'g1',
        name: 'Interviewers',
        description: null,
        members: [
          { userId: 'u1', name: 'Alice', email: 'alice@x.com' },
          { userId: 'u2', name: 'Bob', email: 'bob@x.com' },
        ],
      });
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the group does not exist', async () => {
      tx.userGroup.findFirst.mockResolvedValue(null);

      await expect(service.update(context, 'actor-1', 'missing', { name: 'X' } as any)).rejects.toThrow(NotFoundException);
      expect(tx.userGroup.update).not.toHaveBeenCalled();
    });

    it('rejects renaming to a name clash with another group', async () => {
      tx.userGroup.findFirst
        .mockResolvedValueOnce({ id: 'g1' }) // existence check
        .mockResolvedValueOnce({ id: 'g2' }); // clash check

      await expect(service.update(context, 'actor-1', 'g1', { name: 'Taken' } as any)).rejects.toThrow(BadRequestException);
      expect(tx.userGroup.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes members then the group, and records audit', async () => {
      tx.userGroup.findFirst.mockResolvedValue({ id: 'g1' });
      tx.userGroup.delete.mockResolvedValue({ id: 'g1' });

      const result = await service.remove(context, 'actor-1', 'g1');

      const memberDeleteOrder = tx.userGroupMember.deleteMany.mock.invocationCallOrder[0];
      const groupDeleteOrder = tx.userGroup.delete.mock.invocationCallOrder[0];
      expect(memberDeleteOrder).toBeLessThan(groupDeleteOrder);
      expect(tx.userGroupMember.deleteMany).toHaveBeenCalledWith({ where: { organizationId: 'org-1', groupId: 'g1' } });
      expect(tx.userGroup.delete).toHaveBeenCalledWith({ where: { id: 'g1' } });
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'user_group.deleted', entityId: 'g1' }));
      expect(result).toEqual({ id: 'g1' });
    });

    it('throws NotFoundException for a missing group and skips deletes', async () => {
      tx.userGroup.findFirst.mockResolvedValue(null);

      await expect(service.remove(context, 'actor-1', 'missing')).rejects.toThrow(NotFoundException);
      expect(tx.userGroupMember.deleteMany).not.toHaveBeenCalled();
      expect(tx.userGroup.delete).not.toHaveBeenCalled();
    });
  });

  describe('setMembers', () => {
    it('diffs correctly: inserts added, deletes removed, leaves unchanged untouched', async () => {
      tx.userGroup.findFirst.mockResolvedValue({ id: 'g1', name: 'Interviewers', description: null });
      // Current members: u1 (kept), u2 (removed). Desired: u1, u3 (added).
      tx.userGroupMember.findMany
        .mockResolvedValueOnce([{ userId: 'u1' }, { userId: 'u2' }]) // applyMembers current
        .mockResolvedValueOnce([{ groupId: 'g1', userId: 'u1' }, { groupId: 'g1', userId: 'u3' }]); // hydrate
      tx.user.findMany
        .mockResolvedValueOnce([{ id: 'u1' }, { id: 'u3' }]) // applyMembers validation for desired set
        .mockResolvedValueOnce([
          { id: 'u1', name: 'Alice', email: 'alice@x.com' },
          { id: 'u3', name: 'Cara', email: 'cara@x.com' },
        ]); // hydrate lookup

      await service.setMembers(context, 'actor-1', 'g1', ['u1', 'u3']);

      expect(tx.userGroupMember.deleteMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', groupId: 'g1', userId: { in: ['u2'] } },
      });
      expect(tx.userGroupMember.createMany).toHaveBeenCalledWith({
        data: [{ organizationId: 'org-1', groupId: 'g1', userId: 'u3' }],
      });
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'user_group.members_changed', entityId: 'g1' }));
    });

    it('leaves unchanged members untouched: no add/remove calls when desired set matches current', async () => {
      tx.userGroup.findFirst.mockResolvedValue({ id: 'g1', name: 'Interviewers', description: null });
      tx.userGroupMember.findMany
        .mockResolvedValueOnce([{ userId: 'u1' }, { userId: 'u2' }]) // applyMembers current
        .mockResolvedValueOnce([{ groupId: 'g1', userId: 'u1' }, { groupId: 'g1', userId: 'u2' }]); // hydrate
      tx.user.findMany
        .mockResolvedValueOnce([{ id: 'u1' }, { id: 'u2' }]) // applyMembers validation
        .mockResolvedValueOnce([
          { id: 'u1', name: 'Alice', email: 'alice@x.com' },
          { id: 'u2', name: 'Bob', email: 'bob@x.com' },
        ]);

      await service.setMembers(context, 'actor-1', 'g1', ['u1', 'u2']);

      expect(tx.userGroupMember.deleteMany).not.toHaveBeenCalled();
      expect(tx.userGroupMember.createMany).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a missing group', async () => {
      tx.userGroup.findFirst.mockResolvedValue(null);

      await expect(service.setMembers(context, 'actor-1', 'missing', ['u1'])).rejects.toThrow(NotFoundException);
      expect(tx.userGroupMember.createMany).not.toHaveBeenCalled();
      expect(tx.userGroupMember.deleteMany).not.toHaveBeenCalled();
    });

    it('rejects when a desired member is not active/same-org', async () => {
      tx.userGroup.findFirst.mockResolvedValue({ id: 'g1', name: 'Interviewers', description: null });
      tx.user.findMany.mockResolvedValueOnce([{ id: 'u1' }]); // only 1 of 2 valid

      await expect(service.setMembers(context, 'actor-1', 'g1', ['u1', 'u2'])).rejects.toThrow(BadRequestException);
      expect(tx.userGroupMember.createMany).not.toHaveBeenCalled();
      expect(tx.userGroupMember.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('directory', () => {
    it('returns id/name/memberIds for every group', async () => {
      tx.userGroup.findMany.mockResolvedValue([
        { id: 'g1', name: 'Interviewers' },
        { id: 'g2', name: 'Panel' },
      ]);
      tx.userGroupMember.findMany.mockResolvedValue([
        { groupId: 'g1', userId: 'u1' },
        { groupId: 'g1', userId: 'u2' },
        { groupId: 'g2', userId: 'u3' },
      ]);

      const result = await service.directory(context);

      expect(result).toEqual([
        { id: 'g1', name: 'Interviewers', memberIds: ['u1', 'u2'] },
        { id: 'g2', name: 'Panel', memberIds: ['u3'] },
      ]);
    });

    it('returns an empty array with no groups (and skips the member query)', async () => {
      tx.userGroup.findMany.mockResolvedValue([]);

      const result = await service.directory(context);

      expect(result).toEqual([]);
      expect(tx.userGroupMember.findMany).not.toHaveBeenCalled();
    });
  });

  describe('mine', () => {
    it("returns the caller's groupIds and deduped co-member ids excluding the caller", async () => {
      tx.userGroupMember.findMany
        .mockResolvedValueOnce([{ groupId: 'g1' }, { groupId: 'g2' }]) // caller's memberships
        .mockResolvedValueOnce([
          { userId: 'me' },
          { userId: 'u1' },
          { userId: 'u1' }, // duplicate across groups
          { userId: 'u2' },
        ]); // co-members across g1/g2

      const result = await service.mine(context, 'me');

      expect(tx.userGroupMember.findMany).toHaveBeenNthCalledWith(2, {
        where: { organizationId: 'org-1', groupId: { in: ['g1', 'g2'] } },
        select: { userId: true },
      });
      expect(result.groupIds).toEqual(['g1', 'g2']);
      expect(result.coMemberUserIds.sort()).toEqual(['u1', 'u2']);
    });

    it('returns empty arrays when the caller belongs to no group (and skips the co-member query)', async () => {
      tx.userGroupMember.findMany.mockResolvedValueOnce([]);

      const result = await service.mine(context, 'me');

      expect(result).toEqual({ groupIds: [], coMemberUserIds: [] });
      expect(tx.userGroupMember.findMany).toHaveBeenCalledTimes(1);
    });
  });
});
