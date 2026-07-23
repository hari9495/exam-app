# Multi-Provider AI Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an organization configure any OpenAI-compatible AI provider (Azure OpenAI, OpenAI, etc.) instead of being hardcoded to Anthropic, across all 5 AI-backed features in this codebase, with zero behavior change for orgs that configure nothing.

**Architecture:** A new `AiProvider` interface in `packages/shared` (one method: `generateStructured`, plus a `ping` for save-time key validation) with two implementations — `AnthropicProvider` (wraps the existing Anthropic SDK calls) and `OpenAiCompatibleProvider` (uses the standard `openai` npm package pointed at an org-configured base URL). The existing `AiApiKeyResolverService.resolve(organizationId)` — already injected into all 5 AI call sites today — is extended in place to return a resolved `AiProvider` instead of a raw API key string, so every call site's shape stays nearly identical.

**Tech Stack:** NestJS + Prisma (backend), `@anthropic-ai/sdk` (existing), `openai` (new dependency), Next.js (org-admin settings UI).

## Global Constraints

- Provider is one of exactly two types: `'anthropic' | 'openai-compatible'` — not a named enum per vendor. `'openai-compatible'` covers Azure OpenAI, OpenAI, and any other vendor speaking the same API shape, configured purely by base URL + model names, with zero code changes per new vendor.
- Auth is always a Bearer token for both provider types — no per-provider auth-style configuration.
- `Organization.aiProvider` defaults to `'anthropic'` — every existing org keeps today's exact behavior with zero config changes.
- For `aiProvider = 'anthropic'`, `aiModelFast`/`aiModelStandard` are always ignored — the hardcoded defaults (`claude-haiku-4-5-20251001` / `claude-sonnet-5`) are always used.
- For `aiProvider = 'openai-compatible'`, `aiBaseUrl`/`aiModelFast`/`aiModelStandard` are all required together — an org must fully configure all three (plus the API key) to use it at all. No platform-wide fallback exists for `openai-compatible`.
- All 5 existing AI call sites are migrated to the new abstraction in this single plan (not an incremental per-feature rollout).
- Both Anthropic's `input_schema` and OpenAI's `parameters` are plain JSON Schema — the same schema object is reused for both providers unchanged, only the request/response envelope differs.
- Package manager commands: `npm run test --workspace=packages/shared -- <args>`, `npm run test --workspace=apps/api -- <args>`, `npm run test --workspace=apps/exam-runtime -- <args>`, `npm run test --workspace=apps/web -- <args>` (or `npx jest <pattern>` from the relevant app/package directory if the workspace form hits shell-quoting issues).

---

### Task 1: Prisma schema — add multi-provider AI config columns

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260724010000_multi_provider_ai_config/migration.sql`

**Interfaces:**
- Produces: `Organization.aiProvider: string` (default `"anthropic"`), `Organization.aiBaseUrl: string | null`, `Organization.aiModelFast: string | null`, `Organization.aiModelStandard: string | null` — consumed by every later task.

- [ ] **Step 1: Add the 4 new columns to the `Organization` model**

In `apps/api/prisma/schema.prisma`, find the `Organization` model's `aiApiKeyEncrypted` line:

```prisma
  aiApiKeyEncrypted      String?           @map("ai_api_key_encrypted")
```

Add these 4 lines directly below it:

```prisma
  aiProvider             String            @default("anthropic") @map("ai_provider")
  aiBaseUrl              String?           @map("ai_base_url")
  aiModelFast            String?           @map("ai_model_fast")
  aiModelStandard        String?           @map("ai_model_standard")
```

- [ ] **Step 2: Write the migration SQL**

Create `apps/api/prisma/migrations/20260724010000_multi_provider_ai_config/migration.sql`:

```sql
ALTER TABLE [dbo].[organizations] ADD [ai_provider] NVARCHAR(1000) NOT NULL CONSTRAINT [organizations_ai_provider_default] DEFAULT 'anthropic';
ALTER TABLE [dbo].[organizations] ADD [ai_base_url] NVARCHAR(1000) NULL;
ALTER TABLE [dbo].[organizations] ADD [ai_model_fast] NVARCHAR(1000) NULL;
ALTER TABLE [dbo].[organizations] ADD [ai_model_standard] NVARCHAR(1000) NULL;
```

- [ ] **Step 3: Apply the migration and regenerate the Prisma client**

Run: `npx prisma migrate deploy --schema apps/api/prisma/schema.prisma` (or the project's documented db-push fallback if the shadow-database permission quirk noted elsewhere in this repo's history applies in your environment)
Run: `npx prisma generate --schema apps/api/prisma/schema.prisma`
Expected: migration applies cleanly; `npx prisma migrate status --schema apps/api/prisma/schema.prisma` reports up to date.

- [ ] **Step 4: Confirm the API still builds with the new Prisma types**

Run: `npm run test --workspace=apps/api -- organizations.service.spec.ts`
Expected: PASS (no test yet exercises the new columns — this just confirms the schema change didn't break compilation)

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260724010000_multi_provider_ai_config
git commit -m "feat: add multi-provider AI config columns to Organization"
```

---

### Task 2: Shared `AiProvider` engine — interface + `AnthropicProvider` + `OpenAiCompatibleProvider`

**Files:**
- Create: `packages/shared/src/ai/ai-provider.ts`
- Create: `packages/shared/src/ai/anthropic-provider.ts`
- Create: `packages/shared/src/ai/anthropic-provider.spec.ts`
- Create: `packages/shared/src/ai/openai-compatible-provider.ts`
- Create: `packages/shared/src/ai/openai-compatible-provider.spec.ts`
- Modify: `packages/shared/package.json`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `AiProvider` interface (`generateStructured`, `ping`), `StructuredCompletionRequest`, `StructuredCompletionTool` types, `AnthropicProvider` class, `OpenAiCompatibleProvider` class — all exported from `@exam-platform/shared`, consumed by Task 3 (resolver) and Tasks 4-8 (the 5 migrated clients) and Task 9 (org settings save validation).

- [ ] **Step 1: Add the `openai` dependency**

Run: `npm install openai --workspace=packages/shared`

`packages/shared/package.json` should also already list `@anthropic-ai/sdk` as a dependency; if it does not, run: `npm install @anthropic-ai/sdk --workspace=packages/shared`

- [ ] **Step 2: Define the shared interface**

Create `packages/shared/src/ai/ai-provider.ts`:

```ts
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
```

- [ ] **Step 3: Write the failing `AnthropicProvider` tests**

Create `packages/shared/src/ai/anthropic-provider.spec.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm run test --workspace=packages/shared -- anthropic-provider.spec.ts`
Expected: FAIL — `./anthropic-provider` does not exist yet.

- [ ] **Step 5: Implement `AnthropicProvider`**

Create `packages/shared/src/ai/anthropic-provider.ts`:

```ts
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
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test --workspace=packages/shared -- anthropic-provider.spec.ts`
Expected: PASS

- [ ] **Step 7: Write the failing `OpenAiCompatibleProvider` tests**

Create `packages/shared/src/ai/openai-compatible-provider.spec.ts`:

```ts
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
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-fast',
        max_tokens: 512,
        tool_choice: { type: 'function', function: { name: 'report_thing' } },
        tools: [{ type: 'function', function: { name: 'report_thing', description: 'Report a thing.', parameters: tool.schema } }],
        messages: [{ role: 'user', content: 'Say hello' }],
      }),
    );
  });

  it('uses the standard-tier model name when requested', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { tool_calls: [{ function: { name: 'report_thing', arguments: '{"value":"hi"}' } }] } }],
    });
    const provider = new OpenAiCompatibleProvider('azure-key', 'https://example.openai.azure.com/openai/v1', 'gpt-fast', 'gpt-standard');

    await provider.generateStructured({ modelTier: 'standard', maxTokens: 512, prompt: 'Say hi', tool });

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-standard' }));
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

  it('ping sends a minimal real request and does not throw on success', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: {} }] });
    const provider = new OpenAiCompatibleProvider('azure-key', 'https://example.openai.azure.com/openai/v1', 'gpt-fast', 'gpt-standard');

    await provider.ping();

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-fast', max_tokens: 1, messages: [{ role: 'user', content: 'Hi' }] }),
    );
  });

  it('ping propagates an error from a rejected request', async () => {
    mockCreate.mockRejectedValue(new Error('401 Unauthorized'));
    const provider = new OpenAiCompatibleProvider('bad-key', 'https://example.openai.azure.com/openai/v1', 'gpt-fast', 'gpt-standard');

    await expect(provider.ping()).rejects.toThrow('401 Unauthorized');
  });
});
```

- [ ] **Step 8: Run the tests to verify they fail**

Run: `npm run test --workspace=packages/shared -- openai-compatible-provider.spec.ts`
Expected: FAIL — `./openai-compatible-provider` does not exist yet.

- [ ] **Step 9: Implement `OpenAiCompatibleProvider`**

Create `packages/shared/src/ai/openai-compatible-provider.ts`:

