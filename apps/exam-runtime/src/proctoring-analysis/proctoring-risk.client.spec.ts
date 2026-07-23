import { ProctoringRiskClient } from './proctoring-risk.client';
import { AiProvider } from '@exam-platform/shared';

describe('ProctoringRiskClient', () => {
  let client: ProctoringRiskClient;
  let aiProvider: { generateStructured: jest.Mock };

  const events = [{ eventType: 'tab_switch', severity: 'medium', elapsedSeconds: 120 }];

  beforeEach(() => {
    aiProvider = { generateStructured: jest.fn() };
    client = new ProctoringRiskClient();
  });

  it('returns the risk level and summary from a valid structured completion', async () => {
    aiProvider.generateStructured.mockResolvedValue({ riskLevel: 'medium', summary: 'One tab switch observed.' });

    const result = await client.assessRisk(events, aiProvider as unknown as AiProvider);

    expect(result).toEqual({ riskLevel: 'medium', summary: 'One tab switch observed.' });
  });

  it('requests the fast model tier with the correct tool schema', async () => {
    aiProvider.generateStructured.mockResolvedValue({ riskLevel: 'low', summary: 'x' });

    await client.assessRisk(events, aiProvider as unknown as AiProvider);

    expect(aiProvider.generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({ modelTier: 'fast', maxTokens: 512, tool: expect.objectContaining({ name: 'report_risk_assessment' }) }),
    );
  });

  it('throws when the risk level is not one of low/medium/high', async () => {
    aiProvider.generateStructured.mockResolvedValue({ riskLevel: 'extreme', summary: 'x' });

    await expect(client.assessRisk(events, aiProvider as unknown as AiProvider)).rejects.toThrow('AI provider returned a malformed risk assessment');
  });
});
