jest.mock('@anthropic-ai/sdk');

import Anthropic from '@anthropic-ai/sdk';
import { ClaudeProctoringClient } from './claude-proctoring.client';

describe('ClaudeProctoringClient', () => {
  let client: ClaudeProctoringClient;
  let mockCreate: jest.Mock;

  beforeEach(() => {
    mockCreate = jest.fn();
    (Anthropic as unknown as jest.Mock).mockImplementation(() => ({
      messages: { create: mockCreate },
    }));
    process.env.ANTHROPIC_API_KEY = 'test-key';
    client = new ClaudeProctoringClient();
  });

  const events = [{ eventType: 'tab_switch', severity: 'medium', elapsedSeconds: 120 }];

  it('returns the risk assessment from a valid tool_use response', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', name: 'report_risk_assessment', input: { riskLevel: 'medium', summary: 'One tab switch mid-exam.' } }],
    });

    const result = await client.assessRisk(events);

    expect(result).toEqual({ riskLevel: 'medium', summary: 'One tab switch mid-exam.' });
  });

  it('forces the report_risk_assessment tool via tool_choice', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', name: 'report_risk_assessment', input: { riskLevel: 'low', summary: 'Nothing notable.' } }],
    });

    await client.assessRisk(events);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        tool_choice: { type: 'tool', name: 'report_risk_assessment' },
        tools: [expect.objectContaining({ name: 'report_risk_assessment' })],
      }),
    );
  });

  it('throws when the response contains no tool_use block', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'I cannot help with that.' }] });

    await expect(client.assessRisk(events)).rejects.toThrow('Claude did not return a valid report_risk_assessment tool call');
  });

  it('throws when the tool_use input has an invalid riskLevel', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', name: 'report_risk_assessment', input: { riskLevel: 'extreme', summary: 'Bad value.' } }],
    });

    await expect(client.assessRisk(events)).rejects.toThrow('Claude returned a malformed risk assessment');
  });

  it('throws when the tool_use input is missing a summary', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', name: 'report_risk_assessment', input: { riskLevel: 'high' } }],
    });

    await expect(client.assessRisk(events)).rejects.toThrow('Claude returned a malformed risk assessment');
  });

  it('propagates an error thrown by the Anthropic API call', async () => {
    mockCreate.mockRejectedValue(new Error('rate limited'));

    await expect(client.assessRisk(events)).rejects.toThrow('rate limited');
  });
});
