import { browserLocation, resetLocationMemory } from './yx-time';

type Opts = PositionOptions | undefined;
const fix = (accuracy: number) => ({ coords: { latitude: 12.97, longitude: 77.59, accuracy } }) as GeolocationPosition;

function mockGeo(answer: (o: Opts) => GeolocationPosition | { code: number } | 'never') {
  const calls: Opts[] = [];
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (ok: PositionCallback, fail: PositionErrorCallback, o?: PositionOptions) => {
        calls.push(o);
        const a = answer(o);
        if (a === 'never') setTimeout(() => fail({ code: 3 } as GeolocationPositionError), o?.timeout ?? 0); // the browser's own timeout
        else if ('coords' in a) ok(a);
        else fail(a as GeolocationPositionError);
      },
    },
  });
  return calls;
}
const ua = (value: string) => Object.defineProperty(navigator, 'userAgent', { configurable: true, value });

describe('browserLocation (founder 21 Oct: Clock in and breaks took ~10 s)', () => {
  beforeEach(() => {
    resetLocationMemory();
    ua('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
  });

  it('uses the quick network fix and never waits for GPS on a laptop', async () => {
    const calls = mockGeo(() => fix(800));
    expect(await browserLocation()).toEqual({ pin: { lat: 12.97, lng: 77.59, accuracyM: 800 } });
    expect(calls.map((o) => o?.enableHighAccuracy)).toEqual([false]);
  });

  it('a browser that never answers costs 3 s at most once; the next punch does not ask again', async () => {
    jest.useFakeTimers();
    const calls = mockGeo(() => 'never');
    const first = browserLocation();
    await jest.advanceTimersByTimeAsync(3_000);
    expect((await first).pin).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.timeout).toBe(3_000);
    expect((await browserLocation()).pin).toBeNull();
    expect(calls).toHaveLength(1);
    jest.useRealTimers();
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
