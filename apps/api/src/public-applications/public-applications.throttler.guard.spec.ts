import { publicTracker } from './public-applications.throttler.guard';

describe('public rate-limit buckets (security review F7)', () => {
  const careers = (ip: string, orgSlug: string) => ({ ip, params: { orgSlug }, route: { path: '/api/v1/public/careers/:orgSlug' } });

  it('splits careers callers by company and by IP (positive)', () => {
    expect(publicTracker(careers('203.0.113.9', 'no-such-company'))).not.toBe(publicTracker(careers('198.51.100.7', 'demo-org')));
    expect(publicTracker(careers('203.0.113.9', 'demo-org'))).not.toBe(publicTracker(careers('198.51.100.7', 'demo-org')));
    expect(publicTracker(careers('203.0.113.9', 'acme'))).not.toBe(publicTracker(careers('203.0.113.9', 'demo-org')));
    const feed = (ip: string, feedToken: string) => publicTracker({ ip, params: { feedToken }, route: { path: '/api/v1/public/job-boards/:feedToken/feed.xml' } });
    expect(feed('203.0.113.9', 'a')).not.toBe(feed('203.0.113.9', 'b'));
    const apply = (ip: string) => publicTracker({ ip, params: { applyToken: 'job-1' }, route: { path: '/api/v1/public/jobs/:applyToken/apply' } });
    expect(apply('203.0.113.9')).not.toBe(apply('198.51.100.7'));
  });

  it('keeps one bucket for the same caller on the same page, and a private link on its own token (negative)', () => {
    expect(publicTracker(careers('203.0.113.9', 'demo-org'))).toBe(publicTracker(careers('203.0.113.9', 'demo-org')));
    const offer = (ip: string) => publicTracker({ ip, params: { token: 'offer-secret' }, route: { path: '/api/v1/public/offers/:token' } });
    expect(offer('203.0.113.9')).toBe(offer('198.51.100.7'));
  });
});
