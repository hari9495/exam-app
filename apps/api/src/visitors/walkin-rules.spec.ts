import { hoursText, approvalDue, decider, inHours, personKey, photoProblem, policyText } from './walkin-rules';

// The keyed hashes derive their key from the API secret (security review F10).
process.env.JWT_ACCESS_SECRET ??= 'unit-test-secret-only-for-these-hashes';

describe('Visitors slice 2 rules', () => {
  it('610: allowed hours in the location time zone (from inclusive, to exclusive)', () => {
    expect(inHours(new Date('2026-11-10T03:30:00Z'), 'Asia/Kolkata', '09:00', '18:30')).toBe(true); // 09:00 IST
    expect(inHours(new Date('2026-11-10T03:29:00Z'), 'Asia/Kolkata', '09:00', '18:30')).toBe(false);
    expect(inHours(new Date('2026-11-10T13:00:00Z'), 'Asia/Kolkata', '09:00', '18:30')).toBe(false); // 18:30 IST
    expect(inHours(new Date('2026-11-10T14:00:00Z'), 'Europe/London', '09:00', '18:30')).toBe(true);
  });

  it('604: the host decides until the deadline, reception after; anyone else is refused', () => {
    const now = new Date('2026-11-10T05:00:00Z');
    const v = { status: 'waiting', approvalDueAt: approvalDue(now, 10), hostUserId: 'h' };
    expect(decider(v, 'h', false, now)).toBe('host');
    expect(decider(v, 'r', true, now)).toMatch(/The host has until 10:40 AM/i);
    expect(decider(v, 'r', true, new Date(now.getTime() + 10 * 60_000))).toBe('reception');
    expect(decider(v, 'x', false, new Date(now.getTime() + 60 * 60_000))).toMatch(/Only the host or reception/);
    expect(decider({ ...v, status: 'on_site' }, 'h', false, now)).toMatch(/not waiting/);
  });

  it('606: the NDA person key is the same for one person and company, different otherwise, and never the number', () => {
    const a = personKey('o', '+919811044319', 'Fairview  Auditors');
    expect(a).toBe(personKey('o', '+919811044319', 'fairview auditors'));
    expect(a).not.toBe(personKey('o', '+919811044319', 'Other Co'));
    expect(a).not.toBe(personKey('o2', '+919811044319', 'Fairview Auditors'));
    expect(a).not.toContain('9811044319');
  });

  it('606: a policy body becomes plain text for the visitor', () => {
    expect(policyText('<h2>NDA</h2><p>Keep it <strong>secret</strong> &amp; safe.</p><script>x</script>')).toBe('NDA\nKeep it secret & safe.');
  });

  it('602: only a small JPEG or PNG is a photo', () => {
    expect(photoProblem(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]))).toBeNull();
    expect(photoProblem(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBeNull();
    expect(photoProblem(Buffer.from('GIF89a'))).toMatch(/JPEG or PNG/);
    expect(photoProblem(Buffer.alloc(0))).toMatch(/empty/);
    expect(photoProblem(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(700 * 1024)]))).toMatch(/too large/);
  });
});

describe('visitor hours over the whole day (answer 791)', () => {
  const at = (iso: string) => new Date(iso);
  it('until midnight (24:00) lets in a visitor at 23:45; all day (00:00 to 24:00) at any hour', () => {
    expect(inHours(at('2026-11-11T18:15:00Z'), 'Asia/Kolkata', '09:00', '24:00')).toBe(true); // 23:45 IST
    expect(inHours(at('2026-11-10T18:45:00Z'), 'Asia/Kolkata', '00:00', '24:00')).toBe(true); // 00:15 IST
    expect(hoursText('09:00', '24:00')).toBe('09:00 to 00:00');
  });
  it('negative: outside the hours stays outside; 18:30 closes at 18:30', () => {
    expect(inHours(at('2026-11-11T13:00:00Z'), 'Asia/Kolkata', '09:00', '18:30')).toBe(false); // 18:30 IST
    expect(inHours(at('2026-11-10T18:45:00Z'), 'Asia/Kolkata', '09:00', '24:00')).toBe(false); // 00:15 IST
    expect(hoursText('09:00', '18:30')).toBe('09:00 to 18:30');
  });
});
