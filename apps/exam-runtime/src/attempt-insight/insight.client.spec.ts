import { InsightClient } from './insight.client';
import { AiProvider } from '@exam-platform/shared';

describe('InsightClient', () => {
  let client: InsightClient;
  let aiProvider: { generateStructured: jest.Mock };

  const input = { percentage: 80, passFail: 'pass', topicBreakdown: [{ topic: 'Arrays', correct: 4, total: 5 }], proctoring: null };

  beforeEach(() => {
    aiProvider = { generateStructured: jest.fn() };
    client = new InsightClient();
  });

  it('returns the summary from a valid structured completion', async () => {
    aiProvider.generateStructured.mockResolvedValue({ summary: 'Strong performance overall.' });

    const result = await client.generate(input, aiProvider as unknown as AiProvider);

    expect(result).toBe('Strong performance overall.');
  });

  it('requests the standard model tier with the correct tool schema', async () => {
    aiProvider.generateStructured.mockResolvedValue({ summary: 'x' });

    await client.generate(input, aiProvider as unknown as AiProvider);

    expect(aiProvider.generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({ modelTier: 'standard', maxTokens: 512, tool: expect.objectContaining({ name: 'report_insight' }) }),
    );
  });

  it('throws when the structured completion is missing a summary', async () => {
    aiProvider.generateStructured.mockResolvedValue({});

    await expect(client.generate(input, aiProvider as unknown as AiProvider)).rejects.toThrow('AI provider returned a malformed insight summary');
  });
});
