import Anthropic from '@anthropic-ai/sdk';
import { AiProvider, StructuredCompletionRequest, parseImageDataUri } from './ai-provider';

const FAST_MODEL = 'claude-haiku-4-5-20251001';
const STANDARD_MODEL = 'claude-sonnet-5';

// Structural types rather than SDK exports: the installed @anthropic-ai/sdk version doesn't
// surface ContentBlockParam at the top level, and these two shapes are stable API contract.
type AnthropicImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
type ImageBlock = { type: 'image'; source: { type: 'base64'; media_type: AnthropicImageMediaType; data: string } };
type TextBlock = { type: 'text'; text: string };

// A text-only request keeps the plain string content it always had; images become a
// multi-part content array with the text last (Anthropic's recommended ordering).
function buildContent(request: StructuredCompletionRequest): string | Array<ImageBlock | TextBlock> {
  if (!request.images?.length) {
    return request.prompt;
  }
  return [
    ...request.images.map((image): ImageBlock => {
      const { mediaType, base64 } = parseImageDataUri(image);
      // Callers only pass JPEG/PNG screenshots; an off-list type would be rejected by the API
      // with its own clear error, so a cast beats duplicating Anthropic's allow-list check here.
      return { type: 'image', source: { type: 'base64', media_type: mediaType as AnthropicImageMediaType, data: base64 } };
    }),
    { type: 'text', text: request.prompt },
  ];
}

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
      messages: [{ role: 'user', content: buildContent(request) }],
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
