// Compiled languages have a distinct "compile" stage in Piston's response; interpreted
// languages don't, so compileError should always be null for them (see PistonClient).
export const COMPILED_LANGUAGES = new Set(['java', 'csharp', 'cpp', 'go']);
