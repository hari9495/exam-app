import { expandedName } from './walk-in.service';

describe('expandedName', () => {
  // The case this exists for: a hand-created record holds a one-word placeholder, and the
  // candidate has just typed their real full name into the walk-in form. Without this their own
  // invite email greets them "Dear Siva" instead of by their actual first name.
  it('expands a stored single word into the fuller name the candidate typed', () => {
    expect(expandedName('Siva', 'Hari Siva Sai Kumar Mada')).toBe('Hari Siva Sai Kumar Mada');
  });

  it('matches the stored word case-insensitively', () => {
    expect(expandedName('siva', 'Hari SIVA Mada')).toBe('Hari SIVA Mada');
  });

  it('fills in a blank stored name, which has nothing to protect', () => {
    expect(expandedName('', 'Hari Mada')).toBe('Hari Mada');
    expect(expandedName('   ', 'Hari Mada')).toBe('Hari Mada');
  });

  // Condition 1: a real, already-complete record is never touched.
  it('leaves a stored multi-word name alone', () => {
    expect(expandedName('Nanji Reddy', 'Somebody Else Entirely')).toBeNull();
    expect(expandedName('Nanji Reddy', 'Nanji Reddy Kumar')).toBeNull();
  });

  // Condition 3: the whole point of the containment check. Anyone can learn an email address.
  it('refuses to replace a single word with an unrelated name', () => {
    expect(expandedName('Siva', 'Bob Smith')).toBeNull();
  });

  // Condition 2: no swapping one single word for another.
  it('refuses a same-length rename', () => {
    expect(expandedName('Siva', 'Bob')).toBeNull();
    expect(expandedName('Siva', 'Siva')).toBeNull();
  });

  it('does not treat a substring as the stored word', () => {
    // "Siv" is not the token "Siva", and "Sivakumar" is a different word.
    expect(expandedName('Siva', 'Sivakumar Reddy')).toBeNull();
  });

  it('ignores an empty submitted name rather than blanking a stored one', () => {
    expect(expandedName('Siva', '')).toBeNull();
    expect(expandedName('Siva', '   ')).toBeNull();
  });

  it('tolerates and tidies untidy whitespace -- the result is stored and rendered', () => {
    expect(expandedName('  Siva  ', '  Hari   Siva   Mada ')).toBe('Hari Siva Mada');
  });
});
