// Split a candidate's single `name` into first/last for vendors that require both. Everything before
// the first space is the first name; the remainder is the last name. A single-token name is used for
// both (most ATS/HRIS reject an empty last name).
export function splitName(name: string): { first: string; last: string } {
  const trimmed = (name ?? '').trim();
  const space = trimmed.indexOf(' ');
  if (space === -1) return { first: trimmed || 'Unknown', last: trimmed || 'Unknown' };
  return { first: trimmed.slice(0, space), last: trimmed.slice(space + 1).trim() };
}

// HTTP Basic auth header for vendors that authenticate with an API key as the username.
export function basicAuth(username: string, password = ''): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

// Parse a vendor credential blob (JSON) previously stored via prepareConfig. Tolerant: a non-JSON
// or empty value yields {} so a missing/legacy secret is treated as "no fields set".
export function parseBlob(secret: string | null): Record<string, string> {
  if (!secret) return {};
  try {
    const parsed = JSON.parse(secret);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}
