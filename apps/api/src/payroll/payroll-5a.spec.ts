import { ZERO_HASH, checkBatch, rowHash, type ChainRow } from './audit-chain';
import { maskMetadata } from './audit.service';
import { money } from './documents.service';
import { reopenPhrase } from './periods.service';

// Unit checks of the batch-5a pure parts: the audit hash chain (YX-AUD-03), masking of Confidential values in audit
// details (YX-AUD-06), Indian money format on documents, and the reopen confirmation phrase.

const chain = (n: number): ChainRow[] => {
  const rows: ChainRow[] = [];
  let prev = ZERO_HASH;
  for (let i = 1; i <= n; i++) {
    const base = { id: `00000000-0000-0000-0000-00000000000${i}`, chainKey: '11111111-1111-1111-1111-111111111111', chainSeq: BigInt(i), actorEmail: 'a@x.test', actorName: 'A', actorRole: 'panel', action: 'x.done', entityType: 'thing', entityId: String(i), metadataJson: `{"n":${i}}`, createdAt: new Date(1_700_000_000_000 + i) };
    const hash = rowHash(prev, base);
    rows.push({ ...base, prevHash: prev, rowHash: hash });
    prev = hash;
  }
  return rows;
};

describe('audit hash chain', () => {
  const start = { seq: BigInt(0), hash: ZERO_HASH };

  it('a whole chain verifies, batch after batch', () => {
    const rows = chain(5);
    const first = checkBatch(start, rows.slice(0, 2));
    expect('cursor' in first).toBe(true);
    const second = checkBatch((first as { cursor: { seq: bigint; hash: string } }).cursor, rows.slice(2));
    expect(second).toEqual({ cursor: { seq: BigInt(5), hash: rows[4].rowHash } });
  });

  it('finds a changed row, a removed row and a re-pointed row', () => {
    const changed = chain(3);
    changed[1] = { ...changed[1], metadataJson: '{"n":99}' };
    expect(checkBatch(start, changed)).toEqual({ seq: BigInt(2), problem: 'Row 2 was changed after it was written' });
    const gap = chain(3);
    expect(checkBatch(start, [gap[0], gap[2]])).toEqual({ seq: BigInt(2), problem: 'Rows 2 to 2 are missing' });
    const repointed = chain(3);
    repointed[2] = { ...repointed[2], prevHash: ZERO_HASH };
    expect(checkBatch(start, repointed)).toEqual({ seq: BigInt(3), problem: 'Row 3 does not point at the row before it' });
  });
});

describe('masking Confidential values in audit details', () => {
  const details = { legalEntityId: 'e1', annualCtc: '780000', netPay: '1', network: 'kept', lines: [{ amount: '12' }], bank: { accountNumber: '1234' }, pan: 'ABCDE1234F', reason: 'Promotion' };

  it('hides pay and identity values without the field permission, keeping the rest', () => {
    expect(maskMetadata(details, false, false)).toEqual({ legalEntityId: 'e1', annualCtc: '•••• (hidden)', netPay: '•••• (hidden)', network: 'kept', lines: [{ amount: '•••• (hidden)' }], bank: '•••• (hidden)', pan: '•••• (hidden)', reason: 'Promotion' });
  });

  it('shows them to a reader who holds both permissions', () => {
    expect(maskMetadata(details, true, true)).toEqual(details);
  });
});

describe('documents and confirmations', () => {
  it('writes rupees in the Indian grouping from Decimal text', () => {
    expect(money('55380')).toBe('Rs. 55,380.00');
    expect(money('1234567.5')).toBe('Rs. 12,34,567.50');
    expect(money('999')).toBe('Rs. 999.00');
  });

  it('asks for the entity and month in capitals to reopen', () => {
    expect(reopenPhrase('kfpl-tn', '2026-09')).toBe('REOPEN KFPL-TN 2026-09');
  });
});
