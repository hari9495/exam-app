import { Prisma } from '@prisma/client';

// Expenses batch E4 (M05-BUILD-DESIGN §5.5, §9.4, §10; XP-4.03, XP-4.04): the travel booking partner seam and the
// advance arithmetic. Partner booking is a paid add-on the founder has not picked yet (Q3), so only a dev fake exists;
// a tenant without a partner books by uploading tickets.

export type PartnerBooking = { provider: string; ref: string; kind: 'ticket' | 'hotel'; title: string; amount: string };
export type LegForBooking = { fromCity: string; toCity: string; departOn: string; mode: string; stayNights: number };

export interface TravelBookingAdapter {
  readonly name: string;
  /** Books one leg for the traveller and returns what the partner charged the company. */
  book(leg: LegForBooking, currency: string): Promise<PartnerBooking>;
}

export const TRAVEL_BOOKING = Symbol('TRAVEL_BOOKING');

/** No partner: booking through one is refused with a plain reason. */
export class NoTravelPartner implements TravelBookingAdapter {
  readonly name = 'none';
  book(): Promise<PartnerBooking> {
    return Promise.reject(new Error('No travel booking partner is set up. Upload the ticket instead.'));
  }
}

/** Dev and CI only: a stable made-up reference and fare, so the seam is exercised without any network call. */
export class DevFakeTravelPartner implements TravelBookingAdapter {
  readonly name = 'dev-fake';
  async book(leg: LegForBooking): Promise<PartnerBooking> {
    const base = leg.mode === 'air' ? 5400 : leg.mode === 'rail' ? 1200 : 800;
    const ref = `FAKE-${leg.departOn.replace(/-/g, '')}-${leg.fromCity.slice(0, 3).toUpperCase()}${leg.toCity.slice(0, 3).toUpperCase()}`;
    return { provider: this.name, ref, kind: 'ticket', title: `${leg.fromCity} → ${leg.toCity} (${leg.mode})`, amount: base.toFixed(2) };
  }
}

export function travelPartnerFromEnv(env = process.env.TRAVEL_BOOKING_ADAPTER): TravelBookingAdapter {
  if (env === 'dev-fake') {
    if (process.env.NODE_ENV === 'production') throw new Error('TRAVEL_BOOKING_ADAPTER=dev-fake is not allowed in production.');
    return new DevFakeTravelPartner();
  }
  return new NoTravelPartner();
}

const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);

/** The advance's open balance: what was paid less every settlement (claims, returns, recoveries). */
export function openBalance(amount: Prisma.Decimal.Value | null, settled: Prisma.Decimal.Value[]): Prisma.Decimal {
  if (amount === null) return D(0);
  return settled.reduce<Prisma.Decimal>((t, x) => t.sub(D(x)), D(amount));
}

/**
 * An approved claim against an advance: the advance covers what it can; the rest is paid to the person.
 * ₹10,000 advance, ₹7,000 approved → adjusted 7,000, net 0, ₹3,000 left to return (M05 §9, XP-4.04).
 */
export function settleClaim(open: Prisma.Decimal.Value, approved: Prisma.Decimal.Value) {
  const o = Prisma.Decimal.max(D(open), 0);
  const adjusted = Prisma.Decimal.min(o, D(approved));
  return { adjusted: adjusted.toFixed(2), netPayable: D(approved).sub(adjusted).toFixed(2), leftOnAdvance: o.sub(adjusted).toFixed(2) };
}

/** What the trip has used of its estimate: company-paid bookings plus the claims on it (never reimbursed twice). */
export function tripBudget(estimate: Prisma.Decimal.Value, companyPaid: Prisma.Decimal.Value[], claimed: Prisma.Decimal.Value[]) {
  const company = companyPaid.reduce<Prisma.Decimal>((t, x) => t.add(D(x)), D(0));
  const claims = claimed.reduce<Prisma.Decimal>((t, x) => t.add(D(x)), D(0));
  const used = company.add(claims);
  return { estimate: D(estimate).toFixed(2), companyPaid: company.toFixed(2), claimed: claims.toFixed(2), used: used.toFixed(2), left: D(estimate).sub(used).toFixed(2) };
}
