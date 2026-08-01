jest.mock('@anthropic-ai/sdk');

import Anthropic from '@anthropic-ai/sdk';
import { AnthropicProvider } from './anthropic-provider';

describe('AnthropicProvider', () => {
  let mockCreate: jest.Mock;

  beforeEach(() => {
    mockCreate = jest.fn();
    (Anthropic as unknown as jest.Mock).mockImplementation(() => ({
      messages: { create: mockCreate },
    }));
  });

  const tool = {
    name: 'report_thing',
    description: 'Report a thing.',
    schema: { type: 'object' as const, properties: { value: { type: 'string' } }, required: ['value'] },
  };

  it('uses the fast-tier model and returns the parsed tool_use input', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'tool_use', name: 'report_thing', input: { value: 'hello' } }] });
    const provider = new AnthropicProvider('sk-ant-test');

    const result = await provider.generateStructured({ modelTier: 'fast', maxTokens: 512, prompt: 'Say hello', tool });

    expect(result).toEqual({ value: 'hello' });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        tool_choice: { type: 'tool', name: 'report_thing' },
        tools: [{ name: 'report_thing', description: 'Report a thing.', input_schema: tool.schema }],
        messages: [{ role: 'user', content: 'Say hello' }],
      }),
    );
  });

  it('uses the standard-tier model when requested', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'tool_use', name: 'report_thing', input: { value: 'hi' } }] });
    const provider = new AnthropicProvider('sk-ant-test');

    await provider.generateStructured({ modelTier: 'standard', maxTokens: 512, prompt: 'Say hi', tool });

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-sonnet-5' }));
  });

  it('sends images as base64 blocks ahead of the prompt text', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'tool_use', name: 'report_thing', input: { value: 'seen' } }] });
    const provider = new AnthropicProvider('sk-ant-test');

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
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'Zm9v' } },
              { type: 'text', text: 'What is in this image?' },
            ],
          },
        ],
      }),
    );
  });

  it('rejects an image that is not a base64 data URI', async () => {
    const provider = new AnthropicProvider('sk-ant-test');

    await expect(
      provider.generateStructured({
        modelTier: 'fast',
        maxTokens: 512,
        prompt: 'x',
        images: ['https://example.com/img.jpg'],
        tool,
      }),
    ).rejects.toThrow('Image must be a base64 data URI');
  });

  it('throws when the response contains no tool_use block', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'I refuse.' }] });
    const provider = new AnthropicProvider('sk-ant-test');

    await expect(provider.generateStructured({ modelTier: 'fast', maxTokens: 512, prompt: 'x', tool })).rejects.toThrow(
      'Anthropic did not return a valid report_thing tool call',
    );
  });

  it('ping sends a minimal real request and does not throw on success', async () => {
    mockCreate.mockResolvedValue({ content: [] });
    const provider = new AnthropicProvider('sk-ant-test');

    await provider.ping();

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-haiku-4-5-20251001', max_tokens: 1, messages: [{ role: 'user', content: 'Hi' }] }),
    );
  });

  it('ping propagates an error from a rejected request', async () => {
    mockCreate.mockRejectedValue(new Error('authentication_error'));
    const provider = new AnthropicProvider('sk-ant-bad');

    await expect(provider.ping()).rejects.toThrow('authentication_error');
  });
});
