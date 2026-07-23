import { QuestionGenerationClient } from './question-generation.client';
import { AiProvider } from '@exam-platform/shared';

describe('QuestionGenerationClient', () => {
  let client: QuestionGenerationClient;
  let aiProvider: { generateStructured: jest.Mock };

  beforeEach(() => {
    aiProvider = { generateStructured: jest.fn() };
    client = new QuestionGenerationClient();
  });

  it('returns the questions array from a valid structured completion', async () => {
    aiProvider.generateStructured.mockResolvedValue({
      questions: [{ type: 'single_mcq', text: 'What is 2+2?', options: [{ text: '4', isCorrect: true }, { text: '5', isCorrect: false }] }],
    });

    const result = await client.generate('Math', 'easy', ['single_mcq'], 1, aiProvider as unknown as AiProvider);

    expect(result).toEqual([{ type: 'single_mcq', text: 'What is 2+2?', options: [{ text: '4', isCorrect: true }, { text: '5', isCorrect: false }] }]);
  });

  it('requests the standard model tier with the correct tool schema and prompt content', async () => {
    aiProvider.generateStructured.mockResolvedValue({ questions: [] });

    await client.generate('Math', 'hard', ['single_mcq', 'multi_mcq'], 3, aiProvider as unknown as AiProvider);

    expect(aiProvider.generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        modelTier: 'standard',
        maxTokens: 4096,
        tool: expect.objectContaining({ name: 'report_generated_questions' }),
        prompt: expect.stringContaining('Generate 3 multiple-choice exam question(s) about "Math" at "hard" difficulty'),
      }),
    );
  });

  it('throws when the structured completion has no questions array', async () => {
    aiProvider.generateStructured.mockResolvedValue({});

    await expect(client.generate('Math', 'easy', ['single_mcq'], 1, aiProvider as unknown as AiProvider)).rejects.toThrow(
      'AI provider returned malformed generated questions',
    );
  });
});
