// Settings S-9, 8.5 (answer 1332): what a whole-company export leaves out. Secrets never leave YukthiX (password and key
// hashes, tokens, second-factor secrets, sessions); encrypted fields stay encrypted at rest and are left out (bytea).

/** Tables whose rows are sign-in or key material, or YukthiX's own records about the company: never exported. */
const SKIP_TABLE = /(session|token|mfa|webauthn|passkey|otp|password|api_key|secret|recovery|credential|company_exports|support_)/i;
/** Columns that hold a secret, a hash of one, or a file's storage reference. */
const SKIP_COLUMN = /(password|secret|token|hash|otp|private_key|credential|totp|recovery|cipher|encrypted|file_ref|storage_key)/i;

export const exportTable = (table: string) => !SKIP_TABLE.test(table);
export const exportColumn = (column: string, dataType: string) => dataType !== 'bytea' && !SKIP_COLUMN.test(column);

/** shortcut: at most this many rows per table go in one export (the manifest says when a table was cut); upgrade to a streamed archive when a customer reaches it. */
export const MAX_ROWS_PER_TABLE = 50_000;

/** A Postgres identifier from the catalogue, quoted. */
export const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;
