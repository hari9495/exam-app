import OpenAI from 'openai';

/**
 * A bring-your-own embeddings provider. Every mainstream embeddings API (OpenAI, Azure OpenAI,
 * Voyage, Cohere-compat, local Ollama / LM Studio) speaks the OpenAI `/embeddings` shape, so one
 * OpenAI-compatible client covers "use whatever AI you like" without a per-vendor branch.
 */
export interface EmbeddingProvider {
  readonly model: string;
  embed(texts: string[]): Promise<number[][]>;
}

export class OpenAiCompatibleEmbeddingProvider implements EmbeddingProvider {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    public readonly model: string,
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const client = new OpenAI({ apiKey: this.apiKey, baseURL: this.baseUrl });
    const res = await client.embeddings.create({ model: this.model, input: texts });
    // Preserve request order (the API returns an `index` per item; sort defensively).
    return [...res.data].sort((a, b) => a.index - b.index).map((d) => d.embedding as number[]);
  }
}
