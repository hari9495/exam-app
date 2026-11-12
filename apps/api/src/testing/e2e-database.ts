// Which database the API e2e suites may use (founder answer 798, 11 Nov 2026). e2e files create and sweep companies and
// some sweep with dates far ahead; run against the test app's database they deleted a demo visitor's ID. So:
//   - E2E_DATABASE_URL (and E2E_MIGRATION_DATABASE_URL) name the e2e database when set;
//   - otherwise the checkout's own DATABASE_URL is used, except the test app's (examapp_org) and the shared default
//     (examapp), which become <name>_e2e (created once by scripts/e2e-db.sh);
//   - the run is refused unless the database is an e2e one (…_e2e) or a builder's own worktree database (examapp_<name>).
export const PROTECTED_DATABASES = ['examapp', 'examapp_org'] as const;

export interface E2eDatabase {
  name: string;
  url: string;
  migrationUrl: string | undefined;
}

export const databaseName = (url: string): string => decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));

const withName = (url: string, name: string): string => {
  const u = new URL(url);
  u.pathname = `/${encodeURIComponent(name)}`;
  return u.toString();
};

/** Null when the name may be used by the e2e suites, else the reason. */
export function e2eDatabaseProblem(name: string, env: { NODE_ENV?: string }): string | null {
  if (env.NODE_ENV === 'production') return 'NODE_ENV is production: the e2e suites never run there.';
  if (name.endsWith('_e2e')) return null;
  if ((PROTECTED_DATABASES as readonly string[]).includes(name)) return `${name} is the test app's or the shared database: the e2e suites create and delete companies.`;
  if (/^examapp_[a-z0-9_]+$/.test(name)) return null; // a builder's own worktree database
  return `${name} is neither an e2e database (…_e2e) nor a builder's worktree database (examapp_<name>).`;
}

/** The database the e2e suites use, from the environment; throws with what to do when it is not allowed. */
export function e2eDatabase(env: Record<string, string | undefined>): E2eDatabase {
  const base = env.E2E_DATABASE_URL ?? env.DATABASE_URL;
  if (!base) throw new Error('No database for the e2e suites: set E2E_DATABASE_URL (or DATABASE_URL in apps/api/.env).');
  let name = databaseName(base);
  let url = base;
  // The default never touches the test app's or the shared database: it moves to their e2e twin.
  if (!env.E2E_DATABASE_URL && (PROTECTED_DATABASES as readonly string[]).includes(name)) {
    name = `${name}_e2e`;
    url = withName(base, name);
  }
  const problem = e2eDatabaseProblem(name, env);
  if (problem) throw new Error(`Refusing to run the e2e suites on database "${name}". ${problem} Use E2E_DATABASE_URL with a database ending in _e2e (create it once with: sh scripts/e2e-db.sh).`);
  const mig = env.E2E_MIGRATION_DATABASE_URL ?? (env.MIGRATION_DATABASE_URL ? withName(env.MIGRATION_DATABASE_URL, name) : undefined);
  return { name, url, migrationUrl: mig };
}

/**
 * The client address the API e2e suites sign in from, one per e2e database. Every worktree's suites run on this machine
 * against one shared Redis, and they all came from 127.0.0.1: the per-IP sign-in lock (30 failures in 15 min), the OTP
 * per-IP counter and the per-IP throttles added up across worktrees, so one builder's run could make another's sign-ins
 * fail with 429 or 503. A loopback address of the database's own (127.x.y.z, never 127.0.0.1) keeps those counters
 * apart without changing any limit; production never uses this.
 */
export function e2eClientIp(databaseName: string): string {
  let h = 2166136261;
  for (const ch of databaseName) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return `127.${(h >>> 16) & 255}.${(h >>> 8) & 255}.${2 + ((h & 255) % 253)}`;
}
