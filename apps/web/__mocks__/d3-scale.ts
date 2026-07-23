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
