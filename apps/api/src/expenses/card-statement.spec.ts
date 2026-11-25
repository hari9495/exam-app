import ExcelJS from 'exceljs';
import { cardLast4, headerIndex, mappingProblem, parseAmount, parseDate, parseRows, readTable, scrub, suggestMatches, type CardMapping, type MatchCandidate, type MatchCard } from './card-statement';

const M: CardMapping = { date: 'Txn Date', dateFormat: 'DD/MM/YYYY', description: 'Description', amountMode: 'signed', amount: 'Amount', card: 'Card No' };
const table = (...rows: string[][]) => [['Statement of corporate cards'], [], ['Txn Date', 'Card No', 'Description', 'Amount'], ...rows];

describe('card statement: reading the file', () => {
  it('reads a CSV with a BOM and quoted commas', async () => {
    const t = await readTable('s.csv', Buffer.from('﻿Txn Date,Description,Amount\n01/09/2026,"TAJ, MUMBAI","1,200.50"\n'));
    expect(t[1]).toEqual(['01/09/2026', 'TAJ, MUMBAI', '1,200.50']);
  });

  it('reads the first sheet of an Excel file; a date cell becomes YYYY-MM-DD', async () => {
    const book = new ExcelJS.Workbook();
    const s = book.addWorksheet('Sep');
    s.addRow(['Txn Date', 'Description', 'Amount']);
    s.addRow([new Date(Date.UTC(2026, 8, 3)), 'FUELPOINT', 2100]);
    const t = await readTable('s.xlsx', Buffer.from(await book.xlsx.writeBuffer()));
    expect(t[1]).toEqual(['2026-09-03', 'FUELPOINT', '2100']);
  });

  it('refuses other file types and an unreadable Excel file', async () => {
    await expect(readTable('s.pdf', Buffer.from('x'))).rejects.toThrow('CSV or Excel');
    await expect(readTable('s.xlsx', Buffer.from('not a zip'))).rejects.toThrow('could not be read');
  });
});

describe('card statement: the mapping', () => {
  it('finds the heading row below a title', () => {
    expect(headerIndex(table(), M)).toBe(2);
    expect(headerIndex(table())).toBe(2);
    expect(headerIndex([['a'], ['b']], M)).toBe(-1);
  });

  it('says what is missing', () => {
    expect(mappingProblem(M)).toBeNull();
    expect(mappingProblem({ ...M, amount: undefined })).toBe('Choose the amount column.');
    expect(mappingProblem({ ...M, amountMode: 'split', amount: undefined, debit: 'Dr' })).toBe('Choose both the debit and the credit columns.');
    expect(mappingProblem({ ...M, card: 'Amount' })).toBe('Each column can be chosen once.');
    expect(mappingProblem({ ...M, dateFormat: 'D/M' as never })).toBe('Choose how dates are written.');
  });
});

describe('card statement: cells', () => {
  it('dates in each format; impossible dates are refused; a leap day only in a leap year', () => {
    expect(parseDate('03/09/2026', 'DD/MM/YYYY')).toBe('2026-09-03');
    expect(parseDate('09/03/2026', 'MM/DD/YYYY')).toBe('2026-09-03');
    expect(parseDate('3-Sep-26', 'DD-MMM-YYYY')).toBe('2026-09-03');
    expect(parseDate('03 September 2026', 'DD-MMM-YYYY')).toBe('2026-09-03');
    expect(parseDate('2026-09-03', 'DD/MM/YYYY')).toBe('2026-09-03');
    expect(parseDate('31/02/2026', 'DD/MM/YYYY')).toBeNull();
    expect(parseDate('29/02/2028', 'DD/MM/YYYY')).toBe('2028-02-29');
    expect(parseDate('29/02/2027', 'DD/MM/YYYY')).toBeNull();
    expect(parseDate('13/13/2026', 'DD/MM/YYYY')).toBeNull();
    expect(parseDate('Total', 'DD/MM/YYYY')).toBeNull();
  });

  it('amounts: commas, rupee sign, brackets, minus and Cr / Dr; more than 2 decimals is refused', () => {
    expect(parseAmount('₹ 1,200.50')).toMatchObject({ side: null });
    expect((parseAmount('1,200.50') as { value: { toFixed: (n: number) => string } }).value.toFixed(2)).toBe('1200.50');
    expect((parseAmount('(450.00)') as { value: { isNegative: () => boolean } }).value.isNegative()).toBe(true);
    expect((parseAmount('-450') as { value: { isNegative: () => boolean } }).value.isNegative()).toBe(true);
    expect(parseAmount('450.00 Cr')).toMatchObject({ side: 'credit' });
    expect(parseAmount('450.00Dr')).toMatchObject({ side: 'debit' });
    expect(parseAmount('12.345')).toBe('bad');
    expect(parseAmount('abc')).toBe('bad');
    expect(parseAmount(' ')).toBe('empty');
  });

  it('a card number keeps its last 4 digits; a full number is noticed', () => {
    expect(cardLast4('XXXX XXXX XXXX 4821')).toEqual({ last4: '4821', full: false });
    expect(cardLast4('4111 1111 1111 1111')).toEqual({ last4: '1111', full: true });
    expect(cardLast4('482')).toBeNull();
    expect(scrub('Paid with 4111-1111-1111-1111 at TAJ')).toEqual({ text: 'Paid with XXXX1111 at TAJ', cut: 1 });
    expect(scrub('Order 123456')).toEqual({ text: 'Order 123456', cut: 0 });
  });
});

