import {
  GOVERNABLE_ROLES,
  GOVERNED_FIELDS,
  parseFieldPermissions,
  validateFieldPermissions,
  hiddenFieldsFor,
  lockedFieldsFor,
  lockedFieldEdits,
} from './field-permissions';

describe('parseFieldPermissions', () => {
  it('returns {} for null', () => {
    expect(parseFieldPermissions(null)).toEqual({});
  });

  it('returns {} for undefined', () => {
    expect(parseFieldPermissions(undefined)).toEqual({});
  });

  it("returns {} for ''", () => {
    expect(parseFieldPermissions('')).toEqual({});
  });

  it('returns {} for invalid JSON', () => {
    expect(parseFieldPermissions('{not valid json')).toEqual({});
  });

  it('returns {} for a non-object JSON value (array)', () => {
    expect(parseFieldPermissions('[1,2,3]')).toEqual({});
  });

  it('returns {} for a non-object JSON value (string)', () => {
    expect(parseFieldPermissions('"hello"')).toEqual({});
  });

  it('returns {} for a non-object JSON value (number)', () => {
    expect(parseFieldPermissions('42')).toEqual({});
  });

  it('parses a new object-form config (per-field level)', () => {
    const json = JSON.stringify({ candidate: { panel: { email: 'hidden', phone: 'readonly' } } });
    expect(parseFieldPermissions(json)).toEqual({ candidate: { panel: { email: 'hidden', phone: 'readonly' } } });
  });

  it('normalizes a legacy array config to all-hidden object form', () => {
    const json = JSON.stringify({ candidate: { panel: ['email'] } });
    expect(parseFieldPermissions(json)).toEqual({ candidate: { panel: { email: 'hidden' } } });
  });

  it('drops unknown levels / fields / roles leniently on read', () => {
    const json = JSON.stringify({ candidate: { panel: { email: 'bogus', phone: 'readonly' }, admin: { email: 'hidden' } } });
    expect(parseFieldPermissions(json)).toEqual({ candidate: { panel: { phone: 'readonly' } } });
  });
});

describe('validateFieldPermissions', () => {
  it('accepts a new object-form config with per-field levels', () => {
    const input = { candidate: { panel: { email: 'hidden', phone: 'readonly' } } };
    expect(validateFieldPermissions(input)).toEqual({ candidate: { panel: { email: 'hidden', phone: 'readonly' } } });
  });

  it('accepts + normalizes a legacy array config to all-hidden', () => {
    expect(validateFieldPermissions({ candidate: { panel: ['email'] } })).toEqual({ candidate: { panel: { email: 'hidden' } } });
  });

  it('accepts an empty object', () => {
    expect(validateFieldPermissions({})).toEqual({});
  });

  it('rejects an invalid level', () => {
    expect(() => validateFieldPermissions({ candidate: { panel: { email: 'bogus' } } })).toThrow();
  });

  it('throws on non-object input', () => {
    expect(() => validateFieldPermissions('nope')).toThrow();
    expect(() => validateFieldPermissions(null)).toThrow();
    expect(() => validateFieldPermissions(42)).toThrow();
  });

  it('throws on array input', () => {
    expect(() => validateFieldPermissions([1, 2])).toThrow();
  });

  it('throws on unknown entity', () => {
    expect(() => validateFieldPermissions({ widget: { panel: ['email'] } })).toThrow();
  });

  it('throws on a non-governable role', () => {
    expect(() => validateFieldPermissions({ candidate: { admin: ['email'] } })).toThrow();
  });

  it('throws on a field not in GOVERNED_FIELDS for the entity', () => {
    expect(() => validateFieldPermissions({ candidate: { panel: ['notAField'] } })).toThrow();
  });

  it('throws when the per-role value is not an array', () => {
    expect(() => validateFieldPermissions({ candidate: { panel: 'email' } })).toThrow();
  });

  it('throws when the roles map for an entity is not an object', () => {
    expect(() => validateFieldPermissions({ candidate: ['panel'] })).toThrow();
    expect(() => validateFieldPermissions({ candidate: null })).toThrow();
  });

  it('throws when an array entry is not a string', () => {
    expect(() => validateFieldPermissions({ candidate: { panel: [1, 2] } })).toThrow();
  });
});

