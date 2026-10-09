import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import Redis from 'ioredis';
import { randomBytes } from 'crypto';
import { OrgSecretsCryptoService, PrismaService, TenantPrismaService, isOrganizationActive } from '@exam-platform/shared';
import { REDIS_CONNECTION } from '../jobs/redis-connection';
import { DeskActor, audit, has } from './desk-access';
import { PortalService } from './portal.service';

// SD-2.20 (US-G-069): the help widget a company embeds in its own site or app, and the API the mobile SDKs use.
//   - Embedding is CSP-safe: one external script (yx-widget.js from our web origin, no inline code, no eval) that adds a
//     launcher and an iframe of our own page; the host page only allows our origin in script-src and frame-src.
//   - The widget opens one outside portal (raise, follow, help articles). Who the visitor is comes only from a token the
//     company's own server signs with the widget's secret (HS256, audience = the widget key, at most 10 minutes, a
//     unique jti that works once). The browser hands it to our iframe by postMessage, checked against the widget's
//     allowed sites; the API checks the site again. Mobile SDKs (no browser origin) work only on a widget marked mobile.
//   - Without a token the visitor reads public articles only (when the widget allows anonymous visitors).
// The secret is shown once and stored encrypted; changing sites or the secret needs the widget's version (no lost
// updates) and rotating the secret needs a fresh second factor (the controller).

const TOKEN_MAX_SECONDS = 600;
const KEY_RE = /^wk_[A-Za-z0-9_-]{20,36}$/;
const webOrigin = () => (process.env.WEB_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '');

/** "https://shop.example.com" (no path, no trailing slash); http only for localhost. */
export function cleanOrigin(o: string): string | null {
  try {
    const u = new URL(o.trim());
    if (u.pathname !== '/' || u.search || u.hash || u.username || u.password) return null;
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))) return null;
    return u.origin;
  } catch {
    return null;
  }
}

