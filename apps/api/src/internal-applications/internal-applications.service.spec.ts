jest.mock('../candidates/recompute-global-stage', () => ({ recomputeGlobalStage: jest.fn().mockResolvedValue(undefined) }));
const SETTINGS: Record<string, string> = {};
jest.mock('../people/probation', () => ({ settingFor: jest.fn(async (_tx: unknown, _c: unknown, key: string) => SETTINGS[key]) }));

import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InternalApplicationsService, internalStatus } from './internal-applications.service';
import { addMonths, internalEligibility, roleSince } from './internal-eligibility';

const ctx = { organizationId: 'org-1', isSuperAdmin: false } as any;
const NOTE = 'I ran the QA automation for the Hosur line and want to grow it.';

function makeService(tx: Record<string, any>, extra: { notify?: jest.Mock; upload?: jest.Mock } = {}) {
  const tenantPrisma = { forTenant: jest.fn((_c: unknown, fn: (t: unknown) => unknown) => fn(tx)) } as any;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as any;
  const blob = { upload: extra.upload ?? jest.fn().mockResolvedValue('candidates/org-1/x.pdf') } as any;
  const notifications = { notify: extra.notify ?? jest.fn().mockResolvedValue(undefined) } as any;
  return { svc: new InternalApplicationsService(tenantPrisma, audit, blob, notifications), audit, blob, notifications };
}

const day = (s: string) => new Date(`${s}T00:00:00Z`);

/** A confirmed employee in the same role since 2024, managed by employee m1 (user mgr-1). */
function baseTx(overrides: Record<string, any> = {}) {
  return {
    user: { findFirst: jest.fn().mockResolvedValue({ email: 'sam@acme.com', name: 'Sam Staff' }) },
    job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1', title: 'Senior QA Engineer', status: 'open', pipelineId: 'p1', hiringManagerId: 'hm-1' }) },
    employee: { findFirst: jest.fn(async ({ where }: any) => (where.userId ? { id: 'emp-1' } : { userId: 'mgr-1', givenName: 'Karthik', familyName: 'Subramanian', preferredName: null })) },
    employment: { findFirst: jest.fn().mockResolvedValue({ id: 'em-1' }) },
    employmentStatusPeriod: { findFirst: jest.fn().mockResolvedValue({ status: 'confirmed' }) },
    probation: { findFirst: jest.fn().mockResolvedValue(null) },
    employeeAssignment: { findMany: jest.fn().mockResolvedValue([{ validFrom: day('2024-01-01'), designationId: 'd1', managerEmployeeId: 'm1' }]) },
    candidate: { upsert: jest.fn().mockResolvedValue({ id: 'cand-1' }) },
    candidateProfile: { upsert: jest.fn().mockResolvedValue({}) },
    pipeline: { findFirst: jest.fn().mockResolvedValue({ stages: [{ category: 'active', statuses: [{ id: 'st-1' }] }] }) },
    pipelineEntry: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'entry-1' }) },
    pipelineFeedback: { create: jest.fn().mockResolvedValue({}) },
    internalApplication: { create: jest.fn(async ({ data }: any) => ({ id: 'ia-1', ...data })), findFirst: jest.fn(), updateMany: jest.fn() },
    ...overrides,
  };
}

beforeEach(() => Object.assign(SETTINGS, { 'hiring.internal.after_probation': 'on', 'hiring.internal.months_in_role': '12', 'hiring.internal.tell_manager': 'on_apply' }));

