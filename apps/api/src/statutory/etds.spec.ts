import { BH, CD, DD, FH, etdsFile, etdsStructure, type EtdsInput } from './etds';
import { mkdtemp, readdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import JSZip from 'jszip';
import { FvuRunner, FvuUnavailable, fvuFor, reportLines, unpackTool } from './fvu';

const input: EtdsInput = {
  formNo: '138',
  taxYear: '2026-27',
  quarter: 3,
  createdOn: '2027-01-20',
  deductor: {
    tan: 'BLRK12345E',
    pan: 'AAACK1234F',
    name: 'Kaveri Foods Pvt Ltd',
    address: ['12 MG Road', 'Bengaluru'],
    state: 'IN-KA',
    pin: '560001',
    email: 'tax@kaveri.test',
    responsibleName: 'Divya R',
    responsibleDesignation: 'CFO',
    responsiblePan: null,
    mobile: '9845012345',
  },
  challans: [
    {
      bsr: '0510308',
      challanNo: '00042',
      depositDate: '2026-11-06',
      tds: '30000.00',
      interest: '0.00',
      fee: '0.00',
      deductees: [
        { pan: 'ABCPE1234F', name: 'Asha^Rao', paid: '200000.00', tds: '25000.00', paidOn: '2026-10-31', deductedOn: '2026-10-31', noPan: false },
        { pan: null, name: 'Ravi K', paid: '25000.00', tds: '5000.00', paidOn: '2026-10-31', deductedOn: '2026-10-31', noPan: true },
      ],
    },
  ],
};

describe('e-TDS return file and the File Validation Utility seam (5f-D1)', () => {
  it('writes numbered, caret-separated FH, BH, CD and DD records with every field of each layout', () => {
    const lines = etdsFile(input)
      .toString()
      .split('\r\n')
      .filter(Boolean)
      .map((l) => l.split('^'));
    expect(lines.map((l) => l[1])).toEqual(['FH', 'BH', 'CD', 'DD', 'DD']);
    expect(lines.map((l) => l.length)).toEqual([FH.length, BH.length, CD.length, DD.length, DD.length]);
    expect(lines.map((l) => l[0])).toEqual(['1', '2', '3', '4', '5']);
    const bh = lines[1];
    expect([bh[BH.indexOf('formNo')], bh[BH.indexOf('financialYear')], bh[BH.indexOf('assessmentYear')], bh[BH.indexOf('period')], bh[BH.indexOf('stateCode')]]).toEqual([
      '138',
      '202627',
      '202728',
      'Q3',
      '15',
    ]);
    const dd = lines[4];
    expect([dd[DD.indexOf('pan')], dd[DD.indexOf('remarks')], dd[DD.indexOf('depositedOn')]]).toEqual(['PANNOTAVBL', 'C', '06112026']);
    // A caret in a name can never break a record.
    expect(lines[3][DD.indexOf('name')]).toBe('Asha Rao');
    expect(etdsStructure(etdsFile(input))).toEqual([]);
  });

  it('the structural checks catch a deductee total that does not match its challan, and bad numbering', () => {
    const text = etdsFile(input).toString();
    expect(etdsStructure(Buffer.from(text.replace('^25000.00^0.00^0.00^25000.00^', '^25000.00^0.00^0.00^26000.00^')))).toEqual(expect.arrayContaining([expect.stringMatching(/add up to/)]));
    expect(etdsStructure(Buffer.from(text.replace('\r\n3^CD', '\r\n9^CD')))).toEqual(expect.arrayContaining(['Line 3: the line number is 9']));
    expect(() => etdsFile({ ...input, deductor: { ...input.deductor, tan: 'BAD' } })).toThrow(/TAN/);
  });

  it('without the FVU: a fake in development that says it is a fake; production refuses', async () => {
    const env = { ...process.env };
    delete process.env.FVU_DIR;
    delete process.env.FVU_JRE_IMAGE;
    delete process.env.FVU_ARGS;
    try {
      process.env.NODE_ENV = 'test';
      expect(await new FvuRunner().validate(etdsFile(input), '2026-27', null)).toMatchObject({ ok: true, validator: 'fake', output: null });
      process.env.NODE_ENV = 'production';
      await expect(new FvuRunner().validate(etdsFile(input), '2026-27', null)).rejects.toBeInstanceOf(FvuUnavailable);
    } finally {
      process.env = env;
    }
  });

  it('picks the FVU release by year, and refuses an unpinned image, a missing challan file and a package whose hash differs', async () => {
    expect(fvuFor('2025-26').version).toBe('9.5');
    expect(fvuFor('2026-27').version).toBe('1.2');
    const env = { ...process.env };
    const dir = await mkdtemp(join(tmpdir(), 'fvu-spec-'));
    try {
      process.env.FVU_DIR = dir;
      process.env.FVU_ARGS = '["{input}"]';
      process.env.FVU_JRE_IMAGE = 'eclipse-temurin:17-jre';
      await expect(new FvuRunner().validate(etdsFile(input), '2026-27', Buffer.from('x'))).rejects.toThrow(/digest/);
      process.env.FVU_JRE_IMAGE = `eclipse-temurin@sha256:${'a'.repeat(64)}`;
      await expect(new FvuRunner().validate(etdsFile(input), '2026-27', null)).rejects.toThrow(/CSI/);
      await writeFile(join(dir, 'TDS_STANDALONE_FVU_1.2.zip'), 'tampered');
      await expect(new FvuRunner().validate(etdsFile(input), '2026-27', Buffer.from('x'))).rejects.toThrow(/SHA-256/);
    } finally {
      process.env = env;
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('unpacks only jars and certificates, flat, never outside its folder; reads reports as plain capped text', async () => {
    const zip = new JSZip();
    zip.file('TDS_STANDALONE_FVU_1.2/TDS_STANDALONE_FVU_1.2.jar', 'jar');
    zip.file('../../evil.jar', 'evil');
    zip.file('TDS_STANDALONE_FVU_1.2/run.bat', 'start javaw');
    const dir = await mkdtemp(join(tmpdir(), 'fvu-unpack-'));
    try {
      expect(await unpackTool(await zip.generateAsync({ type: 'nodebuffer' }), dir)).toEqual(['TDS_STANDALONE_FVU_1.2.jar']);
      expect(await readdir(dir)).toEqual(['TDS_STANDALONE_FVU_1.2.jar']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
    expect(reportLines(`<html><script>alert(1)</script><td>T-FV-1001</td><td>Invalid PAN${String.fromCharCode(7)}</td></html>`)).toEqual(['T-FV-1001', 'Invalid PAN']);
    expect(reportLines('x<br>'.repeat(500))).toHaveLength(200);
  });
});
