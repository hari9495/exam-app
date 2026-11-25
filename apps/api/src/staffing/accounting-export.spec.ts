import { ledgerLines, receiptLines, roundOff, tallyXml, zohoCsv, zohoPaymentsCsv, type ExportDoc, type ExportReceipt, type ExportSettings } from './accounting-export';

const S: ExportSettings = { sales: 'Sales - Staffing Services', cgst: 'Output CGST', sgst: 'Output SGST', igst: 'Output IGST', gst: 'Output GST', gstSplit: 'separate', tds: 'TDS Receivable', tdsMode: 'none', roundOff: 'rupee', roundOffLedger: 'Round Off', bank: 'HDFC Current A/c' };
const INV: ExportDoc = {
  kind: 'invoice', number: 'KS/7', date: '2026-10-31', party: 'Nilgiri Retail & Co', gstin: '33AAFCN4521K1Z2', stateCode: '33', stateName: 'Tamil Nadu', original: null, reason: null, sac: '998519', gstPct: '18',
  lines: [
    { description: 'Arun · 70 h', qtyCenti: 7000, ratePaise: 120000n, amountPaise: 8400000n },
    { description: 'Arun · overtime · 2.5 h', qtyCenti: 250, ratePaise: 180000n, amountPaise: 450025n },
  ],
  taxable: 8850025n, cgst: 0n, sgst: 0n, igst: 1593005n, total: 10443030n, tds: 177001n,
};
const CN: ExportDoc = { ...INV, kind: 'credit_note', number: 'KS/CN1', original: 'KS/7', reason: 'Overtime not agreed', lines: [{ description: 'Credit', qtyCenti: 100, ratePaise: 450025n, amountPaise: 450025n }], taxable: 450025n, igst: 81005n, total: 531030n, tds: 0n };
const sum = (x: { party: bigint; lines: { amount: bigint }[] }) => x.party + x.lines.reduce((s, l) => s + l.amount, 0n);

describe('accounting export (answer 522)', () => {
  it('round-off to the rupee, half up; none keeps paise', () => {
    expect(roundOff(10443030n, 'rupee')).toEqual({ total: 10443000n, diff: -30n });
    expect(roundOff(10443050n, 'rupee')).toEqual({ total: 10443100n, diff: 50n });
    expect(roundOff(10443030n, 'none')).toEqual({ total: 10443030n, diff: 0n });
  });
  it('ledger lines always balance: invoice, credit note, combined GST, expected TDS', () => {
    for (const s of [S, { ...S, gstSplit: 'combined' as const }, { ...S, tdsMode: 'expected' as const }, { ...S, roundOff: 'none' as const }]) {
      expect(sum(ledgerLines(INV, s))).toBe(0n);
      expect(sum(ledgerLines(CN, s))).toBe(0n);
    }
    const l = ledgerLines(INV, { ...S, tdsMode: 'expected' });
    expect(l.party).toBe(-(10443000n - 177001n)); // party debit: rounded total less the expected TDS
    expect(l.lines.map((x) => [x.ledger, x.amount])).toEqual([['Sales - Staffing Services', 8850025n], ['Output IGST', 1593005n], ['Round Off', -30n], ['TDS Receivable', -177001n]]);
    expect(ledgerLines(CN, S).party).toBe(531000n); // a credit note credits the party
    expect(ledgerLines({ ...INV, igst: 0n, cgst: 796502n, sgst: 796503n }, { ...S, gstSplit: 'combined' }).lines.map((x) => x.ledger)).toEqual(['Sales - Staffing Services', 'Output GST', 'Round Off']);
  });
  it('Tally XML: one voucher per document, escaped, dated by the rule, debit negative', () => {
    const x = tallyXml([INV, CN], S, { voucherType: { invoice: 'Sales', credit_note: 'Credit Note' }, dateFormat: 'YYYYMMDD', company: 'Kaveri Staffing Pvt Ltd' });
    expect(x.match(/<VOUCHER /g)).toHaveLength(2);
    expect(x).toContain('<VOUCHER VCHTYPE="Credit Note" ACTION="Create">');
    expect(x).toContain('<DATE>20261031</DATE>');
    expect(x).toContain('<PARTYLEDGERNAME>Nilgiri Retail &amp; Co</PARTYLEDGERNAME>');
    expect(x).toContain('<LEDGERNAME>Nilgiri Retail &amp; Co</LEDGERNAME>\n       <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n       <AMOUNT>-104430.00</AMOUNT>');
    expect(x).toContain('<SVCURRENTCOMPANY>Kaveri Staffing Pvt Ltd</SVCURRENTCOMPANY>');
    expect(x).toContain('<NARRATION>Against KS/7: Overtime not agreed</NARRATION>');
  });
  it('Zoho CSV: columns from the rule, a row per line, GST split exactly across lines, quoted cells', () => {
    const rule = {
      invoiceColumns: [{ header: 'Invoice Number', field: 'number' }, { header: 'Customer Name', field: 'customer' }, { header: 'Item Desc', field: 'description' }, { header: 'Item Tax Amount', field: 'taxAmount' }, { header: 'Adjustment', field: 'adjustment' }, { header: 'Total', field: 'total' }],
      creditNoteColumns: [{ header: 'Credit Note Number', field: 'number' }, { header: 'Reference Invoice', field: 'original' }, { header: 'Reason', field: 'reason' }],
    };
    const inv = zohoCsv([INV, CN], 'invoice', S, rule).trim().split('\r\n');
    expect(inv[0]).toBe('Invoice Number,Customer Name,Item Desc,Item Tax Amount,Adjustment,Total');
    expect(inv).toHaveLength(3);
    const taxes = inv.slice(1).map((r) => Number(r.split(',').slice(-3)[0]));
    expect(Math.round(taxes.reduce((a, b) => a + b, 0) * 100)).toBe(1593005);
    expect(inv[1]).toContain('KS/7,Nilgiri Retail & Co,Arun · 70 h,');
    expect(inv[1].endsWith(',-0.30,104430.00')).toBe(true);
    const cn = zohoCsv([INV, CN], 'credit_note', S, rule).trim().split('\r\n');
    expect(cn).toEqual(['Credit Note Number,Reference Invoice,Reason', 'KS/CN1,KS/7,Overtime not agreed']);
    expect(zohoCsv([{ ...INV, party: 'A, "B" Ltd' }], 'invoice', S, rule)).toContain('"A, ""B"" Ltd"');
  });
  it('security review F14: a customer name that starts like a formula is neutralised; negative amounts stay numbers', () => {
    const rule = { invoiceColumns: [{ header: 'Customer Name', field: 'customer' }, { header: 'Total', field: 'total' }], creditNoteColumns: [] };
    const out = zohoCsv([{ ...INV, party: '=HYPERLINK("http://x","pay")' }], 'invoice', S, rule);
    expect(out).toContain(`"'=HYPERLINK(""http://x"",""pay"")"`);
    expect(out).not.toMatch(/(^|,)=HYPERLINK/m);
    const cn = zohoCsv([{ ...INV, party: '@SUM(A1)' }], 'invoice', S, rule).trim().split('\r\n')[1];
    expect(cn.startsWith("'@SUM(A1)")).toBe(true);
    expect(cn.split(',').pop()).toMatch(/^-?\d+(\.\d+)?$/);
  });
});

