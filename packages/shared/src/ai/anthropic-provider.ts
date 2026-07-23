import Anthropic from '@anthropic-ai/sdk';
import { AiProvider, StructuredCompletionRequest } from './ai-provider';

const FAST_MODEL = 'claude-haiku-4-5-20251001';
const STANDARD_MODEL = 'claude-sonnet-5';

export class AnthropicProvider implements AiProvider {
  constructor(private readonly apiKey: string) {}

  async generateStructured(request: StructuredCompletionRequest): Promise<Record<string, unknown>> {
    const client = new Anthropic({ apiKey: this.apiKey });
    const model = request.modelTier === 'fast' ? FAST_MODEL : STANDARD_MODEL;
    const response = await client.messages.create({
      model,
      max_tokens: request.maxTokens,
      tools: [{ name: request.tool.name, description: request.tool.description, input_schema: request.tool.schema }],
      tool_choice: { type: 'tool', name: request.tool.name },
      messages: [{ role: 'user', content: request.prompt }],
    });

    const toolUse = response.content.find(
      (block: { type: string }) => block.type === 'tool_use',
    ) as { type: 'tool_use'; input: unknown } | undefined;

    if (!toolUse || typeof toolUse.input !== 'object' || toolUse.input === null) {
      throw new Error(`Anthropic did not return a valid ${request.tool.name} tool call`);
    }
    return toolUse.input as Record<string, unknown>;
  }

  async ping(): Promise<void> {
    const client = new Anthropic({ apiKey: this.apiKey });
    await client.messages.create({ model: FAST_MODEL, max_tokens: 1, messages: [{ role: 'user', content: 'Hi' }] });
  }
}
