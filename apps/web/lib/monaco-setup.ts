import { loader } from '@monaco-editor/react';

// Point the Monaco loader at self-hosted assets (public/monaco/vs, populated by
// scripts/copy-monaco.mjs) instead of its default jsdelivr CDN. Candidates take
// exams on locked-down office networks that block third-party CDNs, which left a
// code question's editor stuck on "Loading..." forever. Serving Monaco from the
// app's own origin -- which the candidate can obviously reach -- removes that
// external dependency entirely. See ADO #6825.
//
// Importing this module for its side effect must happen before the first
// <Editor> renders; the exam page imports it at module top for that reason.
//
// The path MUST be absolute, not root-relative. Monaco passes this base URL into its language
// web worker, and a worker's base is a `blob:` URL -- an opaque path that nothing relative can
// be resolved against. With '/monaco/vs' the worker threw before it ever hit the network:
// "Failed to parse URL from /monaco/vs/language/typescript/tsWorker.js" in Chrome, "... is not a
// valid URL" in Firefox. The file itself was always there and served 200; only the resolution
// failed. That cost 13 candidates their editor diagnostics across the 2026-08-08 drives, and the
// knock-on mis-resolution also produced "Can only have one anonymous define call per script file".
//
// Guarded on `window` because origin only exists in the browser. Monaco loads client-side only,
// so skipping this during SSR costs nothing -- and the guard keeps the module import SSR-safe,
// which the exam page's module-top import depends on.
if (typeof window !== 'undefined') {
  loader.config({ paths: { vs: `${window.location.origin}/monaco/vs` } });
}
