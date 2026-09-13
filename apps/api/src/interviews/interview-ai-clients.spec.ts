import { InterviewQuestionsClient } from './interview-questions.client';
import { InterviewScorecardClient } from './interview-scorecard.client';

function providerReturning(payload: Record<string, unknown>) {
  return { generateStructured: jest.fn().mockResolvedValue(payload), ping: jest.fn() };
}

describe('InterviewQuestionsClient', () => {
  const client = new InterviewQuestionsClient();

  it('passes the requested count as the schema maxItems and keeps only valid-category rows', async () => {
    const provider = providerReturning({
      questions: [
        { question: 'Q1', category: 'technical', rationale: 'r' },
        { question: 'Q2', category: 'made_up', rationale: 'r' }, // dropped: bad category
        { question: 'Q3', category: 'culture', rationale: 'r' },
      ],
    });
    const out = await client.generate({ title: 'Dev', description: null, fitCriteria: null }, 5, provider);
    expect(out.map((q) => q.question)).toEqual(['Q1', 'Q3']);
    const req = provider.generateStructured.mock.calls[0][0];
    expect(req.tool.schema.properties.questions.maxItems).toBe(5);
    expect(req.prompt).toContain('Dev');
  });

  it('throws when the provider returns a non-array', async () => {
    await expect(client.generate({ title: 'X', description: null, fitCriteria: null }, 3, providerReturning({ questions: 'nope' }))).rejects.toThrow();
  });
});

describe('InterviewScorecardClient', () => {
  const client = new InterviewScorecardClient();

  it('returns the normalized scorecard and includes the notes in the prompt', async () => {
    const provider = providerReturning({ recommendation: 'strong_yes', summary: 'great', competencies: [{ name: 'X', rating: 5, justification: 'j' }], strengths: ['a'], concerns: [] });
    const out = await client.generate({ jobTitle: 'Dev', jobDescription: null, notes: 'crushed it' }, provider);
    expect(out.recommendation).toBe('strong_yes');
    expect(out.competencies).toHaveLength(1);
    expect(provider.generateStructured.mock.calls[0][0].prompt).toContain('crushed it');
  });

  it('throws on an invalid recommendation', async () => {
    await expect(client.generate({ jobTitle: 'X', jobDescription: null, notes: 'n' }, providerReturning({ recommendation: 'maybe' }))).rejects.toThrow();
  });
});
