jest.mock('@anthropic-ai/sdk');

import Anthropic from '@anthropic-ai/sdk';
import { ClaudeIntegrityClient } from './claude-integrity.client';
import { IntegrityFlag } from './integrity-rules';

describe('ClaudeIntegrityClient', () => {
  let client: ClaudeIntegrityClient;
  let mockCreate: jest.Mock;

  beforeEach(() => {
    mockCreate = jest.fn();
    (Anthropic as unknown as jest.Mock).mockImplementation(() => ({
      messages: { create: mockCreate },
    }));
    client = new ClaudeIntegrityClient();
  });

  const flags: IntegrityFlag[] = [{ type: 'large_paste', severity: 'medium', detail: 'Pasted 250 characters', questionId: 'q1' }];
  const context = { examTitle: 'Backend Engineer Exam', level: 'review' };

  it('returns the narrative from a valid tool_use response', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', name: 'report_integrity_narrative', input: { narrative: 'A large paste was detected.' } }],
    });

    const result = await client.writeNarrative(flags, context, 'test-key');

    expect(result).toBe('A large paste was detected.');
  });

  it('forces the report_integrity_narrative tool via tool_choice', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', name: 'report_integrity_narrative', input: { narrative: 'Nothing notable.' } }],
    });

    await client.writeNarrative(flags, context, 'test-key');

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        tool_choice: { type: 'tool', name: 'report_integrity_narrative' },
        tools: [expect.objectContaining({ name: 'report_integrity_narrative' })],
      }),
    );
  });

  it('throws when the response contains no tool_use block', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'I cannot help with that.' }] });

    await expect(client.writeNarrative(flags, context, 'test-key')).rejects.toThrow(
      'Claude did not return a valid report_integrity_narrative tool call',
    );
  });

  it('throws when the tool_use input is missing a narrative', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', name: 'report_integrity_narrative', input: {} }],
    });

    await expect(client.writeNarrative(flags, context, 'test-key')).rejects.toThrow('Claude returned a malformed integrity narrative');
  });

  it('throws when the tool_use input has an empty narrative', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', name: 'report_integrity_narrative', input: { narrative: '   ' } }],
    });

    await expect(client.writeNarrative(flags, context, 'test-key')).rejects.toThrow('Claude returned a malformed integrity narrative');
  });

  it('propagates an error thrown by the Anthropic API call', async () => {
    mockCreate.mockRejectedValue(new Error('rate limited'));

    await expect(client.writeNarrative(flags, context, 'test-key')).rejects.toThrow('rate limited');
  });
});
