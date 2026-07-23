export function scaleLinear() {
  const scale = ((x: number) => {
    // Simple linear interpolation between domain and range
    return x;
  }) as any;

  scale.domain = jest.fn().mockReturnValue(scale);
  scale.range = jest.fn().mockReturnValue(scale);

  return scale;
}

export function scalePoint<T>() {
  const scale = ((x: T) => {
    // Return a deterministic value based on input
    const index = typeof x === 'string' ? parseInt(x.slice(-2)) || 0 : 0;
    return index * 20;
  }) as any;

  scale.domain = jest.fn().mockReturnValue(scale);
  scale.range = jest.fn().mockReturnValue(scale);

  return scale;
}

export function scaleBand<T extends string>() {
  let domainValues: T[] = [];
  let rangeValues: [number, number] = [0, 0];
  let paddingValue = 0;

  const scale = ((key: T) => {
    const index = domainValues.indexOf(key);
    if (index === -1) return 0;
    const step = (rangeValues[1] - rangeValues[0]) / Math.max(domainValues.length, 1);
    return rangeValues[0] + index * step;
  }) as any;

  scale.domain = jest.fn((d?: T[]) => {
    if (d) domainValues = d;
    return scale;
  });
  scale.range = jest.fn((r?: [number, number]) => {
    if (r) rangeValues = r;
    return scale;
  });
  scale.padding = jest.fn((p?: number) => {
    if (p !== undefined) paddingValue = p;
    return scale;
  });
  scale.bandwidth = jest.fn(() => {
    const step = (rangeValues[1] - rangeValues[0]) / Math.max(domainValues.length, 1);
    return step * (1 - paddingValue);
  });

  return scale;
}