describe('receipts in the export (answer 574)', () => {
  const R: ExportReceipt = { number: 'UTR123', date: '2026-11-20', party: 'Nilgiri Retail & Co', reference: 'UTR123', invoices: [{ number: 'KS/7', amount: 10266029n, tds: 177001n }] };
  it('a receipt balances: bank and TDS debited, the client credited; with TDS booked at invoice only the bank', () => {
    const none = receiptLines(R, S);
    expect(none.party + none.lines.reduce((n, l) => n + l.amount, 0n)).toBe(0n);
    expect(none.lines).toEqual([{ ledger: 'HDFC Current A/c', amount: -10266029n }, { ledger: 'TDS Receivable', amount: -177001n }]);
    expect(none.party).toBe(10443030n);
    const expected = receiptLines(R, { ...S, tdsMode: 'expected' });
    expect(expected).toEqual({ party: 10266029n, lines: [{ ledger: 'HDFC Current A/c', amount: -10266029n }] });
  });
  it('Tally: a Receipt voucher from the rule; none without receipts', () => {
    const xml = tallyXml([INV], S, { voucherType: { invoice: 'Sales', credit_note: 'Credit Note' }, dateFormat: 'YYYYMMDD', company: 'Kaveri', receiptVoucherType: 'Receipt' }, [R]);
    expect(xml).toContain('<VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>');
    expect(xml).toContain('<NARRATION>Against KS/7</NARRATION>');
    expect(xml).toMatch(/<LEDGERNAME>HDFC Current A\/c<\/LEDGERNAME>\s*<ISDEEMEDPOSITIVE>Yes<\/ISDEEMEDPOSITIVE>\s*<AMOUNT>-102660\.29<\/AMOUNT>/);
    expect(tallyXml([INV], S, { voucherType: { invoice: 'Sales', credit_note: 'Credit Note' }, dateFormat: 'YYYYMMDD', company: 'Kaveri' })).not.toContain('Receipt');
  });
  it('Zoho customer payments: a row per invoice paid, columns from the rule; negative: no columns gives just the header', () => {
    const cols = [{ header: 'Date', field: 'date' }, { header: 'Customer Name', field: 'customer' }, { header: 'Deposit To', field: 'depositTo' }, { header: 'Invoice Number', field: 'invoice' }, { header: 'Amount Applied to Invoice', field: 'applied' }, { header: 'Withholding Tax Amount', field: 'tds' }];
    const csv = zohoPaymentsCsv([{ ...R, invoices: [...R.invoices, { number: 'KS/8', amount: 100000n, tds: 0n }] }], S, { invoiceColumns: [], creditNoteColumns: [], paymentColumns: cols }).trim().split(/\r\n/);
    expect(csv).toEqual(['Date,Customer Name,Deposit To,Invoice Number,Amount Applied to Invoice,Withholding Tax Amount', '2026-11-20,Nilgiri Retail & Co,HDFC Current A/c,KS/7,104430.30,1770.01', '2026-11-20,Nilgiri Retail & Co,HDFC Current A/c,KS/8,1000.00,0.00']);
    expect(zohoPaymentsCsv([R], S, { invoiceColumns: [], creditNoteColumns: [] }).trim()).toBe('');
  });
});

