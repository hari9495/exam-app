import { NotFoundException } from '@nestjs/common';
import { AuditService } from '@exam-platform/shared';
import { PayDocumentsService } from './documents.service';
import { sha256 } from './pay-file-store';

// T9-02: the alumni login shows a former employee's payslips by the pay documents portal's rules. The service finds the
// person's employee record (left within 7 years, not working here again), sets the database guard to it, and reads only
// that employee's documents: one alumnus never reaches another's payslip, even with its id.
describe('alumni pay documents (the pay portal rules, for one person)', () => {
  const PDF = Buffer.from('%PDF-1.7 payslip');
  // Two alumni: Rohan (person pR, employee eR) and Meena (person pM, employee eM), and someone still employed (pX).
  const EMPLOYEE: Record<string, string> = { pR: 'eR', pM: 'eM' };
  const DOCS = [
    { id: 'dR', employeeId: 'eR', kind: 'payslip', status: 'issued', fileRef: 'f', sha256: sha256(PDF), referenceNo: 'PS/2026/1', issuedAt: new Date(), periodStart: null },
    { id: 'dM', employeeId: 'eM', kind: 'payslip', status: 'issued', fileRef: 'f', sha256: sha256(PDF), referenceNo: 'PS/2026/2', issuedAt: new Date(), periodStart: null },
  ];
  let guard: string | null = null;
  const tx = {
    // formerEmployee(): the person id is the parameter of the `who` fragment.
    $queryRaw: async (_s: TemplateStringsArray, ...values: unknown[]) => {
      const who = values.find((v): v is { values: unknown[] } => typeof v === 'object' && v !== null && 'values' in v);
      const id = EMPLOYEE[String(who?.values[0])];
      return id ? [{ id }] : [];
    },
    $executeRaw: async (_s: TemplateStringsArray, employeeId: string) => {
      guard = employeeId;
      return 1;
    },
    payDocument: {
      // The database guard (app.pay_portal_employee) and the query's own filter both hold.
      findFirst: async ({ where }: { where: { id: string; employeeId: string } }) => DOCS.find((d) => d.id === where.id && d.employeeId === where.employeeId && d.employeeId === guard) ?? null,
      findMany: async ({ where }: { where: { employeeId: string } }) => DOCS.filter((d) => d.employeeId === where.employeeId && d.employeeId === guard),
    },
  };
  const service = new PayDocumentsService(null as never, null as never, { get: async () => PDF } as never, null as never, null as never, null as never, null as never);

  beforeEach(() => {
    guard = null;
    jest.spyOn(AuditService, 'recordIn').mockResolvedValue(undefined as never);
  });
  afterEach(() => jest.restoreAllMocks());

  it('an alumnus lists and downloads their own payslip', async () => {
    expect((await service.alumniDocuments(tx as never, 'org', 'pR')).map((d) => d.id)).toEqual(['dR']);
    expect((await service.alumniFile(tx as never, 'org', 'pR', 'dR')).file).toEqual(PDF);
    expect(guard).toBe('eR');
  });

  it("one alumnus cannot fetch another's payslip, even with its id", async () => {
    await expect(service.alumniFile(tx as never, 'org', 'pR', 'dM')).rejects.toBeInstanceOf(NotFoundException);
    expect((await service.alumniDocuments(tx as never, 'org', 'pM')).map((d) => d.id)).toEqual(['dM']);
  });

  it('someone the pay portal would not let in (still employed, or left over 7 years ago) gets nothing', async () => {
    expect(await service.alumniDocuments(tx as never, 'org', 'pX')).toEqual([]);
    await expect(service.alumniFile(tx as never, 'org', 'pX', 'dR')).rejects.toBeInstanceOf(NotFoundException);
    expect(guard).toBeNull();
  });
});
