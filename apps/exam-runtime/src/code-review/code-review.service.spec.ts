import { CodeReviewService } from './code-review.service';

describe('CodeReviewService', () => {
  function buildService(claudeResult: { suggestedMarks: number; summary: string } | Error) {
    const tx = {
      answer: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'answer-1',
          answerText: 'function reverse(s) { return s; }',
          question: { text: 'Reverse a string', starterCode: null, codeLanguage: 'javascript', marks: 10 },
          attempt: { invitation: { exam: { organizationId: 'org-1' } } },
        }),
      },
      codeAnswerReview: { upsert: jest.fn().mockResolvedValue({}) },
      aiCreditUsage: { create: jest.fn().mockResolvedValue({}) },
    };
    const tenantPrisma = { forTenant: jest.fn((_context, callback) => callback(tx)) };
    const claudeClient = {
      review: claudeResult instanceof Error ? jest.fn().mockRejectedValue(claudeResult) : jest.fn().mockResolvedValue(claudeResult),
    };
    return { service: new CodeReviewService(tenantPrisma as never, claudeClient as never), tx, tenantPrisma };
  }

  it('generates a review, upserts CodeAnswerReview as completed, and records AI credit usage', async () => {
    const { service, tx } = buildService({ suggestedMarks: 8, summary: 'Solid solution.' });

    await service.analyze('answer-1');

    expect(tx.codeAnswerReview.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ answerId: 'answer-1', status: 'completed', suggestedMarks: 8, summary: 'Solid solution.' }),
      }),
    );
    expect(tx.aiCreditUsage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ source: 'code_review', sourceId: 'answer-1' }) }),
    );
  });

  it('upserts CodeAnswerReview as failed and records no credit usage when Claude throws', async () => {
    const { service, tx } = buildService(new Error('Claude unavailable'));

    await service.analyze('answer-1');

    expect(tx.codeAnswerReview.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ status: 'failed', suggestedMarks: null, summary: null }) }),
    );
    expect(tx.aiCreditUsage.create).not.toHaveBeenCalled();
  });
});