describe('internal job eligibility (founder decision 6)', () => {
  const rules = { afterProbation: true, monthsInRole: 12 };
  const facts = { employed: true, status: 'confirmed', probationEndsOn: null, roleSince: '2026-01-01', today: '2027-01-01' };

  it('12 months in the role opens on the same day a year later (the boundary), not a day before', () => {
    expect(internalEligibility(rules, facts)).toEqual({ eligible: true });
    expect(internalEligibility(rules, { ...facts, today: '2026-12-31' })).toMatchObject({ eligible: false, reason: 'months', opensOn: '2027-01-01', detail: 'You started your current role on 1 Jan 2026. Internal applications open for you on 1 Jan 2027 (company rule).' });
  });
  it('0 months means no wait; a changed setting changes the date', () => {
    expect(internalEligibility({ ...rules, monthsInRole: 0 }, { ...facts, roleSince: '2026-12-31', today: '2026-12-31' })).toEqual({ eligible: true });
    expect(internalEligibility({ ...rules, monthsInRole: 6 }, { ...facts, today: '2026-06-30' })).toMatchObject({ eligible: false, opensOn: '2026-07-01' });
  });
  it('on probation: refused while the rule is on, allowed when HR turns it off', () => {
    const p = { ...facts, status: 'probation', probationEndsOn: '2027-03-31' };
    expect(internalEligibility(rules, p)).toMatchObject({ eligible: false, reason: 'probation', opensOn: '2027-03-31' });
    expect(internalEligibility({ ...rules, afterProbation: false }, p)).toEqual({ eligible: true });
  });
  it('no employee record, or serving notice: refused whatever the settings', () => {
    expect(internalEligibility({ afterProbation: false, monthsInRole: 0 }, { ...facts, employed: false })).toMatchObject({ eligible: false, reason: 'not_employee' });
    expect(internalEligibility({ afterProbation: false, monthsInRole: 0 }, { ...facts, status: 'notice' })).toMatchObject({ eligible: false, reason: 'notice' });
  });
  it('months are calendar months, the day clamped to the month end (31 Jan + 1 = 28 Feb; leap year 29 Feb)', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2027-01-31', 13)).toBe('2028-02-29');
    expect(addMonths('2026-11-15', 12)).toBe('2027-11-15');
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01');
  });
  it('the current role starts where the designation last changed', () => {
    expect(roleSince([])).toBeNull();
    expect(roleSince([{ validFrom: '2026-05-01', designationId: 'd2' }, { validFrom: '2026-01-01', designationId: 'd2' }, { validFrom: '2024-01-01', designationId: 'd1' }])).toBe('2026-01-01');
  });
});

describe('internalStatus (the design statuses)', () => {
  const st = (category: string, position: number, name = 'Stage') => ({ name, category, position });
  it('maps the pipeline to Applied / Assessment / Interview / Offer / Selected / Not selected', () => {
    expect(internalStatus(false, false, st('active', 1), 1)).toBe('Applied');
    expect(internalStatus(false, false, st('active', 2, 'Online test'), 1)).toBe('Assessment');
    expect(internalStatus(false, false, st('active', 3, 'Panel'), 1)).toBe('Interview');
    expect(internalStatus(false, false, st('offer', 4), 1)).toBe('Offer');
    expect(internalStatus(false, false, st('hired', 5), 1)).toBe('Selected');
    expect(internalStatus(true, false, st('active', 3), 1)).toBe('Not selected');
    expect(internalStatus(false, true, st('active', 3), 1)).toBe('Not selected');
    expect(internalStatus(false, false, null, undefined)).toBe('Applied');
  });
});

