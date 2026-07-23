import OpenAI from 'openai';
import { AiProvider, StructuredCompletionRequest } from './ai-provider';

export class OpenAiCompatibleProvider implements AiProvider {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly modelFast: string,
    private readonly modelStandard: string,
  ) {}

  async generateStructured(request: StructuredCompletionRequest): Promise<Record<string, unknown>> {
    const client = new OpenAI({ apiKey: this.apiKey, baseURL: this.baseUrl });
    const model = request.modelTier === 'fast' ? this.modelFast : this.modelStandard;
    const response = await client.chat.completions.create({
      model,
      max_tokens: request.maxTokens,
      tools: [{ type: 'function', function: { name: request.tool.name, description: request.tool.description, parameters: request.tool.schema } }],
      tool_choice: { type: 'function', function: { name: request.tool.name } },
      messages: [{ role: 'user', content: request.prompt }],
    });

    const toolCall = response.choices[0]?.message?.tool_calls?.[0];
    // ponytail: narrow the function/custom tool-call union from the openai SDK's newer types; runtime shape is unchanged.
    if (!toolCall || !('function' in toolCall) || toolCall.function.name !== request.tool.name) {
      throw new Error(`The AI provider did not return a valid ${request.tool.name} tool call`);
    }

    try {
      return JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
    } catch {
      throw new Error(`The AI provider returned malformed JSON for the ${request.tool.name} tool call`);
    }
  }

  async ping(): Promise<void> {
    const client = new OpenAI({ apiKey: this.apiKey, baseURL: this.baseUrl });
    await client.chat.completions.create({ model: this.modelFast, max_tokens: 1, messages: [{ role: 'user', content: 'Hi' }] });
  }
}
