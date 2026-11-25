// Kept apart from document.tsx: only bundlers (Next, Vite) read import.meta, so Jest never loads this file unless a PDF is drawn.
export const pdfWorkerSrc = () => new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
