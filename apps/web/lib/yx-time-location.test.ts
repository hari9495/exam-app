import { browserLocation } from './yx-time';

type Opts = PositionOptions | undefined;
const fix = (accuracy: number) => ({ coords: { latitude: 12.97, longitude: 77.59, accuracy } }) as GeolocationPosition;

function mockGeo(answer: (o: Opts) => GeolocationPosition | { code: number }) {
  const calls: Opts[] = [];
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (ok: PositionCallback, fail: PositionErrorCallback, o?: PositionOptions) => {
        calls.push(o);
        const a = answer(o);
        if ('coords' in a) ok(a);
        else fail(a as GeolocationPositionError);
      },
    },
  });
  return calls;
}
const ua = (value: string) => Object.defineProperty(navigator, 'userAgent', { configurable: true, value });

describe('browserLocation (founder 21 Oct: punches waited up to 10 s for GPS on a laptop)', () => {
  it('uses the quick network fix and never waits for GPS on a laptop', async () => {
    ua('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    const calls = mockGeo(() => fix(800));
    expect(await browserLocation()).toEqual({ pin: { lat: 12.97, lng: 77.59, accuracyM: 800 } });
    expect(calls.map((o) => o?.enableHighAccuracy)).toEqual([false]);
  });

  it('on a phone asks for GPS only when the quick fix is too rough for a geofence', async () => {
    ua('Mozilla/5.0 (Linux; Android 14) Mobile');
    const calls = mockGeo((o) => (o?.enableHighAccuracy ? fix(12) : fix(900)));
    expect((await browserLocation()).pin?.accuracyM).toBe(12);
    expect(calls.map((o) => o?.enableHighAccuracy)).toEqual([false, true]);
  });

  it('says plainly when location is turned off', async () => {
    mockGeo(() => ({ code: 1 }));
    expect((await browserLocation()).problem).toMatch(/Location is turned off/);
  });
});
