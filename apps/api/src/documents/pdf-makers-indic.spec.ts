import { Prisma } from '@prisma/client';
import { expectNamesIn, INDIC_NAMES } from '../../test/fixtures/indic-names';
import { buildOfferPdf } from '../offers/offer-pdf';
import { renderFormC } from '../payroll/bonus-form-c';
import { ConsultantsService } from '../payroll/consultants.service';
import { necCopyPdf } from '../payroll/country-packs.service';
import { PayDocumentsService } from '../payroll/documents.service';
import { renderPayslipPdf } from '../payroll/payslip-pdf';
import { renderRegister } from '../payroll/statutory-registers.service';
import { myDataPdf } from '../people/my-data-pdf';
import { exportResultsToPdf } from '../reports/exporters/pdf-exporter';
import type { ExportResultRow } from '../reports/reports.service';
import { pdf as deskPdf } from '../service-desk/documents.service';
import { PeriodsService } from '../time/periods.service';

// Every PDF YukthiX makes prints names, addresses and free text in Indian scripts with real glyphs: each maker is fed a
// real name in every script, and the PDF is read back (pdf.js for the drawn glyphs, ActualText for the typed order).
const NAMES = Object.values(INDIC_NAMES);
const [ta, hi, , te, kn, ml, bn, gu] = NAMES;
const D = (x: string) => new Prisma.Decimal(x);
// The private drawing methods use nothing of the service but their arguments (and tx, stubbed).
const call = <T>(proto: object, method: string, ...args: unknown[]) => (proto as Record<string, (...a: unknown[]) => Promise<T>>)[method].apply({}, args);

