jest.mock('@anthropic-ai/sdk');

import Anthropic from '@anthropic-ai/sdk';
import { ClaudeCodeReviewClient } from './claude-code-review.client';

describe('ClaudeCodeReviewClient', () => {
  let client: ClaudeCodeReviewClient;
  let mockCreate: jest.Mock;

  beforeEach(() => {
    mockCreate = jest.fn();
    (Anthropic as unknown as jest.Mock).mockImplementation(() => ({
      messages: { create: mockCreate },
    }));
    process.env.ANTHROPIC_API_KEY = 'test-key';
    client = new ClaudeCodeReviewClient();
  });

  const input = {
    questionText: 'Write a function that reverses a string.',
    starterCode: 'function reverse(str) {}',
    codeLanguage: 'javascript',
    answerText: 'function reverse(str) { return str.split("").reverse().join(""); }',
    marks: 10,
  };

  it('returns the suggested marks and summary from a valid tool_use response', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', name: 'report_code_review', input: { suggestedMarks: 7, summary: 'Correct logic, minor style issues.' } }],
    });

    const result = await client.review(input);

    expect(result).toEqual({ suggestedMarks: 7, summary: 'Correct logic, minor style issues.' });
  });

  it('forces the report_code_review tool via tool_choice, using the sonnet model', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', name: 'report_code_review', input: { suggestedMarks: 7, summary: 'Solid solution.' } }],
    });

    await client.review(input);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-5',
        tool_choice: { type: 'tool', name: 'report_code_review' },
        tools: [expect.objectContaining({ name: 'report_code_review' })],
      }),
    );
  });

  it('throws when Claude does not return a tool_use block', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'no tool call' }] });

    await expect(
      client.review({ questionText: 'x', starterCode: null, codeLanguage: 'python', answerText: 'y', marks: 5 }),
    ).rejects.toThrow('Claude did not return a valid report_code_review tool call');
  });

  it('throws when the returned suggestedMarks is not a number', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'tool_use', name: 'report_code_review', input: { suggestedMarks: 'seven', summary: 'ok' } }] });

    await expect(
      client.review({ questionText: 'x', starterCode: null, codeLanguage: 'python', answerText: 'y', marks: 5 }),
    ).rejects.toThrow('Claude returned a malformed code review');
  });

  it('propagates an error thrown by the Anthropic API call', async () => {
    mockCreate.mockRejectedValue(new Error('rate limited'));

    await expect(client.review(input)).rejects.toThrow('rate limited');
  });
});
