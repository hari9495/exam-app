import { pdfPages, pdfText } from '../../test/fixtures/pdf-text';
import { FORM_C_HEADER, formCTotals, renderFormC } from './bonus-form-c';

// Form C as a PDF (founder 30 Oct 2026, last 10, item 2): the letterhead, the register rows and totals, the signature block
// and the rule line, read back from the PDF's text.
const row = (n: number, code: string, name: string, salary: string, bonus: string, puja: string, net: string) => [n, code, name, '', 'Yes', 'Operator', '300', salary, bonus, puja, '0.00', '', '0.00', puja, net, '', '', ''];

describe('Form C PDF', () => {
  const rows = [row(1, 'BN-001', 'Asha Rao', '72000.00', '5998.00', '0.00', '5998.00'), row(2, 'BN-002', 'Bala Iyer', '84000.00', '6997.00', '500.00', '6497.00')];

  it('totals each money column to the paisa and leaves the others blank', () => {
    const t = formCTotals(rows);
    expect(t).toHaveLength(FORM_C_HEADER.length);
    expect(t[2]).toBe('Total');
    expect(t[7]).toBe('156000.00');
    expect(t[8]).toBe('12995.00');
    expect(t[9]).toBe('500.00');
    expect(t[14]).toBe('12495.00');
    expect(t[15]).toBe('0.00'); // nothing paid yet
    expect(t[6]).toBe(''); // days are not totalled
    expect(formCTotals([[...rows[0].slice(0, 7), '0.10', '0.20', ...rows[0].slice(9)], [...rows[0].slice(0, 7), '0.20', '0.10', ...rows[0].slice(9)]])[7]).toBe('0.30'); // no float drift
  });

  it('has the letterhead, the rule, every row, the totals and the signature block', async () => {
    const pdf = await renderFormC({ entityName: 'Bonus Foods Pvt Ltd', address: ['12 MG Road', 'Bengaluru 560001'], title: 'Bonus paid to employees for the accounting year 1 Apr 2025 to 31 Mar 2026 at 8.33%', rows });
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const text = pdfText(pdf);
    expect(text).toContain('Bonus Foods Pvt Ltd');
    expect(text).toContain('12 MG Road, Bengaluru 560001');
    expect(text).toContain('Form C, Payment of Bonus Act, 1965, Rule 4');
    expect(text).toContain('1 Apr 2025 to 31 Mar 2026 at 8.33%');
    for (const x of ['BN-001', 'Asha Rao', '5998.00', 'BN-002', 'Bala Iyer', '6497.00', 'Total', '156000.00', '12995.00', '12495.00']) expect(text).toContain(x);
    expect(text).toContain('Signature of the employer or authorised person, for Bonus Foods Pvt Ltd');
    expect(text).toContain('Date');
  });

  it('no eligible employees: says so, still totals (zero) and still has the signature block', async () => {
    const text = pdfText(await renderFormC({ entityName: 'Empty Co', address: [], title: 'x', rows: [] }));
    expect(text).toContain('Registered address not recorded');
    expect(text).toContain('No eligible employees in this year.');
    expect(text).toContain('0.00');
    expect(text).toContain('Signature of the employer');
  });

  it('a long register runs over pages and repeats the header', async () => {
    const many = Array.from({ length: 120 }, (_, i) => row(i + 1, `BN-${String(i + 1).padStart(3, '0')}`, `Person ${i + 1}`, '84000.00', '6997.00', '0.00', '6997.00'));
    const pages = pdfPages(await renderFormC({ entityName: 'Big Co', address: [], title: 'x', rows: many }));
    expect(pages.length).toBeGreaterThan(1);
    const text = pages.join(' ').replace(/\s+/g, ' ');
    expect(text).toContain('BN-120');
    expect(pages.every((p) => p.includes('Employee code'))).toBe(true); // the header repeats on every page
    expect(text).toContain((6997 * 120).toFixed(2));
  });
});
