import { Logger } from '@nestjs/common';
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
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { MonitoringService, RosterRow } from './monitoring.service';

interface StaffSocketUser {
  userId: string;
  organizationId: string | null;
  role: string;
}

export const PRESENCE_TICK_MS = 15_000;
const EXAM_ROOM_PREFIX = 'exam:';

@WebSocketGateway({ namespace: '/monitoring', cors: { origin: process.env.WEB_ORIGIN } })
export class MonitoringGateway implements OnGatewayConnection, OnGatewayInit {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(MonitoringGateway.name);
  private readonly lastPresence = new Map<string, boolean>();

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly monitoring: MonitoringService,
  ) {}

  afterInit(): void {
    setInterval(() => {
      this.tickPresence().catch((error) => this.logger.error('Presence tick failed', error as Error));
    }, PRESENCE_TICK_MS);
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

    await client.join(`${EXAM_ROOM_PREFIX}${body.examId}`);
    client.emit('roster:snapshot', roster);
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

  emitMessageSent(examId: string, payload: { attemptId: string; candidateId: string; sentAt: Date }): void {
    this.server?.to(`${EXAM_ROOM_PREFIX}${examId}`).emit('message:sent', payload);
  }

  private async hasExamManagePermission(role: string): Promise<boolean> {
    const grant = await this.prisma.rolePermission.findFirst({ where: { role, permission: { key: 'exam:manage' } } });
    return !!grant;
  }

  private async tickPresence(): Promise<void> {
    const rooms = this.server.sockets.adapter.rooms;
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
