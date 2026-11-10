// Answer 522: a month's issued invoices and credit notes of one GSTIN series as a Tally XML import and a Zoho Books CSV.
// Ledger names, the GST split, TDS and round-off are company settings (6.2); the formats (Tally voucher type names and
// date format, Zoho column headers) are the rule sets EXPORT.TALLY_XML and EXPORT.ZOHO_CSV, marked verify. Money is
// paise in, rupee text out (two decimals); nothing is rounded except the optional whole-rupee round-off.

export interface ExportDoc {
  kind: 'invoice' | 'credit_note';
  number: string;
  date: string; // YYYY-MM-DD
  party: string;
  gstin: string | null;
  stateCode: string;
  stateName: string;
  original: string | null;
  reason: string | null;
  sac: string;
  gstPct: string;
  lines: { description: string; qtyCenti: number; ratePaise: bigint; amountPaise: bigint }[];
  taxable: bigint;
  cgst: bigint;
  sgst: bigint;
  igst: bigint;
  total: bigint;
  /** The TDS the client is expected to deduct (paise), when the company exports it. */
  tds: bigint;
}

export interface ExportSettings {
  sales: string;
  cgst: string;
  sgst: string;
  igst: string;
  gst: string;
  gstSplit: 'separate' | 'combined';
  tds: string;
  tdsMode: 'none' | 'expected';
  roundOff: 'none' | 'rupee';
  roundOffLedger: string;
}

export interface TallyRule {
  voucherType: { invoice: string; credit_note: string };
  /** e.g. "YYYYMMDD" */
  dateFormat: string;
  company: string | null;
}
export interface ZohoRule {
  /** Column headers in order, each with the field it carries. */
  invoiceColumns: { header: string; field: string }[];
  creditNoteColumns: { header: string; field: string }[];
}

const rs = (p: bigint) => {
  const neg = p < 0n;
  const a = neg ? -p : p;
  return `${neg ? '-' : ''}${a / 100n}.${String(a % 100n).padStart(2, '0')}`;
};
const qty = (c: number) => (c / 100).toFixed(2);

/** The whole-rupee round-off of a total: the rounded total and the difference (paise, half up). */
export function roundOff(total: bigint, mode: 'none' | 'rupee') {
  if (mode === 'none') return { total, diff: 0n };
  const r = ((total + 50n) / 100n) * 100n;
  return { total: r, diff: r - total };
}

/** The ledger lines of one document: name and signed amount (positive = credit), summing to zero with the party. */
export function ledgerLines(d: ExportDoc, s: ExportSettings) {
  const sign = d.kind === 'invoice' ? 1n : -1n;
  const out: { ledger: string; amount: bigint }[] = [{ ledger: s.sales, amount: sign * d.taxable }];
  if (s.gstSplit === 'combined') {
    const g = d.cgst + d.sgst + d.igst;
    if (g) out.push({ ledger: s.gst, amount: sign * g });
  } else {
    if (d.cgst) out.push({ ledger: s.cgst, amount: sign * d.cgst });
    if (d.sgst) out.push({ ledger: s.sgst, amount: sign * d.sgst });
    if (d.igst) out.push({ ledger: s.igst, amount: sign * d.igst });
  }
  const r = roundOff(d.total, s.roundOff);
  if (r.diff) out.push({ ledger: s.roundOffLedger, amount: sign * r.diff });
  const tds = s.tdsMode === 'expected' ? d.tds : 0n;
  if (tds) out.push({ ledger: s.tds, amount: -sign * tds });
  // The party takes the rest (a debit for an invoice): the rounded total less the expected TDS.
  const party = -sign * (r.total - tds);
  return { party, lines: out };
}

const xml = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const tallyDate = (iso: string, fmt: string) => fmt.replace('YYYY', iso.slice(0, 4)).replace('MM', iso.slice(5, 7)).replace('DD', iso.slice(8, 10));
// Tally: a debit is a negative amount with ISDEEMEDPOSITIVE Yes; a credit positive with No.
const entry = (ledger: string, credit: bigint) => `      <ALLLEDGERENTRIES.LIST>
       <LEDGERNAME>${xml(ledger)}</LEDGERNAME>
       <ISDEEMEDPOSITIVE>${credit < 0n ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
       <AMOUNT>${rs(credit)}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>`;

