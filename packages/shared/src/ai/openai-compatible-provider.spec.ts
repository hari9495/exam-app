jest.mock('openai');

import OpenAI from 'openai';
import { OpenAiCompatibleProvider } from './openai-compatible-provider';

describe('OpenAiCompatibleProvider', () => {
  let mockCreate: jest.Mock;

  beforeEach(() => {
    mockCreate = jest.fn();
    (OpenAI as unknown as jest.Mock).mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    }));
  });

  const tool = {
    name: 'report_thing',
    description: 'Report a thing.',
    schema: { type: 'object' as const, properties: { value: { type: 'string' } }, required: ['value'] },
  };

  it('sends the request as OpenAI function-calling and parses the JSON tool call arguments', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { tool_calls: [{ function: { name: 'report_thing', arguments: '{"value":"hello"}' } }] } }],
    });
    const provider = new OpenAiCompatibleProvider('azure-key', 'https://example.openai.azure.com/openai/v1', 'gpt-fast', 'gpt-standard');

    const result = await provider.generateStructured({ modelTier: 'fast', maxTokens: 512, prompt: 'Say hello', tool });

    expect(result).toEqual({ value: 'hello' });
    expect(OpenAI).toHaveBeenCalledWith({ apiKey: 'azure-key', baseURL: 'https://example.openai.azure.com/openai/v1' });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-fast',
        max_tokens: 512,
        tool_choice: { type: 'function', function: { name: 'report_thing' } },
        tools: [{ type: 'function', function: { name: 'report_thing', description: 'Report a thing.', parameters: tool.schema } }],
        messages: [{ role: 'user', content: 'Say hello' }],
      }),
    );
  });

  it('uses the standard-tier model name when requested', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { tool_calls: [{ function: { name: 'report_thing', arguments: '{"value":"hi"}' } }] } }],
    });
    const provider = new OpenAiCompatibleProvider('azure-key', 'https://example.openai.azure.com/openai/v1', 'gpt-fast', 'gpt-standard');

    await provider.generateStructured({ modelTier: 'standard', maxTokens: 512, prompt: 'Say hi', tool });

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-standard' }));
  });

  it('throws when the response contains no matching tool call', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { tool_calls: [] } }] });
    const provider = new OpenAiCompatibleProvider('azure-key', 'https://example.openai.azure.com/openai/v1', 'gpt-fast', 'gpt-standard');

    await expect(provider.generateStructured({ modelTier: 'fast', maxTokens: 512, prompt: 'x', tool })).rejects.toThrow(
      'The AI provider did not return a valid report_thing tool call',
    );
  });

  it('throws when the tool call arguments are not valid JSON', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { tool_calls: [{ function: { name: 'report_thing', arguments: 'not json' } }] } }],
    });
    const provider = new OpenAiCompatibleProvider('azure-key', 'https://example.openai.azure.com/openai/v1', 'gpt-fast', 'gpt-standard');

    await expect(provider.generateStructured({ modelTier: 'fast', maxTokens: 512, prompt: 'x', tool })).rejects.toThrow(
      'The AI provider returned malformed JSON for the report_thing tool call',
    );
  });

  it('ping sends a minimal real request and does not throw on success', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: {} }] });
    const provider = new OpenAiCompatibleProvider('azure-key', 'https://example.openai.azure.com/openai/v1', 'gpt-fast', 'gpt-standard');

    await provider.ping();

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-fast', max_tokens: 1, messages: [{ role: 'user', content: 'Hi' }] }),
    );
  });

  it('ping propagates an error from a rejected request', async () => {
    mockCreate.mockRejectedValue(new Error('401 Unauthorized'));
    const provider = new OpenAiCompatibleProvider('bad-key', 'https://example.openai.azure.com/openai/v1', 'gpt-fast', 'gpt-standard');

    await expect(provider.ping()).rejects.toThrow('401 Unauthorized');
  });
});
