import { BAND_TEXT, bandAddsStep, bandPosition, compensationText, conditionNames, inr, offerLines, revisionNeedsApproval, statusAfterRevision } from './offer-rules';

describe('HIR-09 offer rules', () => {
  const band = { min: '1200000', max: '1800000' };

  it('places the fixed CTC against the grade range, the limits inside', () => {
    expect(bandPosition('1200000', band)).toBe('within');
    expect(bandPosition('1800000', band)).toBe('within');
    expect(bandPosition('1800001', band)).toBe('above');
    expect(bandPosition('1199999.99', band)).toBe('below');
    expect(bandPosition('5000000', null)).toBe('none');
  });

  it('adds the extra step only above the range (founder decision 4)', () => {
    expect(bandAddsStep('above')).toBe(true);
    expect(['within', 'below', 'none'].map((p) => bandAddsStep(p as never))).toEqual([false, false, false]);
    expect(BAND_TEXT.above).toMatch(/extra approval/);
  });

  it('asks for approval again only when the CTC or the grade changed', () => {
    expect(revisionNeedsApproval(null, { annualCtc: '1600000', gradeId: 'g6' })).toBe(true);
    expect(revisionNeedsApproval({ annualCtc: '1600000.00', gradeId: 'g6' }, { annualCtc: '1600000', gradeId: 'g6' })).toBe(false);
    expect(revisionNeedsApproval({ annualCtc: '1600000', gradeId: 'g6' }, { annualCtc: '1600001', gradeId: 'g6' })).toBe(true);
    expect(revisionNeedsApproval({ annualCtc: '1600000', gradeId: 'g6' }, { annualCtc: '1600000', gradeId: 'g7' })).toBe(true);
    expect(revisionNeedsApproval({ annualCtc: '1600000', gradeId: null }, { annualCtc: '1600000', gradeId: null })).toBe(false);
  });

  it('keeps an approved or sent offer approved when nothing priced changed', () => {
    expect(statusAfterRevision('sent', false)).toBe('approved');
    expect(statusAfterRevision('approved', false)).toBe('approved');
    expect(statusAfterRevision('draft', false)).toBe('draft');
    expect(statusAfterRevision('sent', true)).toBe('draft');
    expect(statusAfterRevision('pending_approval', false)).toBe('draft');
  });

  it('writes the letter text in rupees with Indian grouping', () => {
    expect(inr('1600000')).toBe('₹16,00,000');
    expect(compensationText({ annualCtc: '1600000', variablePay: '0', joiningBonus: '0', clawbackMonths: null })).toBe('Fixed CTC ₹16,00,000 a year');
    expect(compensationText({ annualCtc: '1600000', variablePay: '150000', joiningBonus: '100000', clawbackMonths: 12 })).toBe('Fixed CTC ₹16,00,000 a year; target variable pay ₹1,50,000 a year; a one-time joining bonus of ₹1,00,000, repaid if you leave within 12 months');
  });

  it('keeps earnings and employer costs, drops deductions, adds variable and joining bonus', () => {
    const lines = offerLines(
      [
        { code: 'BASIC', name: 'Basic', kind: 'earning', monthly: '53333.00', annual: '639996.00' },
        { code: 'PF_ER', name: 'Employer PF', kind: 'employer', monthly: '1800.00', annual: '21600.00' },
        { code: 'PF_EE', name: 'Employee PF', kind: 'deduction', monthly: '1800.00', annual: '21600.00' },
        { code: 'NOTE', name: 'Info', kind: 'info', monthly: '0', annual: '0' },
      ],
      '150000',
      '0',
    );
    expect(lines.map((l) => [l.key, l.kind])).toEqual([['BASIC', 'earning'], ['PF_ER', 'employer'], ['variable', 'variable']]);
    expect(lines[0]).toMatchObject({ annual: 639996, monthly: 53333 });
  });

  it('reads the company conditions one a line', () => {
    expect(conditionNames(' Background check clear \n\nDegree certificate uploaded\nBackground check clear')).toEqual(['Background check clear', 'Degree certificate uploaded']);
    expect(conditionNames('')).toEqual([]);
  });
});
