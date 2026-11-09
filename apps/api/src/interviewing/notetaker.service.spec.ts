const SETTINGS: Record<string, string> = {};
jest.mock('../people/probation', () => ({ settingFor: jest.fn(async (_tx: unknown, _c: unknown, key: string) => SETTINGS[key]) }));

import { BadGatewayException, BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { NotetakerService, everyoneConsented } from './notetaker.service';
import { checkDraft } from './notetaker-draft.client';

const ctx = { organizationId: 'org-1', isSuperAdmin: false } as any;
const PANEL = { userId: 'u-panel', role: 'panel' };
const REC = { userId: 'u-rec', role: 'recruiter' };
const ITEMS = [{ id: 'i1', label: 'Test design', guidance: null }, { id: 'i2', label: 'Communication', guidance: null }];

function setup(opts: { consents?: { participant: string; consent: string }[]; transcript?: boolean; submitted?: boolean; overseer?: boolean; cancelled?: boolean } = {}) {
  const iv = { id: 'iv1', status: opts.cancelled ? 'cancelled' : 'scheduled', panelists: [{ userId: 'u-panel' }, { userId: 'u-hm' }], pipelineEntry: { candidateId: 'c1', job: { title: 'QA Engineer', hiringManagerId: 'u-hm' }, candidate: { name: 'Ananya Iyer' } } };
  const tx: Record<string, any> = {
    interviewNotetakerConsent: { findMany: jest.fn().mockResolvedValue(opts.consents ?? []), upsert: jest.fn().mockResolvedValue({}) },
    user: { findMany: jest.fn().mockResolvedValue([{ id: 'u-panel', name: 'Joseph Mathew' }, { id: 'u-hm', name: 'Karthik S' }]), findFirst: jest.fn().mockResolvedValue({ name: 'Joseph Mathew' }) },
    interviewTranscript: { findUnique: jest.fn().mockResolvedValue(opts.transcript ? { text: 'Candidate: I start with payment failures.', createdAt: new Date(), uploadedBy: 'u-panel' } : null), upsert: jest.fn(), deleteMany: jest.fn().mockResolvedValue({ count: opts.transcript ? 1 : 0 }) },
    interviewScorecardDraft: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn(), deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    scorecard: { findUnique: jest.fn().mockResolvedValue(opts.submitted ? { status: 'submitted' } : null) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const tenantPrisma = { forTenant: jest.fn((_c: unknown, fn: (t: unknown) => unknown) => fn(tx)) } as any;
  const scorecards = {
    load: jest.fn().mockResolvedValue({ iv, template: { scaleMax: 5, items: ITEMS } }),
    access: jest.fn(async (_iv: unknown, v: { userId: string }) => {
      const isPanelist = ['u-panel', 'u-hm'].includes(v.userId);
      if (!isPanelist && !opts.overseer) throw new ForbiddenException('You are not on this interview panel.');
      return { isPanelist, isOverseer: Boolean(opts.overseer) };
    }),
  } as any;
  const ai = { run: jest.fn(async (_c: unknown, _o: unknown, fn: (p: unknown) => unknown) => fn({ generateStructured: jest.fn().mockResolvedValue({ items: [{ skill: 'Test design', rating: 4, note: 'Prioritised by risk.', quote: 'I start with payment failures.' }, { skill: 'communication', rating: 3, note: 'Clear.', quote: 'Is this web or mobile?' }] }) })) } as any;
  return { svc: new NotetakerService(tenantPrisma, scorecards, ai), tx, ai };
}
const ALL = [{ participant: 'candidate', consent: 'given' }, { participant: 'u-panel', consent: 'given' }, { participant: 'u-hm', consent: 'given' }];

beforeEach(() => Object.assign(SETTINGS, { 'hiring.notetaker.enabled': 'on', 'hiring.notetaker.ai_draft': 'on' }));

describe('HIR-25 consent rules (founder decision 2)', () => {
  it('recording only when every participant gave consent; a waiting or declined one stops it', () => {
    expect(everyoneConsented([{ consent: 'given' }, { consent: 'given' }])).toBe(true);
    expect(everyoneConsented([{ consent: 'given' }, { consent: 'waiting' }])).toBe(false);
    expect(everyoneConsented([{ consent: 'given' }, { consent: 'declined' }])).toBe(false);
    expect(everyoneConsented([])).toBe(false);
  });

  it('the view lists the candidate and the panel, with who answers what', async () => {
    const v = await setup({ consents: [{ participant: 'candidate', consent: 'given' }] }).svc.view(ctx, 'iv1', PANEL);
    expect(v.participants).toEqual([
      { key: 'candidate', name: 'Ananya Iyer', role: 'Candidate', consent: 'given', canAnswer: true },
      { key: 'u-panel', name: 'Joseph Mathew', role: 'Interviewer', consent: 'waiting', canAnswer: true },
      { key: 'u-hm', name: 'Karthik S', role: 'Hiring manager', consent: 'waiting', canAnswer: false },
    ]);
    expect(v).toMatchObject({ enabled: true, recording: false, provider: null, transcript: null });
  });

  it('a panellist answers for themselves; the candidate answer is recorded with who recorded it', async () => {
    const { svc, tx } = setup();
    await svc.consent(ctx, 'iv1', PANEL, 'me', 'given');
    expect(tx.interviewNotetakerConsent.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ participant: 'u-panel', consent: 'given', recordedBy: 'u-panel' }) }));
    await svc.consent(ctx, 'iv1', PANEL, 'candidate', 'given');
    expect(tx.interviewNotetakerConsent.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ create: expect.objectContaining({ participant: 'candidate', recordedBy: 'u-panel' }) }));
  });

  it('a "no" (also a later one) deletes any transcript and every draft at once', async () => {
    const { svc, tx } = setup({ consents: ALL, transcript: true });
    await svc.consent(ctx, 'iv1', PANEL, 'candidate', 'declined');
    expect(tx.interviewTranscript.deleteMany).toHaveBeenCalledWith({ where: { organizationId: 'org-1', interviewId: 'iv1' } });
    expect(tx.interviewScorecardDraft.deleteMany).toHaveBeenCalledWith({ where: { organizationId: 'org-1', interviewId: 'iv1' } });
  });

  it('refused: off for the company (409), a recruiter off the panel answering for themselves (403), a cancelled interview (409), off the panel (403)', async () => {
    SETTINGS['hiring.notetaker.enabled'] = 'off';
    await expect(setup().svc.consent(ctx, 'iv1', PANEL, 'me', 'given')).rejects.toBeInstanceOf(ConflictException);
    SETTINGS['hiring.notetaker.enabled'] = 'on';
    await expect(setup({ overseer: true }).svc.consent(ctx, 'iv1', REC, 'me', 'given')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(setup({ cancelled: true }).svc.consent(ctx, 'iv1', PANEL, 'me', 'given')).rejects.toBeInstanceOf(ConflictException);
    await expect(setup().svc.consent(ctx, 'iv1', { userId: 'u-other', role: 'panel' }, 'candidate', 'given')).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('HIR-25 transcript (no provider connected: a panellist adds it)', () => {
  it('only with everyone’s consent, says who is missing', async () => {
    const one = [{ participant: 'candidate', consent: 'given' }, { participant: 'u-panel', consent: 'given' }];
    await expect(setup({ consents: one }).svc.addTranscript(ctx, 'iv1', PANEL, 'text')).rejects.toThrow("No recording without everyone's consent. Waiting or declined: Karthik S.");
    const { svc, tx } = setup({ consents: ALL });
    await svc.addTranscript(ctx, 'iv1', PANEL, '  Candidate: hello  ');
    expect(tx.interviewTranscript.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ text: 'Candidate: hello', source: 'upload', uploadedBy: 'u-panel' }) }));
    expect(tx.interviewScorecardDraft.deleteMany).toHaveBeenCalled();
  });
  it('empty text is 400; an overseer off the panel cannot add it (403)', async () => {
    await expect(setup({ consents: ALL }).svc.addTranscript(ctx, 'iv1', PANEL, '   ')).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup({ consents: ALL, overseer: true }).svc.addTranscript(ctx, 'iv1', REC, 'x')).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('HIR-25 AI draft (a suggestion only)', () => {
  it('drafts one rating per scorecard skill through the company AI and stores it as the panellist’s own draft', async () => {
    const { svc, tx, ai } = setup({ consents: ALL, transcript: true });
    tx.interviewScorecardDraft.findUnique.mockResolvedValue({ items: [{ itemId: 'i1' }], createdAt: new Date() });
    await svc.draft(ctx, 'iv1', PANEL);
    expect(ai.run).toHaveBeenCalledWith(ctx, { source: 'interview_draft', sourceId: 'iv1' }, expect.any(Function));
    expect(tx.interviewScorecardDraft.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ panelistUserId: 'u-panel', items: [expect.objectContaining({ itemId: 'i1', rating: 4 }), expect.objectContaining({ itemId: 'i2', rating: 3 })] }) }));
  });
  it('refused with AI off, without consent, without a transcript, after submitting (409); not on the panel (403)', async () => {
    SETTINGS['hiring.notetaker.ai_draft'] = 'off';
    await expect(setup({ consents: ALL, transcript: true }).svc.draft(ctx, 'iv1', PANEL)).rejects.toThrow('AI drafting is off for your company. Fill the scorecard yourself.');
    SETTINGS['hiring.notetaker.ai_draft'] = 'on';
    await expect(setup({ transcript: true }).svc.draft(ctx, 'iv1', PANEL)).rejects.toBeInstanceOf(ConflictException);
    await expect(setup({ consents: ALL }).svc.draft(ctx, 'iv1', PANEL)).rejects.toThrow('Add the transcript first.');
    await expect(setup({ consents: ALL, transcript: true, submitted: true }).svc.draft(ctx, 'iv1', PANEL)).rejects.toBeInstanceOf(ConflictException);
    await expect(setup({ consents: ALL, transcript: true, overseer: true }).svc.draft(ctx, 'iv1', REC)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('a malformed AI reply is 502 and nothing is stored; an AI not configured stays 400', async () => {
    const bad = setup({ consents: ALL, transcript: true });
    bad.ai.run.mockImplementation(async (_c: unknown, _o: unknown, fn: (p: unknown) => unknown) => fn({ generateStructured: jest.fn().mockResolvedValue({ items: 'nope' }) }));
    await expect(bad.svc.draft(ctx, 'iv1', PANEL)).rejects.toBeInstanceOf(BadGatewayException);
    expect(bad.tx.interviewScorecardDraft.upsert).not.toHaveBeenCalled();
    bad.ai.run.mockRejectedValue(new BadRequestException('AI is not configured for your organization.'));
    await expect(bad.svc.draft(ctx, 'iv1', PANEL)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('checkDraft keeps only the scorecard’s skills with ratings in range, in its order', () => {
    expect(checkDraft({ scaleMax: 4, skills: ITEMS }, [{ skill: 'communication', rating: 5, note: '', quote: '' }, { skill: 'Test design', rating: 2, note: 'n', quote: 'q' }, { skill: 'Made up', rating: 3 }])).toEqual([{ itemId: 'i1', skill: 'Test design', rating: 2, note: 'n', quote: 'q' }]);
    expect(() => checkDraft({ scaleMax: 4, skills: ITEMS }, [])).toThrow();
    expect(() => checkDraft({ scaleMax: 4, skills: ITEMS }, null)).toThrow();
  });
  it('the draft page is the panellist’s own: none = 404', async () => {
    await expect(setup().svc.myDraft(ctx, 'iv1', PANEL)).rejects.toBeInstanceOf(NotFoundException);
  });
});