@Injectable()
export class WidgetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly crypto: OrgSecretsCryptoService,
    private readonly portals: PortalService,
    @Inject(REDIS_CONNECTION) private readonly redis: Redis,
  ) {}

  private requireAdmin(a: DeskActor) {
    if (!(has(a, 'desk.channel.manage') && has(a, 'desk.portal.manage'))) throw new ForbiddenException('You need channel and help page set-up rights.');
  }

  private view(w: { id: string; portalId: string; key: string; name: string; allowedOrigins: string[]; allowAnonymous: boolean; mobile: boolean; state: string; version: number }) {
    return {
      id: w.id,
      portalId: w.portalId,
      key: w.key,
      name: w.name,
      allowedOrigins: w.allowedOrigins,
      allowAnonymous: w.allowAnonymous,
      mobile: w.mobile,
      state: w.state,
      version: w.version,
      // What the company pastes in its page: one external script, nothing inline (CSP-safe).
      snippet: `<script src="${webOrigin()}/yx-widget.js" data-key="${w.key}" async></script>`,
    };
  }

  async list(a: DeskActor) {
    this.requireAdmin(a);
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => (await tx.sdWidget.findMany({ where: { organizationId: a.ctx.organizationId }, orderBy: { createdAt: 'asc' } })).map((w) => this.view(w)));
  }

  private origins(list: string[]) {
    const out = [...new Set(list.map(cleanOrigin))];
    if (out.some((o) => o === null)) throw new BadRequestException('Each site is an address like https://shop.example.com (no path).');
    return out as string[];
  }

  async create(a: DeskActor, dto: { portalId: string; name: string; allowedOrigins: string[]; allowAnonymous?: boolean; mobile?: boolean }) {
    this.requireAdmin(a);
    const org = a.ctx.organizationId;
    const secret = randomBytes(32).toString('base64url');
    const key = `wk_${randomBytes(18).toString('base64url')}`;
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      if (!(await tx.sdPortal.findFirst({ where: { organizationId: org, id: dto.portalId }, select: { id: true } }))) throw new BadRequestException('Choose one of your help pages.');
      const w = await tx.sdWidget.create({ data: { organizationId: org, portalId: dto.portalId, key, name: dto.name, allowedOrigins: this.origins(dto.allowedOrigins), identitySecretEncrypted: this.crypto.encrypt(secret), allowAnonymous: Boolean(dto.allowAnonymous), mobile: Boolean(dto.mobile), createdBy: a.userId } });
      await audit(tx, a, 'desk.widget.created', 'sd_widget', w.id, { portalId: w.portalId, origins: w.allowedOrigins, mobile: w.mobile });
      // The signing secret is shown once.
      return { ...this.view(w), secret };
    });
  }

  async update(a: DeskActor, id: string, dto: { version: number; name?: string; allowedOrigins?: string[]; allowAnonymous?: boolean; mobile?: boolean; state?: 'active' | 'paused' }) {
    this.requireAdmin(a);
    const org = a.ctx.organizationId;
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const res = await tx.sdWidget.updateMany({
        where: { organizationId: org, id, version: dto.version },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.allowedOrigins ? { allowedOrigins: this.origins(dto.allowedOrigins) } : {}),
          ...(dto.allowAnonymous !== undefined ? { allowAnonymous: dto.allowAnonymous } : {}),
          ...(dto.mobile !== undefined ? { mobile: dto.mobile } : {}),
          ...(dto.state ? { state: dto.state } : {}),
          version: { increment: 1 },
          updatedAt: new Date(),
        },
      });
      if (!res.count) {
        if (!(await tx.sdWidget.findFirst({ where: { organizationId: org, id }, select: { id: true } }))) throw new NotFoundException('No such widget.');
        throw new ConflictException('Someone else changed this widget. Reload and try again.');
      }
      await audit(tx, a, 'desk.widget.updated', 'sd_widget', id, { changed: Object.keys(dto).filter((k) => k !== 'version') });
      return this.view(await tx.sdWidget.findFirstOrThrow({ where: { id } }));
    });
  }

  async rotate(a: DeskActor, id: string) {
    this.requireAdmin(a);
    const secret = randomBytes(32).toString('base64url');
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const res = await tx.sdWidget.updateMany({ where: { organizationId: a.ctx.organizationId, id }, data: { identitySecretEncrypted: this.crypto.encrypt(secret), version: { increment: 1 }, updatedAt: new Date() } });
      if (!res.count) throw new NotFoundException('No such widget.');
      await audit(tx, a, 'desk.widget.secret_rotated', 'sd_widget', id);
      return { secret };
    });
  }

  // ------------------------------------------------------------------------------------------ public

  /** The widget by its public key (no session): only an active widget of an active company. */
  private async byKey(key: string) {
    if (!KEY_RE.test(key)) throw new NotFoundException('No such widget.');
    const w = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.sdWidget.findFirst({ where: { key, state: 'active' } }));
    if (!w) throw new NotFoundException('No such widget.');
    const org = await this.prisma.organization.findUnique({ where: { id: w.organizationId }, select: { id: true, name: true, slug: true, status: true } });
    if (!org || !isOrganizationActive(org.status)) throw new NotFoundException('No such widget.');
    const portal = await this.tenantPrisma.forTenant({ organizationId: org.id, isSuperAdmin: false }, (tx) => tx.sdPortal.findFirst({ where: { organizationId: org.id, id: w.portalId, status: 'active' } }));
    if (!portal) throw new NotFoundException('No such widget.');
    return { w, org, portal };
  }

  /** GET /desk/widget/:key: what the iframe needs (no personal data). */
  async config(key: string) {
    const { w, org, portal } = await this.byKey(key);
    return { company: org.name, orgSlug: org.slug, portalSlug: portal.slug, portalName: portal.name, accentColour: portal.accentColour, allowedOrigins: w.allowedOrigins, allowAnonymous: w.allowAnonymous };
  }

  /**
   * POST /desk/widget/:key/session: the company's signed token becomes a portal session. browserOrigin is the request's
   * Origin header (our iframe, or absent for a mobile SDK); parentOrigin is the site the iframe was told it runs on.
   */
  // DECISION NEEDED: a visitor the company's server signed for becomes an outside contact even when the help page's
  // own sign-up is closed (the company vouched for them). Keep, or obey the page's sign-up setting here too?
  async session(key: string, dto: { token: string; parentOrigin?: string }, browserOrigin: string | null, ip: string | null) {
    const { w, org, portal } = await this.byKey(key);
    const refuse = () => new UnauthorizedException('This sign-in is not accepted. Ask the site to sign you in again.');
    if (browserOrigin) {
      // From a browser: only our own iframe (or the allowed site itself), and the page it sits on must be allowed.
      if (browserOrigin !== webOrigin() && !w.allowedOrigins.includes(browserOrigin)) throw refuse();
      const parent = browserOrigin === webOrigin() ? cleanOrigin(dto.parentOrigin ?? '') : browserOrigin;
      if (!parent || !w.allowedOrigins.includes(parent)) throw refuse();
    } else if (!w.mobile) {
      throw refuse();
    }
    if (!(await this.perMinute(`sd:widget:rl:${w.id}`, 120))) throw new ConflictException('Too many sign-ins. Try again in a minute.');
    let claims: { sub?: unknown; email?: unknown; name?: unknown; jti?: unknown; iat?: unknown; exp?: unknown };
    try {
      claims = new JwtService({}).verify(dto.token, { secret: this.crypto.decrypt(w.identitySecretEncrypted), algorithms: ['HS256'], audience: w.key });
    } catch {
      throw refuse();
    }
    const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
    if (!/^[^@\s]{1,64}@[^@\s]{1,190}$/.test(email) || typeof claims.jti !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(claims.jti)) throw refuse();
    if (typeof claims.iat !== 'number' || typeof claims.exp !== 'number' || claims.exp - claims.iat > TOKEN_MAX_SECONDS) throw refuse();
    // Each token works once (a copied token cannot open a second session).
    const ttl = Math.max(1, Math.ceil(claims.exp - Date.now() / 1000));
    if (!(await this.redis.set(`sd:widget:jti:${w.id}:${claims.jti}`, '1', 'EX', ttl, 'NX'))) throw refuse();
    const name = typeof claims.name === 'string' ? claims.name.trim().slice(0, 100) : '';
    const s = await this.portals.vouchedSession(org.id, portal.id, email, name, ip, w.id);
    return { token: s.token, expiresAt: s.expiresAt, orgSlug: org.slug, portalSlug: portal.slug };
  }

  private async perMinute(key: string, max: number) {
    const [[, n]] = (await this.redis.multi().incr(key).expire(key, 60, 'NX').exec()) as [[null, number], unknown];
    return n <= max;
  }
}