```ts
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
    if (!toolCall || toolCall.function.name !== request.tool.name) {
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
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `npm run test --workspace=packages/shared -- openai-compatible-provider.spec.ts`
Expected: PASS

- [ ] **Step 11: Export the new modules**

Add these lines to `packages/shared/src/index.ts` (anywhere in the file; grouping with the existing `crypto/` exports is reasonable):

```ts
export * from './ai/ai-provider';
export * from './ai/anthropic-provider';
export * from './ai/openai-compatible-provider';
```

- [ ] **Step 12: Commit**

```bash
git add packages/shared/package.json package-lock.json packages/shared/src/ai packages/shared/src/index.ts
git commit -m "feat: add AiProvider engine (Anthropic + OpenAI-compatible)"
```

---

### Task 3: Extend `AiApiKeyResolverService` to resolve a full `AiProvider`

**Files:**
- Modify: `packages/shared/src/crypto/ai-api-key-resolver.service.ts`
- Modify: `packages/shared/src/crypto/ai-api-key-resolver.service.spec.ts`

**Interfaces:**
- Consumes: `AiProvider`, `AnthropicProvider`, `OpenAiCompatibleProvider` (Task 2).
- Produces: `AiApiKeyResolverService.resolve(organizationId: string): Promise<AiProvider>` — signature changed from returning `Promise<string>`. This is the exact same method name and call shape (`this.aiApiKeyResolver.resolve(organizationId)`) already used at all 5 existing AI call sites, so each of Tasks 4-8 only needs to change what it does with the *result*, not how it's obtained.

- [ ] **Step 1: Write the failing/updated tests**

Replace the full contents of `packages/shared/src/crypto/ai-api-key-resolver.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { AiApiKeyResolverService } from './ai-api-key-resolver.service';
import { OrgSecretsCryptoService } from './org-secrets-crypto.service';
import { PrismaService } from '../prisma/prisma.service';
import { AnthropicProvider } from '../ai/anthropic-provider';
import { OpenAiCompatibleProvider } from '../ai/openai-compatible-provider';

describe('AiApiKeyResolverService', () => {
  let service: AiApiKeyResolverService;
  let prisma: { organization: { findUnique: jest.Mock } };
  let cryptoService: { decrypt: jest.Mock };

  beforeEach(async () => {
    prisma = { organization: { findUnique: jest.fn() } };
    cryptoService = { decrypt: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AiApiKeyResolverService,
        { provide: PrismaService, useValue: prisma },
        { provide: OrgSecretsCryptoService, useValue: cryptoService },
      ],
    }).compile();
    service = moduleRef.get(AiApiKeyResolverService);
  });

  it("returns an AnthropicProvider using the org's own decrypted key when configured", async () => {
    prisma.organization.findUnique.mockResolvedValue({
      aiProvider: 'anthropic',
      aiApiKeyEncrypted: 'encrypted-blob',
      aiBaseUrl: null,
      aiModelFast: null,
      aiModelStandard: null,
    });
    cryptoService.decrypt.mockReturnValue('sk-ant-org-own-key');

    const result = await service.resolve('org-1');

    expect(cryptoService.decrypt).toHaveBeenCalledWith('encrypted-blob');
    expect(result).toBeInstanceOf(AnthropicProvider);
  });

  it('falls back to an AnthropicProvider using the platform ANTHROPIC_API_KEY when the org has none configured', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      aiProvider: 'anthropic',
      aiApiKeyEncrypted: null,
      aiBaseUrl: null,
      aiModelFast: null,
      aiModelStandard: null,
    });
    process.env.ANTHROPIC_API_KEY = 'sk-ant-platform-key';

    const result = await service.resolve('org-1');

    expect(cryptoService.decrypt).not.toHaveBeenCalled();
    expect(result).toBeInstanceOf(AnthropicProvider);
  });

  it('throws when neither an org key nor a platform key is available for the anthropic provider', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      aiProvider: 'anthropic',
      aiApiKeyEncrypted: null,
      aiBaseUrl: null,
      aiModelFast: null,
      aiModelStandard: null,
    });
    delete process.env.ANTHROPIC_API_KEY;

    await expect(service.resolve('org-1')).rejects.toThrow(
      'No AI API key configured for this organization, and no platform-wide ANTHROPIC_API_KEY is set',
    );
  });

  it('returns an OpenAiCompatibleProvider using the org\'s own base URL and models when configured', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      aiProvider: 'openai-compatible',
      aiApiKeyEncrypted: 'encrypted-blob',
      aiBaseUrl: 'https://example.openai.azure.com/openai/v1',
      aiModelFast: 'gpt-fast',
      aiModelStandard: 'gpt-standard',
    });
    cryptoService.decrypt.mockReturnValue('azure-key');

    const result = await service.resolve('org-1');

    expect(cryptoService.decrypt).toHaveBeenCalledWith('encrypted-blob');
    expect(result).toBeInstanceOf(OpenAiCompatibleProvider);
  });

  it('throws when the org is configured for openai-compatible but is missing required fields', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      aiProvider: 'openai-compatible',
      aiApiKeyEncrypted: 'encrypted-blob',
      aiBaseUrl: null,
      aiModelFast: 'gpt-fast',
      aiModelStandard: 'gpt-standard',
    });
    cryptoService.decrypt.mockReturnValue('azure-key');

    await expect(service.resolve('org-1')).rejects.toThrow(
      'This organization is configured for an OpenAI-compatible provider but is missing its API key, base URL, or model names',
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test --workspace=packages/shared -- ai-api-key-resolver.service.spec.ts`
Expected: FAIL — `service.resolve` currently returns a string, and the org mock shape doesn't match the current implementation's `select`.

- [ ] **Step 3: Implement the updated `resolve` method**

Replace the full contents of `packages/shared/src/crypto/ai-api-key-resolver.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrgSecretsCryptoService } from './org-secrets-crypto.service';
import { AiProvider } from '../ai/ai-provider';
import { AnthropicProvider } from '../ai/anthropic-provider';
import { OpenAiCompatibleProvider } from '../ai/openai-compatible-provider';

@Injectable()
export class AiApiKeyResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptoService: OrgSecretsCryptoService,
  ) {}

  async resolve(organizationId: string): Promise<AiProvider> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { aiProvider: true, aiApiKeyEncrypted: true, aiBaseUrl: true, aiModelFast: true, aiModelStandard: true },
    });

    if (org?.aiProvider === 'openai-compatible') {
      if (!org.aiApiKeyEncrypted || !org.aiBaseUrl || !org.aiModelFast || !org.aiModelStandard) {
        throw new Error('This organization is configured for an OpenAI-compatible provider but is missing its API key, base URL, or model names');
      }
      return new OpenAiCompatibleProvider(this.cryptoService.decrypt(org.aiApiKeyEncrypted), org.aiBaseUrl, org.aiModelFast, org.aiModelStandard);
    }

    if (org?.aiApiKeyEncrypted) {
      return new AnthropicProvider(this.cryptoService.decrypt(org.aiApiKeyEncrypted));
    }
    const platformKey = process.env.ANTHROPIC_API_KEY;
    if (!platformKey) {
      throw new Error('No AI API key configured for this organization, and no platform-wide ANTHROPIC_API_KEY is set');
    }
    return new AnthropicProvider(platformKey);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test --workspace=packages/shared -- ai-api-key-resolver.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Confirm the expected, temporary type errors in the 5 callers**

Run: `npm run test --workspace=apps/exam-runtime -- integrity-analysis.service.spec.ts code-review.service.spec.ts attempt-insight.service.spec.ts attempt-analysis.service.spec.ts`
Run: `npm run test --workspace=apps/api -- ai-question-generation.processor.spec.ts`
Expected: FAIL in all 5 — each caller passes the resolved value (now an `AiProvider` object, not a string) straight into its Claude client's `apiKey: string` parameter. This is expected and fixed in Tasks 4-8; do not fix any of the 5 callers in this task.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/crypto/ai-api-key-resolver.service.ts packages/shared/src/crypto/ai-api-key-resolver.service.spec.ts
git commit -m "feat: resolve a full AiProvider instead of a raw API key string"
```

---

### Task 4: Migrate question generation (`apps/api`)

**Files:**
- Create: `apps/api/src/jobs/processors/question-generation.client.ts`
- Create: `apps/api/src/jobs/processors/question-generation.client.spec.ts`
- Modify: `apps/api/src/jobs/processors/ai-question-generation.processor.ts`
- Modify: `apps/api/src/jobs/jobs.module.ts`
- Delete: `apps/api/src/jobs/processors/claude-question-generation.client.ts`
- Delete: `apps/api/src/jobs/processors/claude-question-generation.client.spec.ts`

**Interfaces:**
- Consumes: `AiProvider` (Task 2), `AiApiKeyResolverService.resolve(organizationId): Promise<AiProvider>` (Task 3).
- Produces: `QuestionGenerationClient.generate(topic, difficulty, questionTypes, count, aiProvider: AiProvider): Promise<GeneratedQuestion[]>` (renamed from `ClaudeQuestionGenerationClient`; same `GeneratedQuestion`/`GeneratedQuestionOption` interfaces, unchanged).

- [ ] **Step 1: Write the failing test for the renamed client**

Create `apps/api/src/jobs/processors/question-generation.client.spec.ts`:

```ts
import { QuestionGenerationClient } from './question-generation.client';
import { AiProvider } from '@exam-platform/shared';

