# Multi-Provider AI Configuration — Design

## Goal

Let an organization configure any OpenAI-compatible AI provider (Azure OpenAI, OpenAI, Groq, Together.ai, a self-hosted endpoint, etc.) for this platform's 5 AI-backed features, instead of being hardcoded to Anthropic. An org that configures nothing keeps today's exact behavior (platform Anthropic key, hardcoded models) with zero changes required.

## Current State

Every AI-backed feature in this codebase talks to Anthropic directly, via 5 independent, near-identical client classes:

| Client | App | Model tier used today | Purpose |
|---|---|---|---|
| `ClaudeQuestionGenerationClient` | `apps/api` | `claude-sonnet-5` | AI-generated exam questions |
| `ClaudeIntegrityClient` | `apps/exam-runtime` | `claude-haiku-4-5-20251001` | Integrity-flag narrative for recruiters |
| `ClaudeCodeReviewClient` | `apps/exam-runtime` | `claude-sonnet-5` | AI code-answer review/scoring suggestion |
| `ClaudeInsightClient` | `apps/exam-runtime` | `claude-sonnet-5` | Attempt evaluation summary |
| `ClaudeProctoringClient` | `apps/exam-runtime` | `claude-haiku-4-5-20251001` | Proctoring-timeline risk assessment |

Each one independently does the exact same sequence: `new Anthropic({ apiKey })` → `client.messages.create({ model, max_tokens, tools: [oneToolSchema], tool_choice: {type:'tool', name}, messages: [{role:'user', content: promptString}] })` → find the `tool_use` content block → validate/parse its `input` → return. The only per-client variation is the model tier, the tool's JSON Schema, the prompt text, and the result validation.

`Organization.aiApiKeyEncrypted` is the only AI-related config field that exists today — no provider type, no base URL, no model/deployment name. A per-org key, when present, is decrypted and passed as the Anthropic `apiKey` to whichever client is calling; when absent, a platform-wide `ANTHROPIC_API_KEY` environment variable is used instead. The org-admin settings page (`apps/web/app/(org-admin)/settings/integrations/page.tsx`) exposes this as a single password field with Anthropic-specific status copy.

This was triggered by a user attempting to configure a real Azure AI Foundry / Azure OpenAI resource — which cannot work today, since the code has no concept of a custom base URL or of OpenAI's function-calling response shape.

## Scope

Both backend apps (`apps/api`, `apps/exam-runtime`) and the org-admin settings UI (`apps/web`). All 5 existing AI call sites are migrated to the new abstraction in one pass (not an incremental per-feature rollout) — confirmed explicitly, since all 5 share the identical request/response shape, and a partially-migrated state would mean some AI features silently ignore an org's configured provider while others respect it.

## Design

### 1. Provider model and org configuration

Provider is one of exactly two types: `'anthropic' | 'openai-compatible'`. `'openai-compatible'` is deliberately generic rather than one named type per vendor (Azure OpenAI, OpenAI, Groq, etc. all speak the same request/response shape) — a new vendor never requires a code change, only different config values from the org.

`Organization` gains 4 new nullable columns:
- `aiProvider` (`'anthropic' | 'openai-compatible'`, defaults to `'anthropic'`) — every existing org keeps today's behavior unchanged.
- `aiBaseUrl` — only meaningful when `aiProvider = 'openai-compatible'` (e.g. `https://ptc-vss-sf-interview-foundry.openai.azure.com/openai/v1`).
- `aiModelFast` / `aiModelStandard` — the two model tiers the 5 features actually use (see table above). For `aiProvider = 'anthropic'` these columns are ignored; the hardcoded Anthropic defaults (`claude-haiku-4-5-20251001` / `claude-sonnet-5`) are always used, since there's no need for an org on Anthropic to override them. For `aiProvider = 'openai-compatible'`, both are required — there is no universal default deployment/model name across arbitrary providers.

Auth is always a Bearer token (`Authorization: Bearer <key>`), matching both the Anthropic SDK's default and the standard OpenAI SDK / Azure's newer unified `v1` API — no per-provider auth-style configuration needed.

