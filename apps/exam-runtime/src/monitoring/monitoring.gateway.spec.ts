import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { MonitoringGateway, ROSTER_TICK_MS } from './monitoring.gateway';
import { PrismaService } from '@exam-platform/shared';
import { DEFAULT_SECURITY_POLICY, TenantPrismaService, invalidateTenantSecurityPolicy } from '@exam-platform/shared';
import { MonitoringService } from './monitoring.service';
import { LeaderboardService } from '../leaderboard/leaderboard.service';

describe('MonitoringGateway', () => {
  let gateway: MonitoringGateway;
  let jwt: JwtService;
  let prisma: { rolePermission: { findMany: jest.Mock } };
  let tenantPrisma: { forTenant: jest.Mock };
  // The session's MFA state as touchStaffSession returns it: AAL2.
  const ASSURANCE = { assuranceLevel: 'aal2', mfaVerifiedAt: new Date(), mfaMethod: 'passkey', mfaEnrolmentDueAt: new Date(0) };
  let monitoring: { getRosterSnapshot: jest.Mock; getRecentAlerts: jest.Mock };
  let leaderboardService: { computeRecruiterView: jest.Mock };

  function makeSocket(overrides: Record<string, unknown> = {}) {
    return {
      handshake: { auth: {} },
      request: { headers: {}, socket: { remoteAddress: '203.0.113.5' } },
      data: {},
      disconnect: jest.fn(),
      join: jest.fn().mockResolvedValue(undefined),
      emit: jest.fn(),
      ...overrides,
    } as any;
  }

  beforeEach(async () => {
    prisma = { rolePermission: { findMany: jest.fn() } };
    tenantPrisma = { forTenant: jest.fn() };
    invalidateTenantSecurityPolicy('org-1');
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
    const USER = '11111111-1111-4111-8111-111111111111';
    const SID = '22222222-2222-4222-8222-222222222222';
    const sessionLive = (live: boolean) => tenantPrisma.forTenant.mockResolvedValueOnce(live ? [ASSURANCE] : []);

    it('disconnects a socket with no auth token', async () => {
      const socket = makeSocket();

      await gateway.authenticate(socket);
      gateway.handleConnection(socket);

      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('disconnects a socket with an invalid token', async () => {
      const socket = makeSocket({ handshake: { auth: { token: 'not-a-real-jwt' } } });

      await gateway.authenticate(socket);
      gateway.handleConnection(socket);

      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('attaches the decoded staff user to the socket for a valid token with a live session', async () => {
      const token = jwt.sign({ sub: USER, organizationId: 'org-1', role: 'recruiter', sid: SID }, { secret: process.env.JWT_ACCESS_SECRET });
      const socket = makeSocket({ handshake: { auth: { token } } });
      sessionLive(true);

      await gateway.authenticate(socket);
      gateway.handleConnection(socket);

      expect(socket.disconnect).not.toHaveBeenCalled();
      expect(socket.data.user).toEqual({ userId: USER, organizationId: 'org-1', role: 'recruiter', permissionProfileId: null, session: ASSURANCE });
    });

    it('disconnects a validly signed token whose session is revoked or expired', async () => {
      const token = jwt.sign({ sub: USER, organizationId: 'org-1', role: 'recruiter', sid: SID }, { secret: process.env.JWT_ACCESS_SECRET });
      const socket = makeSocket({ handshake: { auth: { token } } });
      sessionLive(false);

      await gateway.authenticate(socket);
      gateway.handleConnection(socket);

      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(socket.data.user).toBeUndefined();
    });

    it('disconnects a pre-sessions token that carries no sid, without touching the database', async () => {
      const token = jwt.sign({ sub: USER, organizationId: 'org-1', role: 'recruiter' }, { secret: process.env.JWT_ACCESS_SECRET });
      const socket = makeSocket({ handshake: { auth: { token } } });

      await gateway.authenticate(socket);
      gateway.handleConnection(socket);

      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
    });

    it('authenticates in namespace middleware, so the connection is accepted only after the session check', async () => {
      const token = jwt.sign({ sub: USER, organizationId: 'org-1', role: 'recruiter', sid: SID }, { secret: process.env.JWT_ACCESS_SECRET });
      let middleware: (socket: unknown, next: () => void) => void = () => undefined;
      gateway.afterInit({ use: (fn: typeof middleware) => (middleware = fn) } as any);
      gateway.onModuleDestroy();
      const socket = makeSocket({ handshake: { auth: { token } } });
      sessionLive(true);

      await new Promise<void>((resolve) => middleware(socket, resolve));

      expect(socket.data.user).toEqual(expect.objectContaining({ userId: USER }));
    });

    describe("the company's desk IP allow-list (YX-IAM-09)", () => {
      const connectFrom = async (ip: string, claims: object = { role: 'recruiter' }) => {
        const token = jwt.sign({ sub: USER, organizationId: 'org-1', sid: SID, ...claims }, { secret: process.env.JWT_ACCESS_SECRET });
        const socket = makeSocket({ handshake: { auth: { token } }, request: { headers: {}, socket: { remoteAddress: ip } } });
        sessionLive(true);
        tenantPrisma.forTenant.mockResolvedValueOnce({ ...DEFAULT_SECURITY_POLICY, ipAllowlistDesk: ['203.0.113.0/24'], organizationId: 'org-1' });
        await gateway.authenticate(socket);
        gateway.handleConnection(socket);
        return socket;
      };

      it('refuses a live staff session connecting from outside the list', async () => {
        const socket = await connectFrom('192.0.2.1');
        expect(socket.data.user).toBeUndefined();
        expect(socket.disconnect).toHaveBeenCalledWith(true);
      });

      it('accepts it from inside the list', async () => {
        const socket = await connectFrom('203.0.113.99');
        expect(socket.data.user).toEqual(expect.objectContaining({ userId: USER }));
      });
    });

    it('refuses YukthiX staff inside a company: support sessions never watch candidates (P02 Q8, YX-SEC-23)', async () => {
      const token = jwt.sign(
        { sub: USER, organizationId: 'org-1', role: 'super_admin', actingSuperAdmin: true, supportSessionId: 'ss-1', sid: SID },
        { secret: process.env.JWT_ACCESS_SECRET },
      );
      const socket = makeSocket({ handshake: { auth: { token } } });
      sessionLive(true);

      await gateway.authenticate(socket);
      gateway.handleConnection(socket);

      expect(socket.data.user).toBeUndefined();
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });
  });

  describe('handleJoinExam', () => {
    // The shared resolver also reads the user's active role grants (P02 YX-SEC-03): none unless a test says so.
    beforeEach(() => tenantPrisma.forTenant.mockImplementation(async (_ctx: unknown, fn: (tx: unknown) => unknown) => fn({ $queryRaw: async () => [], orgRolePermission: { findUnique: async () => null } })));

    it('disconnects a socket with no authenticated user', async () => {
      const socket = makeSocket();

      await gateway.handleJoinExam(socket, { examId: 'exam-1' });

      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('emits an error and does not join when the role lacks exam:manage', async () => {
      const socket = makeSocket({ data: { user: { session: ASSURANCE, userId: 'user-1', organizationId: 'org-1', role: 'panel' } } });
      prisma.rolePermission.findMany.mockResolvedValue([]);

      await gateway.handleJoinExam(socket, { examId: 'exam-1' });

      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Missing required permission: exam:manage' });
      expect(socket.join).not.toHaveBeenCalled();
    });

    // Must match apps/api's PermissionsGuard: a profile or a per-org override REPLACES the role default.
    it('denies a recruiter whose permission profile lacks exam:manage, even though the role grants it', async () => {
      const socket = makeSocket({
        data: { user: { session: ASSURANCE, userId: 'user-1', organizationId: 'org-1', role: 'recruiter', permissionProfileId: 'profile-1' } },
      });
      const findUnique = jest.fn().mockResolvedValue({ permissionsJson: JSON.stringify(['org:view', 'results:view']) });
      tenantPrisma.forTenant.mockImplementation((_ctx: unknown, fn: (tx: unknown) => unknown) => fn({ permissionProfile: { findUnique }, $queryRaw: async () => [] }));
      prisma.rolePermission.findMany.mockResolvedValue([{ permission: { key: 'exam:manage' } }]);

      await gateway.handleJoinExam(socket, { examId: 'exam-1' });

      expect(findUnique).toHaveBeenCalledWith({ where: { id: 'profile-1' }, select: { permissionsJson: true } });
      expect(prisma.rolePermission.findMany).not.toHaveBeenCalled();
      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Missing required permission: exam:manage' });
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('denies a recruiter when the org override for the role removed exam:manage', async () => {
      const socket = makeSocket({ data: { user: { session: ASSURANCE, userId: 'user-1', organizationId: 'org-1', role: 'recruiter', permissionProfileId: null } } });
      const findUnique = jest.fn().mockResolvedValue({ permissionsJson: JSON.stringify(['org:view']) });
      tenantPrisma.forTenant.mockImplementation((_ctx: unknown, fn: (tx: unknown) => unknown) => fn({ orgRolePermission: { findUnique }, $queryRaw: async () => [] }));
      prisma.rolePermission.findMany.mockResolvedValue([{ permission: { key: 'exam:manage' } }]);

      await gateway.handleJoinExam(socket, { examId: 'exam-1' });

      expect(findUnique).toHaveBeenCalledWith({
        where: { organizationId_role: { organizationId: 'org-1', role: 'recruiter' } },
        select: { permissionsJson: true },
      });
      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Missing required permission: exam:manage' });
      expect(socket.join).not.toHaveBeenCalled();
    });

    // Live proctoring is a sensitive-role action (P12 §3 proctor, YX-IAM-01).
    it('refuses live proctoring to an AAL1 session once the MFA enrolment grace is over', async () => {
      const pastDue = { assuranceLevel: 'aal1', mfaVerifiedAt: null, mfaMethod: null, mfaEnrolmentDueAt: new Date(Date.now() - 1000) };
      const socket = makeSocket({ data: { user: { session: pastDue, userId: 'user-1', organizationId: 'org-1', role: 'recruiter' } } });
      prisma.rolePermission.findMany.mockResolvedValue([{ permission: { key: 'exam:manage' } }]);

      await gateway.handleJoinExam(socket, { examId: 'exam-1' });

      expect(socket.emit).toHaveBeenCalledWith('error', { code: 'MFA_REQUIRED', message: 'Set up two-step verification to continue.' });
      expect(monitoring.getRosterSnapshot).not.toHaveBeenCalled();
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('still allows it at AAL1 inside the enrolment grace', async () => {
      const inGrace = { assuranceLevel: 'aal1', mfaVerifiedAt: null, mfaMethod: null, mfaEnrolmentDueAt: new Date(Date.now() + 86_400_000) };
      const socket = makeSocket({ data: { user: { session: inGrace, userId: 'user-1', organizationId: 'org-1', role: 'recruiter' } } });
      prisma.rolePermission.findMany.mockResolvedValue([{ permission: { key: 'exam:manage' } }]);
      monitoring.getRosterSnapshot.mockResolvedValue([]);
      leaderboardService.computeRecruiterView.mockResolvedValue([]);

      await gateway.handleJoinExam(socket, { examId: 'exam-1' });

      expect(socket.join).toHaveBeenCalledWith('exam:exam-1');
    });

    it('emits an error when the roster lookup throws (exam not found / not owned)', async () => {
      const socket = makeSocket({ data: { user: { session: ASSURANCE, userId: 'user-1', organizationId: 'org-1', role: 'recruiter' } } });
      prisma.rolePermission.findMany.mockResolvedValue([{ permission: { key: 'exam:manage' } }]);
      monitoring.getRosterSnapshot.mockRejectedValue(new Error('not found'));

      await gateway.handleJoinExam(socket, { examId: 'exam-1' });

      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Exam exam-1 not found' });
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('joins the exam room and emits a roster snapshot on success', async () => {
      const socket = makeSocket({ data: { user: { session: ASSURANCE, userId: 'user-1', organizationId: 'org-1', role: 'recruiter' } } });
      prisma.rolePermission.findMany.mockResolvedValue([{ permission: { key: 'exam:manage' } }]);
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

    it('emits proctoring:recent before joining the room, so no live flag can be wiped by the replay', async () => {
      // proctoring:recent replaces the client's alert list. Joining first meant a
      // proctoring:flag broadcast during the awaited history query was delivered,
      // appended client-side, and then thrown away by the replay that followed.
      const socket = makeSocket({ data: { user: { session: ASSURANCE, userId: 'user-1', organizationId: 'org-1', role: 'recruiter' } } });
      prisma.rolePermission.findMany.mockResolvedValue([{ permission: { key: 'exam:manage' } }]);
      monitoring.getRosterSnapshot.mockResolvedValue([]);
      monitoring.getRecentAlerts.mockResolvedValue([]);
      leaderboardService.computeRecruiterView.mockResolvedValue([]);

      await gateway.handleJoinExam(socket, { examId: 'exam-1' });

      const replayOrder = socket.emit.mock.calls.findIndex(([event]: [string]) => event === 'proctoring:recent');
      expect(replayOrder).toBeGreaterThanOrEqual(0);
      expect(socket.emit.mock.invocationCallOrder[replayOrder]).toBeLessThan(socket.join.mock.invocationCallOrder[0]);
    });

    it('does not throw and still emits the leaderboard snapshot when recent-alerts lookup fails', async () => {
      const socket = makeSocket({ data: { user: { session: ASSURANCE, userId: 'user-1', organizationId: 'org-1', role: 'recruiter' } } });
      prisma.rolePermission.findMany.mockResolvedValue([{ permission: { key: 'exam:manage' } }]);
      const roster = [{ candidateId: 'cand-1' }];
      monitoring.getRosterSnapshot.mockResolvedValue(roster);
      monitoring.getRecentAlerts.mockRejectedValue(new Error('db hiccup'));
      const leaderboardSnapshot = [{
        rank: 1, candidateId: 'cand-1', candidateName: 'Alice', correctCount: 2,
        totalAutoGradableQuestions: 3, status: 'submitted', timeTakenSeconds: 120, remainingSeconds: null,
        score: 8, maxScore: 10, percentage: 80, passFail: 'pass', percentile: 90,
      }];
      leaderboardService.computeRecruiterView.mockResolvedValue(leaderboardSnapshot);

      await expect(gateway.handleJoinExam(socket, { examId: 'exam-1' })).resolves.not.toThrow();

      expect(socket.emit).not.toHaveBeenCalledWith('proctoring:recent', expect.anything());
      expect(socket.emit).not.toHaveBeenCalledWith('error', expect.anything());
      expect(socket.emit).toHaveBeenCalledWith('leaderboard:snapshot', leaderboardSnapshot);
    });
  });

  // Regression (ASVS V3.3, YX-IAM-06): a socket used to be checked at connect only, so a proctor
  // whose session was revoked (admin revoke, password reset, deactivation, MFA reset, role
  // change) kept receiving live roster data, past token expiry and session limits.
  describe('re-validating open sockets on every roster tick', () => {
    const USER = '11111111-1111-4111-8111-111111111111';
    const SID = '22222222-2222-4222-8222-222222222222';
    const connected = async (claims: Record<string, unknown> = {}, rooms: string[] = ['exam:exam-1']) => {
      const token = jwt.sign({ sub: USER, organizationId: 'org-1', role: 'recruiter', sid: SID, ...claims }, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: 900 });
      const socket = makeSocket({ id: 's1', handshake: { auth: { token } }, rooms: new Set(['s1', ...rooms]) });
      tenantPrisma.forTenant.mockResolvedValueOnce([ASSURANCE]);
      await gateway.authenticate(socket);
      (gateway as any).server = { sockets: new Map([['s1', socket]]), adapter: { rooms: new Map() } };
      return socket;
    };
    const grantsExamManage = (granted: boolean) => prisma.rolePermission.findMany.mockResolvedValue(granted ? [{ permission: { key: 'exam:manage' } }] : []);
    // touchStaffSession (raw query) or the permission lookup (callback), by call shape.
    const sessionIs = (rows: unknown[]) =>
      tenantPrisma.forTenant.mockImplementation(async (_ctx: unknown, fn: (tx: unknown) => unknown) =>
        fn({ $queryRaw: async (sql: TemplateStringsArray) => (sql.join('').includes('role_grants') ? [] : rows), orgRolePermission: { findUnique: async () => null } }),
      );

    it('remembers which session the socket rides on and when its token expires', async () => {
      const socket = await connected();
      expect(socket.data.auth).toEqual({ sid: SID, sessionUserId: USER, expiresAtMs: expect.any(Number) });
      expect(socket.data.auth.expiresAtMs).toBeGreaterThan(Date.now());
    });

    it('keeps a live, authorised socket and refreshes its session snapshot', async () => {
      const socket = await connected();
      grantsExamManage(true);
      const later = { ...ASSURANCE, mfaVerifiedAt: new Date(Date.now() + 1) };
      sessionIs([later]);
      await gateway.revalidateSockets();
      expect(socket.disconnect).not.toHaveBeenCalled();
      expect(socket.data.user.session).toEqual(later);
    });

    it('disconnects a socket whose session was revoked or idled out', async () => {
      const socket = await connected();
      sessionIs([]);
      await gateway.revalidateSockets();
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('disconnects a socket whose access token has expired, without a lookup', async () => {
      const socket = await connected();
      socket.data.auth.expiresAtMs = Date.now() - 1;
      tenantPrisma.forTenant.mockClear();
      await gateway.revalidateSockets();
      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
    });

    it('disconnects a watcher who lost exam:manage, or whose MFA grace ran out at AAL1', async () => {
      const lost = await connected();
      grantsExamManage(false);
      sessionIs([ASSURANCE]);
      await gateway.revalidateSockets();
      expect(lost.disconnect).toHaveBeenCalledWith(true);

      const aal1 = await connected();
      grantsExamManage(true);
      sessionIs([{ assuranceLevel: 'aal1', mfaVerifiedAt: null, mfaMethod: null, mfaEnrolmentDueAt: new Date(0) }]);
      await gateway.revalidateSockets();
      expect(aal1.disconnect).toHaveBeenCalledWith(true);
    });

    it('fails closed: a lookup error disconnects', async () => {
      const socket = await connected();
      tenantPrisma.forTenant.mockRejectedValue(new Error('db down'));
      await gateway.revalidateSockets();
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('runs on the roster tick', async () => {
      const spy = jest.spyOn(gateway, 'revalidateSockets').mockResolvedValue(undefined);
      (gateway as any).server = { adapter: { rooms: new Map() } };
      await (gateway as any).tickRoster();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('emitLeaderboardUpdate', () => {
    it('emits leaderboard:update to the exam room', () => {
      (gateway as any).server = { to: jest.fn().mockReturnThis(), emit: jest.fn() };

      const row = {
        rank: 1, candidateId: 'cand-1', candidateName: 'Alice', correctCount: 3,
        totalAutoGradableQuestions: 5, status: 'submitted', timeTakenSeconds: 300, remainingSeconds: null,
        score: 9, maxScore: 10, percentage: 90, passFail: 'pass', percentile: 95,
      };
      gateway.emitLeaderboardUpdate('exam-1', [row]);

      expect((gateway as any).server.to).toHaveBeenCalledWith('exam:exam-1');
      expect((gateway as any).server.emit).toHaveBeenCalledWith('leaderboard:update', [row]);
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
      jest.advanceTimersByTime(ROSTER_TICK_MS * 2);
      expect(monitoring.getRosterSnapshot).not.toHaveBeenCalled();
    });

    it('is a no-op when called before afterInit ever ran', () => {
      expect(() => gateway.onModuleDestroy()).not.toThrow();
    });
  });

  describe('tickRoster via the interval (realistic Server shape)', () => {
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
      // A row as the roster snapshot really shapes it -- the tick used to reduce this to just
      // the online flag, which is why Time remaining and Progress stayed "—" all exam.
      const row = {
        attemptId: 'attempt-1',
        candidateId: 'cand-1',
        online: true,
        status: 'in_progress',
        remainingSeconds: 1500,
        answeredCount: 3,
        totalQuestions: 10,
      };
      monitoring.getRosterSnapshot.mockResolvedValue([row]);

      gateway.afterInit();
      await jest.advanceTimersByTimeAsync(ROSTER_TICK_MS);

      expect(monitoring.getRosterSnapshot).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: false },
        'exam-1',
      );
      // Regression: the whole row must go out, carrying the fresh clock and progress -- not a
      // narrow presence payload, and not only when `online` happens to have changed.
      expect(emit).toHaveBeenCalledWith('roster:snapshot', [row]);
      expect(emit).not.toHaveBeenCalledWith('roster:presence', expect.anything());
    });

    it('rebroadcasts on every tick even when nothing about presence changed', async () => {
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
      // Same online flag both ticks: the old change-detection would have emitted once and then
      // gone silent, freezing the recruiter's clock for the rest of the exam.
      monitoring.getRosterSnapshot.mockResolvedValue([
        { attemptId: 'attempt-1', candidateId: 'cand-1', online: true, status: 'in_progress', remainingSeconds: 1500 },
      ]);

      gateway.afterInit();
      await jest.advanceTimersByTimeAsync(ROSTER_TICK_MS);
      await jest.advanceTimersByTimeAsync(ROSTER_TICK_MS);

      const snapshots = emit.mock.calls.filter((call) => call[0] === 'roster:snapshot');
      expect(snapshots).toHaveLength(2);
    });
  });
});
