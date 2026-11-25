import { visitorIp } from './yx-careers';

// Security review F7: the careers server pages pass the visitor's IP to the API's per-company, per-IP rate limit.
describe('visitorIp', () => {
  const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });
  it('takes the address our proxy added (the rightmost forwarded entry), else the real-ip header (positive)', () => {
    expect(visitorIp(h({ 'x-forwarded-for': '1.2.3.4, 10.0.0.2' }))).toBe('10.0.0.2');
    expect(visitorIp(h({ 'x-forwarded-for': '198.51.100.7' }))).toBe('198.51.100.7');
    expect(visitorIp(h({ 'x-real-ip': '203.0.113.9' }))).toBe('203.0.113.9');
  });
  it('never trusts a visitor-written first entry, and gives nothing when there is no address (negative)', () => {
    expect(visitorIp(h({ 'x-forwarded-for': 'spoofed, 10.0.0.2' }))).not.toBe('spoofed');
    expect(visitorIp(h({}))).toBeNull();
    expect(visitorIp(h({ 'x-forwarded-for': ' , ' }))).toBeNull();
  });
});
