import { CodeReviewService } from './code-review.service';

describe('CodeReviewService', () => {
  function buildService(claudeResult: { suggestedMarks: number; summary: string } | Error, answerText: string | null = 'function reverse(s) { return s; }') {
    const tx = {
      answer: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'answer-1',
          answerText,
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
    const aiApiKeyResolver = { resolve: jest.fn().mockResolvedValue('test-api-key') };
    return {
      service: new CodeReviewService(tenantPrisma as never, claudeClient as never, aiApiKeyResolver as never),
      tx,
      tenantPrisma,
      claudeClient,
      aiApiKeyResolver,
    };
  }

  it('generates a review, upserts CodeAnswerReview as completed, and records AI credit usage', async () => {
    const { service, tx, claudeClient } = buildService({ suggestedMarks: 8, summary: 'Solid solution.' });

    await service.analyze('answer-1');

    expect(tx.codeAnswerReview.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ answerId: 'answer-1', status: 'completed', suggestedMarks: 8, summary: 'Solid solution.' }),
      }),
    );
    expect(tx.aiCreditUsage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ source: 'code_review', sourceId: 'answer-1' }) }),
    );
    expect(claudeClient.review).toHaveBeenCalledWith(expect.anything(), 'test-api-key');
  });

  it('upserts CodeAnswerReview as failed and records no credit usage when Claude throws', async () => {
    const { service, tx } = buildService(new Error('Claude unavailable'));

    await service.analyze('answer-1');

    expect(tx.codeAnswerReview.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ status: 'failed', suggestedMarks: null, summary: null }) }),
    );
    expect(tx.aiCreditUsage.create).not.toHaveBeenCalled();
  });

  it('skips the Claude call and records no credit usage for a blank submission', async () => {
    const { service, tx, claudeClient } = buildService({ suggestedMarks: 8, summary: 'Solid solution.' }, null);

    await service.analyze('answer-1');

    expect(claudeClient.review).not.toHaveBeenCalled();
    expect(tx.codeAnswerReview.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ answerId: 'answer-1', status: 'completed', suggestedMarks: 0, summary: 'No code was submitted for this question.' }),
      }),
    );
    expect(tx.aiCreditUsage.create).not.toHaveBeenCalled();
  });

  it('treats a whitespace-only submission the same as blank', async () => {
    const { service, tx, claudeClient } = buildService({ suggestedMarks: 8, summary: 'Solid solution.' }, '   ');

    await service.analyze('answer-1');

    expect(claudeClient.review).not.toHaveBeenCalled();
    expect(tx.codeAnswerReview.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ status: 'completed', suggestedMarks: 0 }) }),
    );
    expect(tx.aiCreditUsage.create).not.toHaveBeenCalled();
  });

  it("sends the candidate's chosen codeLanguage (from the Answer, not the Question) to the review client", async () => {
    const tx = {
      answer: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'answer-1',
          answerText: 'print(1)',
          codeLanguage: 'python',
          question: { text: 'x', starterCode: null, marks: 10 },
          attempt: { invitation: { exam: { organizationId: 'org-1' } } },
        }),
      },
      codeAnswerReview: { upsert: jest.fn() },
      aiCreditUsage: { create: jest.fn() },
    };
    const tenantPrisma = { forTenant: jest.fn((_context, callback) => callback(tx)) };
    const claudeCodeReviewClient = { review: jest.fn().mockResolvedValue({ suggestedMarks: 5, summary: 'ok' }) };
    const aiApiKeyResolver = { resolve: jest.fn().mockResolvedValue('key') };
    const service = new CodeReviewService(tenantPrisma as never, claudeCodeReviewClient as never, aiApiKeyResolver as never);

    await service.analyze('answer-1');

    expect(claudeCodeReviewClient.review).toHaveBeenCalledWith(
      expect.objectContaining({ codeLanguage: 'python' }),
      'key',
    );
  });
});
