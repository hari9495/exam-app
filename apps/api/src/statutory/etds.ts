// The quarterly TDS statement in the e-TDS text format the government's File Validation Utility (FVU) reads (founder
// decision 5f-D1, 10 Oct 2026; M03 §19.8): a file header, one batch header, a challan record per deposit and the
// deductee records under it, fields joined by "^", lines numbered from 1. The layouts below are data, field by field,
// so they can be checked against the published file format; every field we do not fill is left empty, as the format
// allows. FORMAT is "verify" until the FVU has accepted a file made here (go-live checklist item 16).

export const ETDS_FORMAT = 'PROTEAN-ETDS-REGULAR-24Q (verify)';

export interface Deductor {
  tan: string;
  pan: string;
  name: string;
  address: string[];
  state: string;
  pin: string;
  email: string;
  responsibleName: string;
  responsibleDesignation: string;
  responsiblePan: string | null;
  mobile: string;
}
export interface EtdsChallan {
  bsr: string;
  challanNo: string;
  depositDate: string; // YYYY-MM-DD
  tds: string;
  interest: string;
  fee: string;
  deductees: { pan: string | null; name: string; paid: string; tds: string; paidOn: string; deductedOn: string; noPan: boolean }[];
}
export interface EtdsInput {
  formNo: '24Q' | '138';
  taxYear: string; // 2026-27
  quarter: number;
  createdOn: string; // YYYY-MM-DD
  deductor: Deductor;
  challans: EtdsChallan[];
}

