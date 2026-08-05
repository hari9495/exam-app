// Practical (not full RFC 5322) email check: requires a real-looking domain
// with a letters-only TLD of 2+ chars, so "a@b.c" no longer passes.
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

// Phone is optional everywhere it's collected, so this only matters when non-empty.
export const PHONE_PATTERN = /^\d{10}$/;

// The DB stores one `name` column; every form collects First/Middle/Last (middle
// optional) and composes/splits through these two so all of them agree on the shape.
export function composeName(firstName: string, middleName: string, lastName: string): string {
  return [firstName.trim(), middleName.trim(), lastName.trim()].filter(Boolean).join(' ');
}

// Lossy by necessity (the stored value is one string): first word -> First, last
// word -> Last, anything between -> Middle. A legacy single-word name lands in
// First with Last empty rather than losing data.
export function splitName(name: string): { firstName: string; middleName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] ?? '', middleName: '', lastName: '' };
  return { firstName: parts[0], middleName: parts.slice(1, -1).join(' '), lastName: parts[parts.length - 1] };
}
