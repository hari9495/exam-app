export interface StructuredCompletionTool {
  name: string;
  description: string;
  schema: { type: 'object'; properties: Record<string, unknown>; required: string[] };
}

export interface StructuredCompletionRequest {
  modelTier: 'fast' | 'standard';
  maxTokens: number;
  prompt: string;
  tool: StructuredCompletionTool;
}

export interface AiProvider {
  generateStructured(request: StructuredCompletionRequest): Promise<Record<string, unknown>>;
  ping(): Promise<void>;
}
