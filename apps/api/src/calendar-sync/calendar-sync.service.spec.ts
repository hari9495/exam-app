import { BadRequestException } from '@nestjs/common';
import { CalendarSyncService } from './calendar-sync.service';
import { CalendarNotConfiguredError } from './calendar-oauth-config';
import * as providers from './providers';

jest.mock('./providers', () => {
  const actual = jest.requireActual('./providers');
  return { ...actual, getCalendarProvider: jest.fn() };
});
const mockGetProvider = providers.getCalendarProvider as jest.Mock;

function makeAdapter(id: 'google' | 'microsoft') {
  return {
    id,
    label: id === 'google' ? 'Google Calendar' : 'Microsoft Outlook',
    scopes: [],
    authUrl: jest.fn().mockReturnValue(`https://consent.example/${id}`),
    exchangeCode: jest.fn(),
    refresh: jest.fn(),
    createEvent: jest.fn(),
    deleteEvent: jest.fn().mockResolvedValue(undefined),
    getBusy: jest.fn().mockResolvedValue([]),
  };
}

describe('CalendarSyncService', () => {
  let service: CalendarSyncService;
  let prisma: { calendarOAuthState: Record<string, jest.Mock> };
  let tx: { calendarConnection: Record<string, jest.Mock> };
  let tenantPrisma: { forTenant: jest.Mock };
  let crypto: { encrypt: jest.Mock; decrypt: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: true } as any;
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, GOOGLE_OAUTH_CLIENT_ID: 'gid', GOOGLE_OAUTH_CLIENT_SECRET: 'gsec', API_ORIGIN: 'https://api.test' };
    delete process.env.MICROSOFT_OAUTH_CLIENT_ID;
    delete process.env.MICROSOFT_OAUTH_CLIENT_SECRET;

    prisma = {
      calendarOAuthState: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        delete: jest.fn().mockResolvedValue({}),
      },
    };
    tx = {
      calendarConnection: {
        create: jest.fn(),
        upsert: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    tenantPrisma = { forTenant: jest.fn().mockImplementation((_c, fn) => fn(tx)) };
    // Reversible stub: prefix so we can assert something was encrypted, and strip on decrypt.
    crypto = {
      encrypt: jest.fn().mockImplementation((s: string) => `enc(${s})`),
      decrypt: jest.fn().mockImplementation((s: string) => s.replace(/^enc\((.*)\)$/, '$1')),
    };
    // Default to the real registry (so listConnections gets real labels); tests that isolate a
    // fake adapter override with mockReturnValue.
    const actual = jest.requireActual('./providers');
    mockGetProvider.mockReset();
    mockGetProvider.mockImplementation((id: string) => actual.getCalendarProvider(id));
    service = new CalendarSyncService(prisma as any, tenantPrisma as any, crypto as any);
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  describe('beginConnect', () => {
    it('mints a hashed one-time state and returns the provider consent url', async () => {
      const adapter = makeAdapter('google');
      mockGetProvider.mockReturnValue(adapter);

      const out = await service.beginConnect(context, 'user-1', 'google');

      expect(out.authUrl).toBe('https://consent.example/google');
      expect(prisma.calendarOAuthState.create).toHaveBeenCalledTimes(1);
      const created = prisma.calendarOAuthState.create.mock.calls[0][0].data;
      expect(created).toMatchObject({ userId: 'user-1', organizationId: 'org-1', provider: 'google' });
      // Only the sha256 of the state is stored, never the raw state.
      expect(created.stateHash).toMatch(/^[0-9a-f]{64}$/);
      // The raw state (not the hash) is what goes to the provider.
      const rawState = adapter.authUrl.mock.calls[0][1];
      expect(created.stateHash).not.toBe(rawState);
    });

    it('throws CalendarNotConfiguredError when the provider has no OAuth app', async () => {
      mockGetProvider.mockReturnValue(makeAdapter('microsoft')); // microsoft env unset above
      await expect(service.beginConnect(context, 'user-1', 'microsoft')).rejects.toBeInstanceOf(CalendarNotConfiguredError);
    });

    it('rejects an unknown provider', async () => {
      mockGetProvider.mockReturnValue(undefined);
      await expect(service.beginConnect(context, 'user-1', 'nope')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('handleCallback', () => {
    it('validates + consumes the state, exchanges the code, and upserts an encrypted connection', async () => {
      const adapter = makeAdapter('google');
      mockGetProvider.mockReturnValue(adapter);
      prisma.calendarOAuthState.findUnique.mockResolvedValue({
        id: 'state-1', provider: 'google', userId: 'user-1', organizationId: 'org-1',
        expiresAt: new Date(Date.now() + 60000),
      });
      adapter.exchangeCode.mockResolvedValue({
        accessToken: 'at', refreshToken: 'rt', expiresAt: new Date(Date.now() + 3600_000),
        scope: 'calendar', connectedEmail: 'me@example.com',
      });

      const out = await service.handleCallback('google', 'auth-code', 'raw-state');

      expect(out).toEqual({ userId: 'user-1', organizationId: 'org-1' });
      expect(prisma.calendarOAuthState.delete).toHaveBeenCalledWith({ where: { id: 'state-1' } });
      const upsertArg = tx.calendarConnection.upsert.mock.calls[0][0];
      expect(upsertArg.create).toMatchObject({
        userId: 'user-1', provider: 'google', connectedEmail: 'me@example.com',
        accessTokenEncrypted: 'enc(at)', refreshTokenEncrypted: 'enc(rt)',
      });
    });

    it('rejects an unknown/mismatched state', async () => {
      mockGetProvider.mockReturnValue(makeAdapter('google'));
      prisma.calendarOAuthState.findUnique.mockResolvedValue(null);
      await expect(service.handleCallback('google', 'c', 'bad')).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.calendarConnection.upsert).not.toHaveBeenCalled();
    });

    it('rejects an expired state (after consuming it)', async () => {
      mockGetProvider.mockReturnValue(makeAdapter('google'));
      prisma.calendarOAuthState.findUnique.mockResolvedValue({
        id: 'state-1', provider: 'google', userId: 'u', organizationId: 'org-1',
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.handleCallback('google', 'c', 'raw')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.calendarOAuthState.delete).toHaveBeenCalled();
    });

    it('rejects when the provider returns no refresh token', async () => {
      const adapter = makeAdapter('google');
      mockGetProvider.mockReturnValue(adapter);
      prisma.calendarOAuthState.findUnique.mockResolvedValue({
        id: 's', provider: 'google', userId: 'u', organizationId: 'org-1', expiresAt: new Date(Date.now() + 60000),
      });
      adapter.exchangeCode.mockResolvedValue({ accessToken: 'at', refreshToken: '', expiresAt: new Date() });
      await expect(service.handleCallback('google', 'c', 'raw')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('pushInterviewEvent', () => {
    const input = {
      organizerUserIds: ['recruiter-1', 'panelist-1'],
      summary: 'Interview', description: '', location: 'Room', startsAt: new Date(), endsAt: new Date(),
      timeZone: 'UTC', attendeeEmails: ['c@x.com'],
    };

    it('creates the event on the first organizer with a connection and returns id + meeting url', async () => {
      const adapter = makeAdapter('google');
      mockGetProvider.mockReturnValue(adapter);
      // recruiter-1 has no connection; panelist-1 has a google connection.
      tx.calendarConnection.findMany.mockImplementation(({ where }: any) =>
        Promise.resolve(where.userId === 'panelist-1' ? [{ provider: 'google' }] : []),
      );
      tx.calendarConnection.findUnique.mockResolvedValue({
        id: 'conn-1', accessTokenEncrypted: 'enc(at)', refreshTokenEncrypted: 'enc(rt)',
        tokenExpiresAt: new Date(Date.now() + 3600_000),
      });
      adapter.createEvent.mockResolvedValue({ eventId: 'evt-1', meetingUrl: 'https://meet.example/x' });

      const out = await service.pushInterviewEvent(context, input);

      expect(out).toEqual({ provider: 'google', eventId: 'evt-1', meetingUrl: 'https://meet.example/x', ownerId: 'panelist-1' });
      expect(adapter.createEvent).toHaveBeenCalledTimes(1);
    });

    it('returns null when no organizer has a connection (inert)', async () => {
      mockGetProvider.mockReturnValue(makeAdapter('google'));
      tx.calendarConnection.findMany.mockResolvedValue([]);
      const out = await service.pushInterviewEvent(context, input);
      expect(out).toBeNull();
    });

    it('never throws -- a provider error yields null', async () => {
      const adapter = makeAdapter('google');
      mockGetProvider.mockReturnValue(adapter);
      tx.calendarConnection.findMany.mockResolvedValue([{ provider: 'google' }]);
      tx.calendarConnection.findUnique.mockResolvedValue({
        id: 'c', accessTokenEncrypted: 'enc(at)', refreshTokenEncrypted: 'enc(rt)', tokenExpiresAt: new Date(Date.now() + 3600_000),
      });
      adapter.createEvent.mockRejectedValue(new Error('Google API 500'));
      await expect(service.pushInterviewEvent(context, input)).resolves.toBeNull();
    });

    it('refreshes an expired access token before creating the event, and persists the new token', async () => {
      const adapter = makeAdapter('google');
      mockGetProvider.mockReturnValue(adapter);
      tx.calendarConnection.findMany.mockResolvedValue([{ provider: 'google' }]);
      tx.calendarConnection.findUnique.mockResolvedValue({
        id: 'conn-1', accessTokenEncrypted: 'enc(old)', refreshTokenEncrypted: 'enc(rt)',
        tokenExpiresAt: new Date(Date.now() - 1000), // expired
      });
      adapter.refresh.mockResolvedValue({ accessToken: 'newAt', refreshToken: '', expiresAt: new Date(Date.now() + 3600_000) });
      adapter.createEvent.mockResolvedValue({ eventId: 'e', meetingUrl: null });

      await service.pushInterviewEvent(context, input);

      expect(adapter.refresh).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'gid' }), 'rt');
      // persisted the refreshed access token; kept the existing refresh token (provider sent none back)
      const upd = tx.calendarConnection.update.mock.calls[0][0];
      expect(upd.data.accessTokenEncrypted).toBe('enc(newAt)');
      expect(upd.data.refreshTokenEncrypted).toBe('enc(rt)');
      expect(adapter.createEvent.mock.calls[0][0]).toBe('newAt');
    });
  });

  describe('getExternalBusyForUsers', () => {
    it('merges busy intervals across users and is best-effort per connection', async () => {
      const adapter = makeAdapter('google');
      mockGetProvider.mockReturnValue(adapter);
      tx.calendarConnection.findMany.mockResolvedValue([
        { userId: 'u1', provider: 'google' },
        { userId: 'u2', provider: 'google' },
      ]);
      tx.calendarConnection.findUnique.mockResolvedValue({
        id: 'c', accessTokenEncrypted: 'enc(at)', refreshTokenEncrypted: 'enc(rt)', tokenExpiresAt: new Date(Date.now() + 3600_000),
      });
      adapter.getBusy
        .mockResolvedValueOnce([{ startsAt: 'a', endsAt: 'b' }])
        .mockRejectedValueOnce(new Error('boom')); // second user's fetch fails -> skipped, not fatal

      const busy = await service.getExternalBusyForUsers(context, ['u1', 'u2'], new Date(), new Date());
      expect(busy).toEqual([{ startsAt: 'a', endsAt: 'b' }]);
    });

    it('returns [] for no users', async () => {
      expect(await service.getExternalBusyForUsers(context, [], new Date(), new Date())).toEqual([]);
    });
  });

  describe('listConnections', () => {
    it('reports configured + connected state per provider', async () => {
      tx.calendarConnection.findMany.mockResolvedValue([{ provider: 'google', connectedEmail: 'me@x.com' }]);
      const out = await service.listConnections(context, 'user-1');
      const google = out.find((c) => c.provider === 'google')!;
      const microsoft = out.find((c) => c.provider === 'microsoft')!;
      expect(google).toMatchObject({ configured: true, connected: true, connectedEmail: 'me@x.com' });
      expect(microsoft).toMatchObject({ configured: false, connected: false });
    });
  });
});
