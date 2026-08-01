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
    const sent = mockCreate.mock.calls[0][0];
    expect(sent).toEqual(
      expect.objectContaining({
        model: 'gpt-fast',
        // Always max_completion_tokens (the universal param), never the reasoning-model-rejected max_tokens.
        max_completion_tokens: 512 + 4000,
        tool_choice: { type: 'function', function: { name: 'report_thing' } },
        tools: [{ type: 'function', function: { name: 'report_thing', description: 'Report a thing.', parameters: tool.schema } }],
        messages: [{ role: 'user', content: 'Say hello' }],
      }),
    );
    expect(sent).not.toHaveProperty('max_tokens');
    // A plain (non-reasoning) model must not receive reasoning_effort -- non-OpenAI backends 400 on it.
    expect(sent).not.toHaveProperty('reasoning_effort');
  });

  it('uses the standard-tier model name when requested', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { tool_calls: [{ function: { name: 'report_thing', arguments: '{"value":"hi"}' } }] } }],
    });
    const provider = new OpenAiCompatibleProvider('azure-key', 'https://example.openai.azure.com/openai/v1', 'gpt-fast', 'gpt-standard');

    await provider.generateStructured({ modelTier: 'standard', maxTokens: 512, prompt: 'Say hi', tool });

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-standard' }));
  });

  it('sends images as image_url parts ahead of the prompt text', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { tool_calls: [{ function: { name: 'report_thing', arguments: '{"value":"seen"}' } }] } }],
    });
    const provider = new OpenAiCompatibleProvider('azure-key', 'https://example.openai.azure.com/openai/v1', 'gpt-fast', 'gpt-standard');

    await provider.generateStructured({
      modelTier: 'fast',
      maxTokens: 512,
      prompt: 'What is in this image?',
      images: ['data:image/jpeg;base64,Zm9v'],
      tool,
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,Zm9v' } },
              { type: 'text', text: 'What is in this image?' },
            ],
          },
        ],
      }),
    );
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

  it('sends max_completion_tokens and reasoning_effort (not max_tokens) for a reasoning model like gpt-5', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { tool_calls: [{ function: { name: 'report_thing', arguments: '{"value":"ok"}' } }] } }],
    });
    const provider = new OpenAiCompatibleProvider('azure-key', 'https://example.openai.azure.com/openai/v1', 'gpt-5', 'gpt-5');

    await provider.generateStructured({ modelTier: 'fast', maxTokens: 512, prompt: 'x', tool });

    const sent = mockCreate.mock.calls[0][0];
    expect(sent).toEqual(
      expect.objectContaining({ model: 'gpt-5', max_completion_tokens: 512 + 4000, reasoning_effort: 'low' }),
    );
    expect(sent).not.toHaveProperty('max_tokens');
  });

  it('adds reasoning_effort for an o-series reasoning model too', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { tool_calls: [{ function: { name: 'report_thing', arguments: '{"value":"ok"}' } }] } }],
    });
    const provider = new OpenAiCompatibleProvider('azure-key', 'https://example.openai.azure.com/openai/v1', 'o3-mini', 'o3-mini');

    await provider.generateStructured({ modelTier: 'fast', maxTokens: 512, prompt: 'x', tool });

    expect(mockCreate.mock.calls[0][0]).toEqual(expect.objectContaining({ reasoning_effort: 'low' }));
  });

  it('ping sends a minimal real request and does not throw on success', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: {} }] });
    const provider = new OpenAiCompatibleProvider('azure-key', 'https://example.openai.azure.com/openai/v1', 'gpt-fast', 'gpt-standard');

    await provider.ping();

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-fast', max_completion_tokens: 1 + 4000, messages: [{ role: 'user', content: 'Hi' }] }),
    );
  });

  it('ping propagates an error from a rejected request', async () => {
    mockCreate.mockRejectedValue(new Error('401 Unauthorized'));
    const provider = new OpenAiCompatibleProvider('bad-key', 'https://example.openai.azure.com/openai/v1', 'gpt-fast', 'gpt-standard');

    await expect(provider.ping()).rejects.toThrow('401 Unauthorized');
  });
});
