import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { IssueDocumentDto, ReleaseFileDto, SupersedeDocumentDto } from './dto';
import { LetterDto, TemplateVersionDto } from './dto-5b';

// A required nested object (the typed confirmation, a template's sample run) that is left out is a 400, never a 500:
// class-validator skips @ValidateNested on a missing value unless @IsDefined is there too.
describe('payroll DTOs: required nested objects', () => {
  const missing = (cls: new () => object, body: object, field: string) => validateSync(plainToInstance(cls, body) as object).some((e) => e.property === field);

  it('refuses a missing confirmation or sample', () => {
    expect(missing(IssueDocumentDto, { employeeId: '00000000-0000-4000-8000-000000000000', kind: 'payslip', fields: {} }, 'confirmation')).toBe(true);
    expect(missing(SupersedeDocumentDto, { fields: {}, reason: 'A wrong figure' }, 'confirmation')).toBe(true);
    expect(missing(ReleaseFileDto, {}, 'confirmation')).toBe(true);
    expect(missing(LetterDto, { signatory: 'Asha Rao' }, 'confirmation')).toBe(true);
    expect(missing(TemplateVersionDto, { validFrom: '2026-04-01', lines: [{ code: 'basic', formula: '1' }], balancing: 'basic', employerPfInCtc: true, employerEsiInCtc: true, gratuityInCtc: false }, 'sample')).toBe(true);
  });
});
