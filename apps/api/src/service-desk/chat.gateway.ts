import { Logger, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { SessionAssurance, TenantPrismaService, clientIpOf, staffDeskIpAllowed, touchStaffSession } from '@exam-platform/shared';
import { CompanyContext } from '../org-structure/org-structure.service';
import { companyOriginPattern } from '../auth/company-scope';
import { ChatService } from './chat.service';
import { DeskAccessService, DeskActor, has, isAgentOn } from './desk-access';

// SD-2.18 (D1): the live chat line, our own socket.io namespace /desk-chat, shared across API servers by the Redis
// adapter (ChatIoAdapter). Same rules as every staff request (the exam-runtime monitoring gateway pattern):
//   - a signed staff access token AND its live server-side session (YX-IAM-06), the company's desk IP allow-list
//     (YX-IAM-09); YukthiX staff and anyone acting for someone else are refused;
//   - agent events need desk.chat.work, an agent seat on the desk and the company's two-step rule (DeskAccessService,
//     exactly as the HTTP routes); requester events need the chat to be their own;
//   - every socket is re-checked every 30 seconds: a revoked or expired session, an expired token, a lost seat or key
//     disconnects it; rooms are ids looked up in the person's own company (RLS), so no cross-company room;
//   - at most 30 events a minute per person, 16 KB per frame, 2,000 characters per message.

interface ChatUser {
  userId: string;
  organizationId: string;
  role: string;
  permissionProfileId: string | null;
  session: SessionAssurance;
}
interface ChatAuth {
  sid: string;
  sessionUserId: string;
  expiresAtMs: number;
}

export const RECHECK_MS = 30_000;
export const EVENTS_PER_MINUTE = 30;
export const MAX_FRAME_BYTES = 16 * 1024;

function origins() {
  const company = companyOriginPattern();
  return company ? [process.env.WEB_ORIGIN ?? '', company].filter(Boolean) : process.env.WEB_ORIGIN;
}

@WebSocketGateway({ namespace: '/desk-chat', cors: { origin: origins(), credentials: true }, maxHttpBufferSize: MAX_FRAME_BYTES })
export class ChatGateway implements OnGatewayConnection, OnGatewayInit, OnModuleDestroy {
  @WebSocketServer()
  server!: Namespace;

  private readonly logger = new Logger(ChatGateway.name);
  private timer?: NodeJS.Timeout;
  // ponytail: per-server counter; with several API servers a person gets 30 per server per minute. Move to Redis if abused.
  private readonly rate = new Map<string, number[]>();

  constructor(
    private readonly jwt: JwtService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly access: DeskAccessService,
    private readonly chat: ChatService,
  ) {}

  afterInit(server?: Namespace): void {
    // Authenticate in the namespace middleware, finished before the connection is accepted, so no event can race it.
    server?.use((socket, next) => {
      this.authenticate(socket).finally(() => next());
    });
    if (server) this.chat.server = server;
    this.timer = setInterval(() => {
      this.revalidateSockets().catch((e) => this.logger.error('chat socket re-check failed', e as Error));
    }, RECHECK_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async authenticate(client: Socket): Promise<void> {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) return;
    try {
      const p = this.jwt.verify(token, { secret: process.env.JWT_ACCESS_SECRET }) as { sub: string; organizationId: string | null; role: string; permissionProfileId?: string | null; actingSuperAdmin?: boolean; impersonatorUserId?: string; sid?: string; exp?: number };
      // A support session or an impersonation never chats for someone else (P02 YX-SEC-20).
      if (p.actingSuperAdmin || p.impersonatorUserId || !p.organizationId) return;
      const session = await touchStaffSession(this.tenantPrisma, p.sid, p.sub);
      if (!session) return;
      if (!(await staffDeskIpAllowed(this.tenantPrisma, p, clientIpOf(client.request)))) return;
      (client.data as { user?: ChatUser }).user = { userId: p.sub, organizationId: p.organizationId, role: p.role, permissionProfileId: p.permissionProfileId ?? null, session };
      (client.data as { auth?: ChatAuth }).auth = { sid: p.sid!, sessionUserId: p.sub, expiresAtMs: (p.exp ?? 0) * 1000 };
    } catch {
      // invalid or expired token, or the lookup failed: stays out
    }
  }

  handleConnection(client: Socket): void {
    if (!(client.data as { user?: ChatUser }).user) client.disconnect(true);
  }

  private ctx(u: ChatUser): CompanyContext {
    return { organizationId: u.organizationId, isSuperAdmin: false, userId: u.userId, role: u.role, permissionProfileId: u.permissionProfileId };
  }

  /** The person as a desk actor (keys, seats, the company's two-step rule), or null when they are not an agent anywhere. */
  private async actor(u: ChatUser): Promise<DeskActor | null> {
    return this.access.actorOf({ userId: u.userId, role: u.role, organizationId: u.organizationId, permissionProfileId: u.permissionProfileId, session: u.session }, this.ctx(u));
  }

  /** 30 events a minute per person; false = refused. */
  private allow(u: ChatUser): boolean {
    const now = Date.now();
    const recent = (this.rate.get(u.userId) ?? []).filter((t) => t > now - 60_000);
    if (recent.length >= EVENTS_PER_MINUTE) {
      this.rate.set(u.userId, recent);
      return false;
    }
    recent.push(now);
    this.rate.set(u.userId, recent);
    if (this.rate.size > 10_000) this.rate.clear();
    return true;
  }

  /**
   * One wrapper for every event: signed in, within the rate, and errors as plain { code, message } to the client only.
   * The actor is worked out per event (keys and seats can change; the HTTP routes do the same).
   */
  private async handle<T>(client: Socket, fn: (u: ChatUser, actor: () => Promise<DeskActor | null>) => Promise<T>): Promise<T | { error: { code: string; message: string } }> {
    const u = (client.data as { user?: ChatUser }).user;
    if (!u) {
      client.disconnect(true);
      return { error: { code: 'UNAUTHENTICATED', message: 'Sign in again.' } };
    }
    if (!this.allow(u)) return { error: { code: 'TOO_MANY', message: 'You are sending too fast. Wait a moment.' } };
    try {
      return await fn(u, () => this.actor(u));
    } catch (e) {
      const r = (e as { response?: { code?: string; message?: string | string[] }; status?: number }).response;
      return { error: { code: r?.code ?? 'REFUSED', message: Array.isArray(r?.message) ? r.message[0] : (r?.message ?? 'That did not work.') } };
    }
  }

  /** Join a chat's room: its requester, or an agent of its desk with the chat key. Returns the chat's messages. */
  @SubscribeMessage('chat:join')
  async join(@ConnectedSocket() client: Socket, @MessageBody() body: { sessionId?: unknown }) {
    return this.handle(client, async (u, actor) => {
      const id = typeof body?.sessionId === 'string' ? body.sessionId : '';
      const ctx = this.ctx(u);
      const own = await this.chat.mayJoin({ ctx, userId: u.userId, actor: null }, id).catch(() => false);
      const a = own ? null : await actor();
      if (!own && !(a && (await this.chat.mayJoin({ ctx, userId: u.userId, actor: a }, id).catch(() => false)))) return { error: { code: 'NOT_FOUND', message: 'No such chat.' } };
      await client.join(`chat:${id}`);
      return { joined: id };
    });
  }

  /** An agent watches the desk's queue (new chats, taken, ended). */
  @SubscribeMessage('chat:watch')
  async watch(@ConnectedSocket() client: Socket, @MessageBody() body: { deskId?: unknown }) {
    return this.handle(client, async (_u, actor) => {
      const deskId = typeof body?.deskId === 'string' ? body.deskId : '';
      const a = await actor();
      if (!a || !isAgentOn(a, deskId) || !has(a, 'desk.chat.work')) return { error: { code: 'DESK_AGENT_SEAT_REQUIRED', message: 'Only an agent of this desk can take chats.' } };
      await client.join(`desk:${deskId}`);
      return { watching: deskId };
    });
  }

  @SubscribeMessage('chat:send')
  async send(@ConnectedSocket() client: Socket, @MessageBody() body: { sessionId?: unknown; text?: unknown; card?: unknown; fileId?: unknown }) {
    return this.handle(client, async (u, actor) => {
      const id = typeof body?.sessionId === 'string' ? body.sessionId : '';
      const ctx = this.ctx(u);
      const own = await this.chat.mayJoin({ ctx, userId: u.userId, actor: null }, id).catch(() => false);
      return this.chat.post({ ctx, userId: u.userId, actor: own ? null : await actor() }, id, body ?? {});
    });
  }

  @SubscribeMessage('chat:seen')
  async seen(@ConnectedSocket() client: Socket, @MessageBody() body: { sessionId?: unknown }) {
    return this.handle(client, async (u) => (await this.chat.seen({ ctx: this.ctx(u), userId: u.userId }, typeof body?.sessionId === 'string' ? body.sessionId : '')) ?? { error: { code: 'NOT_FOUND', message: 'No such chat.' } });
  }

  /** Typing: only to the others already in the room, never stored. */
  @SubscribeMessage('chat:typing')
  async typing(@ConnectedSocket() client: Socket, @MessageBody() body: { sessionId?: unknown }) {
    const u = (client.data as { user?: ChatUser }).user;
    const id = typeof body?.sessionId === 'string' ? body.sessionId : '';
    if (!u || !client.rooms.has(`chat:${id}`)) return;
    client.to(`chat:${id}`).emit('chat:typing', { sessionId: id, userId: u.userId });
  }

  // Every socket is re-checked (YX-IAM-06, ASVS V3.3): the session must still be live, the token unexpired; a socket in
  // a desk room must still be an agent there with the chat key and the two-step rule met; a socket in a chat room must
  // still be allowed in that chat. Anything else disconnects it. Fails closed.
  async revalidateSockets(): Promise<void> {
    const sockets = this.server?.sockets;
    if (!sockets) return;
    await Promise.all(
      [...sockets.values()].map(async (s) => {
        if (!(await this.stillAllowed(s).catch(() => false))) s.disconnect(true);
      }),
    );
  }

  private async stillAllowed(s: Socket): Promise<boolean> {
    const { user, auth } = s.data as { user?: ChatUser; auth?: ChatAuth };
    if (!user || !auth || auth.expiresAtMs <= Date.now()) return false;
    const session = await touchStaffSession(this.tenantPrisma, auth.sid, auth.sessionUserId);
    if (!session) return false;
    user.session = session;
    const rooms = [...s.rooms].filter((r) => r.startsWith('desk:') || r.startsWith('chat:'));
    if (!rooms.length) return true;
    const ctx = this.ctx(user);
    let a: DeskActor | null | undefined;
    for (const r of rooms) {
      const id = r.slice(5);
      if (r.startsWith('desk:')) {
        a ??= await this.actor(user);
        if (!a || !isAgentOn(a, id) || !has(a, 'desk.chat.work')) return false;
      } else if (!(await this.chat.mayJoin({ ctx, userId: user.userId, actor: null }, id))) {
        a ??= await this.actor(user);
        if (!a || !(await this.chat.mayJoin({ ctx, userId: user.userId, actor: a }, id))) return false;
      }
    }
    return true;
  }
}
