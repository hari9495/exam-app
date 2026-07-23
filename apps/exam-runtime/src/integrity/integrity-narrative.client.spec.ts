import { IntegrityNarrativeClient } from './integrity-narrative.client';
import { AiProvider } from '@exam-platform/shared';
import { IntegrityFlag } from './integrity-rules';

describe('IntegrityNarrativeClient', () => {
  let client: IntegrityNarrativeClient;
  let aiProvider: { generateStructured: jest.Mock };

  beforeEach(() => {
    aiProvider = { generateStructured: jest.fn() };
    client = new IntegrityNarrativeClient();
  });

  const flags: IntegrityFlag[] = [{ type: 'large_paste', severity: 'medium', detail: 'Pasted 250 characters', questionId: 'q1' }];
  const context = { examTitle: 'Backend Engineer Exam', level: 'review' };

  it('returns the narrative from a valid structured completion', async () => {
    aiProvider.generateStructured.mockResolvedValue({ narrative: 'A large paste was detected.' });

    const result = await client.writeNarrative(flags, context, aiProvider as unknown as AiProvider);

    expect(result).toBe('A large paste was detected.');
  });

  it('requests the fast model tier with the correct tool schema', async () => {
    aiProvider.generateStructured.mockResolvedValue({ narrative: 'Nothing notable.' });

    await client.writeNarrative(flags, context, aiProvider as unknown as AiProvider);

    expect(aiProvider.generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({ modelTier: 'fast', maxTokens: 512, tool: expect.objectContaining({ name: 'report_integrity_narrative' }) }),
    );
  });

  it('throws when the structured completion is missing a narrative', async () => {
    aiProvider.generateStructured.mockResolvedValue({});

    await expect(client.writeNarrative(flags, context, aiProvider as unknown as AiProvider)).rejects.toThrow(
      'AI provider returned a malformed integrity narrative',
    );
  });

  it('throws when the narrative is empty', async () => {
    aiProvider.generateStructured.mockResolvedValue({ narrative: '   ' });

    await expect(client.writeNarrative(flags, context, aiProvider as unknown as AiProvider)).rejects.toThrow(
      'AI provider returned a malformed integrity narrative',
    );
  });
});
