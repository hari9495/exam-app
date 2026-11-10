const SETTINGS: Record<string, string> = {};
jest.mock('../people/probation', () => ({ settingFor: jest.fn(async (_tx: unknown, _c: unknown, key: string) => SETTINGS[key] ?? 'off') }));

import { ForbiddenException } from '@nestjs/common';
import { addBusinessDays, biasAuditBlock, coveredPlace, noticeBlock, nycNotice, resultsProblem, validUntil, type BiasLaw } from './bias-audit';
import { BiasAuditService } from './bias-audit.service';

const LAW: BiasLaw = {
  name: 'NYC Local Law 144',
  jurisdiction: 'US-NY',
  cities: ['New York', 'NYC', 'Brooklyn', 'Staten Island'],
  validMonths: 12,
  noticeBusinessDays: 10,
  categories: { sex: ['Female', 'Male'], race: ['Asian', 'White'] },
  source: 's',
  verify: true,
};
const c = { organizationId: 'org-1', isSuperAdmin: false } as any;

function tx(o: { audit?: string | null; location?: { state: string; address: { city: string } } | null; text?: string | null } = {}) {
  return {
    statutoryRuleSet: { findFirst: jest.fn().mockResolvedValue({ jurisdiction: 'US-NY', values: { name: LAW.name, cities: LAW.cities, validMonths: 12, noticeBusinessDays: 10, categories: LAW.categories }, source: 's', verify: true }) },
    biasAudit: { findFirst: jest.fn().mockResolvedValue(o.audit ? { auditedOn: new Date(`${o.audit}T00:00:00Z`) } : null) },
    job: { findFirst: jest.fn().mockResolvedValue({ locationId: o.location ? 'loc-1' : null, location: o.text ?? null }) },
    location: { findFirst: jest.fn().mockResolvedValue(o.location ?? null) },
  } as any;
}
const NYC = { state: 'US-NY', address: { city: 'New York' } };
const NOW = new Date('2026-11-13T06:00:00Z');

beforeEach(() => {
  for (const k of Object.keys(SETTINGS)) delete SETTINGS[k];
});

describe('HIR-23 rules', () => {
  it('an audit counts for 12 months to the same date (the boundary), then not; month ends clamp', () => {
    expect(validUntil('2026-03-12', 12)).toBe('2027-03-12');
    expect(validUntil('2024-02-29', 12)).toBe('2025-02-28');
  });

  it('covered places: the state and one of the cities; a free-text place naming a city counts too', () => {
    expect(coveredPlace(LAW, { state: 'US-NY', city: ' new  york ' })).toBe(true);
    expect(coveredPlace(LAW, { state: 'US-NY', city: 'Albany' })).toBe(false);
    expect(coveredPlace(LAW, { state: 'US-NJ', city: 'New York' })).toBe(false);
    expect(coveredPlace(LAW, { text: 'Brooklyn, NY (hybrid)' })).toBe(true);
    expect(coveredPlace(LAW, { text: 'Chennai' })).toBe(false);
    expect(coveredPlace(LAW, { text: 'NYCE Plaza' })).toBe(false);
    expect(coveredPlace(LAW, { text: null })).toBe(false);
  });

  it('results: every category of the law once, selected never above assessed, someone assessed', () => {
    const ok = { sex: [{ label: 'Female', assessed: 10, selected: 3 }, { label: 'Male', assessed: 12, selected: 4 }], race: [{ label: 'Asian', assessed: 15, selected: 5 }, { label: 'White', assessed: 7, selected: 2 }] };
    expect(resultsProblem(LAW, ok)).toBeNull();
    expect(resultsProblem(LAW, { ...ok, sex: [ok.sex[0]!] })).toBe('Enter the numbers for Male.');
    expect(resultsProblem(LAW, { ...ok, sex: [...ok.sex, { label: 'Other', assessed: 1, selected: 0 }] })).toBe('Other is not a category of NYC Local Law 144.');
    expect(resultsProblem(LAW, { ...ok, race: [ok.race[0]!, ok.race[0]!] })).toMatch(/listed twice/);
    expect(resultsProblem(LAW, { ...ok, race: [{ label: 'Asian', assessed: 2, selected: 3 }, ok.race[1]!] })).toBe('Asian: selected (3) cannot be more than assessed (2).');
    expect(resultsProblem(LAW, { sex: ok.sex.map((x) => ({ ...x, assessed: 0, selected: 0 })), race: ok.race })).toBe('Enter how many people were assessed.');
  });
});