describe('Indian-script names in every PDF', () => {
  it('payslip', async () => {
    for (const name of NAMES)
      expectNamesIn(await renderPayslipPdf([{ key: 'employeeName', shown: true }], {}, 'kn', { employerName: `${name} Ltd`, employeeName: name }, { title: 'x', watermark: name }), [name]);
  });

  it('payroll letters and certificates (PayDocumentsService.render)', async () => {
    const fields = {
      employerName: `${ta} Pvt Ltd`,
      employeeName: hi,
      address: `${te}, ${kn}`,
      designation: ml,
      earnings: [
        { label: bn, amount: '100.00' },
        { label: gu, amount: '5.00' },
      ],
    };
    const required = [
      { key: 'employerName', label: 'Employer' },
      { key: 'employeeName', label: 'Name' },
      { key: 'address', label: 'Address' },
      { key: 'designation', label: 'Designation' },
    ];
    const t = { key: 'k', version: 1, fields: [], lines: ['earnings'] };
    for (const local of [null, 'hi'] as const)
      expectNamesIn(
        await call<Buffer>(PayDocumentsService.prototype, 'render', 'salary_certificate', `Certificate for ${hi}`, 'REF-1', null, fields, required, t, new Date(), local),
        NAMES.filter((n) => n !== INDIC_NAMES.DevanagariConjunct),
      );
  });

  it('offer letter', async () => {
    const pdf = await buildOfferPdf({
      orgName: `${ta} Industries`,
      letterBody: `Dear ${hi}, ${INDIC_NAMES.DevanagariConjunct} ${te} ${kn} ${ml} ${bn} ${gu}.`,
      candidateName: hi,
      jobTitle: `Engineer (${kn})`,
      compensation: '₹ 12,00,000 a year',
      startDate: new Date('2026-12-01'),
      expiresAt: new Date('2026-11-15'),
    });
    expectNamesIn(pdf, NAMES);
    expect(pdf.toString('latin1')).toMatch(/NotoSans-Regular/); // the rupee sign, which Helvetica lacks
  });

  it('bonus Form C (letterhead, rows, signature block) in its narrow cells', async () => {
    const rows = NAMES.map((n, i) => [i + 1, `BN-00${i}`, n, n, 'Yes', 'Operator', '300', '72000.00', '5998.00', '0.00', '0.00', '', '0.00', '0.00', '5998.00', '', '', '']);
    expectNamesIn(
      await renderFormC({
        entityName: `${ta} Foods`,
        address: [te, `${kn} 560001`],
        title: `Bonus for ${ml}`,
        rows,
      }),
      NAMES,
    );
  });

  it('statutory registers', async () => {
    expectNamesIn(
      await renderRegister(
        'Register of wages',
        `${ta} Mills`,
        '2026-10',
        bn,
        ['Name', 'Father'],
        NAMES.map((n) => [n, gu]),
        'note',
      ),
      NAMES,
    );
  });

  it('consultant payment advice', async () => {
    const tx = {
      consultant: {
        findFirstOrThrow: async () => ({ name: te, bankAccountLast4: '1234' }),
      },
      legalEntity: {
        findFirst: async () => ({ name: `${ta} Advisory`, shortName: 'T' }),
      },
    };
    const inv = {
      status: 'paid',
      consultantId: 'k',
      legalEntityId: 'e',
      invoiceNo: 'INV-1',
      invoiceDate: new Date('2026-10-01'),
      taxableValue: D('1000'),
      cgst: D('90'),
      sgst: D('90'),
      igst: D('0'),
      section: '194J_B',
      tdsAmount: D('100'),
      netPayable: D('1080'),
      paidOn: new Date('2026-10-10'),
      paymentRef: kn,
    };
    expectNamesIn((await call<{ file: Buffer }>(ConsultantsService.prototype, 'advice', tx, 'org', inv)).file, [ta, te, kn]);
  });

  it('1099-NEC copy B', async () => {
    expectNamesIn(
      await necCopyPdf(
        2026,
        `${ta} Inc`,
        '123456789',
        {
          legalName: hi,
          tinKind: 'SSN',
          tinLast4: '6789',
          address: { street: te, city: kn, state: 'CA', zip: '94000' },
        },
        '700.00',
      ),
      [ta, hi, te, kn],
    );
  });

  it('my data export', async () => {
    expectNamesIn(
      await myDataPdf({
        company: `${ta} Ltd`,
        exportedOn: '30 Oct 2026',
        profile: { name: hi, address: te },
        family: [kn, { name: ml, relation: bn }],
        note: gu,
      }),
      [ta, hi, te, kn, ml, bn, gu],
    );
  });

  it('exam results export', async () => {
    const rows = NAMES.map(
      (n) =>
        ({
          candidateName: n,
          status: 'completed',
          score: 5,
          maxScore: 10,
          percentage: 50,
          passFail: 'pass',
          durationMinutes: 30,
          integrityLevel: 'low',
          integrityFlagCount: 0,
          faceEnrolmentStatus: null,
        }) as unknown as ExportResultRow,
    );
    expectNamesIn(await exportResultsToPdf(rows), NAMES);
  });

  it('service desk document and its completion certificate', async () => {
    const pdf = await deskPdf(`Letter for ${ta}`, `Dear ${hi},\n${te} ${kn} ${ml} ${bn} ${gu} ${INDIC_NAMES.DevanagariConjunct}`, (doc) => {
      doc.addPage();
    });
    expectNamesIn(pdf, NAMES);
  });

  it('time registers (muster roll)', async () => {
    const cols = [
      { key: 'name', label: 'Name' },
      { key: 'd1', label: '1' },
      { key: 'father', label: 'Father' },
    ];
    const head = {
      title: 'Form XII',
      form: 'Muster roll',
      establishment: `${ta} Works`,
      period: 'Oct 2026',
      draft: false,
    };
    expectNamesIn(
      await call<Buffer>(
        PeriodsService.prototype,
        'pdf',
        head,
        cols,
        NAMES.map((n) => ({ name: n, d1: 'P', father: gu })),
      ),
      NAMES,
    );
  });
});
