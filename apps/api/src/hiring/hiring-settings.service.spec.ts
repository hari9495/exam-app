import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { HiringSettingsService, HIRING_SETTING_KEYS } from './hiring-settings.service';

// Settings 6.1 Hiring: the writes the e2e cannot reach with a real impersonation token.
describe('HiringSettingsService.save', () => {
  const set = jest.fn();
  const svc = new HiringSettingsService({} as never, {} as never, { set } as never);
  const ctx = { organizationId: 'o1', isSuperAdmin: false };
  beforeEach(() => set.mockReset());

  it('refuses acting for someone else before anything else, even with the key', async () => {
    jest.spyOn(svc, 'canEdit').mockResolvedValue(true);
    await expect(svc.save(ctx, { role: 'panel', impersonatorUserId: 'u9' }, [{ key: 'ats.retention_months', value: '18' }])).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.save(ctx, { role: 'panel', actingSuperAdmin: true }, [{ key: 'ats.retention_months', value: '18' }])).rejects.toThrow(/acting for someone else/);
    expect(set).not.toHaveBeenCalled();
  });

  it('checks every key and value before writing any', async () => {
    jest.spyOn(svc, 'canEdit').mockResolvedValue(true);
    await expect(svc.save(ctx, { role: 'panel' }, [{ key: 'ats.retention_months', value: '18' }, { key: 'ats.referral.qualify_days', value: '45' }])).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.save(ctx, { role: 'panel' }, [{ key: 'hiring.pay_range.show', value: 'on' }])).rejects.toThrow(/not a hiring setting on this page/);
    expect(set).not.toHaveBeenCalled();
  });

  it('page keys are registry keys with defaults', () => {
    expect(HIRING_SETTING_KEYS).toContain('hiring.requisition.default_recruiter');
  });
});
