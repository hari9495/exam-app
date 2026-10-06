// Indian identifier checks for MaskedField (§16). Each returns an error
// message telling the user what to do (§34), or null when valid.

export type IdKind = 'pan' | 'ifsc' | 'uan' | 'aadhaar' | 'phone';

export interface IdSpec {
  /** Normalises raw typing: case, allowed characters, max length. */
  normalise: (raw: string) => string;
  /** Adds display spacing (never stored). */
  display: (value: string) => string;
  validate: (value: string) => string | null;
  placeholder: string;
  inputMode: 'text' | 'numeric' | 'tel';
}

const onlyDigits = (s: string) => s.replace(/\D/g, '');
const alnumUpper = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

// Verhoeff checksum used by Aadhaar.
const VD = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VP = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
export function verhoeffValid(num: string): boolean {
  let c = 0;
  const digits = num.split('').reverse().map(Number);
  for (let i = 0; i < digits.length; i++) c = VD[c][VP[i % 8][digits[i]]];
  return c === 0;
}

export const ID_SPECS: Record<IdKind, IdSpec> = {
  pan: {
    normalise: (s) => alnumUpper(s).slice(0, 10),
    display: (v) => v,
    validate: (v) =>
      /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v) ? null : 'Enter a 10-character PAN like ABCDE1234F',
    placeholder: 'ABCDE1234F',
    inputMode: 'text',
  },
  ifsc: {
    normalise: (s) => alnumUpper(s).slice(0, 11),
    display: (v) => v,
    validate: (v) =>
      /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v) ? null : 'Enter an 11-character IFSC like HDFC0001234',
    placeholder: 'HDFC0001234',
    inputMode: 'text',
  },
  uan: {
    normalise: (s) => onlyDigits(s).slice(0, 12),
    display: (v) => v.replace(/(\d{4})(?=\d)/g, '$1 '),
    validate: (v) => (/^\d{12}$/.test(v) ? null : 'Enter the 12-digit UAN'),
    placeholder: '1000 1234 5678',
    inputMode: 'numeric',
  },
  aadhaar: {
    normalise: (s) => onlyDigits(s).slice(0, 12),
    display: (v) => v.replace(/(\d{4})(?=\d)/g, '$1 '),
    validate: (v) => {
      if (!/^\d{12}$/.test(v)) return 'Enter the 12-digit Aadhaar number';
      if (/^[01]/.test(v) || !verhoeffValid(v)) return 'This Aadhaar number is not valid. Check the digits';
      return null;
    },
    placeholder: '1234 5678 9012',
    inputMode: 'numeric',
  },
  phone: {
    // Indian mobile, stored as 10 digits; the +91 prefix is shown by the field.
    normalise: (s) => {
      let d = onlyDigits(s);
      if (d.length > 10 && d.startsWith('91')) d = d.slice(2);
      if (d.length > 10 && d.startsWith('0')) d = d.slice(1);
      return d.slice(0, 10);
    },
    display: (v) => v.replace(/^(\d{5})(?=\d)/, '$1 '),
    validate: (v) => (/^[6-9]\d{9}$/.test(v) ? null : 'Enter a 10-digit mobile number starting with 6, 7, 8 or 9'),
    placeholder: '98765 43210',
    inputMode: 'tel',
  },
};

/** Masks all but the last 4 digits: "XXXX XXXX 9012". */
export function maskAadhaar(value: string): string {
  const d = value.replace(/\D/g, '');
  if (d.length < 4) return d;
  return `XXXX XXXX ${d.slice(-4)}`;
}
