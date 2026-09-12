import { createHash, randomBytes } from 'crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService, TenantPrismaService, TenantContext } from '@exam-platform/shared';
import { OrgSecretsCryptoService } from '@exam-platform/shared';
import {
  CalendarBusyInterval,
  CalendarProviderAdapter,
  CalendarProviderId,
  getCalendarProvider,
} from './providers';
import {
  CalendarNotConfiguredError,
  isCalendarProviderConfigured,
  resolveCalendarOAuthClient,
} from './calendar-oauth-config';

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes to complete the consent round-trip
const REFRESH_SKEW_MS = 60 * 1000; // refresh a minute before the token actually expires

export interface PushEventInput {
  organizerUserIds: string[]; // priority order; the first with a connection hosts the event
  summary: string;
  description: string;
  location: string;
  startsAt: Date;
  endsAt: Date;
  timeZone: string;
  attendeeEmails: string[];
}

export interface PushEventResult {
  provider: CalendarProviderId;
  eventId: string;
  meetingUrl: string | null;
  ownerId: string;
}

export interface CalendarConnectionStatus {
  provider: CalendarProviderId;
  label: string;
  configured: boolean; // deployment has this provider's OAuth app
  connected: boolean; // this user has linked an account
  connectedEmail: string | null;
}

@Injectable()
export class CalendarSyncService {
  private readonly logger = new Logger(CalendarSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly crypto: OrgSecretsCryptoService,
  ) {}

  // ---- OAuth connect / callback ---------------------------------------------------------

  /** Begin the connect flow: mint a one-time state and return the provider consent URL. */
  async beginConnect(context: TenantContext, userId: string, provider: string): Promise<{ authUrl: string }> {
    const adapter = getCalendarProvider(provider);
    if (!adapter) throw new BadRequestException(`Unknown calendar provider: ${provider}`);
    const client = resolveCalendarOAuthClient(adapter.id); // throws CalendarNotConfiguredError if unset

    const rawState = randomBytes(32).toString('hex');
    const stateHash = createHash('sha256').update(rawState).digest('hex');
    await this.prisma.calendarOAuthState.create({
      data: {
        stateHash,
        userId,
        organizationId: context.organizationId as string,
        provider: adapter.id,
        expiresAt: new Date(Date.now() + STATE_TTL_MS),
      },
    });
    return { authUrl: adapter.authUrl(client, rawState) };
  }

  /**
   * Complete the connect flow. Validates + consumes the state (one-time), exchanges the code, and
   * stores the encrypted tokens. Returns the initiating user/org so the controller can redirect.
   * Throws on any failure (bad/expired state, exchange error) -- the controller maps that to a
   * generic error redirect, never leaking which step failed.
   */
  async handleCallback(provider: string, code: string, rawState: string): Promise<{ userId: string; organizationId: string }> {
    const adapter = getCalendarProvider(provider);
    if (!adapter) throw new BadRequestException('Unknown calendar provider');

    const stateHash = createHash('sha256').update(rawState).digest('hex');
    const state = await this.prisma.calendarOAuthState.findUnique({ where: { stateHash } });
    if (!state || state.provider !== adapter.id) throw new BadRequestException('Invalid state');
    // One-time: consume it immediately, regardless of what happens next.
    await this.prisma.calendarOAuthState.delete({ where: { id: state.id } }).catch(() => undefined);
    if (state.expiresAt.getTime() < Date.now()) throw new BadRequestException('State expired');

    const client = resolveCalendarOAuthClient(adapter.id);
    const tokens = await adapter.exchangeCode(client, code);
    if (!tokens.accessToken || !tokens.refreshToken) {
      // No refresh token means we can't sustain sync (Google only returns it with prompt=consent,
      // which we always request; if it's still missing the connection is not usable).
      throw new BadRequestException('Provider did not return a refresh token');
    }

    const context: TenantContext = { organizationId: state.organizationId, isSuperAdmin: true };
    await this.tenantPrisma.forTenant(context, (tx) =>
      tx.calendarConnection.upsert({
        where: { userId_provider: { userId: state.userId, provider: adapter.id } },
        create: {
          organizationId: state.organizationId,
          userId: state.userId,
          provider: adapter.id,
          connectedEmail: tokens.connectedEmail ?? null,
          accessTokenEncrypted: this.crypto.encrypt(tokens.accessToken),
          refreshTokenEncrypted: this.crypto.encrypt(tokens.refreshToken),
          tokenExpiresAt: tokens.expiresAt,
          scope: tokens.scope ?? null,
        },
        update: {
          connectedEmail: tokens.connectedEmail ?? null,
          accessTokenEncrypted: this.crypto.encrypt(tokens.accessToken),
          refreshTokenEncrypted: this.crypto.encrypt(tokens.refreshToken),
          tokenExpiresAt: tokens.expiresAt,
          scope: tokens.scope ?? null,
        },
      }),
    );
    return { userId: state.userId, organizationId: state.organizationId };
  }

  // ---- Settings surface -----------------------------------------------------------------

