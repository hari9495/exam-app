// Practical (not full RFC 5322) email check: requires a real-looking domain
// with a letters-only TLD of 2+ chars, so "a@b.c" no longer passes.
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

// Phone is optional everywhere it's collected, so this only matters when non-empty.
export const PHONE_PATTERN = /^\d{10}$/;