describe('QuestionGenerationClient', () => {
  let client: QuestionGenerationClient;
  let aiProvider: { generateStructured: jest.Mock };

  beforeEach(() => {
    aiProvider = { generateStructured: jest.fn() };
    client = new QuestionGenerationClient();
  });

  it('returns the questions array from a valid structured completion', async () => {
    aiProvider.generateStructured.mockResolvedValue({
      questions: [{ type: 'single_mcq', text: 'What is 2+2?', options: [{ text: '4', isCorrect: true }, { text: '5', isCorrect: false }] }],
    });

    const result = await client.generate('Math', 'easy', ['single_mcq'], 1, aiProvider as unknown as AiProvider);

    expect(result).toEqual([{ type: 'single_mcq', text: 'What is 2+2?', options: [{ text: '4', isCorrect: true }, { text: '5', isCorrect: false }] }]);
  });

  it('requests the standard model tier with the correct tool schema and prompt content', async () => {
    aiProvider.generateStructured.mockResolvedValue({ questions: [] });

    await client.generate('Math', 'hard', ['single_mcq', 'multi_mcq'], 3, aiProvider as unknown as AiProvider);

    expect(aiProvider.generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        modelTier: 'standard',
        maxTokens: 4096,
        tool: expect.objectContaining({ name: 'report_generated_questions' }),
        prompt: expect.stringContaining('Generate 3 multiple-choice exam question(s) about "Math" at "hard" difficulty'),
      }),
    );
  });

  it('throws when the structured completion has no questions array', async () => {
    aiProvider.generateStructured.mockResolvedValue({});

    await expect(client.generate('Math', 'easy', ['single_mcq'], 1, aiProvider as unknown as AiProvider)).rejects.toThrow(
      'AI provider returned malformed generated questions',
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test --workspace=apps/api -- question-generation.client.spec.ts`
Expected: FAIL — `./question-generation.client` does not exist yet.

- [ ] **Step 3: Implement `QuestionGenerationClient`**

Create `apps/api/src/jobs/processors/question-generation.client.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { AiProvider } from '@exam-platform/shared';

export interface GeneratedQuestionOption {
  text: string;
  isCorrect: boolean;
}

export interface GeneratedQuestion {
  type: string;
  text: string;
  options: GeneratedQuestionOption[];
}

function buildGenerateQuestionsSchema(count: number) {
  return {
    type: 'object' as const,
    properties: {
      questions: {
        type: 'array',
        maxItems: count,
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['single_mcq', 'multi_mcq', 'true_false'] },
            text: { type: 'string', description: 'The question stem.' },
            options: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  text: { type: 'string' },
                  isCorrect: { type: 'boolean' },
                },
                required: ['text', 'isCorrect'],
              },
            },
          },
          required: ['type', 'text', 'options'],
        },
      },
    },
    required: ['questions'],
  };
}

