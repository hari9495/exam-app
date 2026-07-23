import { CodeReviewClient } from './code-review.client';
import { AiProvider } from '@exam-platform/shared';

describe('CodeReviewClient', () => {
  let client: CodeReviewClient;
  let aiProvider: { generateStructured: jest.Mock };

  const input = { questionText: 'Reverse a string', starterCode: null, codeLanguage: 'python', answerText: 'def f(s): return s[::-1]', marks: 10 };

  beforeEach(() => {
    aiProvider = { generateStructured: jest.fn() };
    client = new CodeReviewClient();
  });

  it('returns the suggested marks and summary from a valid structured completion', async () => {
    aiProvider.generateStructured.mockResolvedValue({ suggestedMarks: 10, summary: 'Correct and idiomatic.' });

    const result = await client.review(input, aiProvider as unknown as AiProvider);

    expect(result).toEqual({ suggestedMarks: 10, summary: 'Correct and idiomatic.' });
  });

  it('requests the standard model tier with the correct tool schema', async () => {
    aiProvider.generateStructured.mockResolvedValue({ suggestedMarks: 5, summary: 'Partially correct.' });

    await client.review(input, aiProvider as unknown as AiProvider);

    expect(aiProvider.generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({ modelTier: 'standard', maxTokens: 512, tool: expect.objectContaining({ name: 'report_code_review' }) }),
    );
  });

  it('throws when the structured completion is malformed', async () => {
    aiProvider.generateStructured.mockResolvedValue({ suggestedMarks: 'not a number', summary: 'x' });

    await expect(client.review(input, aiProvider as unknown as AiProvider)).rejects.toThrow('AI provider returned a malformed code review');
  });
});