describe('HIR-23 gate on automated tools', () => {
  it('setting off (the default): never blocks, nothing else is read', async () => {
    const t = tx({ location: NYC });
    expect(await biasAuditBlock(t, c, 'job-1', 'AI notes', NOW)).toBeNull();
    expect(t.biasAudit.findFirst).not.toHaveBeenCalled();
  });

  it('setting on, NYC job, no audit or an audit over a year old: blocked with a plain message', async () => {
    SETTINGS['hiring.bias_audit.nyc'] = 'on';
    expect(await biasAuditBlock(tx({ location: NYC }), c, 'job-1', 'AI notes', NOW)).toBe('AI notes is blocked for New York City jobs. No bias audit is recorded. HR records a new independent audit in Hiring › Bias audits; other jobs are not affected.');
    expect(await biasAuditBlock(tx({ location: NYC, audit: '2025-11-12' }), c, 'job-1', 'AI notes', NOW)).toMatch(/The last bias audit was on 12 Nov 2025, more than a year ago/);
  });

  it('setting on: a valid audit (to the last day), or a job outside NYC, is not blocked', async () => {
    SETTINGS['hiring.bias_audit.nyc'] = 'on';
    expect(await biasAuditBlock(tx({ location: NYC, audit: '2025-11-13' }), c, 'job-1', 'AI notes', NOW)).toBeNull();
    expect(await biasAuditBlock(tx({ location: { state: 'IN-TN', address: { city: 'Chennai' } } }), c, 'job-1', 'AI notes', NOW)).toBeNull();
    expect(await biasAuditBlock(tx({ text: 'Remote, India' }), c, 'job-1', 'AI notes', NOW)).toBeNull();
    expect(await biasAuditBlock(tx({ text: 'New York office' }), c, 'job-1', 'AI notes', NOW)).not.toBeNull();
  });
});

describe('BiasAuditService.record refusals before anything is stored', () => {
  it('acting for someone else, or without the settings key, is 403; nothing is uploaded', async () => {
    const blobs = { upload: jest.fn() } as any;
    const settings = { canEdit: jest.fn().mockResolvedValue(true) } as any;
    const svc = new BiasAuditService({ forTenant: jest.fn() } as any, blobs, settings);
    const dto = { auditedOn: '2026-11-01', auditor: 'A', summaryUrl: 'https://x.test', results: { sex: [], race: [] }, reportBase64: 'JVBERi0=', reportName: 'a.pdf' } as any;
    await expect(svc.record(c, { userId: 'u1', impersonatorUserId: 'admin' } as any, dto)).rejects.toThrow('Not available while acting for someone else');
    settings.canEdit.mockResolvedValue(false);
    await expect(svc.record(c, { userId: 'u1' } as any, dto)).rejects.toBeInstanceOf(ForbiddenException);
    expect(blobs.upload).not.toHaveBeenCalled();
  });
});

describe('Answer 474: the New York City candidate notice', () => {
  it('business days skip weekends: 10 from a Thursday is the Thursday two weeks on', () => {
    expect(addBusinessDays('2026-11-12', 10)).toBe('2026-11-26');
    expect(addBusinessDays('2026-11-14', 1)).toBe('2026-11-16'); // Saturday -> Monday
  });

  it('the notice: only with the setting on and a NYC job; it lists the tools that are on and the days from the rule set', async () => {
    expect(await nycNotice(tx({ location: NYC }), c, 'job-1', NOW)).toBeNull();
    SETTINGS['hiring.bias_audit.nyc'] = 'on';
    expect(await nycNotice(tx({ location: { state: 'US-NY', address: { city: 'Albany' } } }), c, 'job-1', NOW)).toBeNull();
    expect(await nycNotice(tx({ location: NYC }), c, 'job-1', NOW)).toEqual({ assesses: [], businessDays: 10 });
    SETTINGS['hiring.notetaker.enabled'] = 'on';
    SETTINGS['hiring.notetaker.ai_draft'] = 'on';
    SETTINGS['hiring.rediscovery.ai'] = 'on';
    expect((await nycNotice(tx({ location: NYC }), c, 'job-1', NOW))!.assesses).toHaveLength(2);
  });

  it('the AI draft for one applicant: refused when they asked for another process or within the notice days; then allowed', async () => {
    SETTINGS['hiring.bias_audit.nyc'] = 'on';
    const applied = new Date('2026-11-05T06:00:00Z'); // Thursday; 10 business days -> 19 Nov
    expect(await noticeBlock(tx({ location: NYC }), c, { jobId: 'job-1', createdAt: applied, alternativeRequestedAt: applied }, 'The AI draft scorecard', NOW)).toBe('The AI draft scorecard is not used for this candidate: they asked for another process on 5 Nov 2026.');
    expect(await noticeBlock(tx({ location: NYC }), c, { jobId: 'job-1', createdAt: applied, alternativeRequestedAt: null }, 'The AI draft scorecard', NOW)).toBe('The AI draft scorecard can be used for this candidate from 19 Nov 2026: New York City candidates are told 10 business days before.');
    expect(await noticeBlock(tx({ location: NYC }), c, { jobId: 'job-1', createdAt: applied, alternativeRequestedAt: null }, 'The AI draft scorecard', new Date('2026-11-19T06:00:00Z'))).toBeNull();
    // Outside NYC, or with the setting off, nothing is refused.
    expect(await noticeBlock(tx({ location: { state: 'IN-TN', address: { city: 'Chennai' } } }), c, { jobId: 'job-1', createdAt: applied, alternativeRequestedAt: applied }, 'The AI draft scorecard', NOW)).toBeNull();
    SETTINGS['hiring.bias_audit.nyc'] = 'off';
    expect(await noticeBlock(tx({ location: NYC }), c, { jobId: 'job-1', createdAt: applied, alternativeRequestedAt: applied }, 'The AI draft scorecard', NOW)).toBeNull();
  });
});

