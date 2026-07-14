export function fakeJwt(payload: Record<string, unknown>): string {
  const base64url = (obj: Record<string, unknown>) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url(payload)}.sig`;
}
