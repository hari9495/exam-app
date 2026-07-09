export function resolveInternalBindHost(env: NodeJS.ProcessEnv = process.env): string {
  return env.EXAM_RUNTIME_INTERNAL_HOST ?? '127.0.0.1';
}