describe('hiddenFieldsFor', () => {
  const cfg = validateFieldPermissions({
    candidate: { panel: ['email', 'phone'] },
    job: { recruiter: ['salaryMin'] },
  });

  it('returns empty Set for admin role', () => {
    expect(hiddenFieldsFor(cfg, 'candidate', 'admin')).toEqual(new Set());
  });

  it('returns empty Set for an unknown role', () => {
    expect(hiddenFieldsFor(cfg, 'candidate', 'nonexistent')).toEqual(new Set());
  });

  it('returns configured fields for a governable role', () => {
    expect(hiddenFieldsFor(cfg, 'candidate', 'panel')).toEqual(new Set(['email', 'phone']));
  });

  it('returns empty Set when the role has no entry for that entity', () => {
    expect(hiddenFieldsFor(cfg, 'job', 'panel')).toEqual(new Set());
  });

  it('drops stale fields no longer present in GOVERNED_FIELDS', () => {
    // a config carrying a field that used to be governed but has since been removed from the registry
    const stale = { candidate: { panel: { email: 'hidden', ssn: 'hidden' } } } as unknown as ReturnType<typeof validateFieldPermissions>;
    expect(hiddenFieldsFor(stale, 'candidate', 'panel')).toEqual(new Set(['email']));
  });

  it('does NOT report a readonly field as hidden', () => {
    const cfg2 = validateFieldPermissions({ candidate: { panel: { email: 'readonly', phone: 'hidden' } } });
    expect(hiddenFieldsFor(cfg2, 'candidate', 'panel')).toEqual(new Set(['phone']));
  });
});

describe('lockedFieldsFor + lockedFieldEdits', () => {
  const cfg = validateFieldPermissions({ job: { recruiter: { salaryMin: 'readonly', salaryMax: 'hidden', department: 'readonly' } } });

  it('locks both readonly AND hidden fields for edits', () => {
    expect(lockedFieldsFor(cfg, 'job', 'recruiter')).toEqual(new Set(['salaryMin', 'salaryMax', 'department']));
  });

  it('is empty for an ungoverned role', () => {
    expect(lockedFieldsFor(cfg, 'job', 'org_admin')).toEqual(new Set());
  });

  it('flags only locked fields whose value actually changes', () => {
    const locked = new Set(['salaryMin', 'department']);
    const current = { salaryMin: 100, department: 'Eng', title: 'x' };
    // salaryMin changed, department unchanged (no-op resend), title not locked
    expect(lockedFieldEdits(locked, { salaryMin: 200, department: 'Eng', title: 'y' }, current)).toEqual(['salaryMin']);
  });

  it('ignores locked fields absent from the patch', () => {
    expect(lockedFieldEdits(new Set(['salaryMin']), { title: 'y' }, { salaryMin: 100 })).toEqual([]);
  });

  it('compares array/object fields structurally (fit rubric no-op resend is not an edit)', () => {
    const rubric = [{ label: 'a', weight: 1 }];
    expect(lockedFieldEdits(new Set(['fitRubric']), { fitRubric: [...rubric] }, { fitRubric: rubric })).toEqual([]);
    expect(lockedFieldEdits(new Set(['fitRubric']), { fitRubric: [{ label: 'b', weight: 2 }] }, { fitRubric: rubric })).toEqual(['fitRubric']);
  });
});

describe('registry constants', () => {
  it('exposes the expected governable roles', () => {
    expect(GOVERNABLE_ROLES).toEqual(['recruiter', 'panel', 'hiring_manager']);
  });

  it('exposes the expected governed fields', () => {
    expect(GOVERNED_FIELDS.candidate).toEqual(['email', 'phone']);
    expect(GOVERNED_FIELDS.job).toEqual(['salaryMin', 'salaryMax', 'salaryCurrency', 'headcount', 'department', 'fitCriteria', 'fitRubric']);
  });

  it('governs the new fields + role: hides fitRubric from hiring_manager', () => {
    const cfg = validateFieldPermissions({ job: { hiring_manager: ['department', 'fitRubric'] } });
    expect(hiddenFieldsFor(cfg, 'job', 'hiring_manager')).toEqual(new Set(['department', 'fitRubric']));
    // an ungoverned role still gets nothing
    expect(hiddenFieldsFor(cfg, 'job', 'org_admin')).toEqual(new Set());
  });
});
