// Prints the text of a PDF read from stdin, page by page, with pdf.js (Mozilla). Tests run it as a child process because
// pdfjs-dist is ES-module only and the bundled pdf-parse 1.x fails on small pdfkit files under Node 24.
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const doc = await getDocument({ data: new Uint8Array(Buffer.concat(chunks)), useSystemFonts: false, isEvalSupported: false, verbosity: 0 }).promise;
const pages = [];
for (let i = 1; i <= doc.numPages; i++) {
  const content = await (await doc.getPage(i)).getTextContent();
  pages.push(content.items.map((x) => ('str' in x ? x.str : '')).join(' '));
}
process.stdout.write(JSON.stringify(pages));
