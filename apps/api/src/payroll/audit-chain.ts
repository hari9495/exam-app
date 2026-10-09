import { createHash } from 'crypto';

// YX-AUD-03: the audit hash chain, checked independently of the database's own function (audit_row_hash in the
// 20261025000000_payroll_5a migration). Both must join the same fields in the same order: a change here without the
// same change there makes every row look tampered, which the e2e test catches at once.

export const ZERO_HASH = '0'.repeat(64);
export const PLATFORM_CHAIN = '00000000-0000-0000-0000-000000000000';

export interface ChainRow {
  id: string;
  chainKey: string;
  chainSeq: bigint;
  prevHash: string;
  rowHash: string;
  actorEmail: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadataJson: string | null;
  createdAt: Date;
}

export function rowHash(prev: string, r: Omit<ChainRow, 'prevHash' | 'rowHash'>): string {
  const parts = [prev, r.chainSeq.toString(), r.chainKey, r.id, r.actorEmail ?? '', r.actorName ?? '', r.actorRole ?? '', r.action, r.entityType, r.entityId ?? '', r.metadataJson ?? '', String(r.createdAt.getTime())];
  return createHash('sha256').update(parts.join('\u001f'), 'utf8').digest('hex');
}

export interface ChainCursor {
  seq: bigint;
  hash: string;
}

export type ChainProblem = { seq: bigint; problem: string };

/**
 * Checks one batch of rows (ordered by chain_seq) against the cursor the previous batch left: no gap, each row points
 * at the one before, and each row's hash matches its content. Returns the new cursor or the first problem.
 */
export function checkBatch(cursor: ChainCursor, rows: readonly ChainRow[]): { cursor: ChainCursor } | ChainProblem {
  let c = cursor;
  for (const r of rows) {
    if (r.chainSeq !== c.seq + BigInt(1)) return { seq: c.seq + BigInt(1), problem: r.chainSeq > c.seq + BigInt(1) ? `Rows ${c.seq + BigInt(1)} to ${r.chainSeq - BigInt(1)} are missing` : `Row ${r.chainSeq} is out of order` };
    if (r.prevHash !== c.hash) return { seq: r.chainSeq, problem: `Row ${r.chainSeq} does not point at the row before it` };
    if (rowHash(r.prevHash, r) !== r.rowHash) return { seq: r.chainSeq, problem: `Row ${r.chainSeq} was changed after it was written` };
    c = { seq: r.chainSeq, hash: r.rowHash };
  }
  return { cursor: c };
}
