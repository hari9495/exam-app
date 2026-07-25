import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { MonitoringGateway, PRESENCE_TICK_MS } from './monitoring.gateway';
import { PrismaService } from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';
import { MonitoringService } from './monitoring.service';
import { LeaderboardService } from '../leaderboard/leaderboard.service';

describe('MonitoringGateway', () => {
  let gateway: MonitoringGateway;
  let jwt: JwtService;
  let prisma: { rolePermission: { findFirst: jest.Mock } };
  let tenantPrisma: { forTenant: jest.Mock };
  let monitoring: { getRosterSnapshot: jest.Mock; getRecentAlerts: jest.Mock };
  let leaderboardService: { computeRecruiterView: jest.Mock };

  function makeSocket(overrides: Record<string, unknown> = {}) {
    return {
      handshake: { auth: {} },
      data: {},
      disconnect: jest.fn(),
      join: jest.fn().mockResolvedValue(undefined),
      emit: jest.fn(),
      ...overrides,
    } as any;
  }

  beforeEach(async () => {
    prisma = { rolePermission: { findFirst: jest.fn() } };
    tenantPrisma = { forTenant: jest.fn() };
    monitoring = { getRosterSnapshot: jest.fn(), getRecentAlerts: jest.fn().mockResolvedValue([]) };
    leaderboardService = { computeRecruiterView: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MonitoringGateway,
        JwtService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: MonitoringService, useValue: monitoring },
        { provide: LeaderboardService, useValue: leaderboardService },
      ],
    }).compile();

    gateway = moduleRef.get(MonitoringGateway);
    jwt = moduleRef.get(JwtService);
    process.env.JWT_ACCESS_SECRET = 'test-staff-access-secret';
  });

  describe('handleConnection', () => {
    it('disconnects a socket with no auth token', () => {
      const socket = makeSocket();

      gateway.handleConnection(socket);

      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('disconnects a socket with an invalid token', () => {
      const socket = makeSocket({ handshake: { auth: { token: 'not-a-real-jwt' } } });

      gateway.handleConnection(socket);

      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('attaches the decoded staff user to the socket for a valid token', () => {
      const token = jwt.sign(
        { sub: 'user-1', organizationId: 'org-1', role: 'recruiter' },
        { secret: process.env.JWT_ACCESS_SECRET },
      );
      const socket = makeSocket({ handshake: { auth: { token } } });

      gateway.handleConnection(socket);

      expect(socket.disconnect).not.toHaveBeenCalled();
      expect(socket.data.user).toEqual({ userId: 'user-1', organizationId: 'org-1', role: 'recruiter' });
    });
  });

  describe('handleJoinExam', () => {
    it('disconnects a socket with no authenticated user', async () => {
      const socket = makeSocket();

      await gateway.handleJoinExam(socket, { examId: 'exam-1' });

      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('emits an error and does not join when the role lacks exam:manage', async () => {
      const socket = makeSocket({ data: { user: { userId: 'user-1', organizationId: 'org-1', role: 'panel' } } });
      prisma.rolePermission.findFirst.mockResolvedValue(null);

      await gateway.handleJoinExam(socket, { examId: 'exam-1' });

      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Missing required permission: exam:manage' });
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('emits an error when the roster lookup throws (exam not found / not owned)', async () => {
      const socket = makeSocket({ data: { user: { userId: 'user-1', organizationId: 'org-1', role: 'recruiter' } } });
      prisma.rolePermission.findFirst.mockResolvedValue({ role: 'recruiter' });
      monitoring.getRosterSnapshot.mockRejectedValue(new Error('not found'));

      await gateway.handleJoinExam(socket, { examId: 'exam-1' });

      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Exam exam-1 not found' });
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('joins the exam room and emits a roster snapshot on success', async () => {
      const socket = makeSocket({ data: { user: { userId: 'user-1', organizationId: 'org-1', role: 'recruiter' } } });
      prisma.rolePermission.findFirst.mockResolvedValue({ role: 'recruiter' });
      const roster = [{ candidateId: 'cand-1' }];
      monitoring.getRosterSnapshot.mockResolvedValue(roster);
      const recentAlerts = [
        { attemptId: 'attempt-1', candidateId: 'cand-1', eventType: 'tab_switch', severity: 'high', occurredAt: new Date('2026-07-25T10:00:00Z') },
      ];
      monitoring.getRecentAlerts.mockResolvedValue(recentAlerts);
      leaderboardService.computeRecruiterView.mockResolvedValue([
        { rank: 1, candidateId: 'cand-1', candidateName: 'Alice', correctCount: 2 },
      ]);

      await gateway.handleJoinExam(socket, { examId: 'exam-1' });

      expect(socket.join).toHaveBeenCalledWith('exam:exam-1');
      expect(socket.emit).toHaveBeenCalledWith('roster:snapshot', roster);
      expect(monitoring.getRosterSnapshot).toHaveBeenCalledWith({ organizationId: 'org-1', isSuperAdmin: false }, 'exam-1');
      expect(monitoring.getRecentAlerts).toHaveBeenCalledWith({ organizationId: 'org-1', isSuperAdmin: false }, 'exam-1');
      expect(socket.emit).toHaveBeenCalledWith('proctoring:recent', recentAlerts);
      expect(socket.emit).toHaveBeenCalledWith('leaderboard:snapshot', [
        { rank: 1, candidateId: 'cand-1', candidateName: 'Alice', correctCount: 2 },
      ]);
    });

    it('does not throw and still emits the leaderboard snapshot when recent-alerts lookup fails', async () => {
      const socket = makeSocket({ data: { user: { userId: 'user-1', organizationId: 'org-1', role: 'recruiter' } } });
      prisma.rolePermission.findFirst.mockResolvedValue({ role: 'recruiter' });
      const roster = [{ candidateId: 'cand-1' }];
      monitoring.getRosterSnapshot.mockResolvedValue(roster);
      monitoring.getRecentAlerts.mockRejectedValue(new Error('db hiccup'));
      const leaderboardSnapshot = [{ rank: 1, candidateId: 'cand-1', candidateName: 'Alice', correctCount: 2 }];
      leaderboardService.computeRecruiterView.mockResolvedValue(leaderboardSnapshot);

      await expect(gateway.handleJoinExam(socket, { examId: 'exam-1' })).resolves.not.toThrow();

      expect(socket.emit).not.toHaveBeenCalledWith('proctoring:recent', expect.anything());
      expect(socket.emit).not.toHaveBeenCalledWith('error', expect.anything());
      expect(socket.emit).toHaveBeenCalledWith('leaderboard:snapshot', leaderboardSnapshot);
    });
  });

  describe('emitLeaderboardUpdate', () => {
    it('emits leaderboard:update to the exam room', () => {
      (gateway as any).server = { to: jest.fn().mockReturnThis(), emit: jest.fn() };

      gateway.emitLeaderboardUpdate('exam-1', [{ rank: 1, candidateId: 'cand-1', candidateName: 'Alice', correctCount: 3 }]);

      expect((gateway as any).server.to).toHaveBeenCalledWith('exam:exam-1');
      expect((gateway as any).server.emit).toHaveBeenCalledWith('leaderboard:update', [
        { rank: 1, candidateId: 'cand-1', candidateName: 'Alice', correctCount: 3 },
      ]);
    });
  });

  describe('presence-tick interval lifecycle', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('clears the presence-tick interval on module destroy so it does not keep firing', () => {
      jest.useFakeTimers();
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      gateway.afterInit();
      expect(jest.getTimerCount()).toBe(1);

      gateway.onModuleDestroy();

      expect(clearIntervalSpy).toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);

      // Advancing time after destroy must not trigger another tick.
      jest.advanceTimersByTime(PRESENCE_TICK_MS * 2);
      expect(monitoring.getRosterSnapshot).not.toHaveBeenCalled();
    });

    it('is a no-op when called before afterInit ever ran', () => {
      expect(() => gateway.onModuleDestroy()).not.toThrow();
    });
  });

  describe('tickPresence via the interval (realistic Server shape)', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('reads rooms from server.adapter.rooms (real Socket.IO Namespace shape)', async () => {
      jest.useFakeTimers();
      const emit = jest.fn();
      const rooms = new Map([['exam:exam-1', new Set(['socket-1'])]]);
      (gateway as any).server = {
        adapter: { rooms },
        to: jest.fn().mockReturnValue({ emit }),
      };
      tenantPrisma.forTenant.mockImplementation((_context: unknown, fn: (tx: unknown) => unknown) =>
        Promise.resolve(fn({ exam: { findUnique: () => Promise.resolve({ id: 'exam-1', organizationId: 'org-1' }) } })),
      );
      monitoring.getRosterSnapshot.mockResolvedValue([
        { attemptId: 'attempt-1', candidateId: 'cand-1', online: true },
      ]);

      gateway.afterInit();
      await jest.advanceTimersByTimeAsync(PRESENCE_TICK_MS);

      expect(monitoring.getRosterSnapshot).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: false },
        'exam-1',
      );
      expect(emit).toHaveBeenCalledWith('roster:presence', {
        attemptId: 'attempt-1',
        candidateId: 'cand-1',
        online: true,
      });
    });
  });
});
