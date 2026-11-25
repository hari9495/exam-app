export function resolveInternalBindHost(env: NodeJS.ProcessEnv = process.env): string {
  return env.API_INTERNAL_HOST ?? '127.0.0.1';
}

/** The secrets that sign tokens and links; a production start refuses any left as the example value. */
export const SIGNING_SECRETS = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'CANDIDATE_JWT_ACCESS_SECRET', 'CANDIDATE_JWT_REFRESH_SECRET', 'INTERNAL_SERVICE_SECRET'] as const;

/**
 * Security review F9 (25 Nov 2026): with NODE_ENV=production every signing secret is set, is not a placeholder from
 * .env.example (anything with "change-me"), and is at least 32 bytes. Returns the problems in words (empty: fine).
 */
export function secretProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  if (env.NODE_ENV !== 'production') return [];
  return SIGNING_SECRETS.flatMap((k) => {
    const v = env[k] ?? '';
    if (!v) return [`${k} is not set.`];
    if (/change-me/i.test(v)) return [`${k} is still the .env.example placeholder.`];
    if (Buffer.byteLength(v, 'utf8') < 32) return [`${k} is shorter than 32 bytes.`];
    return [];
  });
}

/** Stops a production start with unsafe secrets (called first thing in main.ts). */
export function assertProductionSecrets(env: NodeJS.ProcessEnv = process.env): void {
  const problems = secretProblems(env);
  if (problems.length) throw new Error(`Refusing to start: ${problems.join(' ')} Set real random secrets (for example: node -e "console.log(require('crypto').randomBytes(48).toString('base64'))").`);
}