@Injectable()
export class QuestionGenerationClient {
  async generate(topic: string, difficulty: string, questionTypes: string[], count: number, aiProvider: AiProvider): Promise<GeneratedQuestion[]> {
    const prompt =
      `Generate ${count} multiple-choice exam question(s) about "${topic}" at "${difficulty}" difficulty. ` +
      `Use only these question types: ${questionTypes.join(', ')}. You decide how many questions to generate ` +
      'of each type, but the total must equal the requested count.\n\n' +
      'Follow these type rules exactly:\n' +
      '- single_mcq: exactly 1 correct option, at least 2 options total.\n' +
      '- multi_mcq: at least 1 correct option, at least 2 options total.\n' +
      '- true_false: exactly 2 options, exactly 1 correct.';

    const result = await aiProvider.generateStructured({
      modelTier: 'standard',
      maxTokens: 4096,
      prompt,
      tool: {
        name: 'report_generated_questions',
        description: 'Report a set of generated multiple-choice exam questions.',
        schema: buildGenerateQuestionsSchema(count),
      },
    });

    if (!Array.isArray(result.questions)) {
      throw new Error('AI provider returned malformed generated questions');
    }
    return result.questions as GeneratedQuestion[];
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test --workspace=apps/api -- question-generation.client.spec.ts`
Expected: PASS

- [ ] **Step 5: Update the caller (`ai-question-generation.processor.ts`)**

Read the current file first. Change the import from:

```ts
import { ClaudeQuestionGenerationClient, GeneratedQuestion } from './claude-question-generation.client';
```

to:

```ts
import { QuestionGenerationClient, GeneratedQuestion } from './question-generation.client';
```

Rename the injected constructor property `claudeClient: ClaudeQuestionGenerationClient` to `questionGenerationClient: QuestionGenerationClient` (update both the constructor parameter and every reference to `this.claudeClient` in the file to `this.questionGenerationClient`).

Change the line that resolves the key:

```ts
    const apiKey = await this.aiApiKeyResolver.resolve(context.organizationId as string);
```

to:

```ts
    const aiProvider = await this.aiApiKeyResolver.resolve(context.organizationId as string);
```

Change the line that calls the client (find the `this.claudeClient.generate(...)` call, which passes `apiKey` as its last argument) to pass `aiProvider` instead, using the renamed property: `this.questionGenerationClient.generate(topic, difficulty, questionTypes, count, aiProvider)` (keep the first 4 arguments exactly as they already are in the file — only the injected-client name and the last argument change).

- [ ] **Step 6: Update `apps/api/src/jobs/processors/ai-question-generation.processor.spec.ts`**

Read the current file first. Update every mock/reference from `ClaudeQuestionGenerationClient` to `QuestionGenerationClient`, and every place the test asserts `generate` was called with a raw API key string (e.g. `'test-key'` or similar) to instead assert it was called with whatever mock `AiProvider`-shaped value the test's `AiApiKeyResolverService` mock resolves to — matching the existing mock's resolved value, just renaming what it represents (a provider object, not a string).

- [ ] **Step 7: Update the module registration**

In `apps/api/src/jobs/jobs.module.ts`, change:

```ts
import { ClaudeQuestionGenerationClient } from './processors/claude-question-generation.client';
```

to:

```ts
import { QuestionGenerationClient } from './processors/question-generation.client';
```

and change both occurrences of `ClaudeQuestionGenerationClient` in the `providers` array and the `useFactory`/`inject` wiring (if any references it — check the full file, since the AI question generation processor is injected with this client) to `QuestionGenerationClient`.

- [ ] **Step 8: Delete the old client files**

```bash
git rm apps/api/src/jobs/processors/claude-question-generation.client.ts apps/api/src/jobs/processors/claude-question-generation.client.spec.ts
```

- [ ] **Step 9: Run the tests to verify everything passes**

Run: `npm run test --workspace=apps/api -- question-generation.client.spec.ts ai-question-generation.processor.spec.ts`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/jobs
git commit -m "feat: migrate question generation to the multi-provider AI engine"
```

---

### Task 5: Migrate integrity narrative generation (`apps/exam-runtime`)

**Files:**
- Create: `apps/exam-runtime/src/integrity/integrity-narrative.client.ts`
- Create: `apps/exam-runtime/src/integrity/integrity-narrative.client.spec.ts`
- Modify: `apps/exam-runtime/src/integrity/integrity-analysis.service.ts`
- Modify: `apps/exam-runtime/src/integrity/integrity-analysis.service.spec.ts`
- Modify: `apps/exam-runtime/src/integrity/integrity.module.ts`
- Delete: `apps/exam-runtime/src/integrity/claude-integrity.client.ts`
- Delete: `apps/exam-runtime/src/integrity/claude-integrity.client.spec.ts`

**Interfaces:**
- Consumes: `AiProvider` (Task 2), `AiApiKeyResolverService.resolve` (Task 3).
- Produces: `IntegrityNarrativeClient.writeNarrative(flags, context, aiProvider: AiProvider): Promise<string>` (renamed from `ClaudeIntegrityClient`; `IntegrityNarrativeContext` interface unchanged).

- [ ] **Step 1: Write the failing test**

Create `apps/exam-runtime/src/integrity/integrity-narrative.client.spec.ts`:

```ts
import { IntegrityNarrativeClient } from './integrity-narrative.client';
import { AiProvider } from '@exam-platform/shared';
import { IntegrityFlag } from './integrity-rules';

describe('IntegrityNarrativeClient', () => {
  let client: IntegrityNarrativeClient;
  let aiProvider: { generateStructured: jest.Mock };

  beforeEach(() => {
    aiProvider = { generateStructured: jest.fn() };
    client = new IntegrityNarrativeClient();
  });

  const flags: IntegrityFlag[] = [{ type: 'large_paste', severity: 'medium', detail: 'Pasted 250 characters', questionId: 'q1' }];
  const context = { examTitle: 'Backend Engineer Exam', level: 'review' };

  it('returns the narrative from a valid structured completion', async () => {
    aiProvider.generateStructured.mockResolvedValue({ narrative: 'A large paste was detected.' });

    const result = await client.writeNarrative(flags, context, aiProvider as unknown as AiProvider);

    expect(result).toBe('A large paste was detected.');
  });

  it('requests the fast model tier with the correct tool schema', async () => {
    aiProvider.generateStructured.mockResolvedValue({ narrative: 'Nothing notable.' });

    await client.writeNarrative(flags, context, aiProvider as unknown as AiProvider);

    expect(aiProvider.generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({ modelTier: 'fast', maxTokens: 512, tool: expect.objectContaining({ name: 'report_integrity_narrative' }) }),
    );
  });

  it('throws when the structured completion is missing a narrative', async () => {
    aiProvider.generateStructured.mockResolvedValue({});

    await expect(client.writeNarrative(flags, context, aiProvider as unknown as AiProvider)).rejects.toThrow(
      'AI provider returned a malformed integrity narrative',
    );
  });

  it('throws when the narrative is empty', async () => {
    aiProvider.generateStructured.mockResolvedValue({ narrative: '   ' });

    await expect(client.writeNarrative(flags, context, aiProvider as unknown as AiProvider)).rejects.toThrow(
      'AI provider returned a malformed integrity narrative',
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test --workspace=apps/exam-runtime -- integrity-narrative.client.spec.ts`
Expected: FAIL — `./integrity-narrative.client` does not exist yet.

- [ ] **Step 3: Implement `IntegrityNarrativeClient`**

Create `apps/exam-runtime/src/integrity/integrity-narrative.client.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { AiProvider } from '@exam-platform/shared';
import { IntegrityFlag } from './integrity-rules';

export interface IntegrityNarrativeContext {
  examTitle: string;
  level: string;
}

@Injectable()
export class IntegrityNarrativeClient {
  async writeNarrative(flags: IntegrityFlag[], context: IntegrityNarrativeContext, aiProvider: AiProvider): Promise<string> {
    const prompt =
      'Write a factual, plain-language narrative (3-5 sentences) for a recruiter summarizing the integrity ' +
      `evidence found in exam "${context.examTitle}" (overall level: ${context.level}). Describe what was ` +
      'observed without accusing the candidate of cheating.\n\n' +
      `Flags:\n${JSON.stringify(flags, null, 2)}`;

    const result = await aiProvider.generateStructured({
      modelTier: 'fast',
      maxTokens: 512,
      prompt,
      tool: {
        name: 'report_integrity_narrative',
        description: 'Report a narrative summary of the integrity evidence found in a candidate exam attempt.',
        schema: {
          type: 'object',
          properties: {
            narrative: {
              type: 'string',
              description:
                'A 3-5 sentence, plain-language narrative for a recruiter describing the evidence factually, without accusing the candidate of cheating.',
            },
          },
          required: ['narrative'],
        },
      },
    });

    if (typeof result.narrative !== 'string' || result.narrative.trim() === '') {
      throw new Error('AI provider returned a malformed integrity narrative');
    }
    return result.narrative;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test --workspace=apps/exam-runtime -- integrity-narrative.client.spec.ts`
Expected: PASS

- [ ] **Step 5: Update the caller (`integrity-analysis.service.ts`)**

Read the current file first. Change the import from `ClaudeIntegrityClient` (from `./claude-integrity.client`) to `IntegrityNarrativeClient` (from `./integrity-narrative.client`). Rename the injected constructor property `claudeIntegrityClient` to `integrityNarrativeClient` (update every reference in the file). Rename the local variable `apiKey` (from `const apiKey = await this.aiApiKeyResolver.resolve(organizationId);`) to `aiProvider`, and update the call to `this.claudeIntegrityClient.writeNarrative(flags, context, apiKey)` to `this.integrityNarrativeClient.writeNarrative(flags, context, aiProvider)`.

- [ ] **Step 6: Update `integrity-analysis.service.spec.ts`**

Read the current file first. Update every mock/reference from `ClaudeIntegrityClient` to `IntegrityNarrativeClient`, matching the renamed injected property and import.

- [ ] **Step 7: Update the module registration**

In `apps/exam-runtime/src/integrity/integrity.module.ts`, change the import and the `providers` array entry from `ClaudeIntegrityClient` (from `./claude-integrity.client`) to `IntegrityNarrativeClient` (from `./integrity-narrative.client`).

- [ ] **Step 8: Delete the old client files**

```bash
git rm apps/exam-runtime/src/integrity/claude-integrity.client.ts apps/exam-runtime/src/integrity/claude-integrity.client.spec.ts
```

- [ ] **Step 9: Run the tests to verify everything passes**

Run: `npm run test --workspace=apps/exam-runtime -- integrity-narrative.client.spec.ts integrity-analysis.service.spec.ts`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add apps/exam-runtime/src/integrity
git commit -m "feat: migrate integrity narrative generation to the multi-provider AI engine"
```

---

### Task 6: Migrate code review (`apps/exam-runtime`)

**Files:**
- Create: `apps/exam-runtime/src/code-review/code-review.client.ts`
- Create: `apps/exam-runtime/src/code-review/code-review.client.spec.ts`
- Modify: `apps/exam-runtime/src/code-review/code-review.service.ts`
- Modify: `apps/exam-runtime/src/code-review/code-review.service.spec.ts`
- Modify: `apps/exam-runtime/src/code-review/code-review.module.ts`
- Delete: `apps/exam-runtime/src/code-review/claude-code-review.client.ts`
- Delete: `apps/exam-runtime/src/code-review/claude-code-review.client.spec.ts`

**Interfaces:**
- Consumes: `AiProvider` (Task 2), `AiApiKeyResolverService.resolve` (Task 3).
- Produces: `CodeReviewClient.review(input, aiProvider: AiProvider): Promise<CodeReviewResult>` (renamed from `ClaudeCodeReviewClient`; `CodeReviewInput`/`CodeReviewResult` interfaces unchanged).

- [ ] **Step 1: Write the failing test**

Create `apps/exam-runtime/src/code-review/code-review.client.spec.ts`:

```ts
import { CodeReviewClient } from './code-review.client';
import { AiProvider } from '@exam-platform/shared';

describe('CodeReviewClient', () => {
  let client: CodeReviewClient;
  let aiProvider: { generateStructured: jest.Mock };

  const input = { questionText: 'Reverse a string', starterCode: null, codeLanguage: 'python', answerText: 'def f(s): return s[::-1]', marks: 10 };

  beforeEach(() => {
    aiProvider = { generateStructured: jest.fn() };
    client = new CodeReviewClient();
  });

  it('returns the suggested marks and summary from a valid structured completion', async () => {
    aiProvider.generateStructured.mockResolvedValue({ suggestedMarks: 10, summary: 'Correct and idiomatic.' });

    const result = await client.review(input, aiProvider as unknown as AiProvider);

    expect(result).toEqual({ suggestedMarks: 10, summary: 'Correct and idiomatic.' });
  });

  it('requests the standard model tier with the correct tool schema', async () => {
    aiProvider.generateStructured.mockResolvedValue({ suggestedMarks: 5, summary: 'Partially correct.' });

    await client.review(input, aiProvider as unknown as AiProvider);

    expect(aiProvider.generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({ modelTier: 'standard', maxTokens: 512, tool: expect.objectContaining({ name: 'report_code_review' }) }),
    );
  });

  it('throws when the structured completion is malformed', async () => {
    aiProvider.generateStructured.mockResolvedValue({ suggestedMarks: 'not a number', summary: 'x' });

    await expect(client.review(input, aiProvider as unknown as AiProvider)).rejects.toThrow('AI provider returned a malformed code review');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test --workspace=apps/exam-runtime -- code-review.client.spec.ts`
Expected: FAIL — `./code-review.client` does not exist yet.

- [ ] **Step 3: Implement `CodeReviewClient`**

Create `apps/exam-runtime/src/code-review/code-review.client.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { AiProvider } from '@exam-platform/shared';

export interface CodeReviewInput {
  questionText: string;
  starterCode: string | null;
  codeLanguage: string;
  answerText: string;
  marks: number;
}

export interface CodeReviewResult {
  suggestedMarks: number;
  summary: string;
}

@Injectable()
export class CodeReviewClient {
  async review(input: CodeReviewInput, aiProvider: AiProvider): Promise<CodeReviewResult> {
    const prompt =
      `Review this candidate's code submission for a coding question worth ${input.marks} marks.\n\n` +
      `Question:\n${input.questionText}\n\n` +
      (input.starterCode ? `Starter code:\n${input.starterCode}\n\n` : '') +
      `Candidate's submission (${input.codeLanguage}):\n${input.answerText}`;

    const result = await aiProvider.generateStructured({
      modelTier: 'standard',
      maxTokens: 512,
      prompt,
      tool: {
        name: 'report_code_review',
        description: 'Report a suggested score and written critique for a candidate code submission.',
        schema: {
          type: 'object',
          properties: {
            suggestedMarks: {
              type: 'integer',
              description: "A suggested marks value between 0 and the question's total marks, based on correctness and quality.",
            },
            summary: {
              type: 'string',
              description: 'A short (2-4 sentence) critique for a recruiter, covering correctness, style, and any issues found.',
            },
          },
          required: ['suggestedMarks', 'summary'],
        },
      },
    });

    if (typeof result.suggestedMarks !== 'number' || typeof result.summary !== 'string' || result.summary.trim() === '') {
      throw new Error('AI provider returned a malformed code review');
    }
    return { suggestedMarks: result.suggestedMarks, summary: result.summary };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test --workspace=apps/exam-runtime -- code-review.client.spec.ts`
Expected: PASS

- [ ] **Step 5: Update the caller (`code-review.service.ts`)**

Read the current file first. Change the import from `ClaudeCodeReviewClient` (from `./claude-code-review.client`) to `CodeReviewClient` (from `./code-review.client`). Rename the injected constructor property `claudeCodeReviewClient` to `codeReviewClient` (update every reference). Rename the local `apiKey` variable to `aiProvider` and update the call from `this.claudeCodeReviewClient.review(input, apiKey)` to `this.codeReviewClient.review(input, aiProvider)`.

- [ ] **Step 6: Update `code-review.service.spec.ts`**

Read the current file first. Update every mock/reference from `ClaudeCodeReviewClient` to `CodeReviewClient`, matching the renamed injected property and import.

- [ ] **Step 7: Update the module registration**

In `apps/exam-runtime/src/code-review/code-review.module.ts`, change the import and `providers` array entry from `ClaudeCodeReviewClient` (from `./claude-code-review.client`) to `CodeReviewClient` (from `./code-review.client`).

- [ ] **Step 8: Delete the old client files**

```bash
git rm apps/exam-runtime/src/code-review/claude-code-review.client.ts apps/exam-runtime/src/code-review/claude-code-review.client.spec.ts
```

- [ ] **Step 9: Run the tests to verify everything passes**

Run: `npm run test --workspace=apps/exam-runtime -- code-review.client.spec.ts code-review.service.spec.ts`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add apps/exam-runtime/src/code-review
git commit -m "feat: migrate code review to the multi-provider AI engine"
```

---

### Task 7: Migrate attempt insight generation (`apps/exam-runtime`)

**Files:**
- Create: `apps/exam-runtime/src/attempt-insight/insight.client.ts`
- Create: `apps/exam-runtime/src/attempt-insight/insight.client.spec.ts`
- Modify: `apps/exam-runtime/src/attempt-insight/attempt-insight.service.ts`
- Modify: `apps/exam-runtime/src/attempt-insight/attempt-insight.service.spec.ts`
- Modify: `apps/exam-runtime/src/attempt-insight/attempt-insight.module.ts`
- Delete: `apps/exam-runtime/src/attempt-insight/claude-insight.client.ts`
- Delete: `apps/exam-runtime/src/attempt-insight/claude-insight.client.spec.ts`

**Interfaces:**
- Consumes: `AiProvider` (Task 2), `AiApiKeyResolverService.resolve` (Task 3).
- Produces: `InsightClient.generate(input, aiProvider: AiProvider): Promise<string>` (renamed from `ClaudeInsightClient`; `TopicBreakdownEntry`/`ProctoringContext`/`InsightInput` interfaces unchanged).

- [ ] **Step 1: Write the failing test**

Create `apps/exam-runtime/src/attempt-insight/insight.client.spec.ts`:

```ts
import { InsightClient } from './insight.client';
import { AiProvider } from '@exam-platform/shared';

describe('InsightClient', () => {
  let client: InsightClient;
  let aiProvider: { generateStructured: jest.Mock };

  const input = { percentage: 80, passFail: 'pass', topicBreakdown: [{ topic: 'Arrays', correct: 4, total: 5 }], proctoring: null };

  beforeEach(() => {
    aiProvider = { generateStructured: jest.fn() };
    client = new InsightClient();
  });

  it('returns the summary from a valid structured completion', async () => {
    aiProvider.generateStructured.mockResolvedValue({ summary: 'Strong performance overall.' });

    const result = await client.generate(input, aiProvider as unknown as AiProvider);

    expect(result).toBe('Strong performance overall.');
  });

  it('requests the standard model tier with the correct tool schema', async () => {
    aiProvider.generateStructured.mockResolvedValue({ summary: 'x' });

    await client.generate(input, aiProvider as unknown as AiProvider);

    expect(aiProvider.generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({ modelTier: 'standard', maxTokens: 512, tool: expect.objectContaining({ name: 'report_insight' }) }),
    );
  });

  it('throws when the structured completion is missing a summary', async () => {
    aiProvider.generateStructured.mockResolvedValue({});

    await expect(client.generate(input, aiProvider as unknown as AiProvider)).rejects.toThrow('AI provider returned a malformed insight summary');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test --workspace=apps/exam-runtime -- insight.client.spec.ts`
Expected: FAIL — `./insight.client` does not exist yet.

- [ ] **Step 3: Implement `InsightClient`**

Create `apps/exam-runtime/src/attempt-insight/insight.client.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { AiProvider } from '@exam-platform/shared';

export interface TopicBreakdownEntry {
  topic: string;
  correct: number;
  total: number;
}

export interface ProctoringContext {
  riskLevel: string;
  summary: string;
}

export interface InsightInput {
  percentage: number;
  passFail: string;
  topicBreakdown: TopicBreakdownEntry[];
  proctoring: ProctoringContext | null;
}

@Injectable()
export class InsightClient {
  async generate(input: InsightInput, aiProvider: AiProvider): Promise<string> {
    const proctoringLine = input.proctoring
      ? `\n\nProctoring risk assessment: ${input.proctoring.riskLevel} risk. ${input.proctoring.summary}`
      : '';
    const prompt =
      "Write a short evaluation summary for a recruiter reviewing this candidate's exam attempt. " +
      `Overall result: ${input.percentage}% (${input.passFail}).\n\n` +
      `Per-topic performance:\n${JSON.stringify(input.topicBreakdown, null, 2)}${proctoringLine}`;

    const result = await aiProvider.generateStructured({
      modelTier: 'standard',
      maxTokens: 512,
      prompt,
      tool: {
        name: 'report_insight',
        description: 'Report a narrative evaluation summary for a candidate exam attempt.',
        schema: {
          type: 'object',
          properties: {
            summary: {
              type: 'string',
              description:
                'A short (2-4 sentence) human-readable evaluation summary for a recruiter, covering topic strengths/weaknesses and, if present, proctoring signals.',
            },
          },
          required: ['summary'],
        },
      },
    });

    if (typeof result.summary !== 'string' || result.summary.trim() === '') {
      throw new Error('AI provider returned a malformed insight summary');
    }
    return result.summary;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test --workspace=apps/exam-runtime -- insight.client.spec.ts`
Expected: PASS

- [ ] **Step 5: Update the caller (`attempt-insight.service.ts`)**

Read the current file first. Change the import from `ClaudeInsightClient` (from `./claude-insight.client`) to `InsightClient` (from `./insight.client`) — keep the `TopicBreakdownEntry` import pointing at the new file too, since it now lives in `insight.client.ts`. Rename the injected constructor property `claudeInsightClient` to `insightClient` (update every reference). Rename the local `apiKey` variable to `aiProvider` and update the call from `this.claudeInsightClient.generate(input, apiKey)` to `this.insightClient.generate(input, aiProvider)`.

- [ ] **Step 6: Update `attempt-insight.service.spec.ts`**

Read the current file first. Update every mock/reference from `ClaudeInsightClient` to `InsightClient`, matching the renamed injected property and import.

- [ ] **Step 7: Update the module registration**

In `apps/exam-runtime/src/attempt-insight/attempt-insight.module.ts`, change the import and `providers` array entry from `ClaudeInsightClient` (from `./claude-insight.client`) to `InsightClient` (from `./insight.client`).

- [ ] **Step 8: Delete the old client files**

```bash
git rm apps/exam-runtime/src/attempt-insight/claude-insight.client.ts apps/exam-runtime/src/attempt-insight/claude-insight.client.spec.ts
```

- [ ] **Step 9: Run the tests to verify everything passes**

Run: `npm run test --workspace=apps/exam-runtime -- insight.client.spec.ts attempt-insight.service.spec.ts`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add apps/exam-runtime/src/attempt-insight
git commit -m "feat: migrate attempt insight generation to the multi-provider AI engine"
```

---

### Task 8: Migrate proctoring risk assessment (`apps/exam-runtime`)

**Files:**
- Create: `apps/exam-runtime/src/proctoring-analysis/proctoring-risk.client.ts`
- Create: `apps/exam-runtime/src/proctoring-analysis/proctoring-risk.client.spec.ts`
- Modify: `apps/exam-runtime/src/proctoring-analysis/attempt-analysis.service.ts`
- Modify: `apps/exam-runtime/src/proctoring-analysis/attempt-analysis.service.spec.ts`
- Modify: `apps/exam-runtime/src/proctoring-analysis/proctoring-analysis.module.ts`
- Delete: `apps/exam-runtime/src/proctoring-analysis/claude-proctoring.client.ts`
- Delete: `apps/exam-runtime/src/proctoring-analysis/claude-proctoring.client.spec.ts`

**Interfaces:**
- Consumes: `AiProvider` (Task 2), `AiApiKeyResolverService.resolve` (Task 3).
- Produces: `ProctoringRiskClient.assessRisk(events, aiProvider: AiProvider): Promise<RiskAssessment>` (renamed from `ClaudeProctoringClient`; `ProctoringTimelineEvent`/`RiskAssessment` interfaces unchanged).

- [ ] **Step 1: Write the failing test**

Create `apps/exam-runtime/src/proctoring-analysis/proctoring-risk.client.spec.ts`:

```ts
import { ProctoringRiskClient } from './proctoring-risk.client';
import { AiProvider } from '@exam-platform/shared';

describe('ProctoringRiskClient', () => {
  let client: ProctoringRiskClient;
  let aiProvider: { generateStructured: jest.Mock };

  const events = [{ eventType: 'tab_switch', severity: 'medium', elapsedSeconds: 120 }];

  beforeEach(() => {
    aiProvider = { generateStructured: jest.fn() };
    client = new ProctoringRiskClient();
  });

  it('returns the risk level and summary from a valid structured completion', async () => {
    aiProvider.generateStructured.mockResolvedValue({ riskLevel: 'medium', summary: 'One tab switch observed.' });

    const result = await client.assessRisk(events, aiProvider as unknown as AiProvider);

    expect(result).toEqual({ riskLevel: 'medium', summary: 'One tab switch observed.' });
  });

  it('requests the fast model tier with the correct tool schema', async () => {
    aiProvider.generateStructured.mockResolvedValue({ riskLevel: 'low', summary: 'x' });

    await client.assessRisk(events, aiProvider as unknown as AiProvider);

    expect(aiProvider.generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({ modelTier: 'fast', maxTokens: 512, tool: expect.objectContaining({ name: 'report_risk_assessment' }) }),
    );
  });

  it('throws when the risk level is not one of low/medium/high', async () => {
    aiProvider.generateStructured.mockResolvedValue({ riskLevel: 'extreme', summary: 'x' });

    await expect(client.assessRisk(events, aiProvider as unknown as AiProvider)).rejects.toThrow('AI provider returned a malformed risk assessment');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test --workspace=apps/exam-runtime -- proctoring-risk.client.spec.ts`
Expected: FAIL — `./proctoring-risk.client` does not exist yet.

- [ ] **Step 3: Implement `ProctoringRiskClient`**

Create `apps/exam-runtime/src/proctoring-analysis/proctoring-risk.client.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { AiProvider } from '@exam-platform/shared';

export interface ProctoringTimelineEvent {
  eventType: string;
  severity: string;
  elapsedSeconds: number;
}

export interface RiskAssessment {
  riskLevel: 'low' | 'medium' | 'high';
  summary: string;
}

const VALID_RISK_LEVELS = ['low', 'medium', 'high'];

@Injectable()
export class ProctoringRiskClient {
  async assessRisk(events: ProctoringTimelineEvent[], aiProvider: AiProvider): Promise<RiskAssessment> {
    const prompt =
      'Analyze this exam attempt\'s proctoring event timeline and assess cheating risk. ' +
      'Consider event severity, frequency, and clustering in time.\n\n' +
      `Events (chronological, seconds elapsed since attempt start):\n${JSON.stringify(events, null, 2)}`;

    const result = await aiProvider.generateStructured({
      modelTier: 'fast',
      maxTokens: 512,
      prompt,
      tool: {
        name: 'report_risk_assessment',
        description: 'Report a risk assessment for a candidate exam attempt based on its proctoring event timeline.',
        schema: {
          type: 'object',
          properties: {
            riskLevel: { type: 'string', enum: ['low', 'medium', 'high'] },
            summary: { type: 'string', description: 'A short (1-2 sentence) human-readable explanation for a recruiter.' },
          },
          required: ['riskLevel', 'summary'],
        },
      },
    });

    if (!VALID_RISK_LEVELS.includes(result.riskLevel as string) || typeof result.summary !== 'string' || result.summary.trim() === '') {
      throw new Error('AI provider returned a malformed risk assessment');
    }
    return { riskLevel: result.riskLevel as RiskAssessment['riskLevel'], summary: result.summary };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test --workspace=apps/exam-runtime -- proctoring-risk.client.spec.ts`
Expected: PASS

- [ ] **Step 5: Update the caller (`attempt-analysis.service.ts`)**

Read the current file first. Change the import from `ClaudeProctoringClient` (from `./claude-proctoring.client`) to `ProctoringRiskClient` (from `./proctoring-risk.client`). Rename the injected constructor property `claudeProctoringClient` to `proctoringRiskClient` (update every reference). Rename the local `apiKey` variable to `aiProvider` and update the call from `this.claudeProctoringClient.assessRisk(events, apiKey)` to `this.proctoringRiskClient.assessRisk(events, aiProvider)`.

- [ ] **Step 6: Update `attempt-analysis.service.spec.ts`**

Read the current file first. Update every mock/reference from `ClaudeProctoringClient` to `ProctoringRiskClient`, matching the renamed injected property and import.

- [ ] **Step 7: Update the module registration**

In `apps/exam-runtime/src/proctoring-analysis/proctoring-analysis.module.ts`, change the import and `providers` array entry from `ClaudeProctoringClient` (from `./claude-proctoring.client`) to `ProctoringRiskClient` (from `./proctoring-risk.client`).

- [ ] **Step 8: Delete the old client files**

```bash
git rm apps/exam-runtime/src/proctoring-analysis/claude-proctoring.client.ts apps/exam-runtime/src/proctoring-analysis/claude-proctoring.client.spec.ts
```

- [ ] **Step 9: Run the full exam-runtime test suite to confirm all 5 migrations are consistent**

Run: `npm run test:exam-runtime`
Expected: PASS (all suites)

- [ ] **Step 10: Commit**

```bash
git add apps/exam-runtime/src/proctoring-analysis
git commit -m "feat: migrate proctoring risk assessment to the multi-provider AI engine"
```

---

### Task 9: Org settings — provider-aware save validation and `getIntegrations` response

**Files:**
- Modify: `apps/api/src/organizations/dto/update-ai-key.dto.ts`
- Modify: `apps/api/src/organizations/organizations.service.ts`
- Modify: `apps/api/src/organizations/organizations.service.spec.ts`

**Interfaces:**
- Consumes: `AiProvider`, `AnthropicProvider`, `OpenAiCompatibleProvider` (Task 2).
- Produces: `IntegrationsResponse` (backend, in `organizations.service.ts`) gains `aiProvider: string`, `aiBaseUrl: string | null`, `aiModelFast: string | null`, `aiModelStandard: string | null`. `updateAiKey`'s DTO gains `provider`/`baseUrl`/`modelFast`/`modelStandard`.

- [ ] **Step 1: Write the failing/updated tests**

Read `apps/api/src/organizations/organizations.service.spec.ts`'s current `updateAiKey` describe block first (search for `describe('updateAiKey'`). Replace it with:

```ts
  describe('updateAiKey', () => {
    it('validates an Anthropic key via a real minimal ping, then encrypts and persists on success', async () => {
      const dto = { provider: 'anthropic' as const, apiKey: 'sk-ant-customer-key' };
      mockAnthropicCreate.mockResolvedValue({ content: [] });
      cryptoService.encrypt.mockReturnValue('encrypted-key-blob');
      prisma.organization.update.mockResolvedValue({});

      const result = await service.updateAiKey({ organizationId: 'org-1', isSuperAdmin: false }, 'user-1', dto);

      expect(mockAnthropicCreate).toHaveBeenCalledWith(
        expect.objectContaining({ max_tokens: 1, messages: [{ role: 'user', content: 'Hi' }] }),
      );
      expect(cryptoService.encrypt).toHaveBeenCalledWith('sk-ant-customer-key');
      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { aiProvider: 'anthropic', aiApiKeyEncrypted: 'encrypted-key-blob', aiBaseUrl: null, aiModelFast: null, aiModelStandard: null },
      });
      expect(audit.record).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: false },
        { actorUserId: 'user-1', action: 'organization.ai_key_configured', entityType: 'organization', entityId: 'org-1' },
      );
      expect(result).toEqual({ aiKeyConfigured: true });
    });

    it('validates and persists an openai-compatible provider with its base URL and model names', async () => {
      const dto = {
        provider: 'openai-compatible' as const,
        apiKey: 'azure-key',
        baseUrl: 'https://example.openai.azure.com/openai/v1',
        modelFast: 'gpt-fast',
        modelStandard: 'gpt-standard',
      };
      mockOpenAiCreate.mockResolvedValue({ choices: [{ message: {} }] });
      cryptoService.encrypt.mockReturnValue('encrypted-key-blob');
      prisma.organization.update.mockResolvedValue({});

      const result = await service.updateAiKey({ organizationId: 'org-1', isSuperAdmin: false }, 'user-1', dto);

      expect(mockOpenAiCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gpt-fast', max_tokens: 1, messages: [{ role: 'user', content: 'Hi' }] }),
      );
      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: {
          aiProvider: 'openai-compatible',
          aiApiKeyEncrypted: 'encrypted-key-blob',
          aiBaseUrl: 'https://example.openai.azure.com/openai/v1',
          aiModelFast: 'gpt-fast',
          aiModelStandard: 'gpt-standard',
        },
      });
      expect(result).toEqual({ aiKeyConfigured: true });
    });

    it('rejects with BadRequestException and persists nothing when the ping fails', async () => {
      const dto = { provider: 'anthropic' as const, apiKey: 'sk-ant-customer-key' };
      mockAnthropicCreate.mockRejectedValue(new Error('authentication_error'));

      await expect(
        service.updateAiKey({ organizationId: 'org-1', isSuperAdmin: false }, 'user-1', dto),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.organization.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the caller has no organization context', async () => {
      const dto = { provider: 'anthropic' as const, apiKey: 'sk-ant-customer-key' };
      await expect(
        service.updateAiKey({ organizationId: null, isSuperAdmin: true }, 'user-1', dto),
      ).rejects.toThrow(BadRequestException);
      expect(mockAnthropicCreate).not.toHaveBeenCalled();
    });
  });
```

This test file already has a `mockAnthropicCreate` set up for the pre-existing Anthropic-mocking pattern (search the file's top for how `Anthropic` is mocked) — add an equivalent `mockOpenAiCreate` following the exact same mocking pattern, but for `jest.mock('openai')` / the `OpenAI` import, matching how `mockAnthropicCreate` is already declared and reset in this file's `beforeEach`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test --workspace=apps/api -- organizations.service.spec.ts`
Expected: FAIL — `updateAiKey` doesn't yet accept a `provider` field or persist the 3 new columns.

- [ ] **Step 3: Update `UpdateAiKeyDto`**

Replace the full contents of `apps/api/src/organizations/dto/update-ai-key.dto.ts`:

```ts
import { IsIn, IsString, MinLength, ValidateIf } from 'class-validator';

export class UpdateAiKeyDto {
  @IsIn(['anthropic', 'openai-compatible'])
  provider!: 'anthropic' | 'openai-compatible';

  @IsString()
  @MinLength(1)
  apiKey!: string;

  @ValidateIf((dto) => dto.provider === 'openai-compatible')
  @IsString()
  @MinLength(1)
  baseUrl?: string;

  @ValidateIf((dto) => dto.provider === 'openai-compatible')
  @IsString()
  @MinLength(1)
  modelFast?: string;

  @ValidateIf((dto) => dto.provider === 'openai-compatible')
  @IsString()
  @MinLength(1)
  modelStandard?: string;
}
```

- [ ] **Step 4: Update `organizations.service.ts`**

Replace the `import Anthropic from '@anthropic-ai/sdk';` line with:

```ts
import { AiProvider, AnthropicProvider, OpenAiCompatibleProvider } from '@exam-platform/shared';
```

(This import joins the file's existing `@exam-platform/shared` imports — do not duplicate the import statement if the file already has one; add these named exports to it instead.)

Widen the `IntegrationsResponse` interface:

```ts
export interface IntegrationsResponse {
  smtpConfigured: boolean;
  aiKeyConfigured: boolean;
  aiProvider: string;
  aiBaseUrl: string | null;
  aiModelFast: string | null;
  aiModelStandard: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  emailFromAddress: string | null;
  apiKeyConfigured: boolean;
  apiKeyPrefix: string | null;
  apiKeyCreatedAt: Date | null;
  webhookConfigured: boolean;
  webhookUrl: string | null;
}
```

In `getIntegrations`, widen the `select` and the returned object:

```ts
  async getIntegrations(context: TenantContext): Promise<IntegrationsResponse> {
    const organizationId = this.requireOrganizationId(context);
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        smtpHost: true, smtpPort: true, emailFromAddress: true, aiApiKeyEncrypted: true, smtpPasswordEncrypted: true,
        aiProvider: true, aiBaseUrl: true, aiModelFast: true, aiModelStandard: true,
        apiKeyHash: true, apiKeyPrefix: true, apiKeyCreatedAt: true, webhookUrl: true,
      },
    });
    return {
      smtpConfigured: Boolean(org?.smtpPasswordEncrypted),
      aiKeyConfigured: Boolean(org?.aiApiKeyEncrypted),
      aiProvider: org?.aiProvider ?? 'anthropic',
      aiBaseUrl: org?.aiBaseUrl ?? null,
      aiModelFast: org?.aiModelFast ?? null,
      aiModelStandard: org?.aiModelStandard ?? null,
      smtpHost: org?.smtpHost ?? null,
      smtpPort: org?.smtpPort ?? null,
      emailFromAddress: org?.emailFromAddress ?? null,
      apiKeyConfigured: org?.apiKeyHash !== null && org?.apiKeyHash !== undefined,
      apiKeyPrefix: org?.apiKeyPrefix ?? null,
      apiKeyCreatedAt: org?.apiKeyCreatedAt ?? null,
      webhookConfigured: org?.webhookUrl !== null && org?.webhookUrl !== undefined,
      webhookUrl: org?.webhookUrl ?? null,
    };
  }
```

Replace the full body of `updateAiKey`:

```ts
  async updateAiKey(context: TenantContext, actorUserId: string, dto: UpdateAiKeyDto): Promise<{ aiKeyConfigured: boolean }> {
    const organizationId = this.requireOrganizationId(context);

    const provider: AiProvider =
      dto.provider === 'openai-compatible'
        ? new OpenAiCompatibleProvider(dto.apiKey, dto.baseUrl as string, dto.modelFast as string, dto.modelStandard as string)
        : new AnthropicProvider(dto.apiKey);

    try {
      await provider.ping();
    } catch (error) {
      throw new BadRequestException(`That API key was rejected: ${(error as Error).message}`);
    }

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        aiProvider: dto.provider,
        aiApiKeyEncrypted: this.cryptoService.encrypt(dto.apiKey),
        aiBaseUrl: dto.provider === 'openai-compatible' ? (dto.baseUrl as string) : null,
        aiModelFast: dto.provider === 'openai-compatible' ? (dto.modelFast as string) : null,
        aiModelStandard: dto.provider === 'openai-compatible' ? (dto.modelStandard as string) : null,
      },
    });
    await this.audit.record(context, {
      actorUserId,
      action: 'organization.ai_key_configured',
      entityType: 'organization',
      entityId: organizationId,
    });
    return { aiKeyConfigured: true };
  }
```

- [ ] **Step 5: Update the other `getIntegrations`/`updateAiKey` tests in the same file**

Search this spec file for every other test whose mocked `prisma.organization.findUnique` return value doesn't include `aiProvider`/`aiBaseUrl`/`aiModelFast`/`aiModelStandard` but whose test DOES assert the full `getIntegrations()` return value with `toEqual` (not `toMatchObject`) — add `aiProvider: 'anthropic', aiBaseUrl: null, aiModelFast: null, aiModelStandard: null` to both the mocked resolved value and the expected result object in each such test, so the `toEqual` comparison still matches exactly.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test --workspace=apps/api -- organizations.service.spec.ts`
Expected: PASS

- [ ] **Step 7: Run the full backend suite to confirm no regressions**

Run: `npm run test:api`
Expected: PASS (all suites)

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/organizations
git commit -m "feat: provider-aware AI key validation and integrations response"
```

---

### Task 10: Org-admin settings UI — provider selection

**Files:**
- Modify: `apps/web/lib/types.ts`
- Modify: `apps/web/lib/hooks/useIntegrations.ts`
- Modify: `apps/web/app/(org-admin)/settings/integrations/page.tsx`
- Modify: `apps/web/app/(org-admin)/settings/integrations/page.test.tsx`

**Interfaces:**
- Consumes: `IntegrationsResponse` (Task 9, mirrored on the frontend).
- Produces: `useUpdateAiKey()`'s mutation input widens to accept the full DTO shape.

- [ ] **Step 1: Widen `IntegrationsResponse` in `apps/web/lib/types.ts`**

Replace:

```ts
export interface IntegrationsResponse {
  smtpConfigured: boolean;
  aiKeyConfigured: boolean;
  smtpHost: string | null;
  smtpPort: number | null;
  emailFromAddress: string | null;
  apiKeyConfigured: boolean;
  apiKeyPrefix: string | null;
  apiKeyCreatedAt: string | null;
  webhookConfigured: boolean;
  webhookUrl: string | null;
}
```

with:

```ts
export interface IntegrationsResponse {
  smtpConfigured: boolean;
  aiKeyConfigured: boolean;
  aiProvider: 'anthropic' | 'openai-compatible';
  aiBaseUrl: string | null;
  aiModelFast: string | null;
  aiModelStandard: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  emailFromAddress: string | null;
  apiKeyConfigured: boolean;
  apiKeyPrefix: string | null;
  apiKeyCreatedAt: string | null;
  webhookConfigured: boolean;
  webhookUrl: string | null;
}
```

- [ ] **Step 2: Widen `useUpdateAiKey` in `apps/web/lib/hooks/useIntegrations.ts`**

Replace:

```ts
export function useUpdateAiKey() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (apiKey: string): Promise<{ aiKeyConfigured: boolean }> =>
      apiFetch('/organizations/integrations/ai-key', { method: 'PATCH', body: JSON.stringify({ apiKey }) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['integrations'] }),
  });
}
```

with:

```ts
interface UpdateAiKeyInput {
  provider: 'anthropic' | 'openai-compatible';
  apiKey: string;
  baseUrl?: string;
  modelFast?: string;
  modelStandard?: string;
}

export function useUpdateAiKey() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateAiKeyInput): Promise<{ aiKeyConfigured: boolean }> =>
      apiFetch('/organizations/integrations/ai-key', { method: 'PATCH', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['integrations'] }),
  });
}
```

- [ ] **Step 3: Write the failing page tests**

Read `apps/web/app/(org-admin)/settings/integrations/page.test.tsx`'s current mocked `/organizations/integrations` response shape and the existing AI-key tests first. Add `aiProvider: 'anthropic', aiBaseUrl: null, aiModelFast: null, aiModelStandard: null` to every mocked `/organizations/integrations` response object in the file (matching the widened `IntegrationsResponse`).

Add these new tests after the existing `'shows an inline error when saving the AI key fails validation'` test:

```tsx
  it('shows only the API key field for the Anthropic provider by default', async () => {
    renderPage();
    await screen.findByLabelText('AI API key');

    expect(screen.queryByLabelText('Base URL')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Fast-tier model/deployment name')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Standard-tier model/deployment name')).not.toBeInTheDocument();
  });

  it('shows base URL and model fields when OpenAI-compatible is selected, and submits them together', async () => {
    renderPage();
    await screen.findByLabelText('AI provider');

    fireEvent.click(screen.getByLabelText('AI provider'));
    fireEvent.click(await screen.findByText('OpenAI-compatible'));

    expect(await screen.findByLabelText('Base URL')).toBeInTheDocument();
    expect(screen.getByLabelText('Fast-tier model/deployment name')).toBeInTheDocument();
    expect(screen.getByLabelText('Standard-tier model/deployment name')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('AI API key'), { target: { value: 'azure-key' } });
    fireEvent.change(screen.getByLabelText('Base URL'), { target: { value: 'https://example.openai.azure.com/openai/v1' } });
    fireEvent.change(screen.getByLabelText('Fast-tier model/deployment name'), { target: { value: 'gpt-fast' } });
    fireEvent.change(screen.getByLabelText('Standard-tier model/deployment name'), { target: { value: 'gpt-standard' } });
    mockedApiFetch.mockResolvedValueOnce({ aiKeyConfigured: true });
    fireEvent.click(screen.getByRole('button', { name: 'Save AI API key' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/organizations/integrations/ai-key',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            provider: 'openai-compatible',
            apiKey: 'azure-key',
            baseUrl: 'https://example.openai.azure.com/openai/v1',
            modelFast: 'gpt-fast',
            modelStandard: 'gpt-standard',
          }),
        }),
        undefined,
      ),
    );
  });
