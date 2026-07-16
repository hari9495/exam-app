export interface PistonLanguageEntry {
  language: string;
  version: string;
}

// Versions pinned against ghcr.io/engineer-man/piston's default package set as of this
// feature's implementation. If a version is unavailable on the running Piston instance,
// its GET /api/v2/runtimes endpoint lists what's actually installed.
export const PISTON_LANGUAGE_MAP: Record<string, PistonLanguageEntry> = {
  javascript: { language: 'javascript', version: '18.15.0' },
  typescript: { language: 'typescript', version: '5.0.3' },
  python: { language: 'python', version: '3.10.0' },
  java: { language: 'java', version: '15.0.2' },
  csharp: { language: 'csharp', version: '6.12.0' },
  cpp: { language: 'cpp', version: '10.2.0' },
  go: { language: 'go', version: '1.16.2' },
  ruby: { language: 'ruby', version: '3.0.1' },
};

// Compiled languages have a distinct "compile" stage in Piston's response; interpreted
// languages don't, so compileError should always be null for them (see PistonClient).
export const COMPILED_LANGUAGES = new Set(['java', 'csharp', 'cpp', 'go']);
