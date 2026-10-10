import { createHash } from 'crypto';
import { DevFakeBgvPartner, DevFakeEsignProvider, DevFakeFaceMatcher, addonsFromEnv } from './addon-adapters';

// The paid add-on seams (LIFE-5.08): each fake keeps the contract a real provider must keep.
describe('add-on adapter seams', () => {
  it('eSign: signs only the exact PDF it was started for', async () => {
    const pdf = Buffer.from('%PDF-1.7 letter');
    const p = new DevFakeEsignProvider();
    const { providerRef, redirectUrl } = await p.start({ documentSha256: createHash('sha256').update(pdf).digest('hex'), signerName: 'Sneha Pillai', returnUrl: 'https://app.test/back' });
    expect(redirectUrl).toContain(providerRef);
    expect((await p.status(providerRef, pdf)).status).toBe('signed');
    expect((await p.status(providerRef, Buffer.from('changed'))).status).toBe('declined');
  });

  it('BGV partner: no consent, no order', async () => {
    const b = new DevFakeBgvPartner();
    await expect(b.order({ checkType: 'education', subject: { name: 'A' }, consentRef: '' })).rejects.toThrow(/consent/);
    const { partnerRef } = await b.order({ checkType: 'education', subject: { name: 'A' }, consentRef: 'c1' });
    expect((await b.result(partnerRef)).status).toBe('clear');
  });

  it('face match fake, and nothing is picked without a choice; the fakes refuse production', async () => {
    expect((await new DevFakeFaceMatcher().match(Buffer.from('x'), Buffer.from('x'))).match).toBe(true);
    expect(addonsFromEnv({})).toEqual({ esign: null, bgv: null, face: null });
    const was = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await expect(new DevFakeBgvPartner().order({ checkType: 'x', subject: { name: 'A' }, consentRef: 'c' })).rejects.toThrow(/DECISION NEEDED/);
    } finally {
      process.env.NODE_ENV = was;
    }
  });
});
