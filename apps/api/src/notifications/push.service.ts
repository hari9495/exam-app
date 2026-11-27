import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import * as webpush from 'web-push';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { companySetting } from '../time/time-core';
import { HM, inQuietHours, istHm, pushDefault, pushKeys, pushTitle, validEndpoint } from './push-rules';

/**
 * T2-E 52 (answers 2875 to 2878): push through the installable web app with the standard Web Push protocol (web-push,
 * MIT). The keys come only from server config (WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT); without
 * them, or with the company switch off (notify.push.enabled), nothing is pushed. One subscription per signed-in device;
 * removed on sign-out, or when the push service says it is gone (404 / 410). A push carries a neutral title and the
 * page to open, nothing else; the person's Pause push, quiet hours and per-kind choice apply.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  /** The Web Push sender (a seam for tests, which never reach a real push service). */
  static transport = { sendNotification: (...a: Parameters<typeof webpush.sendNotification>) => webpush.sendNotification(...a) };

  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private async companyOn(ctx: TenantContext) {
    return this.tenantPrisma.forTenant(ctx, async (tx) => (await companySetting(tx, { organizationId: ctx.organizationId as string, isSuperAdmin: false } as never, 'notify.push.enabled')) === 'on');
  }

  /** What Me › Notifications needs: whether push can be used, the public key to subscribe with, and my choices. */
  async status(ctx: TenantContext, userId: string) {
    const keys = pushKeys();
    const on = await this.companyOn(ctx);
    const u = await this.tenantPrisma.forTenant(ctx, (tx) => tx.user.findFirstOrThrow({ where: { id: userId, organizationId: ctx.organizationId as string }, select: { pushPaused: true, pushQuietFrom: true, pushQuietTo: true } }));
    return { available: Boolean(keys && on), publicKey: keys && on ? keys.publicKey : null, paused: u.pushPaused, quietFrom: u.pushQuietFrom, quietTo: u.pushQuietTo };
  }

  /** This device's subscription for me (a device signed in by someone else of the company moves to me). */
  async subscribe(ctx: TenantContext, userId: string, acting: boolean, dto: { endpoint: string; p256dh: string; auth: string; userAgent?: string }) {
    if (acting) throw new ForbiddenException('Not available while acting for someone else.');
    if (!pushKeys() || !(await this.companyOn(ctx))) throw new BadRequestException('Push is switched off for your company.');
    if (!validEndpoint(dto.endpoint)) throw new BadRequestException('That is not a push address a browser gives.');
    const org = ctx.organizationId as string;
    await this.tenantPrisma.forTenant(ctx, (tx) =>
      tx.pushSubscription.upsert({
        where: { organizationId_endpoint: { organizationId: org, endpoint: dto.endpoint } },
        create: { organizationId: org, userId, endpoint: dto.endpoint, p256dh: dto.p256dh, auth: dto.auth, userAgent: dto.userAgent?.slice(0, 200) ?? null },
        update: { userId, p256dh: dto.p256dh, auth: dto.auth, userAgent: dto.userAgent?.slice(0, 200) ?? null },
      }),
    );
    return { success: true };
  }

  /** Sign-out (or "off for this device"): this device's subscription of mine goes. */
  async unsubscribe(ctx: TenantContext, userId: string, endpoint: string) {
    await this.tenantPrisma.forTenant(ctx, (tx) => tx.pushSubscription.deleteMany({ where: { organizationId: ctx.organizationId as string, userId, endpoint } }));
    return { success: true };
  }

  async setChoices(ctx: TenantContext, userId: string, dto: { paused?: boolean; quietFrom?: string; quietTo?: string }) {
    if ((dto.quietFrom && !HM.test(dto.quietFrom)) || (dto.quietTo && !HM.test(dto.quietTo))) throw new BadRequestException('Give quiet hours as HH:MM.');
    await this.tenantPrisma.forTenant(ctx, (tx) =>
      tx.user.updateMany({ where: { id: userId, organizationId: ctx.organizationId as string }, data: { ...(dto.paused !== undefined ? { pushPaused: dto.paused } : {}), ...(dto.quietFrom ? { pushQuietFrom: dto.quietFrom } : {}), ...(dto.quietTo ? { pushQuietTo: dto.quietTo } : {}) } }),
    );
    return this.status(ctx, userId);
  }

  /** After a notice is saved: push it to each recipient's devices where their choices allow. Never throws. */
  async send(ctx: TenantContext, userIds: string[], type: string, linkPath: string, now = new Date()): Promise<number> {
    const keys = pushKeys();
    if (!keys || !userIds.length) return 0;
    try {
      if (!(await this.companyOn(ctx))) return 0;
      const org = ctx.organizationId as string;
      const { users, prefs, subs } = await this.tenantPrisma.forTenant(ctx, async (tx) => ({
        users: await tx.user.findMany({ where: { organizationId: org, id: { in: userIds }, status: 'active' }, select: { id: true, pushPaused: true, pushQuietFrom: true, pushQuietTo: true } }),
        prefs: await tx.userNotificationPreference.findMany({ where: { organizationId: org, userId: { in: userIds }, type }, select: { userId: true, pushEnabled: true } }),
        subs: await tx.pushSubscription.findMany({ where: { organizationId: org, userId: { in: userIds } } }),
      }));
      const hm = istHm(now);
      const to = users.filter((u) => !u.pushPaused && !inQuietHours(hm, u.pushQuietFrom, u.pushQuietTo) && (prefs.find((p) => p.userId === u.id)?.pushEnabled ?? pushDefault(type))).map((u) => u.id);
      const payload = JSON.stringify({ title: pushTitle(type), url: linkPath.startsWith('/') ? linkPath : '/yx/notifications' });
      const gone: string[] = [];
      let sent = 0;
      for (const s of subs.filter((x) => to.includes(x.userId))) {
        try {
          await PushService.transport.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86_400, vapidDetails: keys });
          sent++;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) gone.push(s.id);
          else this.logger.warn(`Push failed (${code ?? 'no status'})`);
        }
      }
      if (gone.length || sent)
        await this.tenantPrisma.forTenant(ctx, async (tx) => {
          if (gone.length) await tx.pushSubscription.deleteMany({ where: { organizationId: org, id: { in: gone } } });
          await tx.pushSubscription.updateMany({ where: { organizationId: org, userId: { in: to }, id: { notIn: gone } }, data: { lastSentAt: now } });
        });
      return sent;
    } catch (e) {
      this.logger.error(`Push sending failed: ${(e as Error).message}`);
      return 0;
    }
  }
}
