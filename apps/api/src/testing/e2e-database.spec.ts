import { databaseName, e2eDatabase, e2eDatabaseProblem } from './e2e-database';

const pg = (db: string, user = 'examapp_app') => `postgresql://${user}:pw@127.0.0.1:5432/${db}?schema=public`;

describe('e2e database guard (answer 798)', () => {
  it('a builder keeps their own worktree database, with its migration login on the same database', () => {
    const d = e2eDatabase({ DATABASE_URL: pg('examapp_timeleave'), MIGRATION_DATABASE_URL: pg('examapp_timeleave', 'examapp_owner') });
    expect(d).toMatchObject({ name: 'examapp_timeleave', url: pg('examapp_timeleave') });
    expect(databaseName(d.migrationUrl!)).toBe('examapp_timeleave');
  });

  it('by default the test app and the shared database move to their e2e twin', () => {
    const org = e2eDatabase({ DATABASE_URL: pg('examapp_org'), MIGRATION_DATABASE_URL: pg('examapp_org', 'examapp_owner') });
    expect(org.name).toBe('examapp_org_e2e');
    expect(databaseName(org.url)).toBe('examapp_org_e2e');
    expect(databaseName(org.migrationUrl!)).toBe('examapp_org_e2e');
    expect(org.url).toContain('?schema=public');
    expect(e2eDatabase({ DATABASE_URL: pg('examapp') }).name).toBe('examapp_e2e');
  });

  it('E2E_DATABASE_URL wins, and an e2e database is always allowed', () => {
    const d = e2eDatabase({ DATABASE_URL: pg('examapp_org'), E2E_DATABASE_URL: pg('ci_e2e'), E2E_MIGRATION_DATABASE_URL: pg('ci_e2e', 'owner') });
    expect(d).toMatchObject({ name: 'ci_e2e', url: pg('ci_e2e'), migrationUrl: pg('ci_e2e', 'owner') });
  });

  it('refuses the test app, the shared database, anything else and production, saying what to do', () => {
    expect(() => e2eDatabase({ E2E_DATABASE_URL: pg('examapp_org') })).toThrow(/Refusing to run the e2e suites on database "examapp_org".*_e2e.*scripts\/e2e-db\.sh/);
    expect(() => e2eDatabase({ E2E_DATABASE_URL: pg('examapp') })).toThrow(/"examapp"/);
    expect(() => e2eDatabase({ DATABASE_URL: pg('yukthix_live') })).toThrow(/neither an e2e database/);
    expect(() => e2eDatabase({ DATABASE_URL: pg('examapp_timeleave'), NODE_ENV: 'production' })).toThrow(/production/);
    expect(() => e2eDatabase({})).toThrow(/No database/);
    expect(e2eDatabaseProblem('examapp_org_e2e', {})).toBeNull();
    expect(e2eDatabaseProblem('Examapp_Org', {})).toMatch(/neither/);
  });
});
