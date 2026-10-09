import { GoneException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { hkdfSync } from 'crypto';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { Tx } from '../org-structure/org-structure.service';

// SD-2.06 (US-G-043, US-E-282): approve from a Teams or Slack card or a phone push. Each card carries a link with a
// signed, single-use, short-lived action token bound to one approval task and one person. Opening the link (GET) never
// decides anything (chat apps open links to preview them); the person presses Approve or Not approve on our page, and
// the decision runs through the same P03 engine as the Approvals inbox, logged with the channel. Sensitive requests
// (an HR ticket in a sensitive category, a private ticket) and high-risk ones never show their content in a card or a
// push and are never decided through a link: the person signs in to decide them.
//
// The provider adapters only build the provider's message (Adaptive Card, Slack blocks, a push payload). Sending goes
// through a transport: the dev fake keeps the messages in memory and logs them; the real Teams / Slack app
// registrations and the push service are go-live lines (APPROVAL_CHANNELS unset = cards are not sent).

export type Provider = 'teams' | 'slack' | 'push';
export interface ApprovalCard {
  title: string;
  /** Empty for a neutral card (sensitive or high risk). */
  lines: { label: string; value: string }[];
  neutral: boolean;
  url: string;
  expiresAt: Date;
}

/** The provider's own message shape. Plain text only, never HTML or markdown from a request. */
export const CARD_BUILDERS: Record<Provider, (c: ApprovalCard) => unknown> = {
  teams: (c) => ({
    type: 'AdaptiveCard',
    version: '1.4',
    body: [
      { type: 'TextBlock', text: c.title, weight: 'Bolder', wrap: true },
      ...(c.lines.length ? [{ type: 'FactSet', facts: c.lines.map((l) => ({ title: l.label, value: l.value })) }] : []),
      { type: 'TextBlock', text: c.neutral ? 'Sign in to YukthiX to see and decide it.' : 'Open to approve or not approve.', isSubtle: true, wrap: true },
    ],
    actions: [{ type: 'Action.OpenUrl', title: c.neutral ? 'Open YukthiX' : 'Open to decide', url: c.url }],
  }),
  slack: (c) => ({
    text: c.title,
    blocks: [
      { type: 'section', text: { type: 'plain_text', text: c.title } },
      ...(c.lines.length ? [{ type: 'section', fields: c.lines.slice(0, 10).map((l) => ({ type: 'plain_text', text: `${l.label}: ${l.value}`.slice(0, 2000) })) }] : []),
      { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: c.neutral ? 'Open YukthiX' : 'Open to decide' }, url: c.url }] },
    ],
  }),
  // A push shows on a locked phone: the title only, never the summary.
  push: (c) => ({ title: 'Approval waiting', body: c.neutral ? 'You have an approval waiting in YukthiX.' : c.title.slice(0, 120), data: { url: c.url } }),
};

export interface ChannelTransport {
  readonly name: string;
  post(provider: Provider, externalRef: string, payload: unknown): Promise<void>;
}

/** Development only: keeps what would be sent (tests and the local demo read it), never leaves the server. */
export class FakeChannelTransport implements ChannelTransport {
  readonly name = 'dev-fake';
  readonly sent: { provider: Provider; externalRef: string; payload: unknown; at: Date }[] = [];
  private readonly logger = new Logger('ApprovalCards');
  async post(provider: Provider, externalRef: string, payload: unknown) {
    this.sent.push({ provider, externalRef, payload, at: new Date() });
    if (this.sent.length > 500) this.sent.shift();
    this.logger.log(`[dev-fake] ${provider} card to ${externalRef.slice(0, 40)}`);
  }
}

// DECISION NEEDED: how long a card's link works. 8 hours (a working day) for now; a reminder sends a fresh card.
const LINK_MINUTES = Number(process.env.APPROVAL_LINK_MINUTES ?? 480);
type Claims = { k: string; o: string; u: string };

@Injectable()
export class ApprovalCards {
  private readonly logger = new Logger(ApprovalCards.name);
  readonly transport: ChannelTransport | null = process.env.APPROVAL_CHANNELS === 'dev-fake' && process.env.NODE_ENV !== 'production' ? new FakeChannelTransport() : null;
  private readonly signer: JwtService;

