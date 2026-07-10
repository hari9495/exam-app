import { shuffle } from './shuffle';

describe('shuffle', () => {
  it('returns an array with the same length as the input', () => {
    const result = shuffle([1, 2, 3, 4, 5]);
    expect(result).toHaveLength(5);
  });

  it('returns an array containing exactly the same elements as the input', () => {
    const input = ['a', 'b', 'c', 'd'];
    const result = shuffle(input);
    expect([...result].sort()).toEqual([...input].sort());
  });

  it('does not mutate the input array', () => {
    const input = [1, 2, 3];
    const inputCopy = [...input];
    shuffle(input);
    expect(input).toEqual(inputCopy);
  });

  it('returns an empty array when given an empty array', () => {
    expect(shuffle([])).toEqual([]);
  });

  it('returns a single-element array unchanged', () => {
    expect(shuffle(['only'])).toEqual(['only']);
  });
});
