import Anthropic from '@anthropic-ai/sdk';
import type { BetaMessage, MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/beta/messages/messages';

/**
 * Ask YukthiX (answer 2102): Claude through YukthiX's own Anthropic account. The key lives only in server config, in
 * this environment variable, never in the repo, the database, a test or a log. Without it the assistant is "not switched
 * on yet". A dedicated key (not ANTHROPIC_API_KEY, which companies without their own key also fall back to) keeps the
 * assistant's spend in its own Anthropic workspace.
 */
export const ASK_KEY_ENV = 'ASK_YUKTHIX_ANTHROPIC_API_KEY';

/** The one call the assistant makes. Tests inject a stand-in; no network call is ever made in a test. */
export interface AskClient {
  create(params: MessageCreateParamsNonStreaming): Promise<BetaMessage>;
}

export const ASK_CLIENT = Symbol('ASK_CLIENT');

/** The real client, or null when the key is not set (the assistant then says it is not switched on yet). */
export function askClientFromEnv(env: NodeJS.ProcessEnv = process.env): AskClient | null {
  const apiKey = env[ASK_KEY_ENV]?.trim();
  if (!apiKey) return null;
  // The key is passed explicitly: the SDK never falls back to other credentials on this server.
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
  return { create: (params) => client.beta.messages.create(params) };
}
