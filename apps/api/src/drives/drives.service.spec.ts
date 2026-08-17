import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DrivesService } from './drives.service';
import { TenantPrismaService, AuditService } from '@exam-platform/shared';

describe('DrivesService', () => {
  let service: DrivesService;
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    audit = { record: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        DrivesService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(DrivesService);
  });

  describe('create', () => {
    const dto = { name: 'Morning Drive', startsAt: '2026-08-20T09:00:00.000Z', endsAt: '2026-08-20T12:00:00.000Z' };

    it('rejects endsAt <= startsAt without hitting the database', async () => {
      await expect(
        service.create(context, 'user-1', 'group-1', { name: 'Bad Window', startsAt: '2026-08-20T12:00:00.000Z', endsAt: '2026-08-20T09:00:00.000Z' }),
      ).rejects.toThrow(BadRequestException);
      expect(tenantPrisma.forTenant).not.toHaveBeenCalled();

      await expect(
        service.create(context, 'user-1', 'group-1', { name: 'Zero Window', startsAt: '2026-08-20T09:00:00.000Z', endsAt: '2026-08-20T09:00:00.000Z' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when the group does not exist in this org', async () => {
      const tx = { walkInGroup: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.create(context, 'user-1', 'missing-group', dto)).rejects.toThrow(NotFoundException);
    });

    it('rejects a new window that overlaps an existing drive for the same group', async () => {
      const tx = {
        walkInGroup: { findFirst: jest.fn().mockResolvedValue({ id: 'group-1' }) },
        driveSession: {
          findFirst: jest.fn().mockResolvedValue({ id: 'existing-drive' }),
          create: jest.fn(),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.create(context, 'user-1', 'group-1', dto)).rejects.toThrow(BadRequestException);
      expect(tx.driveSession.create).not.toHaveBeenCalled();
      expect(tx.driveSession.findFirst).toHaveBeenCalledWith({
        where: {
          walkInGroupId: 'group-1',
          startsAt: { lt: new Date(dto.endsAt) },
          endsAt: { gt: new Date(dto.startsAt) },
        },
      });
    });

    it('creates the drive and audits it when the window is free', async () => {
      const created = { id: 'drive-1', name: 'Morning Drive', startsAt: new Date(dto.startsAt), endsAt: new Date(dto.endsAt) };
      const tx = {
        walkInGroup: { findFirst: jest.fn().mockResolvedValue({ id: 'group-1' }) },
        driveSession: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue(created),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.create(context, 'user-1', 'group-1', dto);

      expect(tx.driveSession.create).toHaveBeenCalledWith({
        data: { organizationId: 'org-1', walkInGroupId: 'group-1', name: 'Morning Drive', startsAt: new Date(dto.startsAt), endsAt: new Date(dto.endsAt) },
      });
      expect(result).toEqual(created);
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'drive.created', entityId: 'drive-1' }));
    });

    it('allows two non-overlapping windows for the same group', async () => {
      const tx = {
        walkInGroup: { findFirst: jest.fn().mockResolvedValue({ id: 'group-1' }) },
        driveSession: {
          findFirst: jest.fn().mockResolvedValue(null), // no overlap found either time
          create: jest.fn().mockResolvedValue({ id: 'drive-1' }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.create(context, 'user-1', 'group-1', dto);
      await service.create(context, 'user-1', 'group-1', {
        name: 'Afternoon Drive',
        startsAt: '2026-08-20T13:00:00.000Z',
        endsAt: '2026-08-20T16:00:00.000Z',
      });

      expect(tx.driveSession.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('listForGroup', () => {
    it('derives scheduled/live/ended status from startsAt/endsAt vs now', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-20T10:00:00.000Z'));
      const tx = {
        driveSession: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'd-scheduled', startsAt: new Date('2026-08-21T09:00:00.000Z'), endsAt: new Date('2026-08-21T12:00:00.000Z') },
            { id: 'd-live', startsAt: new Date('2026-08-20T09:00:00.000Z'), endsAt: new Date('2026-08-20T12:00:00.000Z') },
            { id: 'd-ended', startsAt: new Date('2026-08-19T09:00:00.000Z'), endsAt: new Date('2026-08-19T12:00:00.000Z') },
          ]),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.listForGroup(context, 'group-1');

      expect(result.find((r) => r.id === 'd-scheduled')?.status).toBe('scheduled');
      expect(result.find((r) => r.id === 'd-live')?.status).toBe('live');
      expect(result.find((r) => r.id === 'd-ended')?.status).toBe('ended');
      jest.useRealTimers();
    });
  });

  describe('liveRoster', () => {
    it('throws when the drive does not exist in this org', async () => {
      const tx = { driveSession: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.liveRoster(context, 'missing-drive')).rejects.toThrow(NotFoundException);
    });

    it('maps each invitation through deriveDriveState and returns grouped counts', async () => {
      const invitations = [
        { id: 'inv-1', candidate: { name: 'Registered Only' }, exam: { title: 'Backend Round' }, attempt: null },
        {
          id: 'inv-2',
          candidate: { name: 'In Progress' },
          exam: { title: 'Backend Round' },
          attempt: { status: 'in_progress', submittedAt: null, startedAt: new Date('2026-08-20T09:05:00Z'), result: null },
        },
        {
          id: 'inv-3',
          candidate: { name: 'Submitted Pending' },
          exam: { title: 'Backend Round' },
          attempt: { status: 'submitted', submittedAt: new Date(), startedAt: new Date('2026-08-20T09:05:00Z'), result: null },
        },
        {
          id: 'inv-4',
          candidate: { name: 'Passed' },
          exam: { title: 'Backend Round' },
          attempt: {
            status: 'submitted',
            submittedAt: new Date(),
            startedAt: new Date('2026-08-20T09:05:00Z'),
            result: { passFail: 'pass', percentage: 88 },
          },
        },
        {
          id: 'inv-5',
          candidate: { name: 'Failed' },
          exam: { title: 'Backend Round' },
          attempt: {
            status: 'submitted',
            submittedAt: new Date(),
            startedAt: new Date('2026-08-20T09:05:00Z'),
            result: { passFail: 'fail', percentage: 40 },
          },
        },
      ];
      const tx = {
        driveSession: { findFirst: jest.fn().mockResolvedValue({ id: 'drive-1' }) },
        invitation: { findMany: jest.fn().mockResolvedValue(invitations) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.liveRoster(context, 'drive-1');

      expect(result.counts).toEqual({ registered: 1, inProgress: 1, submitted: 1, passed: 1, failed: 1 });
      expect(result.rows.find((r) => r.invitationId === 'inv-1')).toEqual(
        expect.objectContaining({ candidateName: 'Registered Only', state: 'registered', startedAt: null, score: null }),
      );
      expect(result.rows.find((r) => r.invitationId === 'inv-4')).toEqual(
        expect.objectContaining({ candidateName: 'Passed', state: 'passed', score: 88 }),
      );
      expect(tx.invitation.findMany).toHaveBeenCalledWith({
        where: { driveSessionId: 'drive-1' },
        include: { candidate: true, attempt: { include: { result: true } }, exam: { select: { title: true } } },
      });
    });
  });

  describe('results', () => {
    it('returns the same roster as liveRoster, including candidates with no attempt', async () => {
      const invitations = [{ id: 'inv-1', candidate: { name: 'No Show' }, exam: { title: 'Backend Round' }, attempt: null }];
      const tx = {
        driveSession: { findFirst: jest.fn().mockResolvedValue({ id: 'drive-1' }) },
        invitation: { findMany: jest.fn().mockResolvedValue(invitations) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.results(context, 'drive-1');

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual(expect.objectContaining({ candidateName: 'No Show', state: 'registered' }));
      expect(result.counts.registered).toBe(1);
    });
  });
});