export function tallyXml(docs: ExportDoc[], s: ExportSettings, rule: TallyRule) {
  const vouchers = docs.map((d) => {
    const { party, lines } = ledgerLines(d, s);
    const type = rule.voucherType[d.kind];
    const narration = d.kind === 'credit_note' ? `Against ${d.original ?? ''}: ${d.reason ?? ''}` : d.lines.map((l) => l.description).join('; ');
    return `    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <VOUCHER VCHTYPE="${xml(type)}" ACTION="Create">
      <DATE>${tallyDate(d.date, rule.dateFormat)}</DATE>
      <VOUCHERTYPENAME>${xml(type)}</VOUCHERTYPENAME>
      <VOUCHERNUMBER>${xml(d.number)}</VOUCHERNUMBER>
      <REFERENCE>${xml(d.original ?? d.number)}</REFERENCE>
      <PARTYLEDGERNAME>${xml(d.party)}</PARTYLEDGERNAME>
      <PARTYGSTIN>${xml(d.gstin ?? '')}</PARTYGSTIN>
      <PLACEOFSUPPLY>${xml(d.stateName)}</PLACEOFSUPPLY>
      <NARRATION>${xml(narration.slice(0, 500))}</NARRATION>
${entry(d.party, party)}
${lines.map((l) => entry(l.ledger, l.amount)).join('\n')}
     </VOUCHER>
    </TALLYMESSAGE>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
 <HEADER>
  <TALLYREQUEST>Import Data</TALLYREQUEST>
 </HEADER>
 <BODY>
  <IMPORTDATA>
   <REQUESTDESC>
    <REPORTNAME>Vouchers</REPORTNAME>
    <STATICVARIABLES>
     <SVCURRENTCOMPANY>${xml(rule.company ?? '')}</SVCURRENTCOMPANY>
    </STATICVARIABLES>
   </REQUESTDESC>
   <REQUESTDATA>
${vouchers.join('\n')}
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>
`;
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** One CSV of a kind (Zoho imports invoices and credit notes separately): a row per invoice line. */
export function zohoCsv(docs: ExportDoc[], kind: 'invoice' | 'credit_note', s: ExportSettings, rule: ZohoRule) {
  const cols = kind === 'invoice' ? rule.invoiceColumns : rule.creditNoteColumns;
  const rows: string[] = [cols.map((c) => csvCell(c.header)).join(',')];
  for (const d of docs.filter((x) => x.kind === kind)) {
    const r = roundOff(d.total, s.roundOff);
    const tds = s.tdsMode === 'expected' ? d.tds : 0n;
    // Each line's GST in proportion to its amount; the last line takes the remainder, so the lines sum exactly.
    const tax = d.cgst + d.sgst + d.igst;
    const shares = d.lines.map((l) => (d.taxable ? (tax * l.amountPaise) / d.taxable : 0n));
    if (shares.length) shares[shares.length - 1] = tax - shares.slice(0, -1).reduce((x, y) => x + y, 0n);
    d.lines.forEach((l, i) => {
      const v: Record<string, string> = {
        date: d.date,
        number: d.number,
        status: 'Sent',
        customer: d.party,
        gstTreatment: d.gstin ? 'business_gst' : 'business_none',
        gstin: d.gstin ?? '',
        placeOfSupply: d.stateCode,
        item: d.lines.length > 1 ? `Line ${i + 1}` : 'Services',
        description: l.description,
        quantity: qty(l.qtyCenti),
        rate: rs(l.ratePaise),
        sac: d.sac,
        taxName: d.igst ? `IGST${d.gstPct}` : `GST${d.gstPct}`,
        taxPct: d.gstPct,
        taxAmount: rs(shares[i]!),
        adjustment: i === 0 ? rs(r.diff) : '0.00',
        adjustmentDescription: i === 0 && r.diff ? s.roundOffLedger : '',
        tdsName: i === 0 && tds ? s.tds : '',
        tdsAmount: i === 0 ? rs(tds) : '0.00',
        total: rs(r.total),
        original: d.original ?? '',
        reason: d.reason ?? '',
      };
      rows.push(cols.map((c) => csvCell(v[c.field] ?? '')).join(','));
    });
  }
  return rows.join('\r\n') + '\r\n';
}
