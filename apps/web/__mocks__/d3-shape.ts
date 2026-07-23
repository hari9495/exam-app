export function line<T>() {
  const generator = ((data: T[]) => {
    return 'M 0 10 L 20 5 L 40 15';
  }) as any;

  generator.x = jest.fn().mockReturnValue(generator);
  generator.y = jest.fn().mockReturnValue(generator);
  generator.curve = jest.fn().mockReturnValue(generator);

  return generator;
}

export function area<T>() {
  const generator = ((data: T[]) => {
    return 'M 0 48 L 20 5 L 40 15 L 40 48 Z';
  }) as any;

  generator.x = jest.fn().mockReturnValue(generator);
  generator.y0 = jest.fn().mockReturnValue(generator);
  generator.y1 = jest.fn().mockReturnValue(generator);
  generator.curve = jest.fn().mockReturnValue(generator);

  return generator;
}

export function curveMonotoneX() {
  return {};
}