Platform-wide fallback exists only for `anthropic` (mirroring today's `ANTHROPIC_API_KEY` env var) — an org with no AI config at all still gets today's exact behavior. There is no platform-wide fallback for `openai-compatible`, since a base URL is inherently org-specific; an org must fully configure it (key + base URL + both model names) to use it at all.

### 2. Shared engine (`packages/shared`)

A new `AiProvider` interface with one method:

```ts
interface StructuredCompletionRequest {
  modelTier: 'fast' | 'standard';
  maxTokens: number;
  prompt: string;
  tool: { name: string; description: string; schema: object }; // plain JSON Schema
}

interface AiProvider {
  generateStructured(request: StructuredCompletionRequest): Promise<Record<string, unknown>>;
}
```

Two implementations:
- **`AnthropicProvider`** — wraps `@anthropic-ai/sdk` exactly as today's 5 clients do; `fast` → `claude-haiku-4-5-20251001`, `standard` → `claude-sonnet-5`, hardcoded (never reads `aiModelFast`/`aiModelStandard`).
- **`OpenAiCompatibleProvider`** — uses the standard `openai` npm package with `baseURL` set to the org's `aiBaseUrl`; sends `tools: [{type:'function', function:{name, description, parameters: schema}}]` and `tool_choice: {type:'function', function:{name}}`; parses `response.choices[0].message.tool_calls[0].function.arguments` (a JSON string — `JSON.parse` it, unlike Anthropic's already-structured `tool_use.input`). `modelTier` resolves to `aiModelFast`/`aiModelStandard`.

Both implementations consume the **same JSON Schema object** for a given tool — Anthropic's `input_schema` and OpenAI's `parameters` are both plain JSON Schema, so no schema translation is needed, only a different envelope around it.

**`AiProviderFactory.forOrganization(context: TenantContext): Promise<AiProvider>`** — reads the org's `aiProvider`/`aiBaseUrl`/`aiModelFast`/`aiModelStandard`/decrypted `aiApiKeyEncrypted`; returns an `AnthropicProvider` (using the org's key, or the platform `ANTHROPIC_API_KEY` if the org has none) when `aiProvider = 'anthropic'`, or an `OpenAiCompatibleProvider` (using the org's key/base URL/models) when `aiProvider = 'openai-compatible'`. Throws a clear error if `aiProvider = 'openai-compatible'` but the org is missing any of key/base URL/fast model/standard model.

### 3. Migrating the 5 existing clients

Each client is renamed from `claude-*.client.ts` to a provider-neutral name (e.g. `question-generation.client.ts`) and shrinks to just: its tool's name/description/JSON Schema, its prompt-building logic, and its result validation/parsing — no SDK code, no provider branching. Each method's `apiKey: string` parameter is replaced with an `aiProvider: AiProvider` parameter (the already-resolved provider instance) — the caller resolves it once via `AiProviderFactory.forOrganization(context)` before calling any client, rather than each client re-deriving it.

### 4. Org-admin settings UI

`apps/web/app/(org-admin)/settings/integrations/page.tsx`'s "AI API key" card becomes:
- A **Provider** select: "Anthropic" (default) or "OpenAI-compatible".
- **Anthropic** selected: unchanged from today — just the API key field.
- **OpenAI-compatible** selected: the key field plus three new required fields — **Base URL**, **Fast-tier model/deployment name**, **Standard-tier model/deployment name**.
- Status text becomes provider-aware ("uses this organization's Azure OpenAI endpoint" vs. today's Anthropic-specific wording).
- Same single save endpoint/mutation as today, with a larger payload when provider is `openai-compatible`; the backend validates that base URL + both model names are present together when that provider is selected.

## Testing

- New specs for `AnthropicProvider`, `OpenAiCompatibleProvider` (mocking their respective SDKs) and `AiProviderFactory` (org-configured-anthropic, org-configured-openai-compatible, org-configured-nothing-falls-back-to-platform-key, org-configured-openai-compatible-but-incomplete-throws).
- Each of the 5 existing client specs simplifies to mock `AiProvider.generateStructured` directly instead of constructing fake Anthropic SDK response envelopes.
- Org-admin settings page test gains cases for the provider toggle showing/hiding the conditional fields and for the required-together validation error.

## Out of Scope

- Any provider other than Anthropic and the generic OpenAI-compatible shape (e.g. Google Gemini's native API, AWS Bedrock's native API) — those have genuinely different request/response shapes and would need their own `AiProvider` implementation if ever needed; not requested now.
- A UI for testing/validating the configured endpoint before saving (e.g. a "Send test request" button) — not asked for.
- Migrating existing orgs' data — not needed, since the new columns are nullable and default to reproducing today's exact behavior.
- Per-feature provider overrides (e.g. using Anthropic for code review but Azure for question generation within the same org) — one provider per organization, applied to all 5 features uniformly.
