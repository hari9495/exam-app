import { ConflictException } from '@nestjs/common';
import { SurveysService } from './surveys.service';

// tenantPrisma.forTenant(ctx, fn) just runs fn against a shared per-test tx mock (ctx ignored),
// so the LOOKUP_ORG super-admin resolve + the org-context reads all hit the same tx.
function makeService(tx: Record<string, any>, candidateEmails: { sendMessage: jest.Mock }) {
  const tenantPrisma = { forTenant: jest.fn((_ctx: unknown, fn: (t: unknown) => unknown) => fn(tx)) } as any;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as any;
  return new SurveysService(tenantPrisma, candidateEmails as any, audit);
}

const ctx = { organizationId: 'o1', isSuperAdmin: false } as any;
const questions = [
  { type: 'rating', prompt: 'How was your experience?' },
  { type: 'text', prompt: 'Any comments?' },
];
const questionsJson = JSON.stringify(questions);

describe('SurveysService.sendInvite', () => {
  const base = (extra: Record<string, any> = {}) => ({
    surveyDefinition: { findFirst: jest.fn().mockResolvedValue({ id: 's1', questionsJson }) },
    pipelineEntry: { findFirst: jest.fn().mockResolvedValue({ id: 'en1', candidateId: 'cand-1' }) },
    surveyResponse: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'r1' }) },
    ...extra,
  });

  it('sends the invite and persists a pending response', async () => {
    const tx = base();
    const candidateEmails = { sendMessage: jest.fn().mockResolvedValue({ id: 'email-1' }) };
    const result = await makeService(tx, candidateEmails).sendInvite(ctx, 'user-1', 's1', 'en1');

    expect(result).toEqual({ sent: true });
    expect(candidateEmails.sendMessage).toHaveBeenCalledWith(
      ctx, 'user-1', 'en1',
      expect.objectContaining({ source: 'survey', surveyLink: expect.stringContaining('/survey/') }),
    );
    expect(tx.surveyResponse.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ surveyId: 's1', entryId: 'en1', candidateId: 'cand-1', status: 'pending', token: expect.any(String) }),
    });
  });

  it('skips (already_sent) when a response already exists for the survey+entry', async () => {
    const tx = base({ surveyResponse: { findFirst: jest.fn().mockResolvedValue({ id: 'r0' }), create: jest.fn() } });
    const candidateEmails = { sendMessage: jest.fn() };
    const result = await makeService(tx, candidateEmails).sendInvite(ctx, 'user-1', 's1', 'en1');

    expect(result).toEqual({ sent: false, reason: 'already_sent' });
    expect(candidateEmails.sendMessage).not.toHaveBeenCalled();
    expect(tx.surveyResponse.create).not.toHaveBeenCalled();
  });

  it('skips (opted_out) and persists no row when the send returns null', async () => {
    const tx = base();
    const candidateEmails = { sendMessage: jest.fn().mockResolvedValue(null) };
    const result = await makeService(tx, candidateEmails).sendInvite(ctx, 'user-1', 's1', 'en1');

    expect(result).toEqual({ sent: false, reason: 'opted_out' });
    expect(tx.surveyResponse.create).not.toHaveBeenCalled();
  });

  it('does not send a survey with no questions', async () => {
    const tx = base({ surveyDefinition: { findFirst: jest.fn().mockResolvedValue({ id: 's1', questionsJson: '[]' }) } });
    const candidateEmails = { sendMessage: jest.fn() };
    const result = await makeService(tx, candidateEmails).sendInvite(ctx, 'user-1', 's1', 'en1');

    expect(result).toEqual({ sent: false, reason: 'no_questions' });
    expect(candidateEmails.sendMessage).not.toHaveBeenCalled();
  });
});

