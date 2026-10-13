import { of, lastValueFrom } from 'rxjs';
import { SupportMaskInterceptor, maskDeep } from './support-mask.interceptor';

// M10 AT1 (D14): candidate contact details are masked for a YukthiX support session in hiring responses only.
describe('SupportMaskInterceptor', () => {
  const ctx = (support: string | null, cls = 'CandidatesController') => ({ switchToHttp: () => ({ getRequest: () => ({ user: { supportSessionId: support } }) }), getClass: () => ({ name: cls }) }) as never;
  const body = { items: [{ name: 'Asha Rao', email: 'asha@example.com', phone: '+91 98765 43210', entries: [{ candidateEmail: 'a@b.in' }] }] };

  it('masks emails and phones at any depth in a support session', async () => {
    const out = await lastValueFrom(new SupportMaskInterceptor().intercept(ctx('ss-1'), { handle: () => of(body) }));
    expect(out).toEqual({ items: [{ name: 'Asha Rao', email: 'a•••@example.com', phone: '•••• 3210', entries: [{ candidateEmail: 'a•••@b.in' }] }] });
  });

  it('leaves company users and other controllers alone', async () => {
    expect(await lastValueFrom(new SupportMaskInterceptor().intercept(ctx(null), { handle: () => of(body) }))).toBe(body);
    expect(await lastValueFrom(new SupportMaskInterceptor().intercept(ctx('ss-1', 'UsersController'), { handle: () => of(body) }))).toBe(body);
  });

  it('keeps dates and non-contact fields', () => {
    const d = new Date('2026-10-01T00:00:00Z');
    expect(maskDeep({ createdAt: d, emailOptedOutAt: null, title: 'x' })).toEqual({ createdAt: d, emailOptedOutAt: null, title: 'x' });
  });
});
