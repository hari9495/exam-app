import { BadRequestException } from '@nestjs/common';
import { CalendarSyncController } from './calendar-sync.controller';
import { CalendarNotConfiguredError } from './calendar-oauth-config';

describe('CalendarSyncController', () => {
  let controller: CalendarSyncController;
  let service: {
    listConnections: jest.Mock;
    beginConnect: jest.Mock;
    disconnect: jest.Mock;
    handleCallback: jest.Mock;
  };
  const tenant = { organizationId: 'org-1', isSuperAdmin: false } as any;
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, FRONTEND_URL: 'https://app.test' };
    service = {
      listConnections: jest.fn().mockResolvedValue([]),
      beginConnect: jest.fn().mockResolvedValue({ authUrl: 'https://consent/google' }),
      disconnect: jest.fn().mockResolvedValue(undefined),
      handleCallback: jest.fn().mockResolvedValue({ userId: 'u', organizationId: 'org-1' }),
    };
    controller = new CalendarSyncController(service as any);
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('delegates connect and returns the auth url', async () => {
    const out = await controller.connect(tenant, 'user-1', 'google');
    expect(out).toEqual({ authUrl: 'https://consent/google' });
    expect(service.beginConnect).toHaveBeenCalledWith(tenant, 'user-1', 'google');
  });

  it('maps a not-configured provider to a 400 (not a 500)', async () => {
    service.beginConnect.mockRejectedValue(new CalendarNotConfiguredError('nope'));
    await expect(controller.connect(tenant, 'user-1', 'microsoft')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('delegates disconnect', async () => {
    const out = await controller.disconnect(tenant, 'user-1', 'google');
    expect(out).toEqual({ ok: true });
    expect(service.disconnect).toHaveBeenCalledWith(tenant, 'user-1', 'google');
  });

  it('callback redirects to settings with ?calendarConnected on success', async () => {
    const res = { redirect: jest.fn() } as any;
    await controller.callback('google', 'code', 'state', undefined, {} as any, res);
    expect(service.handleCallback).toHaveBeenCalledWith('google', 'code', 'state');
    expect(res.redirect).toHaveBeenCalledWith('https://app.test/v2/calendar?calendarConnected=google');
  });

  it('callback redirects with a generic error when the provider denied consent', async () => {
    const res = { redirect: jest.fn() } as any;
    await controller.callback('google', undefined, undefined, 'access_denied', {} as any, res);
    expect(service.handleCallback).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('https://app.test/v2/calendar?calendarError=denied');
  });

  it('callback redirects with a generic error when the exchange fails (never leaks the step)', async () => {
    service.handleCallback.mockRejectedValue(new Error('exchange failed at token endpoint'));
    const res = { redirect: jest.fn() } as any;
    await controller.callback('google', 'code', 'state', undefined, {} as any, res);
    expect(res.redirect).toHaveBeenCalledWith('https://app.test/v2/calendar?calendarError=failed');
  });
});
