export function resolveInternalBindHost(env: NodeJS.ProcessEnv = process.env): string {
  return env.API_INTERNAL_HOST ?? '127.0.0.1';
}