```

(These reuse the file's existing `renderPage`/`mockedApiFetch`/`waitFor` helpers — check the file's top for their exact existing setup and match its conventions; do not redefine them.)

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx jest "settings/integrations/page.test.tsx"` from `apps/web`
Expected: FAIL — the page has no provider select or conditional fields yet.

- [ ] **Step 5: Update the AI API key card in `page.tsx`**

Add `Select` and `SelectOption` to the existing UI import (`import { Input, Button, Card, CardGrid, useToast } from '../../../../components/ui';` becomes `import { Input, Button, Card, CardGrid, Select, type SelectOption, useToast } from '../../../../components/ui';`).

Add this constant near the top of the file, after the imports:

```ts
const AI_PROVIDER_OPTIONS: SelectOption[] = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai-compatible', label: 'OpenAI-compatible' },
];
```

Replace the AI key state declarations:

```ts
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiKeyError, setAiKeyError] = useState<string | null>(null);
```

with:

```ts
  const [aiProvider, setAiProvider] = useState<'anthropic' | 'openai-compatible'>('anthropic');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiBaseUrl, setAiBaseUrl] = useState('');
  const [aiModelFast, setAiModelFast] = useState('');
  const [aiModelStandard, setAiModelStandard] = useState('');
  const [aiKeyError, setAiKeyError] = useState<string | null>(null);
```

