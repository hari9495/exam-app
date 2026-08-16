// Whether auth cookies (staff and candidate refresh tokens) carry the Secure flag.
//
// SECURE BY DEFAULT, with an explicit opt-OUT for local http development. The direction
// matters and is the whole reason this helper exists:
//
//   - The staff refresh cookie shipped with `secure: false` HARDCODED at three call sites.
//   - The candidate refresh cookie used `secure: process.env.NODE_ENV === 'production'`,
//     and its comment said "secure is on in production". NODE_ENV is NOT set on the
//     production VM (not in either .env, not in the pm2 process environment), so that guard
//     evaluated false in production and the cookie shipped without Secure too.
//
// Both were found by a production audit on 2026-08-15, not by any test or report. Nothing
// downstream compensated: nginx adds no security headers and does not rewrite cookies, and
// the domain has no HSTS. So an httpOnly session token was willing to ride along on any
// plain-http request a browser could be induced to make to the origin -- the request is on
// the wire before nginx's 301 to 443 happens.
//
// An opt-IN keyed on environment detection is what failed. An opt-OUT means a missing or
// misspelt variable leaves production SECURE, and only a deliberate `INSECURE_COOKIES=true`
// in a local .env weakens it -- where it is needed, because browsers refuse to send Secure
// cookies over http://localhost and the e2e suite runs there.
//
// Shared between apps/api and apps/exam-runtime deliberately: the two cookies diverging is
// how one ended up hardcoded and the other with a dead guard.
export const INSECURE_COOKIES_ENV = 'INSECURE_COOKIES';

export function authCookieSecure(): boolean {
  return process.env[INSECURE_COOKIES_ENV] !== 'true';
}
