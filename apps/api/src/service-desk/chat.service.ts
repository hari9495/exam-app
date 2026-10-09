import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Namespace } from 'socket.io';
import { TenantPrismaService } from '@exam-platform/shared';
import { Tx } from '../org-structure/org-structure.service';
import { RuleError } from '../rules-engine/conditions';
import { EMPTY_FORM, FormDef, checkAnswers, parseForm, summarise } from '../rules-engine/forms';
import { AttachmentsService } from './attachments.service';
import { DeskActor, SEAT_REQUIRED, audit, deskSystem, emit, has, isAgentOn, isLead, requireDesk, requireSetUp } from './desk-access';
import { maskPii } from './pii';
import { profileOf } from './people-facts';
import { Requester, RequesterService } from './requester.service';
import { textToHtml } from './rich-text';
import { OPEN_STATES, TicketsService, asDeskJob } from './tickets.service';

// SD-2.17 … SD-2.19 (US-B-132, US-B-135, US-G-056, US-G-059): live chat on our own socket.io server (D1) and the
// light interaction record for chats, calls and walk-ups.
//   - Queues belong to a desk (its team, how many chats an agent takes at once, how long a chat waits before it becomes
//     a ticket), with a pre-chat form (P18), a welcome line and proactive prompts by page.
//   - A signed-in employee starts a chat (at most 3 open); agents of the desk (desk.chat.work + an agent seat) see the
//     queue, take chats up to their limit, hand one to another queue or agent, end it as resolved, or turn it into a
//     ticket with the transcript. A chat nobody takes in time becomes a ticket by itself. Each chat ends as an
//     interaction (resolved, ticket or abandoned), so first-contact resolution is counted honestly.
//   - Messages are text (masked like ticket text, YX-SD-15, up to 2,000 characters), cards from agents (a title, text
//     and reply buttons; never links or HTML) and files (the same type check and virus scan as ticket files). "Seen"
//     markers are kept for chat only (D11). The requester rates the chat once it ends.
// REST does the state changes (guards, keys, throttles); the socket gateway carries messages and live updates.

export const MAX_OPEN_PER_PERSON = 3;
export const MAX_BODY = 2000;
type Session = Prisma.SdChatSessionGetPayload<object>;
export interface Card {
  title?: string;
  text?: string;
  buttons?: { label: string; reply: string }[];
}
export interface Prompt {
  id: string;
  pathPrefix: string;
  text: string;
  afterSeconds: number;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown, max: number) => (typeof x === 'string' ? x.trim().slice(0, max) : '');

/** An agent's card: plain words and reply buttons only (no links, no markup). Throws a plain 400. */
export function parseCard(x: unknown): Card | null {
  if (x === undefined || x === null) return null;
  if (!isObj(x)) throw new BadRequestException('The card is not in the expected shape.');
  for (const k of Object.keys(x)) if (!['title', 'text', 'buttons'].includes(k)) throw new BadRequestException('The card has an unknown part.');
  const card: Card = {};
  if (x.title !== undefined) card.title = maskPii(str(x.title, 100)).text;
  if (x.text !== undefined) card.text = maskPii(str(x.text, 500)).text;
  if (x.buttons !== undefined) {
    if (!Array.isArray(x.buttons) || x.buttons.length > 5) throw new BadRequestException('Use up to 5 buttons.');
    card.buttons = x.buttons.map((b) => {
      if (!isObj(b)) throw new BadRequestException('A button is not in the expected shape.');
      const label = str(b.label, 40);
      const reply = str(b.reply ?? b.label, 200);
      if (!label || !reply) throw new BadRequestException('Give every button a label.');
      return { label, reply };
    });
  }
  if (!card.title && !card.text && !card.buttons?.length) throw new BadRequestException('The card is empty.');
  return card;
}