Replace `handleAiKeySubmit`:

```ts
  function handleAiKeySubmit(e: React.FormEvent) {
    e.preventDefault();
    setAiKeyError(null);
    updateAiKey.mutate(
      aiProvider === 'openai-compatible'
        ? { provider: aiProvider, apiKey: aiApiKey, baseUrl: aiBaseUrl, modelFast: aiModelFast, modelStandard: aiModelStandard }
        : { provider: aiProvider, apiKey: aiApiKey },
      {
        onSuccess: () => {
          toast('AI API key saved.');
          setAiApiKey('');
          setAiBaseUrl('');
          setAiModelFast('');
          setAiModelStandard('');
        },
        onError: (err) => setAiKeyError(err instanceof Error ? err.message : 'Failed to save AI API key'),
      },
    );
  }
```

Replace the AI API key `<Card>` JSX:

```tsx
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05, ease: 'easeOut' }}>
        <Card className="max-w-md">
          <h2 className="mb-1 text-lg font-semibold text-recruiter-text">AI API key</h2>
          <p className="mb-4 text-sm text-recruiter-text-secondary">
            {integrations?.aiKeyConfigured
              ? `Configured — AI features use this organization's ${integrations.aiProvider === 'openai-compatible' ? 'Azure OpenAI / OpenAI-compatible' : 'Anthropic'} endpoint.`
              : 'Not configured — AI features currently use the platform default key.'}
          </p>
          <form onSubmit={handleAiKeySubmit} className="flex flex-col gap-3">
            <Select label="AI provider" value={aiProvider} onChange={(value) => setAiProvider(value as 'anthropic' | 'openai-compatible')} options={AI_PROVIDER_OPTIONS} />
            <Input label="AI API key" type="password" value={aiApiKey} onChange={setAiApiKey} required />
            {aiProvider === 'openai-compatible' && (
              <>
                <Input label="Base URL" value={aiBaseUrl} onChange={setAiBaseUrl} required placeholder="https://your-resource.openai.azure.com/openai/v1" />
                <Input label="Fast-tier model/deployment name" value={aiModelFast} onChange={setAiModelFast} required />
                <Input label="Standard-tier model/deployment name" value={aiModelStandard} onChange={setAiModelStandard} required />
              </>
            )}
            <Button type="submit" loading={updateAiKey.isPending}>
              {integrations?.aiKeyConfigured ? 'Replace AI API key' : 'Save AI API key'}
            </Button>
          </form>
          {aiKeyError && (
            <p role="alert" className="mt-3 text-sm text-status-danger">
              {aiKeyError}
            </p>
          )}
        </Card>
      </motion.div>
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx jest "settings/integrations/page.test.tsx"` from `apps/web`
Expected: PASS

- [ ] **Step 7: Run the full frontend suite and typecheck to confirm no regressions**

Run: `npx jest` from `apps/web`
Expected: PASS

Run: `npx tsc --noEmit -p tsconfig.json` from `apps/web`
Expected: 0 new errors (only the same pre-existing unrelated baseline)

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/types.ts apps/web/lib/hooks/useIntegrations.ts "apps/web/app/(org-admin)/settings/integrations/page.tsx" "apps/web/app/(org-admin)/settings/integrations/page.test.tsx"
git commit -m "feat: add AI provider selection to org-admin integrations settings"
```

