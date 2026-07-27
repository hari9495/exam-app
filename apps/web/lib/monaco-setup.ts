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
// loader.config only records config (no DOM/network), so it is safe under SSR.
loader.config({ paths: { vs: '/monaco/vs' } });
