import { isSupportedCountry } from 'libphonenumber-js';
import ipaddr from 'ipaddr.js';

// Field rules for P01 organisation records, shared by the DTOs and the service. Country data that P07
// packs will own later (state lists, postal-code patterns) is held here for India only, the one live
// region today (P21 §5a).

/** India's states and union territories, ISO 3166-2:IN. */
export const IN_STATES: Readonly<Record<string, string>> = {
  'IN-AN': 'Andaman and Nicobar Islands', 'IN-AP': 'Andhra Pradesh', 'IN-AR': 'Arunachal Pradesh', 'IN-AS': 'Assam',
  'IN-BR': 'Bihar', 'IN-CH': 'Chandigarh', 'IN-CG': 'Chhattisgarh', 'IN-DH': 'Dadra and Nagar Haveli and Daman and Diu',
  'IN-DL': 'Delhi', 'IN-GA': 'Goa', 'IN-GJ': 'Gujarat', 'IN-HR': 'Haryana', 'IN-HP': 'Himachal Pradesh',
  'IN-JK': 'Jammu and Kashmir', 'IN-JH': 'Jharkhand', 'IN-KA': 'Karnataka', 'IN-KL': 'Kerala', 'IN-LA': 'Ladakh',
  'IN-LD': 'Lakshadweep', 'IN-MP': 'Madhya Pradesh', 'IN-MH': 'Maharashtra', 'IN-MN': 'Manipur', 'IN-ML': 'Meghalaya',
  'IN-MZ': 'Mizoram', 'IN-NL': 'Nagaland', 'IN-OD': 'Odisha', 'IN-PY': 'Puducherry', 'IN-PB': 'Punjab',
  'IN-RJ': 'Rajasthan', 'IN-SK': 'Sikkim', 'IN-TN': 'Tamil Nadu', 'IN-TS': 'Telangana', 'IN-TR': 'Tripura',
  'IN-UP': 'Uttar Pradesh', 'IN-UK': 'Uttarakhand', 'IN-WB': 'West Bengal',
};

/**
 * Region catalogue (YX-ORG-30, P21 §3) with the countries each region serves. A legal entity's data region
 * must be live and serve its country (YX-GLB-01); only India is live until the first customer elsewhere.
 */
export const REGIONS: Readonly<Record<string, { live: boolean; countries: readonly string[] }>> = {
  IN: { live: true, countries: ['IN'] },
  'ME-AE': { live: false, countries: ['AE'] },
  'ME-SA': { live: false, countries: ['SA'] },
  EU: { live: false, countries: ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'] },
  US: { live: false, countries: ['US'] },
  SG: { live: false, countries: ['SG'] },
};

export function regionProblem(region: string, country: string): string | null {
  const r = REGIONS[region];
  if (!r) return 'Unknown data region';
  if (!r.live) return `Region ${region} is not open yet`;
  if (!r.countries.includes(country)) return `Region ${region} does not serve ${country}`;
  return null;
}

// India statutory identifiers (P01 §4.1). The database checks the same shapes.
export const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const TAN = /^[A-Z]{4}[0-9]{5}[A-Z]$/;
export const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
/** CIN for a company, LLPIN for an LLP. */
export const CIN = /^([LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}|[A-Z]{3}-[0-9]{4})$/;

/** A GSTIN carries its holder's PAN in characters 3–12. */
export function gstinMatchesPan(gstin: string, pan: string): boolean {
  return gstin.slice(2, 12) === pan;
}

export const isCountry = (code: string) => /^[A-Z]{2}$/.test(code) && isSupportedCountry(code);

// Node 20 ships Intl.supportedValuesOf; the TS lib in use predates it.
const CURRENCIES = new Set((Intl as unknown as { supportedValuesOf(key: 'currency'): string[] }).supportedValuesOf('currency'));
export const isCurrency = (code: string) => CURRENCIES.has(code);

/** An IANA zone the runtime knows (aliases such as Asia/Calcutta included). */
export function isTimeZone(zone: string): boolean {
  if (!/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(zone)) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** ISO 3166-2 subdivision of `country`; India checked against the list. */
export function isSubdivisionOf(state: string, country: string): boolean {
  if (country === 'IN') return state in IN_STATES;
  return new RegExp(`^${country}-[A-Z0-9]{1,3}$`).test(state);
}

/** A structured address (YX-ORG-28): the problem to show, or null. */
export function addressProblem(address: { country: string; state: string; postalCode?: string | null }): string | null {
  if (!isCountry(address.country)) return 'Unknown country';
  if (!isSubdivisionOf(address.state, address.country)) return `Unknown state for ${address.country}`;
  if (address.country === 'IN' && address.postalCode != null && !/^[1-9][0-9]{5}$/.test(address.postalCode)) return 'An Indian PIN code has 6 digits';
  return null;
}

/** IPv4 / IPv6 CIDR range, e.g. 203.0.113.0/24. */
export function isCidr(range: string): boolean {
  try {
    ipaddr.parseCIDR(range);
    return true;
  } catch {
    return false;
  }
}

/** A code made from a name when the customer leaves it blank (YX-ORG-05): CHENNAI-SALES, then CHENNAI-SALES-2… */
export function codeFromName(name: string, taken: ReadonlySet<string>): string {
  const base = name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24).replace(/-+$/, '') || 'X';
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

// Dates are calendar dates (P06 YX-HIS-04). India is one time zone and the only live region, so "today"
// is the IST date. ponytail: per-location zone once a non-IST region opens.
export function todayIst(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
export const asDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
export const addDays = (iso: string, days: number) => isoDate(new Date(asDate(iso).getTime() + days * 86_400_000));
