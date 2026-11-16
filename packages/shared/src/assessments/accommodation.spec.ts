import { evidenceType, requestProblem, safeEvidenceName } from './accommodation';

describe('AS-4b accommodation rules', () => {
  it('knows PDF, JPEG and PNG by their first bytes', () => {
    expect(evidenceType(Buffer.from('%PDF-1.7 rest'))).toBe('application/pdf');
    expect(evidenceType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe('image/jpeg');
    expect(evidenceType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png');
  });

  it('negative: anything else is refused, whatever its name says (a script, HTML, an empty file)', () => {
    expect(evidenceType(Buffer.from('<html><script>'))).toBeNull();
    expect(evidenceType(Buffer.from('MZ\x90\x00'))).toBeNull();
    expect(evidenceType(Buffer.alloc(0))).toBeNull();
  });

  it('keeps a safe file name (no path, no odd characters)', () => {
    expect(safeEvidenceName('C:\\Users\\me\\Doctor letter (1).pdf')).toBe('Doctor letter _1_.pdf');
    expect(safeEvidenceName('../../etc/passwd')).toBe('passwd');
    expect(safeEvidenceName('...')).toBe('evidence');
  });

  it('a request names known items once, with extra time only for "time"', () => {
    expect(requestProblem(['time', 'reader'], 25)).toBeNull();
    expect(requestProblem(['reader'], null)).toBeNull();
  });

  it('negative: nothing chosen, unknown or repeated items, time without an amount, an amount without time, an odd amount', () => {
    expect(requestProblem([], null)).toBe('Choose what you need.');
    expect(requestProblem(['teleport'], null)).toBe('Choose from the list.');
    expect(requestProblem(['reader', 'reader'], null)).toBe('Choose from the list.');
    expect(requestProblem(['time'], null)).toBe('Choose how much extra time.');
    expect(requestProblem(['reader'], 25)).toBe('Extra time goes with "Extra time".');
    expect(requestProblem(['time'], 33)).toBe('Choose 25 %, 50 % or 100 % extra time.');
  });
});
