import { entityTimeZone, localDate, todayIst, zoneOf } from '../org-structure/org-validation';
import { PayDocumentsService } from './documents.service';
import { LettersService } from '../documents/letters/letters.service';

// Dates shown to people are the company's day, never the server's UTC day. At 01:00 IST the UTC date is still the day
// before; a document issued then is dated the Indian day.
describe('company dates with a frozen clock at 01:00 IST', () => {
  const ONE_AM_IST = new Date('2026-10-09T19:30:00Z'); // 10 Oct 2026, 01:00 in India; still 9 Oct in UTC

  beforeEach(() => jest.useFakeTimers({ now: ONE_AM_IST, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] }));
  afterEach(() => jest.useRealTimers());

  it('today and any moment are the company’s date, not the UTC day', () => {
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-10-09');
    expect(todayIst()).toBe('2026-10-10');
    expect(localDate(new Date(), 'Asia/Kolkata')).toBe('2026-10-10');
    expect(localDate(new Date(), 'Europe/London')).toBe('2026-10-09');
  });

  it('an entity’s zone is its first location’s, else its country’s, else UTC', async () => {
    expect(zoneOf(['Asia/Dubai'], 'IN')).toBe('Asia/Dubai');
    expect(zoneOf([], 'IN')).toBe('Asia/Kolkata');
    expect(zoneOf([], 'XX')).toBe('UTC');
    const tx = { location: { findMany: async () => [] }, legalEntity: { findFirst: async () => ({ country: 'IN' }) } };
    expect(await entityTimeZone(tx, 'org', 'entity')).toBe('Asia/Kolkata');
  });

  it('the verify page dates a document issued at 01:00 IST with the Indian day', async () => {
    const tx = {
      $executeRaw: async () => 0,
      payDocument: { findFirst: async () => ({ organizationId: 'org', legalEntityId: 'entity', employeeId: 'emp', kind: 'payslip', issuedAt: new Date(), status: 'issued' }) },
      organization: { findUnique: async () => ({ name: 'Kaveri Foods' }) },
      employee: { findFirst: async () => ({ givenName: 'Asha', familyName: 'Rao', preferredName: null }) },
      location: { findMany: async () => [{ timezone: 'Asia/Kolkata' }] },
      legalEntity: { findFirst: async () => ({ country: 'IN' }) },
    };
    const tenantPrisma = { forTenant: (_c: unknown, fn: (t: typeof tx) => unknown) => fn(tx) };
    const service = new PayDocumentsService(null as never, tenantPrisma as never, null as never, null as never, null as never, null as never, null as never);
    expect(await service.verify('ABCDEFGH23')).toMatchObject({ issuedOn: '2026-10-10', status: 'current' });
  });

  it('a lifecycle letter issued at 01:00 IST is dated the Indian day on the shared verify page', async () => {
    const tx = {
      letterIssue: { findFirst: async () => ({ organizationId: 'org', legalEntityId: 'entity', personId: 'p', letterType: 'offer', templateId: 't', issuedAt: new Date(), status: 'issued' }) },
      organization: { findUnique: async () => ({ name: 'Kaveri Foods' }) },
      person: { findFirst: async () => ({ givenName: 'Asha', familyName: 'Rao', preferredName: null }) },
      letterTemplate: { findFirst: async () => ({ name: 'Offer letter' }) },
      location: { findMany: async () => [{ timezone: 'Asia/Kolkata' }] },
      legalEntity: { findFirst: async () => ({ country: 'IN' }) },
    };
    const letters = Object.assign(Object.create(LettersService.prototype), { tenantPrisma: { forTenant: (_c: unknown, fn: (t: typeof tx) => unknown) => fn(tx) } }) as LettersService;
    expect(await letters.verify('ABCDEFGH23')).toMatchObject({ kind: 'Offer letter', issuedOn: '2026-10-10', status: 'current' });
  });
});
