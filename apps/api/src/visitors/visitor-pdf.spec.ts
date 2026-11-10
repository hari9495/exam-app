import { BADGE_SIZE, badgePdf, rollCallPdf } from './visitor-pdf';

describe('visitor PDFs (slice 4)', () => {
  it('the badge is one label-size page with an Indian-script name', async () => {
    const out = await badgePdf({ company: 'Kaveri Foods', location: 'Chennai office', name: 'ரவி குமார்', visitorCompany: null, host: 'Divya', validUntil: '6:30 pm, 2026-11-12', badge: 'V-0413', passCode: 'V-7KQ2-MX4P', minorAdult: 'Lakshmi Rao' });
    const text = out.toString('latin1');
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text.match(/\/Type \/Page\b/g)).toHaveLength(1);
    expect(text).toContain(`/MediaBox [0 0 ${Math.floor(BADGE_SIZE[0])}`);
  });

  it('a photo badge carries the photo (713); a minor never does (614)', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    const base = { company: 'Kaveri Foods', location: 'Chennai office', name: 'Rahul Menon', visitorCompany: null, host: 'Divya', validUntil: '6:30 pm', badge: 'V-0413', passCode: 'V-7KQ2-MX4P', minorAdult: null };
    const images = (b: Buffer) => (b.toString('latin1').match(/\/Subtype \/Image/g) ?? []).length;
    const plain = await badgePdf(base);
    expect(images(await badgePdf({ ...base, photo: png }))).toBeGreaterThan(images(plain));
    expect(images(await badgePdf({ ...base, photo: png, minorAdult: 'Lakshmi Rao' }))).toBe(images(plain));
  });

  it('the roll-call lists both groups and runs onto more pages when long', async () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ name: `Employee ${i}`, code: `KF-${i}`, inAt: '9:00 am' }));
    const out = await rollCallPdf({ company: 'Kaveri Foods', location: 'Chennai office', at: '11:00 am, 2026-11-12', visitors: [], employees: many });
    const text = out.toString('latin1');
    expect(text.startsWith('%PDF-')).toBe(true);
    expect((text.match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
  });
});
