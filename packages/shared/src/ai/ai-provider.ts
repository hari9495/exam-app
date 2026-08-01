export interface StructuredCompletionTool {
  name: string;
  description: string;
  schema: { type: 'object'; properties: Record<string, unknown>; required: string[] };
}

export interface StructuredCompletionRequest {
  modelTier: 'fast' | 'standard';
  maxTokens: number;
  prompt: string;
  // Optional images (data URIs, e.g. "data:image/jpeg;base64,...") sent alongside the prompt
  // for vision-capable models. Providers that receive an unsupported media type will surface
  // the API's own error -- callers only pass JPEG/PNG screenshots.
  images?: string[];
  tool: StructuredCompletionTool;
}

// Splits a data URI into the media type and raw base64 payload Anthropic's image blocks need.
// Throws on anything that isn't a base64 data URI -- a caller bug, not a runtime condition.
export function parseImageDataUri(dataUri: string): { mediaType: string; base64: string } {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUri);
  if (!match) {
    throw new Error('Image must be a base64 data URI (data:<media-type>;base64,...)');
  }
  return { mediaType: match[1], base64: match[2] };
}

export interface AiProvider {
  generateStructured(request: StructuredCompletionRequest): Promise<Record<string, unknown>>;
  ping(): Promise<void>;
}
