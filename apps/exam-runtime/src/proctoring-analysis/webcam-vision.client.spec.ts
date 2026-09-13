import { WebcamVisionClient } from './webcam-vision.client';

const providerReturning = (payload: Record<string, unknown>) => ({ generateStructured: jest.fn().mockResolvedValue(payload), ping: jest.fn() });

describe('WebcamVisionClient', () => {
  const client = new WebcamVisionClient();

  it('passes the images through and returns the normalized verdict', async () => {
    const p = providerReturning({ riskLevel: 'high', summary: 'two people', flags: [{ type: 'another_person', note: 'second face' }] });
    const out = await client.analyze(['data:image/jpeg;base64,AAA'], p);
    expect(out.riskLevel).toBe('high');
    expect(out.flags).toHaveLength(1);
    expect(p.generateStructured.mock.calls[0][0].images).toEqual(['data:image/jpeg;base64,AAA']);
  });

  it('drops flags with an unknown type and defaults a bad riskLevel to low', async () => {
    const p = providerReturning({ riskLevel: 'bogus', summary: '', flags: [{ type: 'made_up', note: 'x' }, { type: 'phone_or_device', note: 'y' }] });
    const out = await client.analyze(['data:image/jpeg;base64,AAA'], p);
    expect(out.riskLevel).toBe('low');
    expect(out.flags.map((f) => f.type)).toEqual(['phone_or_device']);
  });
});
