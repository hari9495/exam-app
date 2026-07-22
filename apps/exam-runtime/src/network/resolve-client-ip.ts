import type { Request } from 'express';

// Socket address by default. X-Forwarded-For is attacker-controlled unless a trusted
// reverse proxy sets it, so it is honored only behind an explicit deployment opt-in
// (TRUST_PROXY=true, for when the VM ends up fronted by Nginx).
export function resolveClientIp(req: Request): string {
  if (process.env.TRUST_PROXY === 'true') {
    const header = req.headers['x-forwarded-for'];
    const first = (Array.isArray(header) ? header[0] : header)?.split(',')[0]?.trim();
    if (first) {
      return first;
    }
  }
  return req.ip ?? req.socket?.remoteAddress ?? '';
}
