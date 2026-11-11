import { resolve } from 'path';
import { config } from 'dotenv';
import { e2eDatabase } from '../../src/testing/e2e-database';

// Runs before every e2e file (first in setupFiles): picks the database and refuses the test app's (answer 798).
// apps/api/.env is read here, without overriding what the shell set; Nest's ConfigModule then keeps these values.
config({ path: resolve(__dirname, '../../.env'), quiet: true });
const db = e2eDatabase(process.env);
process.env.DATABASE_URL = db.url;
if (db.migrationUrl) process.env.MIGRATION_DATABASE_URL = db.migrationUrl;
