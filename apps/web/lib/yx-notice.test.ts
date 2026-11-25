import { hiddenToday, hideForToday } from './yx-notice';

const store = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe('notices hidden for the day (MFA banner)', () => {
  it('hidden until the next day, for that person only', () => {
    const s = store();
    hideForToday(s, 'mfa', 'u1', '2026-10-20');
    expect(hiddenToday(s, 'mfa', 'u1', '2026-10-20')).toBe(true);
    expect(hiddenToday(s, 'mfa', 'u1', '2026-10-21')).toBe(false);
    expect(hiddenToday(s, 'mfa', 'u2', '2026-10-20')).toBe(false);
  });

  it('storage that refuses or is missing: the notice just shows', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => hideForToday(broken, 'mfa', 'u1', '2026-10-20')).not.toThrow();
    expect(hiddenToday(broken, 'mfa', 'u1', '2026-10-20')).toBe(false);
    expect(hiddenToday(undefined, 'mfa', 'u1', '2026-10-20')).toBe(false);
  });
});
