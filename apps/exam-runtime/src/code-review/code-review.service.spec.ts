import { CodeReviewService } from './code-review.service';
import { AiNotConfiguredError } from '@exam-platform/shared';

describe('CodeReviewService', () => {
  function buildService(reviewResult: { suggestedMarks: number; summary: string } | Error, answerText: string | null = 'function reverse(s) { return s; }') {
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
    const codeReviewClient = {
      review: reviewResult instanceof Error ? jest.fn().mockRejectedValue(reviewResult) : jest.fn().mockResolvedValue(reviewResult),
    };
    const aiProvider = { generateStructured: jest.fn() };
    const aiApiKeyResolver = { resolve: jest.fn().mockResolvedValue(aiProvider) };
    return {
      service: new CodeReviewService(tenantPrisma as never, codeReviewClient as never, aiApiKeyResolver as never),
      tx,
      tenantPrisma,
      codeReviewClient,
      aiApiKeyResolver,
      aiProvider,
    };
  }

  it('generates a review, upserts CodeAnswerReview as completed, and records AI credit usage', async () => {
    const { service, tx, codeReviewClient, aiProvider } = buildService({ suggestedMarks: 8, summary: 'Solid solution.' });

    await service.analyze('answer-1');

    expect(tx.codeAnswerReview.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ answerId: 'answer-1', status: 'completed', suggestedMarks: 8, summary: 'Solid solution.' }),
      }),
    );
    expect(tx.aiCreditUsage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ source: 'code_review', sourceId: 'answer-1' }) }),
    );
    expect(codeReviewClient.review).toHaveBeenCalledWith(expect.anything(), aiProvider);
  });

  it('upserts skipped_no_ai_key -- not failed -- and never calls the AI when the org has no key', async () => {
    // Audit finding F2: a missing key is permanent and user-fixable; it must not be recorded as
    // a retryable failure.
    const { service, tx, codeReviewClient, aiApiKeyResolver } = buildService({ suggestedMarks: 8, summary: 'unused' });
    aiApiKeyResolver.resolve.mockRejectedValue(new AiNotConfiguredError('no key'));

    await service.analyze('answer-1');

    expect(codeReviewClient.review).not.toHaveBeenCalled();
    expect(tx.codeAnswerReview.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ status: 'skipped_no_ai_key', suggestedMarks: null, summary: null }) }),
    );
    expect(tx.aiCreditUsage.create).not.toHaveBeenCalled();
  });

  it('upserts CodeAnswerReview as failed and records no credit usage when the AI provider throws', async () => {
    const { service, tx } = buildService(new Error('AI provider unavailable'));

    await service.analyze('answer-1');

    expect(tx.codeAnswerReview.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ status: 'failed', suggestedMarks: null, summary: null }) }),
    );
    expect(tx.aiCreditUsage.create).not.toHaveBeenCalled();
  });

  it('skips the AI review call and records no credit usage for a blank submission', async () => {
    const { service, tx, codeReviewClient } = buildService({ suggestedMarks: 8, summary: 'Solid solution.' }, null);

    await service.analyze('answer-1');

    expect(codeReviewClient.review).not.toHaveBeenCalled();
    expect(tx.codeAnswerReview.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ answerId: 'answer-1', status: 'completed', suggestedMarks: 0, summary: 'No code was submitted for this question.' }),
      }),
    );
    expect(tx.aiCreditUsage.create).not.toHaveBeenCalled();
  });

  it('treats a whitespace-only submission the same as blank', async () => {
    const { service, tx, codeReviewClient } = buildService({ suggestedMarks: 8, summary: 'Solid solution.' }, '   ');

    await service.analyze('answer-1');

    expect(codeReviewClient.review).not.toHaveBeenCalled();
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
    const codeReviewClient = { review: jest.fn().mockResolvedValue({ suggestedMarks: 5, summary: 'ok' }) };
    const aiProvider = { generateStructured: jest.fn() };
    const aiApiKeyResolver = { resolve: jest.fn().mockResolvedValue(aiProvider) };
    const service = new CodeReviewService(tenantPrisma as never, codeReviewClient as never, aiApiKeyResolver as never);

    await service.analyze('answer-1');

    expect(codeReviewClient.review).toHaveBeenCalledWith(
      expect.objectContaining({ codeLanguage: 'python' }),
      aiProvider,
    );
  });

  // The internal endpoint that triggers this no longer waits for the AI (it used to 503 at 5s),
  // so the recruiter's UI polls the row instead. That only works if the row is claimed as
  // 'processing' BEFORE the slow call -- otherwise the panel keeps showing the previous review
  // and the Generate button, inviting a second click on work already running.
  it('marks the review processing before calling the AI, then overwrites it with the result', async () => {
    const { service, tx, codeReviewClient } = buildService({ suggestedMarks: 7, summary: 'Solid.' });

    await service.analyze('answer-1');

    const statuses = tx.codeAnswerReview.upsert.mock.calls.map((call: [{ update: { status: string } }]) => call[0].update.status);
    expect(statuses).toEqual(['processing', 'completed']);
    // And the claim really did land first -- before the model was ever asked.
    const firstUpsertOrder = tx.codeAnswerReview.upsert.mock.invocationCallOrder[0];
    expect(firstUpsertOrder).toBeLessThan(codeReviewClient.review.mock.invocationCallOrder[0]);
  });

  it('clears the stale summary while regenerating, rather than leaving it under a spinner', async () => {
    const { service, tx } = buildService({ suggestedMarks: 7, summary: 'Solid.' });

    await service.analyze('answer-1');

    expect(tx.codeAnswerReview.upsert.mock.calls[0][0].update).toMatchObject({
      status: 'processing',
      suggestedMarks: null,
      summary: null,
    });
  });
});