  /** One status row per provider for the settings page. */
  async listConnections(context: TenantContext, userId: string): Promise<CalendarConnectionStatus[]> {
    const rows = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.calendarConnection.findMany({ where: { userId }, select: { provider: true, connectedEmail: true } }),
    );
    const byProvider = new Map(rows.map((r) => [r.provider, r.connectedEmail]));
    return (['google', 'microsoft'] as CalendarProviderId[]).map((provider) => ({
      provider,
      label: getCalendarProvider(provider)!.label,
      configured: isCalendarProviderConfigured(provider),
      connected: byProvider.has(provider),
      connectedEmail: byProvider.get(provider) ?? null,
    }));
  }

  async disconnect(context: TenantContext, userId: string, provider: string): Promise<void> {
    const adapter = getCalendarProvider(provider);
    if (!adapter) throw new BadRequestException(`Unknown calendar provider: ${provider}`);
    await this.tenantPrisma.forTenant(context, (tx) =>
      tx.calendarConnection.deleteMany({ where: { userId, provider: adapter.id } }),
    );
  }

  // ---- Token resolution -----------------------------------------------------------------

  /**
   * Return a usable access token for a user+provider, refreshing (and persisting) it if expired.
   * Returns null when the user has no connection for that provider. Throws only on a real refresh
   * failure -- callers that must stay best-effort wrap this in try/catch.
   */
  private async getAccessToken(
    context: TenantContext,
    userId: string,
    provider: CalendarProviderId,
  ): Promise<{ adapter: CalendarProviderAdapter; accessToken: string } | null> {
    const conn = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.calendarConnection.findUnique({ where: { userId_provider: { userId, provider } } }),
    );
    if (!conn) return null;
    const adapter = getCalendarProvider(provider)!;

    if (conn.tokenExpiresAt.getTime() > Date.now() + REFRESH_SKEW_MS) {
      return { adapter, accessToken: this.crypto.decrypt(conn.accessTokenEncrypted) };
    }

    // Expired (or about to): refresh. resolveCalendarOAuthClient throws if the app was
    // de-configured since the user connected -- that propagates as "not usable" to the caller.
    const client = resolveCalendarOAuthClient(provider);
    const fresh = await adapter.refresh(client, this.crypto.decrypt(conn.refreshTokenEncrypted));
    await this.tenantPrisma.forTenant(context, (tx) =>
      tx.calendarConnection.update({
        where: { id: conn.id },
        data: {
          accessTokenEncrypted: this.crypto.encrypt(fresh.accessToken),
          // Providers usually don't re-issue a refresh token on refresh -- keep the existing one.
          refreshTokenEncrypted: fresh.refreshToken ? this.crypto.encrypt(fresh.refreshToken) : conn.refreshTokenEncrypted,
          tokenExpiresAt: fresh.expiresAt,
        },
      }),
    );
    return { adapter, accessToken: fresh.accessToken };
  }

  // ---- 2-way sync: push / delete / busy -------------------------------------------------

  /**
   * Best-effort: create the interview event on the first organizer who has a connected calendar,
   * returning the event id + Meet/Teams link. Returns null when no organizer is connected or the
   * feature is inert (no OAuth app). NEVER throws -- interview confirmation must not depend on it.
   */
  async pushInterviewEvent(context: TenantContext, input: PushEventInput): Promise<PushEventResult | null> {
    for (const ownerId of input.organizerUserIds) {
      const conns = await this.tenantPrisma
        .forTenant(context, (tx) =>
          tx.calendarConnection.findMany({ where: { userId: ownerId }, select: { provider: true } }),
        )
        .catch(() => [] as { provider: string }[]);
      // Prefer google when a user has both -- arbitrary but deterministic.
      const providers = conns
        .map((c) => c.provider as CalendarProviderId)
        .sort((a, b) => (a === 'google' ? -1 : b === 'google' ? 1 : 0));
      for (const provider of providers) {
        try {
          const resolved = await this.getAccessToken(context, ownerId, provider);
          if (!resolved) continue;
          const event = await resolved.adapter.createEvent(resolved.accessToken, {
            summary: input.summary,
            description: input.description,
            location: input.location,
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            timeZone: input.timeZone,
            attendeeEmails: input.attendeeEmails,
          });
          return { provider, eventId: event.eventId, meetingUrl: event.meetingUrl, ownerId };
        } catch (err) {
          this.logger.warn(`Calendar push failed for user ${ownerId} via ${provider}: ${String(err)}`);
          // Try the next provider/organizer.
        }
      }
    }
    return null;
  }

  /** Best-effort: retract a previously-pushed event. Never throws. */
  async deleteInterviewEvent(
    context: TenantContext,
    ownerId: string,
    provider: string,
    eventId: string,
  ): Promise<void> {
    const adapter = getCalendarProvider(provider);
    if (!adapter) return;
    try {
      const resolved = await this.getAccessToken(context, ownerId, adapter.id);
      if (!resolved) return;
      await resolved.adapter.deleteEvent(resolved.accessToken, eventId);
    } catch (err) {
      this.logger.warn(`Calendar delete failed for user ${ownerId} via ${provider}: ${String(err)}`);
    }
  }

  /**
   * Best-effort inbound sync: merge external busy times for the given users into one list, so
   * self-book slot generation avoids times a panelist is already booked on their own calendar.
   * Returns [] on any failure -- external busy is additive; slot generation still works without it.
   */
  async getExternalBusyForUsers(
    context: TenantContext,
    userIds: string[],
    windowStart: Date,
    windowEnd: Date,
  ): Promise<CalendarBusyInterval[]> {
    if (!userIds.length) return [];
    const conns = await this.tenantPrisma
      .forTenant(context, (tx) =>
        tx.calendarConnection.findMany({
          where: { userId: { in: userIds } },
          select: { userId: true, provider: true },
        }),
      )
      .catch(() => [] as { userId: string; provider: string }[]);

    const busy: CalendarBusyInterval[] = [];
    for (const conn of conns) {
      try {
        const resolved = await this.getAccessToken(context, conn.userId, conn.provider as CalendarProviderId);
        if (!resolved) continue;
        const intervals = await resolved.adapter.getBusy(resolved.accessToken, windowStart, windowEnd);
        busy.push(...intervals);
      } catch (err) {
        this.logger.warn(`Calendar busy fetch failed for user ${conn.userId} via ${conn.provider}: ${String(err)}`);
      }
    }
    return busy;
  }
}

export { CalendarNotConfiguredError };
