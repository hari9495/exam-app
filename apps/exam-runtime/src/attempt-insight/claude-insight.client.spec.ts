jest.mock('@anthropic-ai/sdk');

import Anthropic from '@anthropic-ai/sdk';
import { ClaudeInsightClient } from './claude-insight.client';

describe('ClaudeInsightClient', () => {
  let client: ClaudeInsightClient;
  let mockCreate: jest.Mock;

  beforeEach(() => {
    mockCreate = jest.fn();
    (Anthropic as unknown as jest.Mock).mockImplementation(() => ({
      messages: { create: mockCreate },
    }));
    process.env.ANTHROPIC_API_KEY = 'test-key';
    client = new ClaudeInsightClient();
  });

  const input = {
    percentage: 80,
    passFail: 'pass',
    topicBreakdown: [{ topic: 'SQL', correct: 4, total: 5 }],
    proctoring: null,
  };

  it('returns the summary from a valid tool_use response', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', name: 'report_insight', input: { summary: 'Strong in SQL overall.' } }],
    });

    const result = await client.generate(input);

    expect(result).toBe('Strong in SQL overall.');
  });

  it('forces the report_insight tool via tool_choice, using the sonnet model', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', name: 'report_insight', input: { summary: 'Solid performance.' } }],
    });

    await client.generate(input);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-5',
        tool_choice: { type: 'tool', name: 'report_insight' },
        tools: [expect.objectContaining({ name: 'report_insight' })],
      }),
    );
  });

  it('includes proctoring context in the prompt when present', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', name: 'report_insight', input: { summary: 'Solid, one flag.' } }],
    });

    await client.generate({ ...input, proctoring: { riskLevel: 'medium', summary: 'One tab switch.' } });

    const call = mockCreate.mock.calls[0][0];
    expect(call.messages[0].content).toContain('medium risk');
    expect(call.messages[0].content).toContain('One tab switch.');
  });

  it('throws when the response contains no tool_use block', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'I cannot help with that.' }] });

    await expect(client.generate(input)).rejects.toThrow('Claude did not return a valid report_insight tool call');
  });

  it('throws when the tool_use input is missing a summary', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', name: 'report_insight', input: {} }],
    });

    await expect(client.generate(input)).rejects.toThrow('Claude returned a malformed insight summary');
  });

  it('propagates an error thrown by the Anthropic API call', async () => {
    mockCreate.mockRejectedValue(new Error('rate limited'));

    await expect(client.generate(input)).rejects.toThrow('rate limited');
  });
});
