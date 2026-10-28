import type { PreclearanceItem } from '@yukthix/ui/frame';

/** A pre-clearance as the API sends it (dates as text, the value as a decimal string). */
export interface PreclearanceRow extends Omit<PreclearanceItem, 'value' | 'requestedAt' | 'decidedAt' | 'validUntil' | 'tradedOn'> {
  value: string;
  requestedAt: string;
  decidedAt: string | null;
  validUntil: string | null;
  tradedOn: string | null;
}

const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);

/** PPL-44: the row the designed screens read. */
export const preclearanceItem = (r: PreclearanceRow): PreclearanceItem => ({
  ...r,
  value: Number(r.value),
  requestedAt: new Date(r.requestedAt),
  decidedAt: r.decidedAt ? new Date(r.decidedAt) : null,
  validUntil: r.validUntil ? day(r.validUntil) : null,
  tradedOn: r.tradedOn ? day(r.tradedOn) : null,
});