describe('card statement: every row is checked', () => {
  it('a clean file: debits, a refund (minus is a credit), the last 4 digits only', () => {
    const p = parseRows(table(['01/09/2026', 'XXXX1234', 'SKYINDIA', '6,840.00'], [], ['02/09/2026', '4111111111111234', 'REFUND SKYINDIA', '-500']), M);
    expect(p.problems).toEqual([]);
    expect(p.fullNumbers).toBe(1);
    expect(p.rows).toEqual([
      { rowNo: 4, txnOn: '2026-09-01', description: 'SKYINDIA', merchant: null, amount: '6840.00', direction: 'debit', currency: 'INR', last4: '1234' },
      { rowNo: 6, txnOn: '2026-09-02', description: 'REFUND SKYINDIA', merchant: null, amount: '500.00', direction: 'credit', currency: 'INR', last4: '1234' },
    ]);
  });

  it('a bank that shows payments as minus', () => {
    const p = parseRows(table(['01/09/2026', '1234', 'TAJ', '-100']), { ...M, negativeIs: 'debit' });
    expect(p.rows[0]).toMatchObject({ direction: 'debit', amount: '100.00' });
  });

  it('debit and credit in two columns; Dr / Cr in a column of its own', () => {
    const split = parseRows([['Date', 'Narration', 'Debit', 'Credit'], ['01/09/2026', 'TAJ', '100', ''], ['02/09/2026', 'REFUND', '', '40'], ['03/09/2026', 'BAD', '1', '2']], { date: 'Date', dateFormat: 'DD/MM/YYYY', description: 'Narration', amountMode: 'split', debit: 'Debit', credit: 'Credit' });
    expect(split.rows.map((r) => r.direction)).toEqual(['debit', 'credit']);
    expect(split.problems).toEqual([{ rowNo: 4, problems: ['Both debit and credit have an amount; a row has one.'] }]);
    const ind = parseRows([['Date', 'Narration', 'Amt', 'Type'], ['01/09/2026', 'TAJ', '100', 'Dr'], ['02/09/2026', 'REFUND', '40', 'CR'], ['03/09/2026', 'X', '5', '?']], { date: 'Date', dateFormat: 'DD/MM/YYYY', description: 'Narration', amountMode: 'indicator', amount: 'Amt', indicator: 'Type' });
    expect(ind.rows.map((r) => r.direction)).toEqual(['debit', 'credit']);
    expect(ind.problems[0].rowNo).toBe(4);
  });

  it('foreign currency rows keep their currency; a bad code is a problem', () => {
    const p = parseRows([['Date', 'Desc', 'Amount', 'Cur'], ['01/09/2026', 'HOTEL DUBAI', '220.00', 'aed'], ['01/09/2026', 'X', '1', 'DIRHAM']], { date: 'Date', dateFormat: 'DD/MM/YYYY', description: 'Desc', amountMode: 'signed', amount: 'Amount', currency: 'Cur' });
    expect(p.rows[0].currency).toBe('AED');
    expect(p.problems[0].problems[0]).toContain('not a currency code');
  });

  it('every wrong row is listed with what to fix', () => {
    const p = parseRows(table(['31/02/2026', '1234', 'A', '10'], ['', '1234', 'Total', '10'], ['01/09/2026', '12', '', '0'], ['01/09/2026', '1234', 'B', '12.345']), M);
    expect(p.problems).toEqual([
      { rowNo: 4, problems: ['"31/02/2026" is not a date written as DD/MM/YYYY.'] },
      { rowNo: 5, problems: ['No date.'] },
      { rowNo: 6, problems: ['No description.', 'The amount is zero.', 'The card number has fewer than 4 digits.'] },
      { rowNo: 7, problems: ['"12.345" is not an amount (up to 2 decimals).'] },
    ]);
  });

  it('a file without the mapped headings, or without rows, says so', () => {
    expect(parseRows([['Date', 'X']], M).problems[0].problems[0]).toContain('no heading row');
    expect(parseRows(table(), M).problems[0].problems[0]).toBe('The file has a heading row but no transactions.');
  });
});