---

## Self-Review Notes

- **Spec coverage:** Provider model (`'anthropic' | 'openai-compatible'`) → Task 1 (schema) + Task 3 (resolver) + Task 9 (DTO). Shared engine (`AiProvider`, both implementations) → Task 2. Migrating all 5 call sites in one pass → Tasks 4-8. Org-admin settings UI (provider select + conditional fields) → Task 10. Testing (each client mocks `AiProvider` directly, provider-specific unit tests, settings page toggle test) → covered in every task's own steps. Zero-config unchanged behavior for existing orgs → Task 1's default + Task 3's `org?.aiProvider === 'openai-compatible'` check (falsy/null/undefined falls through to the existing Anthropic-or-platform-key path, byte-identical to today).
- **Type consistency check:** `AiProvider`/`StructuredCompletionRequest`/`StructuredCompletionTool` (Task 2) are used identically by `AnthropicProvider`, `OpenAiCompatibleProvider` (Task 2), `AiApiKeyResolverService.resolve` (Task 3), and all 5 migrated clients (Tasks 4-8). Every migrated client's method signature ends with `aiProvider: AiProvider` in place of the old `apiKey: string`, and every caller service renames its local resolved variable from `apiKey` to `aiProvider` consistently. `IntegrationsResponse` widens identically on both backend (Task 9) and frontend (Task 10) with the same 4 new field names and types (`Date | null` vs `string | null` for `aiModelFast`/`aiModelStandard`/`aiBaseUrl` — actually both are `string | null` on both sides, only `apiKeyCreatedAt` differs by `Date`/`string` per existing convention).
- **Placeholder scan:** no task contains "TBD"/"similar to Task N"/unshown code — every step has complete, copy-pasteable code. Steps that say "read the current file first" (for caller-service updates) are paired with the exact before/after lines to change, not vague instructions.
