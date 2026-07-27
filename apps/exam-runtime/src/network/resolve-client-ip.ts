import type { Request } from 'express';

// Express computes req.ip from X-Forwarded-For according to the `trust proxy`
// setting configured in main.ts, which is gated on TRUST_PROXY=true. That single
// setting also governs the IP that @nestjs/throttler keys its rate-limit buckets
// on, so resolving the client here and rate-limiting there can no longer
// disagree -- they did before, and the disagreement is what let every candidate
// in production share one bucket (ADO #6820).
//
// This used to hand-parse the header and take the FIRST X-Forwarded-For entry,
// which was exploitable: nginx is configured with proxy_add_x_forwarded_for,
// which APPENDS the real peer to whatever the client already sent, so the first
// entry is attacker-controlled. A candidate could send their own
// X-Forwarded-For and defeat both the rate limiter and an exam's IP allowlist.
// Express's own hop-counting handles this correctly, so the parsing is gone
// rather than merely corrected.
export function resolveClientIp(req: Request): string {
  return req.ip ?? req.socket?.remoteAddress ?? '';
}
