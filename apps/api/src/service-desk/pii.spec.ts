import { luhnValid, maskPii, maskPiiHtml, verhoeffValid } from './pii';

// §15.2 PII: Aadhaar (Verhoeff), PAN, card (Luhn), IFSC + account, passwords, health words.
/** A Verhoeff-valid 12-digit number starting with 2..9 (the last digit is the check digit). */
function aadhaar(body = '23456789012'): string {
  for (let d = 0; d < 10; d++) if (verhoeffValid(body + d)) return body + d;
  throw new Error('no check digit');
}

describe('PII masking (YX-SD-15)', () => {
  it('masks a valid Aadhaar number and leaves an ordinary 12-digit number alone', () => {
    const a = aadhaar();
    const wrong = a.slice(0, 11) + String((Number(a[11]) + 1) % 10);
    const r = maskPii(`My Aadhaar is ${a.slice(0, 4)} ${a.slice(4, 8)} ${a.slice(8)} and order ${wrong}.`);
    expect(r.found).toEqual([{ kind: 'aadhaar', value: `${a.slice(0, 4)} ${a.slice(4, 8)} ${a.slice(8)}`, masked: `[Aadhaar ••${a.slice(-4)}]` }]);
    expect(r.text).toContain(wrong);
    expect(r.text).not.toContain(a.slice(0, 4) + ' ');
  });

  it('masks PAN, cards that pass Luhn, bank accounts and passwords', () => {
    expect(luhnValid('4111111111111111')).toBe(true);
    const r = maskPii('PAN ABCPE1234F, card 4111 1111 1111 1111, not 4111 1111 1111 1112. A/c no: 001234567890 IFSC HDFC0001234. password: Hunter2!');
    expect(r.found.map((f) => f.kind).sort()).toEqual(['bank', 'card', 'pan', 'password']);
    expect(r.text).toContain('[PAN ••234F]');
    expect(r.text).toContain('[Card ••1111]');
    expect(r.text).toContain('4111 1111 1111 1112');
    expect(r.text).toContain('A/c no: [Bank account ••7890]');
    expect(r.text).toContain('password: [Password hidden]');
    expect(r.text).not.toMatch(/Hunter2|001234567890|ABCPE1234F/);
  });

  it('masks an account number written after its IFSC code, and health words', () => {
    const r = maskPii('SBIN0005943 - 30012345678 please. I am pregnant and on leave.');
    expect(r.text).toBe('SBIN0005943 - [Bank account ••5678] please. I am [Health detail hidden] and on leave.');
  });

  it('changes only text in HTML, never tags or attributes', () => {
    const r = maskPiiHtml('<p data-x="4111111111111111">Card <strong>4111111111111111</strong></p>');
    expect(r.html).toBe('<p data-x="4111111111111111">Card <strong>[Card ••1111]</strong></p>');
    expect(r.found).toHaveLength(1);
  });

  it('leaves text without personal data as it is', () => {
    const text = 'The VPN drops every 10 minutes since 5 Oct 2026. Ticket IT-1042.';
    expect(maskPii(text)).toEqual({ text, found: [] });
  });
});
