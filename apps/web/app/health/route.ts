// Liveness only -- web has no database of its own. Proves the standalone server is
// answering, which is exactly what was missing when `web` sat stopped for 18 minutes on
// 2026-08-06 and nothing noticed.
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json({ status: 'ok' });
}
