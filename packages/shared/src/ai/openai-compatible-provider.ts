import OpenAI from 'openai';
import { AiProvider, StructuredCompletionRequest } from './ai-provider';

// Hidden reasoning tokens: a reasoning model (gpt-5, o-series, and future ones we can't name yet)
// spends tokens thinking before it emits the tool call, so the caller's output budget (e.g. 512)
// has to be topped up generously or the completion truncates mid-reasoning and returns no tool call.
// The ceiling is billed on actual usage, not reserved, so a plain model that never reasons just
// stops at its natural completion -- the headroom costs nothing when unused.
const REASONING_HEADROOM = 4000;

// The models we'll run in future are unknown, so correctness must NOT depend on recognizing them.
// The only parameter a reasoning model hard-rejects is `max_tokens` (400: "use max_completion_tokens
// instead"). `max_completion_tokens` is the modern OpenAI standard that every current chat model --
// reasoning or not -- accepts, so we always send that. Any future reasoning model then works out of
// the box without a code change. (The lone exception is an ancient OpenAI-compatible backend that
// only implements the deprecated `max_tokens`; none is in use, and it'd be a one-line fallback.)
//
// `reasoning_effort` is deliberately NOT universal: OpenAI/Azure reasoning models accept it (and it
// cuts cost/latency on our tiny summaries), but non-OpenAI openai-compatible endpoints 400 on it.
// So it's gated behind a conservative name match -- a miss just means default effort, never a break.
function isReasoningModel(model: string): boolean {
  return /^(gpt-5|o[1-9])(-|$)/i.test(model);
}

function tokenParams(model: string, maxTokens: number): Record<string, unknown> {
  const params: Record<string, unknown> = { max_completion_tokens: maxTokens + REASONING_HEADROOM };
  if (isReasoningModel(model)) {
    params.reasoning_effort = 'low';
  }
  return params;
}

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
      ...tokenParams(model, request.maxTokens),
      tools: [{ type: 'function', function: { name: request.tool.name, description: request.tool.description, parameters: request.tool.schema } }],
      tool_choice: { type: 'function', function: { name: request.tool.name } },
      // OpenAI's image_url parts accept data URIs directly, so no decode step is needed here.
      messages: [
        {
          role: 'user',
          content: request.images?.length
            ? [
                ...request.images.map((image) => ({ type: 'image_url' as const, image_url: { url: image } })),
                { type: 'text' as const, text: request.prompt },
              ]
            : request.prompt,
        },
      ],
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
    // A reasoning model given a 1-token budget spends it all on reasoning and can 400 on truncation,
    // so ping needs the same reasoning-aware params -- it only checks auth/connectivity, not output.
    await client.chat.completions.create({ model: this.modelFast, ...tokenParams(this.modelFast, 1), messages: [{ role: 'user', content: 'Hi' }] });
  }
}
