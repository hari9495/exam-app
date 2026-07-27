import type { INestApplication } from '@nestjs/common';

// Behind nginx every request's socket address is loopback, so Express reports
// req.ip as 127.0.0.1 for every client unless it is told a proxy sits in front.
// @nestjs/throttler keys its rate-limit buckets on req.ip, so in production that
// meant ALL candidates shared a single bucket: five logins per minute
// platform-wide instead of per candidate, which is 100 minutes to admit a
// 500-person cohort. See ADO #6820.
//
// Gated on TRUST_PROXY rather than always-on: trusting a forwarding header when
// nothing trustworthy sets it would let any client forge req.ip outright.
//
// THE VALUE IS 1, NOT `true`, AND THE DIFFERENCE IS THE WHOLE POINT.
// nginx uses proxy_add_x_forwarded_for, which APPENDS the real peer to whatever
// the client already sent. So for a client that forges `X-Forwarded-For:
// 1.2.3.4`, the header arriving at the app reads `1.2.3.4, <real peer>`.
// Express (via proxy-addr) evaluates [socket, ...reversed X-Forwarded-For] and
// returns the first address it does not trust:
//   trust = true -> trusts the whole chain -> returns 1.2.3.4, the forged value.
//   trust = 1    -> trusts one hop (nginx)  -> returns <real peer>. Correct.
// Using `true` here would reintroduce exactly the spoofing hole this fixes.
//
// If another proxy is ever placed in front of nginx -- a CDN, an external load
// balancer -- this must become 2, or req.ip will report that proxy instead of
// the client.
export function configureTrustProxy(app: INestApplication): void {
  if (process.env.TRUST_PROXY !== 'true') return;
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
}
