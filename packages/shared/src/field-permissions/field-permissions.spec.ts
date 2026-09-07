import {
  GOVERNABLE_ROLES,
  GOVERNED_FIELDS,
  parseFieldPermissions,
  validateFieldPermissions,
  hiddenFieldsFor,
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

  it('parses a valid config object', () => {
    const json = JSON.stringify({ candidate: { panel: ['email'] } });
    expect(parseFieldPermissions(json)).toEqual({ candidate: { panel: ['email'] } });
  });
});

describe('validateFieldPermissions', () => {
  it('accepts a valid config', () => {
    const input = { candidate: { panel: ['email'] } };
    expect(validateFieldPermissions(input)).toEqual({ candidate: { panel: ['email'] } });
  });

  it('accepts an empty object', () => {
    expect(validateFieldPermissions({})).toEqual({});
  });

  it('dedupes repeated fields for a role', () => {
    const input = { candidate: { panel: ['email', 'email', 'phone'] } };
    const result = validateFieldPermissions(input);
    expect(result.candidate?.panel).toHaveLength(2);
    expect(new Set(result.candidate?.panel)).toEqual(new Set(['email', 'phone']));
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
    // simulate a config carrying a field that used to be governed but has since
    // been removed from the registry
    const stale = { candidate: { panel: ['email', 'ssn'] } } as unknown as ReturnType<typeof validateFieldPermissions>;
    expect(hiddenFieldsFor(stale, 'candidate', 'panel')).toEqual(new Set(['email']));
  });
});

describe('registry constants', () => {
  it('exposes the expected governable roles', () => {
    expect(GOVERNABLE_ROLES).toEqual(['recruiter', 'panel']);
  });

  it('exposes the expected governed fields', () => {
    expect(GOVERNED_FIELDS.candidate).toEqual(['email', 'phone']);
    expect(GOVERNED_FIELDS.job).toEqual(['salaryMin', 'salaryMax', 'salaryCurrency', 'headcount']);
  });
});
