import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * The rate-limit bucket of a public request (pure, so it is tested directly). Security review F7 (25 Nov 2026): routes
 * without a private token (careers, sitemap, job feeds, application status, Easy Apply) were keyed only on their route
 * pattern, one bucket for every caller and every company, so 20 requests a minute took every careers site down. Now:
 * - the apply form: its public apply token plus the caller's IP (junk from one IP no longer blocks the job's real applicants);
 * - the offer and candidate-portal links: their private token (a candidate behind a shared office NAT keeps their own);
 * - everything else: the route, the company or feed it names (org slug, feed token, status token, provider) and the IP.
 */
export function publicTracker(req: { ip?: string; ips?: string[]; params?: Record<string, string | undefined>; route?: { path?: string } }): string {
  const p = req.params ?? {};
  const ip = req.ip ?? 'unknown';
  if (p.applyToken) return `apply:${p.applyToken}:${ip}`;
  const secret = p.token ?? p.portalToken;
  if (secret) return secret;
  const scope = p.orgSlug ?? p.feedToken ?? p.statusToken ?? '';
  return `${req.route?.path ?? 'public'}:${scope}:${p.provider ?? ''}:${ip}`;
}

@Injectable()
export class PublicApplicationsThrottlerGuard extends ThrottlerGuard {
  // Deliberately does NOT extend FailOpenThrottlerGuard -- public-facing surface, fail closed.
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return publicTracker(req);
  }
}
