import { keepNextForRoundTrip, safeNextPath, takeNext, withNextHere } from './safe-next';

describe('safeNextPath', () => {
  it.each([
    ['/v2/exams', '/v2/exams'],
    ['/yx/people/directory?tab=all#top', '/yx/people/directory?tab=all#top'],
  ])('keeps the same-site path %s', (raw, expected) => expect(safeNextPath(raw)).toBe(expected));

  it.each([null, '', 'v2/exams', 'https://evil.example/x', '//evil.example', '/\\evil.example', '/\t/evil.example', 'javascript:alert(1)'])(
    'drops %p',
    (raw) => expect(safeNextPath(raw)).toBeNull(),
  );
});

describe('coming back after signing in again', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
    window.sessionStorage.clear();
  });

  it('the sign-in address carries this page as ?next=', () => {
    window.history.replaceState(null, '', '/yx/people/directory?tab=all');
    expect(withNextHere('/yx/sign-in')).toBe('/yx/sign-in?next=%2Fyx%2Fpeople%2Fdirectory%3Ftab%3Dall');
  });

  it('never points back at a sign-in page', () => {
    for (const page of ['/yx/sign-in', '/yx/sign-in/callback', '/staff/sign-in', '/login']) {
      window.history.replaceState(null, '', page);
      expect(withNextHere('/yx/sign-in')).toBe('/yx/sign-in');
    }
  });

  it('keeps ?next= across the Google / Microsoft round trip, once, and validates it again', () => {
    window.history.replaceState(null, '', '/yx/sign-in?next=%2Fyx%2Fpayroll');
    keepNextForRoundTrip();
    window.history.replaceState(null, '', '/yx/sign-in');
    expect(takeNext()).toBe('/yx/payroll');
    expect(takeNext()).toBeNull();

    window.sessionStorage.setItem('yx.signInNext', 'https://evil.example/x'); // tampered storage
    expect(takeNext()).toBeNull();
  });

  it('the address wins over a kept one, and the kept one is cleared', () => {
    window.sessionStorage.setItem('yx.signInNext', '/yx/old');
    window.history.replaceState(null, '', '/yx/sign-in?next=%2Fyx%2Fnew');
    expect(takeNext()).toBe('/yx/new');
    expect(window.sessionStorage.getItem('yx.signInNext')).toBeNull();
  });
});