describe('card statement: suggested matches', () => {
  const card = (id: string, o: Partial<MatchCard> = {}): MatchCard => ({ id, txnOn: '2026-09-10', amount: '1000.00', currency: 'INR', direction: 'debit', merchant: 'TAJ HOTEL', holders: ['e1'], ...o });
  const line = (id: string, o: Partial<MatchCandidate> = {}): MatchCandidate => ({ id, employeeId: 'e1', spentOn: '2026-09-10', amount: '1000.00', currency: 'INR', merchant: 'Taj Hotel', ...o });
  const opts = { within: '1', days: 3 };

  it('same holder, amount and date', () => {
    expect([...suggestMatches([card('c1')], [line('l1')], opts)]).toEqual([['c1', 'l1']]);
  });

  it('the amount within the company rounding: 1.00 apart matches, 1.01 does not', () => {
    expect(suggestMatches([card('c1')], [line('l1', { amount: '1001.00' })], opts).get('c1')).toBe('l1');
    expect(suggestMatches([card('c1')], [line('l1', { amount: '1001.01' })], opts).size).toBe(0);
    expect(suggestMatches([card('c1')], [line('l1', { amount: '1000.50' })], { within: '0', days: 3 }).size).toBe(0);
  });

  it('the date window edge: 3 days either side matches, 4 does not', () => {
    expect(suggestMatches([card('c1')], [line('l1', { spentOn: '2026-09-13' })], opts).get('c1')).toBe('l1');
    expect(suggestMatches([card('c1')], [line('l1', { spentOn: '2026-09-07' })], opts).get('c1')).toBe('l1');
    expect(suggestMatches([card('c1')], [line('l1', { spentOn: '2026-09-14' })], opts).size).toBe(0);
    expect(suggestMatches([card('c1', { txnOn: '2026-03-01' })], [line('l1', { spentOn: '2026-02-26' })], opts).get('c1')).toBe('l1');
  });

  it('a refund (credit) is never matched', () => {
    expect(suggestMatches([card('c1', { direction: 'credit' })], [line('l1')], opts).size).toBe(0);
  });

  it('another holder, or another currency, is not matched; foreign lines match in their own currency', () => {
    expect(suggestMatches([card('c1', { holders: ['e2'] })], [line('l1')], opts).size).toBe(0);
    expect(suggestMatches([card('c1', { currency: 'USD', amount: '12.00' })], [line('l1', { amount: '12.00' })], opts).size).toBe(0);
    expect(suggestMatches([card('c1', { currency: 'USD', amount: '12.00' })], [line('l1', { currency: 'USD', amount: '12.00' })], opts).get('c1')).toBe('l1');
  });

  it('the same amount twice: each claim line is suggested once, the nearer date first', () => {
    const m = suggestMatches([card('c1', { txnOn: '2026-09-10' }), card('c2', { txnOn: '2026-09-12' })], [line('l1', { spentOn: '2026-09-12' }), line('l2', { spentOn: '2026-09-10' })], opts);
    expect(m.get('c1')).toBe('l2');
    expect(m.get('c2')).toBe('l1');
    expect(suggestMatches([card('c1'), card('c2')], [line('l1')], opts).size).toBe(1);
  });

  it('the exact amount beats a near one; a like merchant breaks a tie', () => {
    expect(suggestMatches([card('c1')], [line('l1', { amount: '1000.50' }), line('l2', { spentOn: '2026-09-12' })], opts).get('c1')).toBe('l2');
    expect(suggestMatches([card('c1')], [line('l1', { merchant: 'Cafe' }), line('l2')], opts).get('c1')).toBe('l2');
  });
});
