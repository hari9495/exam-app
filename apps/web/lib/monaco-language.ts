// Maps a Piston runtime language onto a Monaco grammar for syntax highlighting.
//
// Keys are Piston's own `language` strings (what /runtimes reports), NOT display names.
// Getting that wrong costs nothing at run time and everything visually, which is how C++
// candidates ended up writing in plaintext: the key used to be `cpp`, but Piston reports `c++`.
//
// Shared rather than local to one page because BOTH editors receive a raw Piston language:
// the candidate's exam editor and the recruiter's Starter Code editor in QuestionForm.
const PISTON_TO_MONACO_LANGUAGE: Record<string, string> = {
  javascript: 'javascript',
  typescript: 'typescript',
  python: 'python',
  java: 'java',
  csharp: 'csharp',
  c: 'c',
  'c++': 'cpp',
  go: 'go',
  ruby: 'ruby',
  // sqlite3 is Piston's SQL runtime; Monaco's generic `sql` grammar highlights it fine.
  sqlite3: 'sql',
  // Piston's `basic` is Mono Visual Basic (runtime "mono", aliases vb / visual-basic), not a
  // generic BASIC — so Monaco's `vb` grammar is the right one, despite the names differing.
  basic: 'vb',
  // Piston exposes far more runtimes than Monaco has dedicated grammars for — anything not
  // listed here still executes correctly (this only controls syntax-highlighting), it just
  // falls back to plaintext coloring. Verified against the served Monaco build: `d` (gdc) and
  // `fortran` genuinely have no grammar, so they are deliberately left to that fallback.
};

export function monacoLanguageFor(pistonLanguage: string | undefined): string {
  return (pistonLanguage && PISTON_TO_MONACO_LANGUAGE[pistonLanguage]) || 'plaintext';
}