export function parsePrompts(x: unknown): Prompt[] {
  if (x === undefined || x === null) return [];
  if (!Array.isArray(x) || x.length > 10) throw new BadRequestException('Add up to 10 prompts.');
  return x.map((p, i) => {
    if (!isObj(p)) throw new BadRequestException(`Prompt ${i + 1} is not in the expected shape.`);
    const pathPrefix = str(p.pathPrefix, 100);
    const text = str(p.text, 200);
    const afterSeconds = Number(p.afterSeconds ?? 0);
    if (!/^\/[A-Za-z0-9/_-]*$/.test(pathPrefix)) throw new BadRequestException(`Prompt ${i + 1}: the page starts with / (for example /yx/desk/help).`);
    if (!text) throw new BadRequestException(`Prompt ${i + 1}: write what it says.`);
    if (!Number.isInteger(afterSeconds) || afterSeconds < 0 || afterSeconds > 600) throw new BadRequestException(`Prompt ${i + 1}: show it after 0 to 600 seconds.`);
    return { id: str(p.id, 40) || `p${i + 1}`, pathPrefix, text, afterSeconds };
  });
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  /** Set by the gateway once socket.io is up (null in jobs and tests without sockets). */
  server: Namespace | null = null;

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tickets: TicketsService,
    private readonly requesters: RequesterService,
    private readonly files: AttachmentsService,
  ) {}

  private tx<T>(a: { ctx: DeskActor['ctx'] }, fn: (tx: Tx) => Promise<T>) {
    return this.tenantPrisma.forTenant(a.ctx, fn);
  }

  /** Live updates after the change committed. Rooms are ids, and joining one is checked (ChatGateway). */
  tell(room: string, event: string, payload: Record<string, unknown>) {
    this.server?.to(room).emit(event, payload);
  }

  private async agentsOnline(deskId: string): Promise<boolean> {
    if (!this.server) return false;
    return (await this.server.in(`desk:${deskId}`).fetchSockets()).length > 0;
  }

  // ------------------------------------------------------------------------------------------ queues (set-up)

  async queues(a: DeskActor, deskId: string) {
    if (!a.roles.has(deskId) && !has(a, 'desk.desk.create')) throw new NotFoundException('No such desk.');
    return this.tx(a, async (tx) => {
      const rows = await tx.sdChatQueue.findMany({ where: { organizationId: a.ctx.organizationId, deskId }, orderBy: { name: 'asc' } });
      return rows.map((q) => ({ id: q.id, name: q.name, groupId: q.groupId, active: q.active, maxPerAgent: q.maxPerAgent, waitMinutes: q.waitMinutes, welcome: q.welcome, preChat: q.preChat, prompts: q.prompts, version: q.version }));
    });
  }

  async saveQueue(a: DeskActor, id: string | null, dto: { deskId?: string; name?: string; groupId?: string | null; active?: boolean; maxPerAgent?: number; waitMinutes?: number; welcome?: string | null; preChat?: unknown; prompts?: unknown; version?: number }) {
    let preChat: FormDef | undefined;
    try {
      preChat = dto.preChat === undefined ? undefined : parseForm(dto.preChat ?? EMPTY_FORM);
    } catch (e) {
      if (e instanceof RuleError) throw new BadRequestException(e.message);
      throw e;
    }
    const prompts = dto.prompts === undefined ? undefined : parsePrompts(dto.prompts);
    try {
      return await this.tx(a, async (tx) => {
        const org = a.ctx.organizationId;
        const deskId = id ? (await tx.sdChatQueue.findFirst({ where: { organizationId: org, id }, select: { deskId: true } }))?.deskId : dto.deskId;
        if (!deskId) throw new NotFoundException('No such queue.');
        requireSetUp(a, deskId, 'desk.channel.manage');
        await requireDesk(tx, a, deskId);
        if (dto.groupId && !(await tx.sdGroup.findFirst({ where: { organizationId: org, deskId, id: dto.groupId, active: true }, select: { id: true } }))) throw new BadRequestException('Choose a team of this desk.');
        const data = { name: dto.name, groupId: dto.groupId, active: dto.active, maxPerAgent: dto.maxPerAgent, waitMinutes: dto.waitMinutes, welcome: dto.welcome, ...(preChat ? { preChat: preChat as unknown as Prisma.InputJsonValue } : {}), ...(prompts ? { prompts: prompts as unknown as Prisma.InputJsonValue } : {}) };
        if (!id) {
          const q = await tx.sdChatQueue.create({ data: { ...data, name: dto.name!, organizationId: org, deskId, createdBy: a.userId } });
          await audit(tx, a, 'desk.chat_queue.created', 'sd_chat_queue', q.id, { deskId, name: q.name });
          return { id: q.id, version: q.version };
        }
        const res = await tx.sdChatQueue.updateMany({ where: { id, version: dto.version }, data: { ...data, version: { increment: 1 }, updatedAt: new Date() } });
        if (!res.count) throw new ConflictException('Someone changed this queue. Reload to see the latest.');
        await audit(tx, a, 'desk.chat_queue.saved', 'sd_chat_queue', id, { name: dto.name, active: dto.active });
        return { id, version: (dto.version ?? 0) + 1 };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('A queue with that name exists on this desk.');
      throw e;
    }
  }

  // ------------------------------------------------------------------------------------------ the requester

  /** Queues the person can chat with: active queues of employee help desks, with whether an agent is there now. */
  async myQueues(r: Requester) {
    const rows = await this.tx(r, async (tx) => {
      const desks = await tx.sdDesk.findMany({ where: { organizationId: r.ctx.organizationId, status: 'active', kind: { not: 'customer_support' } }, select: { id: true, name: true } });
      const qs = await tx.sdChatQueue.findMany({ where: { organizationId: r.ctx.organizationId, active: true, deskId: { in: desks.map((d) => d.id) } }, orderBy: { name: 'asc' } });
      const names = new Map(desks.map((d) => [d.id, d.name]));
      return qs.map((q) => ({ id: q.id, deskId: q.deskId, desk: names.get(q.deskId) ?? '', name: q.name, welcome: q.welcome, preChat: q.preChat, prompts: q.prompts as unknown as Prompt[] }));
    });
    return Promise.all(rows.map(async (q) => ({ ...q, online: await this.agentsOnline(q.deskId) })));
  }

  /** US-G-059: the proactive prompt for this page (the first queue whose page matches), only when someone can answer. */
  async prompt(r: Requester, path: string) {
    for (const q of await this.myQueues(r)) {
      const p = q.prompts.find((x) => path === x.pathPrefix || path.startsWith(x.pathPrefix.endsWith('/') ? x.pathPrefix : `${x.pathPrefix}/`));
      if (p && q.online) return { queueId: q.id, desk: q.desk, text: p.text, afterSeconds: p.afterSeconds };
    }
    return null;
  }

  async start(r: Requester, dto: { queueId: string; subject?: string; answers?: unknown }) {
    if (r.acting) throw new ForbiddenException('Not available while acting for someone else');
    const s = await this.tx(r, async (tx) => {
      const org = r.ctx.organizationId;
      const q = await tx.sdChatQueue.findFirst({ where: { organizationId: org, id: dto.queueId, active: true } });
      const desk = q && (await tx.sdDesk.findFirst({ where: { organizationId: org, id: q.deskId, status: 'active' }, select: { kind: true } }));
      if (!q || !desk || desk.kind === 'customer_support') throw new NotFoundException('No such chat.');
      const personId = (await this.requesters.personOf(tx, r, true))!;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sd-chat:${org}:${r.userId}`}))`;
      const open = await tx.sdChatSession.count({ where: { organizationId: org, requesterUserId: r.userId, state: { in: ['queued', 'active'] } } });
      if (open >= MAX_OPEN_PER_PERSON) throw new ConflictException(`You have ${open} chats open. Finish one first.`);
      const form = q.preChat as unknown as FormDef;
      const { values, errors } = checkAnswers(form, dto.answers ?? {}, await profileOf(tx, org, personId));
      if (Object.keys(errors).length) throw new BadRequestException({ statusCode: 400, code: 'FORM_ERRORS', message: 'Check the answers before the chat starts.', errors });
      const subject = maskPii(str(dto.subject, 200) || `Chat with ${q.name}`).text;
      const session = await tx.sdChatSession.create({ data: { organizationId: org, deskId: q.deskId, queueId: q.id, requesterUserId: r.userId, personId, subject, preChat: values as unknown as Prisma.InputJsonValue } });
      await tx.sdChatMessage.create({ data: { organizationId: org, deskId: q.deskId, sessionId: session.id, author: 'system', body: q.welcome || 'Thanks. Someone from the team will join you here.' } });
      await audit(tx, { ctx: r.ctx, userId: r.userId }, 'desk.chat.started', 'sd_chat_session', session.id, { deskId: q.deskId, queueId: q.id });
      return session;
    });
    this.tell(`desk:${s.deskId}`, 'chat:queue', { sessionId: s.id, state: s.state });
    return this.sessionView(s);
  }

  private sessionView(s: Session) {
    return { id: s.id, deskId: s.deskId, queueId: s.queueId, state: s.state, subject: s.subject, agentUserId: s.agentUserId, ticketId: s.ticketId, rating: s.rating, endReason: s.endReason, requesterSeenAt: s.requesterSeenAt, agentSeenAt: s.agentSeenAt, startedAt: s.startedAt, acceptedAt: s.acceptedAt, endedAt: s.endedAt };
  }

  private async messages(tx: Tx, org: string, s: Session) {
    const rows = await tx.sdChatMessage.findMany({ where: { organizationId: org, sessionId: s.id }, orderBy: { createdAt: 'asc' }, take: 500 });
    const files = new Map((await tx.sdChatFile.findMany({ where: { organizationId: org, sessionId: s.id } })).map((f) => [f.id, f]));
    const users = await this.tickets.userNames(tx, org, rows.map((m) => m.authorUserId));
    return rows.map((m) => {
      const f = m.fileId ? files.get(m.fileId) : null;
      return { id: m.id, author: m.author, name: m.author === 'agent' ? (users.get(m.authorUserId ?? '') ?? 'Agent') : m.author === 'requester' ? 'You' : null, body: m.body, card: m.card, file: f ? { id: f.id, name: f.fileName, size: f.sizeBytes, scan: f.scanStatus } : null, at: m.createdAt };
    });
  }

  async mine(r: Requester) {
    return this.tx(r, async (tx) => {
      const rows = await tx.sdChatSession.findMany({ where: { organizationId: r.ctx.organizationId, requesterUserId: r.userId }, orderBy: { startedAt: 'desc' }, take: 20 });
      return rows.map((s) => this.sessionView(s));
    });
  }

  /** The person's own chat (RLS also keeps it to them and the desk's agents). */
  async ownSession(tx: Tx, r: { ctx: DeskActor['ctx']; userId: string }, id: string): Promise<Session> {
    const s = await tx.sdChatSession.findFirst({ where: { organizationId: r.ctx.organizationId, id, requesterUserId: r.userId } });
    if (!s) throw new NotFoundException('No such chat.');
    return s;
  }

  async myOne(r: Requester, id: string) {
    return this.tx(r, async (tx) => {
      const s = await this.ownSession(tx, r, id);
      const agent = s.agentUserId ? (await this.tickets.userNames(tx, r.ctx.organizationId, [s.agentUserId])).get(s.agentUserId) : null;
      const ticket = s.ticketId ? await tx.sdTicket.findFirst({ where: { organizationId: r.ctx.organizationId, id: s.ticketId }, select: { id: true, number: true } }) : null;
      return { ...this.sessionView(s), agent: agent ?? null, ticket, messages: (await this.messages(tx, r.ctx.organizationId, s)).map((m) => ({ ...m, name: m.author === 'requester' ? 'You' : m.name })) };
    });
  }

  // DECISION NEEDED: a requester who leaves an active chat counts as "left" (not resolved) in first-contact resolution.
  async endByRequester(r: Requester, id: string) {
    const s = await this.tx(r, (tx) => this.ownSession(tx, r, id));
    if (s.state === 'ended') throw new ConflictException('This chat has ended.');
    // Nobody had taken it yet: it becomes a ticket so the question is not lost (US-B-132).
    if (s.state === 'queued') return this.convert({ ctx: r.ctx, userId: null }, s.id, 'no_agent', 'You left before anyone joined, so we made a ticket for you.');
    return this.finish({ ctx: r.ctx, userId: r.userId }, s.id, 'requester', 'resolved_unknown');
  }

  async rate(r: Requester, id: string, dto: { score: number; comment?: string }) {
    return this.tx(r, async (tx) => {
      const s = await this.ownSession(tx, r, id);
      if (s.state !== 'ended') throw new ConflictException('Rate the chat once it has ended.');
      const res = await tx.sdChatSession.updateMany({ where: { id: s.id, rating: null }, data: { rating: dto.score, ratingComment: dto.comment ? maskPii(dto.comment.trim().slice(0, 500)).text : null, updatedAt: new Date() } });
      if (!res.count) throw new ConflictException('You already rated this chat.');
      await audit(tx, { ctx: r.ctx, userId: r.userId }, 'desk.chat.rated', 'sd_chat_session', s.id, { score: dto.score });
      return { rated: true };
    });
  }

  // ------------------------------------------------------------------------------------------ agents

  private async agentSession(tx: Tx, a: DeskActor, id: string): Promise<Session> {
    const s = await tx.sdChatSession.findFirst({ where: { organizationId: a.ctx.organizationId, id } });
    if (!s || !isAgentOn(a, s.deskId)) throw new NotFoundException('No such chat.');
    if (!has(a, 'desk.chat.work')) throw new ForbiddenException('You need the live chat right (desk.chat.work).');
    return s;
  }

  /** The desk's chats: waiting ones, mine, and (for leads) everyone's. */
  async desk(a: DeskActor, deskId: string) {
    if (!isAgentOn(a, deskId) || !has(a, 'desk.chat.work')) throw new ForbiddenException(SEAT_REQUIRED);
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const rows = await tx.sdChatSession.findMany({ where: { organizationId: org, deskId, OR: [{ state: 'queued' }, { state: 'active', ...(isLead(a, deskId) ? {} : { agentUserId: a.userId }) }] }, orderBy: { startedAt: 'asc' }, take: 200 });
      const people = await this.tickets.personNames(tx, org, rows.map((s) => s.personId));
      const agents = await this.tickets.userNames(tx, org, rows.map((s) => s.agentUserId));
      const queues = new Map((await tx.sdChatQueue.findMany({ where: { organizationId: org, deskId }, select: { id: true, name: true, maxPerAgent: true } })).map((q) => [q.id, q]));
      const mine = rows.filter((s) => s.state === 'active' && s.agentUserId === a.userId).length;
      return {
        mine,
        sessions: rows.map((s) => ({ ...this.sessionView(s), queue: queues.get(s.queueId)?.name ?? '', person: people.get(s.personId)?.name ?? '', agent: s.agentUserId ? (agents.get(s.agentUserId) ?? '') : null })),
      };
    });
  }

  async agentOne(a: DeskActor, id: string) {
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const s = await this.agentSession(tx, a, id);
      const q = await tx.sdChatQueue.findFirstOrThrow({ where: { organizationId: org, id: s.queueId } });
      const person = (await this.tickets.personNames(tx, org, [s.personId])).get(s.personId);
      const ticket = s.ticketId ? await tx.sdTicket.findFirst({ where: { organizationId: org, id: s.ticketId }, select: { id: true, number: true } }) : null;
      return {
        ...this.sessionView(s),
        ticket,
        person: person?.name ?? '',
        queue: q.name,
        // US-G-059: the pre-chat answers reach the agent first (sensitive answers stay out of the summary).
        preChat: summarise(q.preChat as unknown as FormDef, s.preChat as never),
        messages: (await this.messages(tx, org, s)).map((m) => ({ ...m, name: m.author === 'requester' ? (person?.name ?? 'Requester') : m.name })),
      };
    });
  }

  /** SD-2.25: the fewer of the queue's limit and the agent's own chat capacity (US-G-075). */
  private async chatCap(tx: Tx, org: string, userId: string, queueMax: number) {
    const c = await asDeskJob(tx, () => tx.sdAgentCapacity.findFirst({ where: { organizationId: org, userId, channel: 'chat' }, select: { maxOpen: true } }));
    return c ? Math.min(queueMax, c.maxOpen) : queueMax;
  }

  async accept(a: DeskActor, id: string) {
    const s = await this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      await tx.$queryRaw`SELECT id FROM sd_chat_sessions WHERE organization_id = ${org}::uuid AND id = ${id}::uuid FOR UPDATE`;
      const cur = await this.agentSession(tx, a, id);
      if (cur.state !== 'queued') throw new ConflictException('Someone else took this chat.');
      const q = await tx.sdChatQueue.findFirstOrThrow({ where: { organizationId: org, id: cur.queueId } });
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sd-chat-agent:${org}:${a.userId}`}))`;
      const busy = await tx.sdChatSession.count({ where: { organizationId: org, agentUserId: a.userId, state: 'active' } });
      if (busy >= (await this.chatCap(tx, org, a.userId, q.maxPerAgent))) throw new ConflictException(`You already have ${busy} chats, the most you take at once. Finish one first.`);
      const after = await tx.sdChatSession.update({ where: { id }, data: { state: 'active', agentUserId: a.userId, acceptedAt: new Date(), version: { increment: 1 }, updatedAt: new Date() } });
      const name = (await this.tickets.userNames(tx, org, [a.userId])).get(a.userId) ?? 'An agent';
      await tx.sdChatMessage.create({ data: { organizationId: org, deskId: cur.deskId, sessionId: id, author: 'system', body: `${name} joined the chat.` } });
      await audit(tx, a, 'desk.chat.accepted', 'sd_chat_session', id, { deskId: cur.deskId });
      return after;
    });
    this.tell(`chat:${s.id}`, 'chat:state', this.sessionView(s));
    this.tell(`desk:${s.deskId}`, 'chat:queue', { sessionId: s.id, state: s.state });
    return this.sessionView(s);
  }

  /** Hand-over (US-G-059): to another queue (it waits there) or to another agent of the desk who has room. */
  async transfer(a: DeskActor, id: string, dto: { queueId?: string; agentUserId?: string }) {
    if (!dto.queueId === !dto.agentUserId) throw new BadRequestException('Choose a queue or an agent.');
    const s = await this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const cur = await this.agentSession(tx, a, id);
      if (cur.state === 'ended') throw new ConflictException('This chat has ended.');
      if (cur.state === 'active' && cur.agentUserId !== a.userId && !isLead(a, cur.deskId)) throw new ForbiddenException('Only the agent in this chat, or a lead, hands it over.');
      let data: Prisma.SdChatSessionUncheckedUpdateInput;
      let line: string;
      if (dto.queueId) {
        const q = await tx.sdChatQueue.findFirst({ where: { organizationId: org, id: dto.queueId, active: true } });
        if (!q) throw new BadRequestException('Choose an active queue.');
        if (q.deskId !== cur.deskId && !isAgentOn(a, q.deskId)) {
          const from = await tx.sdDesk.findFirstOrThrow({ where: { organizationId: org, id: cur.deskId }, select: { forwardTo: true } });
          if (!from.forwardTo.includes(q.deskId)) throw new ForbiddenException('This desk does not hand chats to that desk. Ask the desk admin to allow it.');
        }
        data = { queueId: q.id, deskId: q.deskId, state: 'queued', agentUserId: null, acceptedAt: null };
        line = `The chat moved to ${q.name}. Someone there will join you.`;
        if (q.deskId !== cur.deskId) {
          // Another desk: a new chat there carries the conversation (rows keep their desk).
          return this.moveToDesk(tx, a, cur, q);
        }
      } else {
        if (!(await this.tickets.seatHeld(tx, org, cur.deskId, dto.agentUserId!))) throw new BadRequestException('Choose an agent of this desk.');
        const q = await tx.sdChatQueue.findFirstOrThrow({ where: { organizationId: org, id: cur.queueId } });
        const busy = await tx.sdChatSession.count({ where: { organizationId: org, agentUserId: dto.agentUserId, state: 'active' } });
        if (busy >= (await this.chatCap(tx, org, dto.agentUserId!, q.maxPerAgent))) throw new ConflictException('That agent has no room for another chat.');
        const name = (await this.tickets.userNames(tx, org, [dto.agentUserId!])).get(dto.agentUserId!) ?? 'Another agent';
        data = { state: 'active', agentUserId: dto.agentUserId, acceptedAt: new Date() };
        line = `${name} is taking over the chat.`;
      }
      const after = await tx.sdChatSession.update({ where: { id }, data: { ...data, version: { increment: 1 }, updatedAt: new Date() } });
      await tx.sdChatMessage.create({ data: { organizationId: org, deskId: after.deskId, sessionId: id, author: 'system', body: line } });
      await audit(tx, a, 'desk.chat.transferred', 'sd_chat_session', id, { toQueue: dto.queueId ?? null, toAgent: dto.agentUserId ?? null });
      return after;
    });
    this.tell(`chat:${s.id}`, 'chat:state', this.sessionView(s));
    this.tell(`desk:${s.deskId}`, 'chat:queue', { sessionId: s.id, state: s.state });
    return this.sessionView(s);
  }

  private async moveToDesk(tx: Tx, a: DeskActor, cur: Session, q: { id: string; deskId: string; name: string }) {
    const org = a.ctx.organizationId;
    const next = await tx.sdChatSession.create({ data: { organizationId: org, deskId: q.deskId, queueId: q.id, requesterUserId: cur.requesterUserId, personId: cur.personId, subject: cur.subject, preChat: cur.preChat as Prisma.InputJsonValue } });
    const earlier = await tx.sdChatMessage.findMany({ where: { organizationId: org, sessionId: cur.id }, orderBy: { createdAt: 'asc' } });
    const text = earlier.map((m) => `${m.author}: ${m.body}`).join('\n').slice(-1900);
    await tx.sdChatMessage.create({ data: { organizationId: org, deskId: q.deskId, sessionId: next.id, author: 'system', body: `Handed over from another team. Earlier:\n${text}`.slice(0, MAX_BODY) } });
    await tx.sdChatSession.update({ where: { id: cur.id }, data: { state: 'ended', endReason: 'handed_over', endedAt: new Date(), version: { increment: 1 }, updatedAt: new Date() } });
    await tx.sdChatMessage.create({ data: { organizationId: org, deskId: cur.deskId, sessionId: cur.id, author: 'system', body: `The chat moved to ${q.name}. Open your chats to continue.` } });
    await audit(tx, a, 'desk.chat.transferred', 'sd_chat_session', cur.id, { toQueue: q.id, toDesk: q.deskId, newSessionId: next.id });
    return next;
  }

  /** End: resolved here (an interaction, no ticket), or not (it becomes a ticket with the transcript). */
  async end(a: DeskActor, id: string, resolved: boolean) {
    await this.tx(a, async (tx) => {
      const cur = await this.agentSession(tx, a, id);
      if (cur.state === 'ended') throw new ConflictException('This chat has ended.');
      if (cur.agentUserId !== a.userId && !isLead(a, cur.deskId)) throw new ForbiddenException('Only the agent in this chat, or a lead, ends it.');
    });
    if (!resolved) return this.convert(a, id, 'unresolved', null);
    return this.finish(a, id, 'agent', 'resolved');
  }

  private async finish(a: { ctx: DeskActor['ctx']; userId: string | null }, id: string, by: 'agent' | 'requester', outcome: 'resolved' | 'resolved_unknown') {
    const s = await this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const cur = await tx.sdChatSession.findFirstOrThrow({ where: { organizationId: org, id } });
      if (cur.state === 'ended') throw new ConflictException('This chat has ended.');
      const after = await tx.sdChatSession.update({ where: { id }, data: { state: 'ended', endReason: by === 'agent' ? 'resolved' : 'requester', endedAt: new Date(), version: { increment: 1 }, updatedAt: new Date() } });
      await tx.sdChatMessage.create({ data: { organizationId: org, deskId: cur.deskId, sessionId: id, author: 'system', body: by === 'agent' ? 'The chat has ended. You can rate it below.' : 'You left the chat.' } });
      if (cur.agentUserId) await this.interaction(tx, org, cur, outcome === 'resolved' ? 'resolved' : 'abandoned', null);
      await audit(tx, { ctx: a.ctx, userId: a.userId as string }, 'desk.chat.ended', 'sd_chat_session', id, { by, outcome });
      return after;
    });
    this.tell(`chat:${s.id}`, 'chat:state', this.sessionView(s));
    this.tell(`desk:${s.deskId}`, 'chat:queue', { sessionId: s.id, state: s.state });
    return this.sessionView(s);
  }

  private async interaction(tx: Tx, org: string, s: Session, outcome: 'resolved' | 'ticket' | 'abandoned', ticketId: string | null) {
    if (!s.agentUserId) return;
    await tx.sdInteraction.create({ data: { organizationId: org, deskId: s.deskId, channel: 'chat', personId: s.personId, agentUserId: s.agentUserId, subject: s.subject, outcome, ticketId, chatSessionId: s.id, startedAt: s.startedAt, endedAt: new Date() } });
  }

  /**
   * Chat → ticket (US-B-132): the requester's ticket on the chat's desk, the pre-chat answers and the transcript as its
   * description, the chat's files as its files, given to the agent who had the chat. The chat ends with the number.
   */
  async convert(a: { ctx: DeskActor['ctx']; userId: string | null; roles?: DeskActor['roles']; keys?: DeskActor['keys'] }, id: string, reason: 'unresolved' | 'no_agent' | 'agent', line: string | null) {
    const out = await deskSystem(this.tenantPrisma, a.ctx, async (tx) => {
      const org = a.ctx.organizationId;
      await tx.$queryRaw`SELECT id FROM sd_chat_sessions WHERE organization_id = ${org}::uuid AND id = ${id}::uuid FOR UPDATE`;
      const s = await tx.sdChatSession.findFirst({ where: { organizationId: org, id } });
      if (!s) throw new NotFoundException('No such chat.');
      if (s.ticketId) throw new ConflictException('This chat is already a ticket.');
      if (a.roles && (!isAgentOn(a as DeskActor, s.deskId) || !(a.keys?.has('desk.chat.work') ?? false))) throw new NotFoundException('No such chat.');
      const q = await tx.sdChatQueue.findFirstOrThrow({ where: { organizationId: org, id: s.queueId } });
      const msgs = await tx.sdChatMessage.findMany({ where: { organizationId: org, sessionId: s.id }, orderBy: { createdAt: 'asc' } });
      const users = await this.tickets.userNames(tx, org, msgs.map((m) => m.authorUserId));
      const pre = summarise(q.preChat as unknown as FormDef, s.preChat as never);
      const text = [
        ...(pre.length ? ['Before the chat:', ...pre.map((p) => `- ${p.label}: ${p.value}`), ''] : []),
        'Chat:',
        ...msgs.filter((m) => m.author !== 'system').map((m) => `${m.createdAt.toISOString().slice(11, 16)} ${m.author === 'agent' ? (users.get(m.authorUserId ?? '') ?? 'Agent') : 'Requester'}: ${m.body || (m.card ? '[card]' : m.fileId ? '[file]' : '')}`),
      ].join('\n');
      const type = (await tx.sdTicketType.findFirst({ where: { organizationId: org, deskId: s.deskId, active: true }, orderBy: { sortOrder: 'asc' } })) ?? undefined;
      let t = await this.tickets.createIn(tx, { ctx: a.ctx, userId: a.userId }, { deskId: s.deskId, typeId: type?.id, subject: s.subject, bodyHtml: textToHtml(text.slice(0, 50_000)), requesterPersonId: s.personId, openedByUserId: a.userId, channel: 'chat', side: 'requester', authorPersonId: s.personId, tags: ['chat'] });
      for (const f of await tx.sdChatFile.findMany({ where: { organizationId: org, sessionId: s.id, scanStatus: { in: ['clean', 'pending'] } } })) {
        await tx.sdAttachment.create({ data: { organizationId: org, deskId: s.deskId, ticketId: t.id, side: f.uploadedByUserId === s.requesterUserId ? 'requester' : 'agent', uploadedByUserId: f.uploadedByUserId === s.requesterUserId ? null : f.uploadedByUserId, uploadedByPersonId: f.uploadedByUserId === s.requesterUserId ? s.personId : null, blobKey: f.blobKey, fileName: f.fileName, contentType: f.contentType, sizeBytes: f.sizeBytes, sha256: f.sha256, scanStatus: f.scanStatus, scanDetail: f.scanDetail, scannedAt: f.scannedAt } });
      }
      const owner = s.agentUserId && (await this.tickets.seatHeld(tx, org, s.deskId, s.agentUserId)) ? s.agentUserId : null;
      if (owner && t.assigneeUserId !== owner) {
        await tx.sdTicket.update({ where: { id: t.id }, data: { assigneeUserId: owner, version: { increment: 1 } } });
        await this.tickets.event(tx, t, 'assigned', t.assigneeUserId, owner, { by: null, reason: 'Had the chat' });
        t = await tx.sdTicket.findFirstOrThrow({ where: { id: t.id } });
      }
      const after = await tx.sdChatSession.update({ where: { id: s.id }, data: { ticketId: t.id, ...(s.state === 'ended' ? {} : { state: 'ended', endReason: reason === 'no_agent' ? 'no_agent' : 'ticket', endedAt: new Date() }), version: { increment: 1 }, updatedAt: new Date() } });
      await tx.sdChatMessage.create({ data: { organizationId: org, deskId: s.deskId, sessionId: s.id, author: 'system', body: line ?? `We made ticket ${t.number} for this. You can follow it in your requests.` } });
      await this.interaction(tx, org, s, 'ticket', t.id);
      await emit(tx, org, 'helpdesk.chat.converted', { ticketId: t.id, deskId: s.deskId, sessionId: s.id });
      await audit(tx, { ctx: a.ctx, userId: a.userId as string }, 'desk.chat.converted', 'sd_chat_session', s.id, { ticketId: t.id, number: t.number, reason });
      return { session: after, ticket: { id: t.id, number: t.number } };
    });
    this.tell(`chat:${out.session.id}`, 'chat:state', { ...this.sessionView(out.session), ticket: out.ticket });
    this.tell(`desk:${out.session.deskId}`, 'chat:queue', { sessionId: out.session.id, state: out.session.state });
    return { ...this.sessionView(out.session), ticket: out.ticket };
  }

  /** Job every minute: a chat nobody took within its queue's wait becomes a ticket (US-B-132 "no agent is free"). */
  async expire(now = new Date()): Promise<number> {
    const waiting = await deskSystem(this.tenantPrisma, { organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.$queryRaw<{ id: string; organization_id: string }[]>`
        SELECT s.id, s.organization_id FROM sd_chat_sessions s JOIN sd_chat_queues q ON q.organization_id = s.organization_id AND q.id = s.queue_id
        WHERE s.state = 'queued' AND s.started_at + make_interval(mins => q.wait_minutes) <= ${now} LIMIT 200`,
    );
    let n = 0;
    for (const w of waiting) {
      try {
        await this.convert({ ctx: { organizationId: w.organization_id, isSuperAdmin: false }, userId: null }, w.id, 'no_agent', 'Nobody from the team is free right now, so we made a ticket for you. You will get a reply there.');
        n++;
      } catch (e) {
        this.logger.warn(`chat expiry ${w.id}: ${(e as Error).message}`);
      }
    }
    return n;
  }

  // ------------------------------------------------------------------------------------------ messages (from the socket)

  /**
   * One message in a chat. The requester writes text or sends a file of theirs; the agent in the chat also sends cards.
   * Text is masked (YX-SD-15) and capped; nothing is stored as HTML.
   */
  async post(who: { ctx: DeskActor['ctx']; userId: string; actor: DeskActor | null }, sessionId: string, input: { text?: unknown; card?: unknown; fileId?: unknown }) {
    const text = typeof input.text === 'string' ? input.text.trim() : '';
    if (text.length > MAX_BODY) throw new BadRequestException(`Messages can be up to ${MAX_BODY} characters.`);
    const fileId = typeof input.fileId === 'string' ? input.fileId : null;
    const m = await this.tx(who, async (tx) => {
      const org = who.ctx.organizationId;
      const s = await tx.sdChatSession.findFirst({ where: { organizationId: org, id: sessionId } });
      if (!s) throw new NotFoundException('No such chat.');
      const asRequester = s.requesterUserId === who.userId;
      const asAgent = !asRequester && s.state === 'active' && s.agentUserId === who.userId && Boolean(who.actor && isAgentOn(who.actor, s.deskId) && has(who.actor, 'desk.chat.work'));
      if (!asRequester && !asAgent) throw new ForbiddenException('Only the person who started this chat and the agent in it can write here.');
      if (s.state === 'ended') throw new ConflictException('This chat has ended.');
      const card = asAgent ? parseCard(input.card) : null;
      if (!asAgent && input.card !== undefined && input.card !== null) throw new ForbiddenException('Only the agent sends cards.');
      if (fileId && !(await tx.sdChatFile.findFirst({ where: { organizationId: org, sessionId: s.id, id: fileId, uploadedByUserId: who.userId }, select: { id: true } }))) throw new BadRequestException('Send a file you added to this chat.');
      if (!text && !card && !fileId) throw new BadRequestException('Write a message first.');
      return tx.sdChatMessage.create({ data: { organizationId: org, deskId: s.deskId, sessionId: s.id, author: asAgent ? 'agent' : 'requester', authorUserId: who.userId, body: maskPii(text).text, card: (card ?? undefined) as Prisma.InputJsonValue | undefined, fileId } });
    });
    const file = m.fileId ? await this.tx(who, (tx) => tx.sdChatFile.findFirst({ where: { organizationId: who.ctx.organizationId, id: m.fileId! } })) : null;
    const view = { id: m.id, sessionId: m.sessionId, author: m.author, authorUserId: m.authorUserId, body: m.body, card: m.card, file: file ? { id: file.id, name: file.fileName, size: file.sizeBytes, scan: file.scanStatus } : null, at: m.createdAt };
    this.tell(`chat:${m.sessionId}`, 'chat:message', view);
    return view;
  }

  /** D11: "Seen" in chat only: when this side last looked. */
  async seen(who: { ctx: DeskActor['ctx']; userId: string }, sessionId: string) {
    const out = await this.tx(who, async (tx) => {
      const s = await tx.sdChatSession.findFirst({ where: { organizationId: who.ctx.organizationId, id: sessionId } });
      if (!s) return null;
      const side = s.requesterUserId === who.userId ? 'requester' : s.agentUserId === who.userId ? 'agent' : null;
      if (!side) return null;
      const at = new Date();
      await tx.sdChatSession.update({ where: { id: s.id }, data: side === 'requester' ? { requesterSeenAt: at } : { agentSeenAt: at } });
      return { sessionId: s.id, by: side, at };
    });
    if (out) this.tell(`chat:${out.sessionId}`, 'chat:seen', out);
    return out;
  }

  /** May this person be in the chat's room? Its requester, or an agent of its desk with the chat key. */
  async mayJoin(who: { ctx: DeskActor['ctx']; userId: string; actor: DeskActor | null }, sessionId: string): Promise<boolean> {
    return this.tx(who, async (tx) => {
      const s = await tx.sdChatSession.findFirst({ where: { organizationId: who.ctx.organizationId, id: sessionId }, select: { requesterUserId: true, deskId: true } });
      if (!s) return false;
      if (s.requesterUserId === who.userId) return true;
      return Boolean(who.actor && isAgentOn(who.actor, s.deskId) && has(who.actor, 'desk.chat.work'));
    });
  }

  // ------------------------------------------------------------------------------------------ files

  async upload(who: { ctx: DeskActor['ctx']; userId: string; actor: DeskActor | null }, sessionId: string, file: { originalname: string; buffer: Buffer } | undefined) {
    if (!file) throw new BadRequestException('Choose a file.');
    const row = await this.tx(who, async (tx) => {
      const s = await tx.sdChatSession.findFirst({ where: { organizationId: who.ctx.organizationId, id: sessionId } });
      if (!s) throw new NotFoundException('No such chat.');
      const ok = s.requesterUserId === who.userId || (s.state === 'active' && s.agentUserId === who.userId && who.actor && has(who.actor, 'desk.chat.work'));
      if (!ok) throw new ForbiddenException('Only the person who started this chat and the agent in it can add files.');
      if (s.state === 'ended') throw new ConflictException('This chat has ended.');
      const f = await this.files.storeChatFile(tx, who.ctx, s, file, who.userId);
      await audit(tx, { ctx: who.ctx, userId: who.userId }, 'desk.chat_file.uploaded', 'sd_chat_session', s.id, { fileId: f.id, fileName: f.fileName, sizeBytes: f.sizeBytes });
      return f;
    });
    await this.files.enqueue(who.ctx.organizationId, row.id, 'chat');
    return { id: row.id, name: row.fileName, size: row.sizeBytes, scan: row.scanStatus };
  }

  async fileLink(who: { ctx: DeskActor['ctx']; userId: string; actor: DeskActor | null }, sessionId: string, fileId: string) {
    if (!(await this.mayJoin(who, sessionId))) throw new NotFoundException('No such file.');
    return this.tx(who, async (tx) => {
      const f = await tx.sdChatFile.findFirst({ where: { organizationId: who.ctx.organizationId, sessionId, id: fileId } });
      if (!f) throw new NotFoundException('No such file.');
      return this.files.chatLink(f, who.userId);
    });
  }

  // ------------------------------------------------------------------------------------------ interactions (SD-2.17)

  async interactions(a: DeskActor, deskId: string) {
    if (!isAgentOn(a, deskId) || !has(a, 'desk.ticket.work')) throw new ForbiddenException(SEAT_REQUIRED);
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const rows = await tx.sdInteraction.findMany({ where: { organizationId: org, deskId }, orderBy: { startedAt: 'desc' }, take: 100 });
      const people = await this.tickets.personNames(tx, org, rows.map((r) => r.personId));
      const agents = await this.tickets.userNames(tx, org, rows.map((r) => r.agentUserId));
      const tickets = new Map((await tx.sdTicket.findMany({ where: { organizationId: org, id: { in: rows.map((r) => r.ticketId).filter((x): x is string => Boolean(x)) } }, select: { id: true, number: true } })).map((t) => [t.id, t.number]));
      const counts = { total: rows.length, resolved: rows.filter((r) => r.outcome === 'resolved').length, ticket: rows.filter((r) => r.outcome === 'ticket').length };
      return {
        firstContactResolution: counts.resolved + counts.ticket ? Math.round((counts.resolved * 100) / (counts.resolved + counts.ticket)) : null,
        interactions: rows.map((r) => ({ id: r.id, channel: r.channel, subject: r.subject, notes: r.notes, outcome: r.outcome, person: r.personId ? (people.get(r.personId)?.name ?? '') : null, agent: agents.get(r.agentUserId) ?? '', ticketId: r.ticketId, ticketNumber: r.ticketId ? (tickets.get(r.ticketId) ?? null) : null, callRef: r.callRef, startedAt: r.startedAt, endedAt: r.endedAt, version: r.version })),
      };
    });
  }

  async logInteraction(a: DeskActor, dto: { deskId: string; channel: 'call' | 'walk_up'; personId?: string; subject: string; notes?: string; outcome?: 'open' | 'resolved'; callRef?: string }) {
    if (!isAgentOn(a, dto.deskId) || !has(a, 'desk.ticket.work')) throw new ForbiddenException(SEAT_REQUIRED);
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      if (dto.personId && !(await this.tickets.deskPerson(tx, a, dto.deskId, dto.personId))) throw new BadRequestException('No such person in this company.');
      const row = await tx.sdInteraction.create({
        data: { organizationId: org, deskId: dto.deskId, channel: dto.channel, personId: dto.personId ?? null, agentUserId: a.userId, subject: maskPii(dto.subject).text, notes: maskPii(dto.notes ?? '').text, outcome: dto.outcome ?? 'open', callRef: dto.callRef ?? null, endedAt: dto.outcome === 'resolved' ? new Date() : null },
      });
      await audit(tx, a, 'desk.interaction.logged', 'sd_interaction', row.id, { deskId: dto.deskId, channel: dto.channel, outcome: row.outcome });
      return { id: row.id, version: row.version };
    });
  }

  async updateInteraction(a: DeskActor, id: string, dto: { version: number; notes?: string; outcome?: 'resolved' | 'abandoned' }) {
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const row = await tx.sdInteraction.findFirst({ where: { organizationId: org, id } });
      if (!row || !isAgentOn(a, row.deskId)) throw new NotFoundException('No such interaction.');
      if (row.outcome !== 'open') throw new ConflictException('This interaction is closed.');
      const res = await tx.sdInteraction.updateMany({ where: { id, version: dto.version }, data: { ...(dto.notes !== undefined ? { notes: maskPii(dto.notes).text } : {}), ...(dto.outcome ? { outcome: dto.outcome, endedAt: new Date() } : {}), version: { increment: 1 }, updatedAt: new Date() } });
      if (!res.count) throw new ConflictException('Someone changed this interaction. Reload to see the latest.');
      await audit(tx, a, 'desk.interaction.updated', 'sd_interaction', id, { outcome: dto.outcome });
      return { id, version: dto.version + 1 };
    });
  }

  /** More work needed: the interaction becomes a ticket (channel phone or walk-up) with its notes (US-B-135, US-G-056). */
  async promote(a: DeskActor, id: string, dto: { typeId?: string; categoryId?: string }) {
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const row = await tx.sdInteraction.findFirst({ where: { organizationId: org, id } });
      if (!row || !isAgentOn(a, row.deskId) || !has(a, 'desk.ticket.work')) throw new NotFoundException('No such interaction.');
      if (row.ticketId) throw new ConflictException('This interaction is already a ticket.');
      if (!row.personId) throw new BadRequestException('Choose who called or came by first.');
      const t = await this.tickets.createIn(tx, a, { deskId: row.deskId, typeId: dto.typeId, categoryId: dto.categoryId, subject: row.subject, bodyHtml: textToHtml(row.notes || row.subject), requesterPersonId: row.personId, openedByUserId: a.userId, channel: row.channel === 'call' ? 'phone' : row.channel === 'walk_up' ? 'walk_up' : 'chat', side: 'agent' });
      const after = OPEN_STATES.includes(t.systemState) && !t.assigneeUserId ? await this.tickets.assignIn(tx, a, t, a.userId) : t;
      await tx.sdInteraction.update({ where: { id }, data: { outcome: 'ticket', ticketId: after.id, endedAt: row.endedAt ?? new Date(), version: { increment: 1 }, updatedAt: new Date() } });
      await audit(tx, a, 'desk.interaction.promoted', 'sd_interaction', id, { ticketId: after.id, number: after.number, callRef: row.callRef });
      return { id: after.id, number: after.number };
    });
  }
}
