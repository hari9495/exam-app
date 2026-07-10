jest.mock('@anthropic-ai/sdk');

import Anthropic from '@anthropic-ai/sdk';
import { ClaudeQuestionGenerationClient } from './claude-question-generation.client';

describe('ClaudeQuestionGenerationClient', () => {
  let client: ClaudeQuestionGenerationClient;
  let mockCreate: jest.Mock;

  beforeEach(() => {
    mockCreate = jest.fn();
    (Anthropic as unknown as jest.Mock).mockImplementation(() => ({
      messages: { create: mockCreate },
    }));
    process.env.ANTHROPIC_API_KEY = 'test-key';
    client = new ClaudeQuestionGenerationClient();
  });

  const validQuestions = [
    {
      type: 'single_mcq',
      text: 'What is 2+2?',
      options: [
        { text: '3', isCorrect: false },
        { text: '4', isCorrect: true },
      ],
    },
  ];

  it('returns the generated questions from a valid tool_use response', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', name: 'report_generated_questions', input: { questions: validQuestions } }],
    });

    const result = await client.generate('arithmetic', 'easy', ['single_mcq'], 1);

    expect(result).toEqual(validQuestions);
  });

  it('forces the report_generated_questions tool via tool_choice, using the sonnet model', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', name: 'report_generated_questions', input: { questions: validQuestions } }],
    });

    await client.generate('arithmetic', 'easy', ['single_mcq'], 1);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-5',
        tool_choice: { type: 'tool', name: 'report_generated_questions' },
        tools: [expect.objectContaining({ name: 'report_generated_questions' })],
      }),
    );
  });

  it('throws when the response contains no tool_use block', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'I cannot help with that.' }] });

    await expect(client.generate('arithmetic', 'easy', ['single_mcq'], 1)).rejects.toThrow(
      'Claude did not return a valid report_generated_questions tool call',
    );
  });

  it('throws when the tool_use input is missing a questions array', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', name: 'report_generated_questions', input: {} }],
    });

    await expect(client.generate('arithmetic', 'easy', ['single_mcq'], 1)).rejects.toThrow(
      'Claude returned malformed generated questions',
    );
  });

  it('propagates an error thrown by the Anthropic API call', async () => {
    mockCreate.mockRejectedValue(new Error('rate limited'));

    await expect(client.generate('arithmetic', 'easy', ['single_mcq'], 1)).rejects.toThrow('rate limited');
  });
});
