import { safeNextPath } from './safe-next';

describe('safeNextPath', () => {
  it.each([
    ['/v2/exams', '/v2/exams'],
    ['/yx/people/directory?tab=all#top', '/yx/people/directory?tab=all#top'],
  ])('keeps the same-site path %s', (raw, expected) => expect(safeNextPath(raw)).toBe(expected));

  it.each([null, '', 'v2/exams', 'https://evil.example/x', '//evil.example', '/\\evil.example', '/\t/evil.example', 'javascript:alert(1)'])(
    'drops %p',
    (raw) => expect(safeNextPath(raw)).toBeNull(),
  );
});
