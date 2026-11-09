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
    await expect(svc.save(ctx, { role: 'panel' }, [{ key: 'rehire.code', value: 'new' }])).rejects.toThrow(/not a hiring setting on this page/);
    // Answer 341: the seven settings now on the page still take only their own values.
    await expect(svc.save(ctx, { role: 'panel' }, [{ key: 'ats.headcount_plan', value: 'strict' }])).rejects.toThrow(/one of: off, advisory, required/);
    await expect(svc.save(ctx, { role: 'panel' }, [{ key: 'ats.referral.self_apply_days', value: '45' }])).rejects.toBeInstanceOf(BadRequestException);
    expect(set).not.toHaveBeenCalled();
  });

  it('a default recruiter that is not a UUID is refused (400) before anything is written (answer 348)', async () => {
    jest.spyOn(svc, 'canEdit').mockResolvedValue(true);
    await expect(svc.save(ctx, { role: 'panel' }, [{ key: 'ats.retention_months', value: '18' }, { key: 'hiring.requisition.default_recruiter', value: 'Neha' }])).rejects.toThrow(/recruiter key/);
    expect(set).not.toHaveBeenCalled();
  });

  it('page keys are registry keys with defaults, the seven of answer 341 included', () => {
    expect(HIRING_SETTING_KEYS).toEqual(expect.arrayContaining(['hiring.requisition.default_recruiter', 'ats.headcount_plan', 'ats.headcount_plan.manager_view', 'ats.referral.self_apply_days', 'hiring.pay_range.show', 'hiring.pay_history.ask', 'hiring.rediscovery.ai', 'hiring.rehire_flag.blocks_screening', 'hiring.bgv.decider_other_person', 'hiring.interview_day.slot_minutes', 'hiring.interview_day.assign', 'hiring.internal.after_probation', 'hiring.internal.months_in_role', 'hiring.internal.tell_manager', 'hiring.notetaker.enabled', 'hiring.notetaker.ai_draft', 'hiring.notetaker.keep_days', 'hiring.bias_audit.nyc']));
    expect(HIRING_SETTING_KEYS).toHaveLength(26);
  });
});
