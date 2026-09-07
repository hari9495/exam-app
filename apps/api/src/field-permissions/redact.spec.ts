import { redactFields, redactMany } from './redact';

describe('redactFields', () => {
  it('nulls out hidden fields', () => {
    const row = { id: '1', email: 'a@b.com', phone: '555', name: 'Ada' };
    const out = redactFields(row, new Set(['email', 'phone']));
    expect(out).toEqual({ id: '1', email: null, phone: null, name: 'Ada' });
  });

  it('nulls out hidden fields via an alias map', () => {
    const row = { id: '1', candidateEmail: 'a@b.com', name: 'Ada' };
    const out = redactFields(row, new Set(['email']), { email: 'candidateEmail' });
    expect(out).toEqual({ id: '1', candidateEmail: null, name: 'Ada' });
  });

  it('returns the same reference when hidden is empty (no-op)', () => {
    const row = { id: '1', email: 'a@b.com' };
    const out = redactFields(row, new Set());
    expect(out).toBe(row);
  });

  it('leaves fields not in hidden untouched', () => {
    const row = { id: '1', email: 'a@b.com', phone: '555' };
    const out = redactFields(row, new Set(['email']));
    expect(out.phone).toBe('555');
    expect(out.id).toBe('1');
  });

  it('does not mutate the input object', () => {
    const row = { id: '1', email: 'a@b.com' };
    redactFields(row, new Set(['email']));
    expect(row.email).toBe('a@b.com');
  });

  it('ignores hidden keys that are not present on the row', () => {
    const row = { id: '1', name: 'Ada' };
    const out = redactFields(row, new Set(['email']));
    expect(out).toEqual({ id: '1', name: 'Ada' });
  });
});

describe('redactMany', () => {
  it('maps redactFields over an array', () => {
    const rows = [
      { id: '1', email: 'a@b.com' },
      { id: '2', email: 'c@d.com' },
    ];
    const out = redactMany(rows, new Set(['email']));
    expect(out).toEqual([
      { id: '1', email: null },
      { id: '2', email: null },
    ]);
  });

  it('returns the same array reference when hidden is empty', () => {
    const rows = [{ id: '1', email: 'a@b.com' }];
    const out = redactMany(rows, new Set());
    expect(out).toBe(rows);
  });

  it('does not mutate input rows', () => {
    const rows = [{ id: '1', email: 'a@b.com' }];
    redactMany(rows, new Set(['email']));
    expect(rows[0].email).toBe('a@b.com');
  });
});
