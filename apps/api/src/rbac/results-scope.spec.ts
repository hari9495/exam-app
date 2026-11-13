import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { CompanyWideResultsGuard, candidatesInScope, invitationsInScope, scopeFrom } from './results-scope';
import { OwnSessionChangesGuard } from '../auth/own-session.guard';
import { LEGACY_ALIASES } from '@exam-platform/shared';

const ctx = (req: object) => ({ switchToHttp: () => ({ getRequest: () => req }) }) as unknown as ExecutionContext;

// Assessments AS-0 (answers 2003, 2004, 2006).
describe('whose results a person reads (answer 2004)', () => {
  it('test writers, recruiters, hiring admins and auditors read every candidate', () => {
    for (const k of ['exam:manage', 'pipeline:manage', 'ats.headcount.manage', 'audit:view']) expect(scopeFrom(new Set([k, 'results:view']), 'u1')).toEqual({ mode: 'all' });
  });

  it('a results reader without any of those (the Hiring manager) reads only their own jobs\' candidates', () => {
    expect(scopeFrom(new Set(['results:view']), 'u1')).toEqual({ mode: 'own', userId: 'u1' });
    expect(invitationsInScope({ mode: 'own', userId: 'u1' })).toEqual({ candidate: { pipelineEntries: { some: { job: { deletedAt: null, OR: [{ hiringManagerId: 'u1' }, { createdById: 'u1' }] } } } } });
    expect(candidatesInScope({ mode: 'own', userId: 'u1' })).toEqual({ pipelineEntries: { some: { job: { deletedAt: null, OR: [{ hiringManagerId: 'u1' }, { createdById: 'u1' }] } } } });
  });

  it('negative: candidate view alone (the Interview coordinator) reads no result; no user, no own scope', () => {
    expect(scopeFrom(new Set(['candidate:view']), 'u1')).toEqual({ mode: 'none' });
    expect(scopeFrom(new Set(['results:view']), null)).toEqual({ mode: 'none' });
    expect(invitationsInScope({ mode: 'none' })).toEqual({ id: { in: [] } });
    expect(candidatesInScope({ mode: 'none' })).toEqual({ id: { in: [] } });
    expect(invitationsInScope(undefined)).toEqual({});
  });

  it('company-wide test numbers: only "all"; "own", "none" and a missing scope are refused', () => {
    const g = new CompanyWideResultsGuard();
    expect(g.canActivate(ctx({ resultsScope: { mode: 'all' } }))).toBe(true);
    for (const resultsScope of [{ mode: 'own', userId: 'u' }, { mode: 'none' }, undefined]) expect(() => g.canActivate(ctx({ resultsScope }))).toThrow(ForbiddenException);
  });
});

describe('the YukthiX assessment keys stand in for the older ones (answer 2003)', () => {
  it('asmt.test.manage writes tests; asmt.bank.manage the bank; asmt.results.view reads results; candidate view never reads results', () => {
    expect(LEGACY_ALIASES['exam:manage']).toEqual(['asmt.test.manage']);
    expect(LEGACY_ALIASES['question_bank:manage']).toEqual(['asmt.bank.manage']);
    expect(LEGACY_ALIASES['question_bank:view']).toEqual(['asmt.bank.manage']);
    expect(LEGACY_ALIASES['results:view']).toEqual(expect.arrayContaining(['asmt.results.view', 'ats.assessment.view', 'ats.candidate.manage']));
    expect(LEGACY_ALIASES['results:view']).not.toContain('ats.candidate.view');
  });
});

describe('no assessments change while acting for someone else (answer 2006)', () => {
  const g = new OwnSessionChangesGuard();
  it('reads pass while acting; changes pass for the person themselves', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) expect(g.canActivate(ctx({ method, user: { impersonatorUserId: 'x' } }))).toBe(true);
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) expect(g.canActivate(ctx({ method, user: {} }))).toBe(true);
  });
  it('negative: any change while impersonating or as YukthiX staff acting in a company is refused', () => {
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      expect(() => g.canActivate(ctx({ method, user: { impersonatorUserId: 'x' } }))).toThrow('Not available while acting for someone else');
      expect(() => g.canActivate(ctx({ method, user: { actingSuperAdmin: true } }))).toThrow(ForbiddenException);
    }
  });
});
