import { exportColumn, exportTable, ident } from './export-rules';

describe('whole-company export rules (answer 1332)', () => {
  it('keeps company records', () => {
    expect(['employees', 'legal_entities', 'leave_requests', 'audit_logs', 'settings'].every(exportTable)).toBe(true);
    expect(exportColumn('name', 'character varying')).toBe(true);
    expect(exportColumn('organization_id', 'uuid')).toBe(true);
  });

  it('negative: never sign-in material, secrets, encrypted fields, file references or its own exports', () => {
    for (const t of ['sessions', 'refresh_tokens', 'mfa_factors', 'webauthn_credentials', 'api_keys', 'password_resets', 'company_exports', 'support_sessions']) expect([t, exportTable(t)]).toEqual([t, false]);
    for (const c of ['password_hash', 'totp_secret', 'token_hash', 'webhook_secret', 'file_ref']) expect([c, exportColumn(c, 'text')]).toEqual([c, false]);
    expect(exportColumn('aadhaar_number', 'bytea')).toBe(false);
  });

  it('quotes catalogue names', () => {
    expect(ident('a"b')).toBe('"a""b"');
  });
});
