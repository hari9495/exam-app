import { Logger, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { PrismaService, resolvePermissionGrants } from '@exam-platform/shared';
import {
  MFA_REQUIRED_CODE,
  SessionAssurance,
  TenantPrismaService,
  clientIpOf,
  mfaSatisfied,
  staffDeskIpAllowed,
  touchStaffSession,
} from '@exam-platform/shared';
import { MonitoringService, RosterRow } from './monitoring.service';
import { LeaderboardService, RecruiterLeaderboardRow } from '../leaderboard/leaderboard.service';

interface StaffSocketUser {
  userId: string;
  organizationId: string | null;
  role: string;
  permissionProfileId: string | null;
  actingSuperAdmin?: boolean;
  session: SessionAssurance;
}

// What re-validating the socket needs (kept apart from the user it describes): the server-side
// session, whose holder owns it, and when the access token presented at connect expires.
interface StaffSocketAuth {
  sid: string;
  sessionUserId: string;
  expiresAtMs: number;
}

// Every tick rebroadcasts the full roster, so this is also how often a recruiter's
// "Time remaining" and "Progress" columns advance.
export const ROSTER_TICK_MS = 15_000;
const EXAM_ROOM_PREFIX = 'exam:';

@WebSocketGateway({ namespace: '/monitoring', cors: { origin: process.env.WEB_ORIGIN } })
export class MonitoringGateway implements OnGatewayConnection, OnGatewayInit, OnModuleDestroy {
  @WebSocketServer()
  server!: Namespace;

  private readonly logger = new Logger(MonitoringGateway.name);
  private rosterInterval?: NodeJS.Timeout;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly monitoring: MonitoringService,
    private readonly leaderboard: LeaderboardService,
  ) {}

  afterInit(server?: Namespace): void {
    // Authenticate in the namespace middleware, which socket.io finishes BEFORE accepting the
    // connection: the session check is async, and doing it in handleConnection would let a
    // client's first event (join-exam) race ahead of `client.data.user` being set.
    server?.use((socket, next) => {
      this.authenticate(socket).finally(() => next());
    });
    this.rosterInterval = setInterval(() => {
      this.tickRoster().catch((error) => this.logger.error('Roster tick failed', error as Error));
    }, ROSTER_TICK_MS);
  }

  onModuleDestroy(): void {
    if (this.rosterInterval) {
      clearInterval(this.rosterInterval);
    }
  }

  // Same rule as the API's JwtStrategy: a validly signed staff token is accepted only while its
  // server-side session is live (YX-IAM-06), so a revoked session cannot open a monitoring socket.
  // Leaves `client.data.user` unset on any failure; handleConnection then disconnects.
  async authenticate(client: Socket): Promise<void> {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      return;
    }
    try {
      const payload = this.jwt.verify(token, { secret: process.env.JWT_ACCESS_SECRET }) as {
        sub: string;
        organizationId: string | null;
        role: string;
        permissionProfileId?: string | null;
        actingSuperAdmin?: boolean;
        impersonatorUserId?: string;
        sid?: string;
        exp?: number;
      };
      const session = await touchStaffSession(this.tenantPrisma, payload.sid, payload.impersonatorUserId ?? payload.sub);
      if (!session) {
        return;
      }
      // The company's desk IP allow-list (YX-IAM-09), as the API applies to every staff request.
      if (!(await staffDeskIpAllowed(this.tenantPrisma, payload, clientIpOf(client.request)))) {
        return;
      }
      (client.data as { user?: StaffSocketUser }).user = {
        userId: payload.sub,
        organizationId: payload.organizationId,
        role: payload.role,
        permissionProfileId: payload.permissionProfileId ?? null,
        actingSuperAdmin: payload.actingSuperAdmin,
        session,
      };
      (client.data as { auth?: StaffSocketAuth }).auth = {
        sid: payload.sid!,
        sessionUserId: payload.impersonatorUserId ?? payload.sub,
        expiresAtMs: (payload.exp ?? 0) * 1000,
      };
    } catch {
      // invalid / expired token, or the session lookup failed: stay unauthenticated
    }
  }

  handleConnection(client: Socket): void {
    if (!(client.data as { user?: StaffSocketUser }).user) {
      client.disconnect(true);
    }
  }

  @SubscribeMessage('join-exam')
  async handleJoinExam(@ConnectedSocket() client: Socket, @MessageBody() body: { examId: string }): Promise<void> {
    const user = (client.data as { user?: StaffSocketUser }).user;
    if (!user) {
      client.disconnect(true);
      return;
    }

    const hasPermission = user.actingSuperAdmin || (await this.hasExamManagePermission(user));
    if (!hasPermission) {
      client.emit('error', { message: 'Missing required permission: exam:manage' });
      return;
    }
    // Live proctoring is a sensitive-role action (P12 §3 proctor): AAL2 once the enrolment grace
    // has passed (YX-IAM-01), as the API applies to proctor endpoints.
    if (!mfaSatisfied(user.session)) {
      client.emit('error', { code: MFA_REQUIRED_CODE, message: 'Set up two-step verification to continue.' });
      return;
    }

    const context = { organizationId: user.organizationId, isSuperAdmin: user.role === 'super_admin' };
    let roster: RosterRow[];
    try {
      roster = await this.monitoring.getRosterSnapshot(context, body.examId);
    } catch {
      client.emit('error', { message: `Exam ${body.examId} not found` });
      return;
    }

    client.emit('roster:snapshot', roster);

    try {
      const recentAlerts = await this.monitoring.getRecentAlerts(context, body.examId);
      client.emit('proctoring:recent', recentAlerts);
    } catch (error) {
      this.logger.error(`Recent alerts lookup failed for exam ${body.examId}`, error as Error);
    }

    // Join right after proctoring:recent rather than after every snapshot. proctoring:recent
    // *replaces* the client's alert list, so a proctoring:flag broadcast landing before the
    // join is delivered and then wiped by the replay -- joining here shrinks that window to
    // the gap between two synchronous emits instead of spanning the leaderboard round-trip
    // below too. This narrows but does not eliminate the window; fully closing it needs
    // join-first plus merge-instead-of-replace on the client, which is deliberately not done here.
    await client.join(`${EXAM_ROOM_PREFIX}${body.examId}`);

    const leaderboard = await this.leaderboard.computeRecruiterView(context, body.examId);
    client.emit('leaderboard:snapshot', leaderboard);
  }

  emitAttemptStatus(examId: string, payload: { attemptId: string; candidateId: string; status: string }): void {
    this.server?.to(`${EXAM_ROOM_PREFIX}${examId}`).emit('attempt:status', payload);
  }

  emitProctoringFlag(
    examId: string,
    payload: { attemptId: string; candidateId: string; eventType: string; severity: string; occurredAt: Date },
  ): void {
    this.server?.to(`${EXAM_ROOM_PREFIX}${examId}`).emit('proctoring:flag', payload);
  }

  // Narrow counterpart to attempt:status — the recruiter's roster is socket state, so
  // an apply/revoke has to reach it as an event or the row goes stale until reload.
  emitProctoringBypass(examId: string, payload: { attemptId: string; proctoringBypassed: boolean }): void {
    this.server?.to(`${EXAM_ROOM_PREFIX}${examId}`).emit('attempt:proctoring-bypass', payload);
  }

  emitMessageSent(examId: string, payload: { attemptId: string; candidateId: string; sentAt: Date }): void {
    this.server?.to(`${EXAM_ROOM_PREFIX}${examId}`).emit('message:sent', payload);
  }

  emitLeaderboardUpdate(examId: string, rows: RecruiterLeaderboardRow[]): void {
    this.server?.to(`${EXAM_ROOM_PREFIX}${examId}`).emit('leaderboard:update', rows);
  }

  // Same resolution as the HTTP PermissionsGuard (profile > per-org role override > role default).
  // Checking only the global role default let a user whose profile or org override removed
  // exam:manage still watch the live roster, proctoring flags and leaderboard.
  private async hasExamManagePermission(user: StaffSocketUser): Promise<boolean> {
    const granted = await resolvePermissionGrants(this.prisma, this.tenantPrisma, user, ['exam:manage']);
    return granted.has('exam:manage');
  }

  // Every connected socket is re-checked on each roster tick (YX-IAM-06, ASVS V3.3): its session
  // must still be live (not revoked, idle or past its absolute limit), the access token it
  // connected with unexpired, and -- once it has joined an exam -- exam:manage and the MFA floor
  // must still hold. Anything else disconnects it; the client reconnects with a fresh token, a
  // revoked session cannot. Fails closed.
  async revalidateSockets(): Promise<void> {
    const sockets = this.server?.sockets;
    if (!sockets) return;
    await Promise.all(
      [...sockets.values()].map(async (socket) => {
        if (!(await this.stillAuthorised(socket).catch(() => false))) socket.disconnect(true);
      }),
    );
  }

  private async stillAuthorised(socket: Socket): Promise<boolean> {
    const { user, auth } = socket.data as { user?: StaffSocketUser; auth?: StaffSocketAuth };
    if (!user || !auth || auth.expiresAtMs <= Date.now()) return false;
    const session = await touchStaffSession(this.tenantPrisma, auth.sid, auth.sessionUserId);
    if (!session) return false;
    user.session = session;
    const watching = [...socket.rooms].some((room) => room.startsWith(EXAM_ROOM_PREFIX));
    if (!watching) return true;
    return Boolean(user.actingSuperAdmin || (await this.hasExamManagePermission(user))) && mfaSatisfied(session);
  }

  private async tickRoster(): Promise<void> {
    await this.revalidateSockets();
    const rooms = this.server.adapter.rooms;
    for (const roomName of rooms.keys()) {
      if (!roomName.startsWith(EXAM_ROOM_PREFIX)) {
        continue;
      }
      const examId = roomName.slice(EXAM_ROOM_PREFIX.length);

      const exam = await this.tenantPrisma
        .forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.exam.findUnique({ where: { id: examId } }))
        .catch(() => null);
      if (!exam) {
        continue;
      }

      try {
        const roster = await this.monitoring.getRosterSnapshot(
          { organizationId: exam.organizationId, isSuperAdmin: false },
          examId,
        );

        // Broadcast the WHOLE row, not just the online flag. This snapshot already carries
        // fresh remainingSeconds / answeredCount / totalQuestions -- it was being computed
        // every tick and thrown away, so a recruiter who opened the Live tab BEFORE a
        // candidate started saw "—" in those columns for the rest of the exam: the only other
        // emitter of a full roster is the one-shot on join, and `attempt:status` carries just
        // the status and attemptId. It also means the clock actually advances (and, for a
        // paused or blocked attempt, correctly stops advancing) instead of being frozen at
        // whatever it read when the page loaded.
        this.server.to(roomName).emit('roster:snapshot', roster);
      } catch (error) {
        this.logger.error(`Roster snapshot failed for exam ${examId}`, error as Error);
      }
    }
  }
}
