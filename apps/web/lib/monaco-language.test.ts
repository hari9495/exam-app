import { monacoLanguageFor } from './monaco-language';

describe('monacoLanguageFor', () => {
  // Regression: the map was keyed `cpp`, but Piston's /runtimes reports the language as
  // `c++` -- so every C++ candidate wrote in an uncoloured plaintext editor, and nothing
  // failed loudly to say so.
  it('maps Piston\'s "c++" (not "cpp") onto the Monaco cpp grammar', () => {
    expect(monacoLanguageFor('c++')).toBe('cpp');
  });

  it('maps Piston\'s sqlite3 runtime onto the generic sql grammar', () => {
    expect(monacoLanguageFor('sqlite3')).toBe('sql');
  });

  it('maps c separately from c++', () => {
    expect(monacoLanguageFor('c')).toBe('c');
  });

  it.each(['javascript', 'typescript', 'python', 'java', 'csharp', 'go', 'ruby'])(
    'maps %s to its own grammar',
    (language) => {
      expect(monacoLanguageFor(language)).toBe(language);
    },
  );

  // These execute fine; Monaco just has no grammar for them, and plaintext is the intended
  // outcome rather than a crash or an undefined language id.
  it.each(['basic', 'd', 'fortran', 'brainfuck'])('falls back to plaintext for %s', (language) => {
    expect(monacoLanguageFor(language)).toBe('plaintext');
  });

  // QuestionForm reads allowedLanguages[0], which is undefined before a language is ticked.
  it('falls back to plaintext when no language is selected yet', () => {
    expect(monacoLanguageFor(undefined)).toBe('plaintext');
  });
});
