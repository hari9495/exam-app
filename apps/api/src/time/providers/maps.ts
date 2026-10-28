// Maps and place names behind an adapter (BUILD-STANDARD §2, external providers). Provider: to decide.
// The web map (GeoMap) is a plain drawing and needs no tiles; the adapter gives place names near a point.

export const MAPS = Symbol('MAPS');

export interface MapsProvider {
  /** Tile URL template ({z}/{x}/{y}) for a real map, or null when none is set up. */
  readonly tilesUrl: string | null;
  /** A short place name near a point ("Near Adyar, Chennai"), or null when unknown. Never throws. */
  placeNear(lat: number, lng: number): Promise<string | null>;
}

/** Local and test use: no network, the same text for the same point. */
export class DevFakeMaps implements MapsProvider {
  readonly tilesUrl = null;
  async placeNear(lat: number, lng: number) {
    return `Near ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}

/** No provider chosen (production until one is): no place names, never a blocked feature. */
export class NoMaps implements MapsProvider {
  readonly tilesUrl = null;
  async placeNear() {
    return null;
  }
}

/** MAPS_PROVIDER=dev-fake (the default outside production); unknown or unset in production: no place names. */
export function mapsFromEnv(env: NodeJS.ProcessEnv = process.env): MapsProvider {
  const name = env.MAPS_PROVIDER ?? (env.NODE_ENV === 'production' ? 'none' : 'dev-fake');
  return name === 'dev-fake' ? new DevFakeMaps() : new NoMaps();
}
