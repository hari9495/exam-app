import { getEasyApplyProvider, EASY_APPLY_PROVIDER_IDS, secretsMatch, normalizeCommon } from './index';

describe('easy-apply provider registry', () => {
  it('registers indeed + linkedin', () => {
    expect(EASY_APPLY_PROVIDER_IDS).toEqual(['indeed', 'linkedin']);
    expect(getEasyApplyProvider('indeed')?.label).toBe('Indeed Apply');
    expect(getEasyApplyProvider('nope')).toBeUndefined();
  });
});

describe('secretsMatch', () => {
  it('is true only for an exact match', () => {
    expect(secretsMatch('s3cr3t', 's3cr3t')).toBe(true);
    expect(secretsMatch('s3cr3t', 'wrong')).toBe(false);
    expect(secretsMatch('s3cr3t', undefined)).toBe(false);
    expect(secretsMatch('', 'anything')).toBe(false);
    expect(secretsMatch('s3cr3t', 's3cr3t2')).toBe(false); // length mismatch, no throw
  });
});

describe('normalizeCommon', () => {
  const good = {
    applyToken: 'tok-abc',
    applicant: { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', phone: '555' },
    resumeBase64: 'JVBERi0=',
    consentAccepted: true,
  };

  it('maps a well-formed payload to the normalized shape', () => {
    const n = normalizeCommon(good, 'Indeed');
    expect(n).toMatchObject({ applyToken: 'tok-abc', name: 'Jane Doe', email: 'jane@example.com', phone: '555', resumeBase64: 'JVBERi0=', consentAccepted: true });
  });

  it('accepts a flat name + jobReference spelling', () => {
    const n = normalizeCommon({ jobReference: 'tok-x', name: 'Sam Lee', email: 's@x.com', resumeBase64: 'AA==' }, 'LinkedIn');
    expect(n).toMatchObject({ applyToken: 'tok-x', name: 'Sam Lee', email: 's@x.com' });
  });

  it.each([
    ['missing job reference', { ...good, applyToken: undefined, jobReference: undefined }],
    ['missing name', { applyToken: 't', applicant: { email: 'a@b.com' }, resumeBase64: 'AA==' }],
    ['missing email', { applyToken: 't', applicant: { name: 'A' }, resumeBase64: 'AA==' }],
    ['missing résumé', { applyToken: 't', applicant: { name: 'A', email: 'a@b.com' } }],
    ['empty payload', null],
  ])('throws on %s', (_label, payload) => {
    expect(() => normalizeCommon(payload, 'Indeed')).toThrow();
  });
});