  constructor(private readonly tenantPrisma: TenantPrismaService) {
    // A key of its own, derived from the API secret, so an action token can never pass as a sign-in token or a file link.
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) throw new Error('JWT_ACCESS_SECRET is required');
    this.signer = new JwtService({ secret: Buffer.from(hkdfSync('sha256', secret, 'yukthix', 'wf-action-token', 32)).toString('base64') });
  }

  /** May people link Teams / Slack by typing an id (dev only; production links through the provider's sign-in). */
  get typedLinksAllowed() {
    return this.transport?.name === 'dev-fake';
  }

  /** One token row + its signed form. The row is what makes it single use. */
  async mint(tx: Tx, org: string, taskId: string, userId: string, channel: Provider | 'email') {
    const expiresAt = new Date(Date.now() + LINK_MINUTES * 60_000);
    const row = await tx.wfActionToken.create({ data: { organizationId: org, taskId, userId, channel, expiresAt } });
    const token = this.signer.sign({ k: row.id, o: org, u: userId } satisfies Claims, { expiresIn: LINK_MINUTES * 60, audience: 'wf-act' });
    return { token, expiresAt };
  }

  /**
   * After an approval notice was sent (P03 send): a card to each linked chat app and phone of each person holding an
   * open task of the request. Best effort, never inside the decision's transaction. preview says whether the module lets
   * the request's words out of the app.
   */
  async deliver(ctx: TenantContext, requestId: string, to: string[], preview: (tx: Tx, req: Prisma.WfRequestGetPayload<object>) => Promise<'full' | 'neutral'>) {
    if (!this.transport || !to.length || !ctx.organizationId) return;
    const org = ctx.organizationId;
    try {
      const out = await this.tenantPrisma.forTenant({ organizationId: org, isSuperAdmin: false }, async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.sd_system', 'on', true)`;
        const req = await tx.wfRequest.findFirst({ where: { organizationId: org, id: requestId, status: 'pending' } });
        if (!req) return [];
        const tasks = await tx.wfTask.findMany({ where: { organizationId: org, requestId, step: req.currentStep, status: 'open', assigneeUserId: { in: to } } });
        const links = await tx.channelLink.findMany({ where: { organizationId: org, userId: { in: tasks.map((t) => t.assigneeUserId) } } });
        // Fails closed: anything but an explicit "full" from the module is neutral; high risk is always neutral.
        const neutral = req.risk === 'high' || (await preview(tx, req).catch(() => 'neutral' as const)) !== 'full';
        const web = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '');
        const cards: { provider: Provider; ref: string; payload: unknown }[] = [];
        for (const t of tasks) {
          for (const l of links.filter((x) => x.userId === t.assigneeUserId)) {
            const provider = l.provider as Provider;
            const { token, expiresAt } = await this.mint(tx, org, t.id, t.assigneeUserId, provider);
            const card: ApprovalCard = {
              title: neutral ? 'An approval is waiting for you' : req.title,
              lines: neutral ? [] : (req.summary as unknown as { label: string; value: string }[]).slice(0, 8).map((x) => ({ label: String(x.label).slice(0, 60), value: String(x.value).slice(0, 200) })),
              neutral,
              url: neutral ? `${web}/yx/approvals` : `${web}/yx/act/${token}`,
              expiresAt,
            };
            cards.push({ provider, ref: l.externalRef, payload: CARD_BUILDERS[provider](card) });
          }
        }
        return cards;
      });
      for (const c of out) await this.transport.post(c.provider, c.ref, c.payload).catch((e: Error) => this.logger.warn(`card not sent: ${e.message}`));
    } catch (e) {
      this.logger.warn(`approval cards not sent: ${(e as Error).message}`);
    }
  }

  /** Reads a token (never consumes it). Throws a plain 404 / 410 for anything wrong. */
  verify(token: string): Claims {
    try {
      const c = this.signer.verify<Claims & { aud?: string }>(token, { audience: 'wf-act' });
      if (typeof c.k !== 'string' || typeof c.o !== 'string' || typeof c.u !== 'string') throw new Error('bad');
      return c;
    } catch (e) {
      if ((e as Error).name === 'TokenExpiredError') throw new GoneException({ statusCode: 410, code: 'LINK_EXPIRED', message: 'This link has expired. Open your approvals in YukthiX.' });
      throw new NotFoundException('This link is not valid. Open your approvals in YukthiX.');
    }
  }
}
