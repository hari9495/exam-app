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
import { PrismaService } from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';
import { MonitoringService, RosterRow } from './monitoring.service';
import { LeaderboardService, RecruiterLeaderboardRow } from '../leaderboard/leaderboard.service';

interface StaffSocketUser {
  userId: string;
  organizationId: string | null;
  role: string;
}

export const PRESENCE_TICK_MS = 15_000;
const EXAM_ROOM_PREFIX = 'exam:';

@WebSocketGateway({ namespace: '/monitoring', cors: { origin: process.env.WEB_ORIGIN } })
export class MonitoringGateway implements OnGatewayConnection, OnGatewayInit, OnModuleDestroy {
  @WebSocketServer()
  server!: Namespace;

  private readonly logger = new Logger(MonitoringGateway.name);
  private readonly lastPresence = new Map<string, boolean>();
  private presenceInterval?: NodeJS.Timeout;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly monitoring: MonitoringService,
    private readonly leaderboard: LeaderboardService,
  ) {}

  afterInit(): void {
    this.presenceInterval = setInterval(() => {
      this.tickPresence().catch((error) => this.logger.error('Presence tick failed', error as Error));
    }, PRESENCE_TICK_MS);
  }

  onModuleDestroy(): void {
    if (this.presenceInterval) {
      clearInterval(this.presenceInterval);
    }
  }

  handleConnection(client: Socket): void {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      client.disconnect(true);
      return;
    }
    try {
      const payload = this.jwt.verify(token, { secret: process.env.JWT_ACCESS_SECRET }) as {
        sub: string;
        organizationId: string | null;
        role: string;
      };
      (client.data as { user?: StaffSocketUser }).user = {
        userId: payload.sub,
        organizationId: payload.organizationId,
        role: payload.role,
      };
    } catch {
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

    const hasPermission = await this.hasExamManagePermission(user.role);
    if (!hasPermission) {
      client.emit('error', { message: 'Missing required permission: exam:manage' });
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

  private async hasExamManagePermission(role: string): Promise<boolean> {
    const grant = await this.prisma.rolePermission.findFirst({ where: { role, permission: { key: 'exam:manage' } } });
    return !!grant;
  }

  private async tickPresence(): Promise<void> {
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

        for (const row of roster) {
          if (!row.attemptId) {
            continue;
          }
          const previous = this.lastPresence.get(row.attemptId);
          if (previous !== row.online) {
            this.lastPresence.set(row.attemptId, row.online);
            this.server.to(roomName).emit('roster:presence', {
              attemptId: row.attemptId,
              candidateId: row.candidateId,
              online: row.online,
            });
          }
        }
      } catch (error) {
        this.logger.error(`Roster snapshot failed for exam ${examId}`, error as Error);
      }
    }
  }
}