describe('SurveysService.triggerOnStageChange', () => {
  it('sends every enabled survey whose triggerStage matches the new global stage', async () => {
    const tx = {
      pipelineEntry: {
        findUnique: jest.fn().mockResolvedValue({ candidate: { globalStage: 'rejected' } }),
        findFirst: jest.fn().mockResolvedValue({ id: 'en1', candidateId: 'cand-1' }),
      },
      surveyDefinition: {
        findMany: jest.fn().mockResolvedValue([{ id: 's1' }]),
        findFirst: jest.fn().mockResolvedValue({ id: 's1', questionsJson }),
      },
      surveyResponse: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'r1' }) },
    };
    const candidateEmails = { sendMessage: jest.fn().mockResolvedValue({ id: 'email-1' }) };
    await makeService(tx, candidateEmails).triggerOnStageChange(ctx, 'en1');

    expect(tx.surveyDefinition.findMany).toHaveBeenCalledWith({ where: { enabled: true, triggerStage: 'rejected' }, select: { id: true } });
    expect(candidateEmails.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no enabled survey matches the stage', async () => {
    const tx = {
      pipelineEntry: { findUnique: jest.fn().mockResolvedValue({ candidate: { globalStage: 'engaged' } }) },
      surveyDefinition: { findMany: jest.fn().mockResolvedValue([]) },
      surveyResponse: { create: jest.fn() },
    };
    const candidateEmails = { sendMessage: jest.fn() };
    await makeService(tx, candidateEmails).triggerOnStageChange(ctx, 'en1');
    expect(candidateEmails.sendMessage).not.toHaveBeenCalled();
  });
});

describe('SurveysService.submit', () => {
  it('snapshots answers against the current questions and marks the response submitted', async () => {
    const tx = {
      surveyResponse: {
        findUnique: jest.fn().mockResolvedValue({ id: 'r1', organizationId: 'o1', surveyId: 's1', status: 'pending' }),
        update: jest.fn().mockResolvedValue({}),
      },
      surveyDefinition: { findFirst: jest.fn().mockResolvedValue({ questionsJson }) },
    };
    const candidateEmails = { sendMessage: jest.fn() };
    const result = await makeService(tx, candidateEmails).submit('tok', [5, 'great']);

    expect(result).toEqual({ submitted: true });
    const data = tx.surveyResponse.update.mock.calls[0][0].data;
    expect(data.status).toBe('submitted');
    expect(JSON.parse(data.answersJson)).toEqual([
      { prompt: 'How was your experience?', type: 'rating', value: 5 },
      { prompt: 'Any comments?', type: 'text', value: 'great' },
    ]);
  });

  it('rejects a second submission', async () => {
    const tx = {
      surveyResponse: { findUnique: jest.fn().mockResolvedValue({ id: 'r1', organizationId: 'o1', surveyId: 's1', status: 'submitted' }) },
    };
    const candidateEmails = { sendMessage: jest.fn() };
    await expect(makeService(tx, candidateEmails).submit('tok', [3])).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('SurveysService.getSummary', () => {
  it('aggregates rating average + distribution, text responses, and response rate', async () => {
    const answersA = JSON.stringify([{ prompt: 'How was your experience?', type: 'rating', value: 5 }, { prompt: 'Any comments?', type: 'text', value: 'good' }]);
    const answersB = JSON.stringify([{ prompt: 'How was your experience?', type: 'rating', value: 3 }, { prompt: 'Any comments?', type: 'text', value: null }]);
    const tx = {
      surveyDefinition: { findFirst: jest.fn().mockResolvedValue({ id: 's1', name: 'Post-reject', questionsJson }) },
      surveyResponse: {
        findMany: jest.fn().mockResolvedValue([
          { status: 'submitted', answersJson: answersA },
          { status: 'submitted', answersJson: answersB },
          { status: 'pending', answersJson: null },
        ]),
      },
    };
    const candidateEmails = { sendMessage: jest.fn() };
    const summary = await makeService(tx, candidateEmails).getSummary(ctx, 's1');

    expect(summary.totalInvited).toBe(3);
    expect(summary.totalSubmitted).toBe(2);
    expect(summary.responseRate).toBeCloseTo((2 / 3) * 100);
    const rating = summary.questions[0];
    expect(rating.averageRating).toBe(4);
    expect(rating.distribution).toEqual({ '1': 0, '2': 0, '3': 1, '4': 0, '5': 1 });
    expect(summary.questions[1].responses).toEqual(['good']);
  });
});