const STATE_CODE: Record<string, string> = { 'IN-AP': '01', 'IN-AS': '02', 'IN-BR': '04', 'IN-DL': '09', 'IN-GA': '10', 'IN-GJ': '11', 'IN-HR': '12', 'IN-KA': '15', 'IN-KL': '16', 'IN-MP': '17', 'IN-MH': '19', 'IN-OR': '26', 'IN-PB': '28', 'IN-RJ': '29', 'IN-TN': '31', 'IN-TS': '36', 'IN-UP': '33', 'IN-WB': '35' };
const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(0, 4)}`;
const money = (x: string) => Number(x).toFixed(2);
const text = (s: string, max: number) => s.replace(/[\^\r\n]/g, ' ').replace(/[^A-Za-z0-9 .,&/()-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** One record from a layout: every named field in order, filled from `v`, empty when absent. */
function record(layout: readonly string[], v: Record<string, string | number | undefined>): string {
  return layout.map((f) => (v[f] === undefined || v[f] === null ? '' : String(v[f]))).join('^');
}

export const FH = ['lineNo', 'recordType', 'fileType', 'uploadType', 'fileDate', 'fileSequence', 'uploaderType', 'tan', 'batches', 'utilityName', 'recordHash', 'fvuVersion', 'fileHash', 'samVersion', 'samHash', 'scmVersion', 'scmHash', 'consolidatedHash'] as const;
export const BH = [
  'lineNo', 'recordType', 'batchNo', 'challanCount', 'formNo', 'transactionType', 'batchUpdation', 'originalToken', 'previousToken', 'token', 'tokenDate', 'lastTan', 'tan', 'receiptNo', 'pan', 'assessmentYear', 'financialYear', 'period',
  'deductorName', 'deductorBranch', 'address1', 'address2', 'address3', 'address4', 'address5', 'stateCode', 'pin', 'email', 'std', 'phone', 'addressChanged', 'deductorType',
  'responsibleName', 'responsibleDesignation', 'rAddress1', 'rAddress2', 'rAddress3', 'rAddress4', 'rAddress5', 'rStateCode', 'rPin', 'rEmail', 'mobile', 'rStd', 'rPhone', 'rAddressChanged',
  'totalDeposit', 'unmatchedChallans', 'salaryRecords', 'grossIncomeTotal', 'aoApproval', 'aoApprovalNo', 'lastDeductorType', 'stateName', 'paoCode', 'ddoCode', 'ministry', 'ministryOther', 'responsiblePan', 'paoRegistration', 'ddoRegistration',
  'stdAlt', 'phoneAlt', 'emailAlt', 'rStdAlt', 'rPhoneAlt', 'rEmailAlt', 'ain', 'gstin', 'recordHash',
] as const;
export const CD = [
  'lineNo', 'recordType', 'batchNo', 'challanNo', 'deducteeCount', 'nilChallan', 'challanUpdation', 'filler3', 'filler4', 'filler5', 'lastBankChallanNo', 'bankChallanNo', 'lastTransferVoucher', 'ddoSerial', 'lastBsr', 'bsr', 'lastChallanDate', 'challanDate', 'filler6', 'filler7', 'sectionCode',
  'oltasTax', 'oltasSurcharge', 'oltasCess', 'oltasInterest', 'oltasOthers', 'totalDeposit', 'lastTotalDeposit', 'totalTaxDeposited', 'tdsTax', 'tdsSurcharge', 'tdsCess', 'totalDeducted', 'tdsInterest', 'tdsOthers', 'chequeNo', 'bookEntry', 'remarks', 'lateFee', 'minorHead', 'recordHash',
] as const;
export const DD = [
  'lineNo', 'recordType', 'batchNo', 'challanNo', 'deducteeNo', 'mode', 'employeeSerial', 'deducteeCode', 'lastPan', 'pan', 'lastPanRef', 'panRef', 'name', 'tdsTax', 'tdsSurcharge', 'tdsCess', 'totalDeducted', 'lastTotalDeducted', 'totalDeposited', 'lastTotalDeposited', 'purchaseValue', 'amountPaid',
  'paidOn', 'deductedOn', 'depositedOn', 'rate', 'groupingUp', 'bookEntry', 'certificateDate', 'remarks', 'filler', 'recordHash',
] as const;

/** The return file (CRLF lines). Assessment and financial years in the format's six-digit form (2026-27 → 202627, AY 202728). */
export function etdsFile(i: EtdsInput): Buffer {
  if (!/^[A-Z]{4}\d{5}[A-Z]$/.test(i.deductor.tan)) throw new Error('The TAN of the deductor is like ABCD12345E.');
  if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(i.deductor.pan)) throw new Error('The PAN of the deductor is like ABCDE1234F.');
  const y = Number(i.taxYear.slice(0, 4));
  const fy = `${y}${String((y + 1) % 100).padStart(2, '0')}`;
  const ay = `${y + 1}${String((y + 2) % 100).padStart(2, '0')}`;
  let line = 0;
  const lines: string[] = [];
  lines.push(record(FH, { lineNo: ++line, recordType: 'FH', fileType: 'NS1', uploadType: 'R', fileDate: ddmmyyyy(i.createdOn), fileSequence: 1, uploaderType: 'D', tan: i.deductor.tan, batches: 1, utilityName: 'YukthiX' }));
  const total = i.challans.reduce((t, c) => t + Number(c.tds) + Number(c.interest) + Number(c.fee), 0);
  const a = [...i.deductor.address, '', '', '', '', ''];
  lines.push(
    record(BH, {
      lineNo: ++line, recordType: 'BH', batchNo: 1, challanCount: i.challans.length, formNo: i.formNo, tan: i.deductor.tan, pan: i.deductor.pan, assessmentYear: ay, financialYear: fy, period: `Q${i.quarter}`,
      deductorName: text(i.deductor.name, 75), address1: text(a[0], 25), address2: text(a[1], 25), address3: text(a[2], 25), address4: text(a[3], 25), address5: text(a[4], 25), stateCode: STATE_CODE[i.deductor.state] ?? '', pin: i.deductor.pin, email: i.deductor.email, addressChanged: 'N', deductorType: 'K',
      responsibleName: text(i.deductor.responsibleName, 75), responsibleDesignation: text(i.deductor.responsibleDesignation, 20), rAddress1: text(a[0], 25), rAddress2: text(a[1], 25), rAddress3: text(a[2], 25), rAddress4: text(a[3], 25), rAddress5: text(a[4], 25), rStateCode: STATE_CODE[i.deductor.state] ?? '', rPin: i.deductor.pin, rEmail: i.deductor.email, mobile: i.deductor.mobile, rAddressChanged: 'N',
      totalDeposit: total.toFixed(2), aoApproval: 'N', responsiblePan: i.deductor.responsiblePan ?? '',
    }),
  );
  i.challans.forEach((c, ci) => {
    const deducted = c.deductees.reduce((t, d) => t + Number(d.tds), 0);
    lines.push(
      record(CD, {
        lineNo: ++line, recordType: 'CD', batchNo: 1, challanNo: ci + 1, deducteeCount: c.deductees.length, nilChallan: 'N', bankChallanNo: c.challanNo, bsr: c.bsr, challanDate: ddmmyyyy(c.depositDate), sectionCode: '92B',
        oltasTax: money(c.tds), oltasSurcharge: '0.00', oltasCess: '0.00', oltasInterest: money(c.interest), oltasOthers: money(c.fee), totalDeposit: (Number(c.tds) + Number(c.interest) + Number(c.fee)).toFixed(2), totalTaxDeposited: deducted.toFixed(2), tdsTax: deducted.toFixed(2), tdsSurcharge: '0.00', tdsCess: '0.00', totalDeducted: deducted.toFixed(2), tdsInterest: money(c.interest), tdsOthers: money(c.fee), bookEntry: 'N', lateFee: money(c.fee), minorHead: '200',
      }),
    );
    c.deductees.forEach((d, di) =>
      lines.push(
        record(DD, {
          lineNo: ++line, recordType: 'DD', batchNo: 1, challanNo: ci + 1, deducteeNo: di + 1, mode: 'O', pan: d.pan ?? 'PANNOTAVBL', name: text(d.name, 75), tdsTax: money(d.tds), tdsSurcharge: '0.00', tdsCess: '0.00', totalDeducted: money(d.tds), totalDeposited: money(d.tds), amountPaid: money(d.paid),
          paidOn: ddmmyyyy(d.paidOn), deductedOn: ddmmyyyy(d.deductedOn), depositedOn: ddmmyyyy(c.depositDate), bookEntry: 'N', remarks: d.noPan ? 'C' : '',
        }),
      ),
    );
  });
  return Buffer.from(lines.join('\r\n') + '\r\n', 'utf8');
}

/** The structural checks the fake validator runs (never a substitute for the FVU): numbering, record order, counts, sums. */
export function etdsStructure(file: Buffer): string[] {
  const lines = file.toString('utf8').split('\r\n').filter(Boolean);
  const errors: string[] = [];
  const fields = lines.map((l) => l.split('^'));
  fields.forEach((f, i) => {
    if (f[0] !== String(i + 1)) errors.push(`Line ${i + 1}: the line number is ${f[0]}`);
  });
  if (fields[0]?.[1] !== 'FH' || fields[0].length !== FH.length) errors.push('The first line is the file header');
  if (fields[1]?.[1] !== 'BH' || fields[1].length !== BH.length) errors.push('The second line is the batch header');
  const cds = fields.filter((f) => f[1] === 'CD');
  if (fields[1] && Number(fields[1][3]) !== cds.length) errors.push('The batch header counts the challans wrongly');
  for (const f of fields.slice(2)) if (!['CD', 'DD'].includes(f[1]) || f.length !== (f[1] === 'CD' ? CD.length : DD.length)) errors.push(`Line ${f[0]}: unexpected record`);
  for (const cd of cds) {
    const dds = fields.filter((f) => f[1] === 'DD' && f[3] === cd[3]);
    if (Number(cd[4]) !== dds.length) errors.push(`Challan ${cd[3]}: ${dds.length} deductees, header says ${cd[4]}`);
    const sum = dds.reduce((t, f) => t + Number(f[DD.indexOf('totalDeducted')]), 0);
    if (Math.abs(sum - Number(cd[CD.indexOf('totalDeducted')])) > 0.005) errors.push(`Challan ${cd[3]}: deductees add up to ${sum.toFixed(2)}, the challan says ${cd[CD.indexOf('totalDeducted')]}`);
    for (const dd of dds) if (dd[9] !== 'PANNOTAVBL' && !/^[A-Z]{5}\d{4}[A-Z]$/.test(dd[9])) errors.push(`Line ${dd[0]}: the PAN is not valid`);
  }
  return errors;
}
