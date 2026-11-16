import { OpenAiCompatibleProvider } from '../ai/openai-compatible-provider';
import { OpenAiCompatibleEmbeddingProvider } from '../ai/embedding-provider';
import { AiApiKeyResolverService } from '../crypto/ai-api-key-resolver.service';
import { isPublicAddress, orgAiFetch } from './public-fetch';

// Answer 1902: a company's own AI address is reached only through the pinned public-only fetch the webhooks use.
describe('the pinned public-only fetch for a company AI address', () => {
  it('negative: a loopback, private or link-local address is refused before any connection', async () => {
    for (const url of ['https://127.0.0.1/v1/chat/completions', 'https://10.0.0.5/v1/embeddings', 'https://169.254.169.254/latest', 'https://[::1]/v1']) {
      await expect(orgAiFetch(url, { method: 'POST', body: '{}' })).rejects.toThrow(/public address|ENOTPUBLIC/);
    }
    expect(isPublicAddress('8.8.8.8')).toBe(true);
    expect(isPublicAddress('192.168.1.10')).toBe(false);
  });

  it('negative: plain http is refused', async () => {
    await expect(orgAiFetch('http://example.com/v1', { method: 'GET' })).rejects.toThrow(/https/);
  });

  it('the OpenAI-compatible providers send their calls through the fetch they are given', async () => {
    const seen: string[] = [];
    const fake = jest.fn(async (input: string | URL | Request) => {
      seen.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      return new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    await new OpenAiCompatibleEmbeddingProvider('k', 'https://ai.example.com/v1', 'e', fake).embed(['x']);
    expect(seen).toEqual(['https://ai.example.com/v1/embeddings']);
    await new OpenAiCompatibleProvider('k', 'https://ai.example.com/v1', 'f', 's', fake).ping().catch(() => undefined);
    expect(seen[1]).toBe('https://ai.example.com/v1/chat/completions');
  });

  it('the AI key resolver builds a company OpenAI-compatible provider on the pinned fetch', async () => {
    const prisma = { organization: { findUnique: jest.fn().mockResolvedValue({ aiProvider: 'openai-compatible', aiApiKeyEncrypted: 'enc', aiBaseUrl: 'https://127.0.0.1/v1', aiModelFast: 'f', aiModelStandard: 's' }) } };
    const crypto = { decrypt: jest.fn().mockReturnValue('sk-test') };
    const provider = await new AiApiKeyResolverService(prisma as never, crypto as never).resolve('org-1');
    // The stored address points inside the network: the call is refused by the pinned fetch, never sent.
    await expect(provider.ping()).rejects.toThrow();
    expect((provider as unknown as { fetchImpl: unknown }).fetchImpl).toBe(orgAiFetch);
  });
});
