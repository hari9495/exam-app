import { describe, expect, it } from 'vitest';
import { formatBytes, formatDate, formatINR, formatPhone, formatTime, groupIndian, initials, parseDate, parseTime } from './format';
import { ID_SPECS, maskAadhaar, verhoeffValid } from './validators';

describe('format', () => {
  it('shows Indian mobile numbers as +91 98450 11122', () => {
    expect(formatPhone('+919845011122')).toBe('+91 98450 11122');
    expect(formatPhone('9845011122')).toBe('+91 98450 11122');
    expect(formatPhone('098450 11122')).toBe('+91 98450 11122');
    expect(formatPhone('+91••••••22')).toBe('+91••••••22');
    expect(formatPhone(null)).toBe('');
  });

  it('groups Indian style', () => {
    expect(groupIndian(0)).toBe('0');
    expect(groupIndian(999)).toBe('999');
    expect(groupIndian(1000)).toBe('1,000');
    expect(groupIndian(123456)).toBe('1,23,456');
    expect(groupIndian(1234567)).toBe('12,34,567');
    expect(groupIndian(123456789)).toBe('12,34,56,789');
    expect(groupIndian(-4218300)).toBe('-42,18,300');
  });
  it('formats rupees without paise unless present', () => {
    expect(formatINR(118500)).toBe('₹1,18,500');
    expect(formatINR(1234.5)).toBe('₹1,234.50');
    expect(formatINR(-2500)).toBe('−₹2,500');
    expect(formatINR(10, { decimals: 2 })).toBe('₹10.00');
  });
  it('formats and parses dates day-first', () => {
    expect(formatDate(new Date(2026, 8, 28))).toBe('28 Sep 2026');
    expect(formatDate(new Date(2026, 0, 4))).toBe('4 Jan 2026');
    const want = new Date(2026, 8, 28).getTime();
    for (const s of ['28 Sep 2026', '28 sep 26', '28/09/2026', '28-9-2026', '2026-09-28', '28 September 2026']) {
      expect(parseDate(s)?.getTime(), s).toBe(want);
    }
    expect(parseDate('31/02/2026')).toBeNull();
    expect(parseDate('13 Foo 2026')).toBeNull();
    expect(parseDate('')).toBeNull();
  });
  it('parses and formats times', () => {
    expect(parseTime('9')).toBe('09:00');
    expect(parseTime('930')).toBe('09:30');
    expect(parseTime('9.30 pm')).toBe('21:30');
    expect(parseTime('12 am')).toBe('00:00');
    expect(parseTime('12pm')).toBe('12:00');
    expect(parseTime('21:30')).toBe('21:30');
    expect(parseTime('25:00')).toBeNull();
    expect(parseTime('13 pm')).toBeNull();
    expect(formatTime('21:30')).toBe('9:30 pm');
    expect(formatTime('00:05')).toBe('12:05 am');
    expect(formatTime('09:30', false)).toBe('09:30');
  });
  it('formats bytes and initials', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
    expect(initials('Divya Raghunathan')).toBe('DR');
    expect(initials('  sana  ')).toBe('S');
    expect(initials('A B C')).toBe('AC');
  });
});

describe('validators', () => {
  it('checks PAN and IFSC', () => {
    expect(ID_SPECS.pan.normalise('abcde 1234f')).toBe('ABCDE1234F');
    expect(ID_SPECS.pan.validate('ABCDE1234F')).toBeNull();
    expect(ID_SPECS.pan.validate('ABCD1234F')).toMatch(/PAN/);
    expect(ID_SPECS.ifsc.validate('HDFC0001234')).toBeNull();
    expect(ID_SPECS.ifsc.validate('HDFC1001234')).toMatch(/IFSC/);
  });
  it('checks UAN and phone', () => {
    expect(ID_SPECS.uan.validate('100012345678')).toBeNull();
    expect(ID_SPECS.uan.display('100012345678')).toBe('1000 1234 5678');
    expect(ID_SPECS.phone.normalise('+91 98765 43210')).toBe('9876543210');
    expect(ID_SPECS.phone.normalise('09876543210')).toBe('9876543210');
    expect(ID_SPECS.phone.validate('9876543210')).toBeNull();
    expect(ID_SPECS.phone.validate('5876543210')).toMatch(/6, 7, 8 or 9/);
  });
  it('checks Aadhaar with Verhoeff', () => {
    expect(verhoeffValid('2363')).toBe(true);
    expect(verhoeffValid('2364')).toBe(false);
    const base = '23456789012';
    const valid = [...'0123456789'].map((c) => base + c).find(verhoeffValid)!;
    expect(ID_SPECS.aadhaar.validate(valid)).toBeNull();
    const wrong = base + String((Number(valid.slice(-1)) + 1) % 10);
    expect(ID_SPECS.aadhaar.validate(wrong)).toMatch(/not valid/);
    expect(ID_SPECS.aadhaar.validate('123456789012')).toMatch(/not valid/); // cannot start with 0 or 1
    expect(maskAadhaar(valid)).toBe(`XXXX XXXX ${valid.slice(-4)}`);
  });
});