describe('InternalApplicationsService.apply', () => {
  it('lands the application, keeps the note for the hiring team and tells the manager (not asks)', async () => {
    const tx = baseTx();
    const { svc, notifications, audit } = makeService(tx);
    expect(await svc.apply(ctx, 'user-1', { jobId: 'job-1', note: `  ${NOTE} ` })).toEqual({ id: 'entry-1' });
    // Candidate is upserted on the SESSION user's email, not any client-supplied value.
    expect(tx.candidate.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId_email: { organizationId: 'org-1', email: 'sam@acme.com' } } }));
    expect(tx.pipelineEntry.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ jobId: 'job-1', candidateId: 'cand-1', enteredVia: 'internal', referrerUserId: 'user-1', statusId: 'st-1' }) }));
    expect(tx.pipelineFeedback.create).toHaveBeenCalledWith({ data: expect.objectContaining({ entryId: 'entry-1', authorUserId: 'user-1', note: `Why I am interested: ${NOTE}` }) });
    expect(tx.internalApplication.create).toHaveBeenCalledWith({ data: expect.objectContaining({ employeeId: 'emp-1', managerUserId: 'mgr-1', note: NOTE, managerToldAt: expect.any(Date) }) });
    expect(notifications.notify).toHaveBeenCalledWith(ctx, 'user-1', ['mgr-1'], 'hiring.internal.applied', expect.objectContaining({ contextText: 'Sam Staff applied for the internal job Senior QA Engineer' }));
    expect(audit.record).toHaveBeenCalledWith(ctx, expect.objectContaining({ action: 'internal_application.submitted' }));
  });

  it('setting "at the offer": nobody is told on apply', async () => {
    SETTINGS['hiring.internal.tell_manager'] = 'at_offer';
    const tx = baseTx();
    const { svc, notifications } = makeService(tx);
    await svc.apply(ctx, 'user-1', { jobId: 'job-1', note: NOTE });
    expect(tx.internalApplication.create).toHaveBeenCalledWith({ data: expect.objectContaining({ managerUserId: 'mgr-1', managerToldAt: null }) });
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('refuses someone not yet 12 months in the role (403, the reason), and writes nothing', async () => {
    const tx = baseTx({ employeeAssignment: { findMany: jest.fn().mockResolvedValue([{ validFrom: new Date(Date.now() - 30 * 86_400_000), designationId: 'd1', managerEmployeeId: 'm1' }]) } });
    await expect(makeService(tx).svc.apply(ctx, 'user-1', { jobId: 'job-1', note: NOTE })).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.pipelineEntry.create).not.toHaveBeenCalled();
  });

  it('refuses someone on probation, and a sign-in with no employee record', async () => {
    const onProbation = baseTx({ employmentStatusPeriod: { findFirst: jest.fn().mockResolvedValue({ status: 'probation' }) }, probation: { findFirst: jest.fn().mockResolvedValue({ plannedEndOn: day('2027-03-31') }) } });
    await expect(makeService(onProbation).svc.apply(ctx, 'user-1', { jobId: 'job-1', note: NOTE })).rejects.toThrow(/probation/);
    const noRecord = baseTx({ employee: { findFirst: jest.fn().mockResolvedValue(null) } });
    await expect(makeService(noRecord).svc.apply(ctx, 'user-1', { jobId: 'job-1', note: NOTE })).rejects.toThrow(/employees/);
  });

  it('the hiring manager of the job cannot apply for it (403)', async () => {
    const tx = baseTx({ job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1', title: 'X', status: 'open', pipelineId: 'p1', hiringManagerId: 'user-1' }) } });
    await expect(makeService(tx).svc.apply(ctx, 'user-1', { jobId: 'job-1', note: NOTE })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a job not on Internal jobs or another company’s is 404; a closed or on-hold job is 409', async () => {
    await expect(makeService(baseTx({ job: { findFirst: jest.fn().mockResolvedValue(null) } })).svc.apply(ctx, 'user-1', { jobId: 'job-1', note: NOTE })).rejects.toBeInstanceOf(NotFoundException);
    const closed = baseTx({ job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1', title: 'X', status: 'on_hold', pipelineId: 'p1', hiringManagerId: null }) } });
    await expect(makeService(closed).svc.apply(ctx, 'user-1', { jobId: 'job-1', note: NOTE })).rejects.toBeInstanceOf(ConflictException);
  });

  it('a second application to the same job is 409, also when two presses race (unique key)', async () => {
    const again = baseTx({ pipelineEntry: { findUnique: jest.fn().mockResolvedValue({ id: 'entry-9' }), create: jest.fn() } });
    await expect(makeService(again).svc.apply(ctx, 'user-1', { jobId: 'job-1', note: NOTE })).rejects.toThrow('You have already applied for this job.');
    const race = baseTx({ pipelineEntry: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' })) } });
    await expect(makeService(race).svc.apply(ctx, 'user-1', { jobId: 'job-1', note: NOTE })).rejects.toBeInstanceOf(ConflictException);
  });

  it('an empty note or a résumé that is not a PDF is 400 before anything is stored', async () => {
    const tx = baseTx();
    const { svc, blob } = makeService(tx);
    await expect(svc.apply(ctx, 'user-1', { jobId: 'job-1', note: '   ' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.apply(ctx, 'user-1', { jobId: 'job-1', note: NOTE, resumeBase64: Buffer.from('MZ not a pdf').toString('base64') })).rejects.toThrow('The résumé must be a PDF file.');
    expect(blob.upload).not.toHaveBeenCalled();
    expect(tx.pipelineEntry.create).not.toHaveBeenCalled();
    await svc.apply(ctx, 'user-1', { jobId: 'job-1', note: NOTE, resumeBase64: Buffer.from('%PDF-1.4 tiny').toString('base64') });
    expect(tx.candidateProfile.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ resumePath: 'candidates/org-1/x.pdf' }) }));
  });
});

describe('InternalApplicationsService.tellAtOffer', () => {
  const pending = { id: 'ia-1', jobId: 'job-1', applicantUserId: 'user-1', managerUserId: 'mgr-1' };
  it('tells the manager once when the setting is "at the offer"', async () => {
    SETTINGS['hiring.internal.tell_manager'] = 'at_offer';
    const tx = baseTx({ internalApplication: { findFirst: jest.fn().mockResolvedValue(pending), updateMany: jest.fn().mockResolvedValue({ count: 1 }) } });
    const { svc, notifications } = makeService(tx);
    await svc.tellAtOffer(ctx, 'entry-1');
    expect(notifications.notify).toHaveBeenCalledWith(ctx, 'user-1', ['mgr-1'], 'hiring.internal.applied', expect.objectContaining({ contextText: 'Sam Staff reached the offer stage for the internal job Senior QA Engineer' }));
    // Already told (another offer, or a race): nothing more.
    tx.internalApplication.updateMany.mockResolvedValue({ count: 0 });
    await svc.tellAtOffer(ctx, 'entry-1');
    expect(notifications.notify).toHaveBeenCalledTimes(1);
  });
  it('does nothing when the manager is told on apply, and never throws', async () => {
    const tx = baseTx({ internalApplication: { findFirst: jest.fn().mockResolvedValue(pending), updateMany: jest.fn() } });
    const { svc, notifications } = makeService(tx);
    await svc.tellAtOffer(ctx, 'entry-1');
    expect(tx.internalApplication.findFirst).not.toHaveBeenCalled();
    SETTINGS['hiring.internal.tell_manager'] = 'at_offer';
    tx.internalApplication.findFirst.mockRejectedValue(new Error('db down'));
    await expect(svc.tellAtOffer(ctx, 'entry-1')).resolves.toBeUndefined();
    expect(notifications.notify).not.toHaveBeenCalled();
  });
});

describe('InternalApplicationsService.myApplications', () => {
  it('returns the staff member’s own internal applications with the design status', async () => {
    const tx = {
      pipelineEntry: { findMany: jest.fn().mockResolvedValue([{ id: 'e1', jobId: 'job-1', createdAt: day('2026-09-15'), rejected: false, archivedAt: null, job: { pipelineId: 'p1' }, status: { name: 'Screen', stage: { name: 'Screening', category: 'active', position: 2 } } }]) },
      job: { findMany: jest.fn().mockResolvedValue([{ id: 'job-1', title: 'Senior Engineer' }]) },
      pipelineStage: { findMany: jest.fn().mockResolvedValue([{ pipelineId: 'p1', position: 1 }]) },
    };
    const rows = await makeService(tx as any).svc.myApplications(ctx, 'user-1');
    expect(tx.pipelineEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { referrerUserId: 'user-1', enteredVia: 'internal' } }));
    expect(rows).toEqual([{ entryId: 'e1', jobTitle: 'Senior Engineer', status: 'Interview', appliedAt: day('2026-09-15') }]);
  });
});
