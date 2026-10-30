import { join } from 'path';

// Indian scripts in every PDF: PDFKit's standard fonts (Helvetica) only hold Western Latin, so a name such as "ரவி குமார்"
// printed with them comes out as boxes or wrong letters. writeText splits a string into runs by Unicode script and writes
// each run in a Google Noto font (SIL Open Font Licence, assets/fonts/OFL.txt); PDFKit's fontkit does the OpenType shaping
// (conjuncts, vowel signs) and embeds only the glyphs used. Latin keeps the document's current font.

export const FONT_DIR = join(__dirname, '..', '..', 'assets', 'fonts');

export type Script = 'Devanagari' | 'Bengali' | 'Gujarati' | 'Tamil' | 'Telugu' | 'Kannada' | 'Malayalam' | 'Latin';
type Run = { script: Script | null; text: string };

// The Unicode blocks, start to end.
const BLOCKS: [number, number, Script][] = [
  [0x0900, 0x097f, 'Devanagari'],
  [0x0980, 0x09ff, 'Bengali'],
  [0x0a80, 0x0aff, 'Gujarati'],
  [0x0b80, 0x0bff, 'Tamil'],
  [0x0c00, 0x0c7f, 'Telugu'],
  [0x0c80, 0x0cff, 'Kannada'],
  [0x0d00, 0x0d7f, 'Malayalam'],
  [0xa8e0, 0xa8ff, 'Devanagari'], // Devanagari Extended
];
// The characters beyond Latin-1 that the standard fonts' WinAnsi encoding does hold.
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
// Joiners, the dotted circle and the dandas (shared by the Indic scripts) take the script of the run they sit in.
const INHERIT = new Set(['‌', '‍', '◌', '।', '॥']);

/** The font file of a script, regular or bold. */
export const fontFile = (script: Script, bold = false) => join(FONT_DIR, `NotoSans${script === 'Latin' ? '' : script}-${bold ? 'Bold' : 'Regular'}.ttf`);

/** The script a character needs a Noto font for: an Indian script, 'Latin' (NotoSans: ₹, ā, ś...), or null (the current font). */
function scriptOf(ch: string): Script | null {
  const c = ch.codePointAt(0)!;
  for (const [a, b, s] of BLOCKS) if (c >= a && c <= b) return s;
  if (c < 0x80 || (c >= 0xa0 && c <= 0xff) || WIN_ANSI_EXTRA.has(ch)) return null;
  return 'Latin';
}

/** Splits text into runs of one font each. White space and joiners stay with the run before them. */
export function scriptRuns(text: string): Run[] {
  const runs: Run[] = [];
  for (const ch of text) {
    const last = runs[runs.length - 1];
    const s = INHERIT.has(ch) ? (last?.script ?? 'Devanagari') : last?.script && /\s/.test(ch) ? last.script : scriptOf(ch);
    if (last && last.script === s) last.text += ch;
    else runs.push({ script: s, text: ch });
  }
  return runs;
}

/** The current font's name (a standard PDFKit font: every PDF here starts with Helvetica). */
const currentFont = (doc: PDFKit.PDFDocument) => (doc as unknown as { _font?: { name?: string } })._font?.name ?? 'Helvetica';

/**
 * doc.text with each script run in its own font: same arguments, same wrapping (the runs are PDFKit `continued` text, so they
 * wrap as one paragraph). Bold follows the current font. Plain Latin text goes straight to doc.text.
 */
export function writeText(doc: PDFKit.PDFDocument, text: string, x?: number | PDFKit.Mixins.TextOptions, y?: number, options?: PDFKit.Mixins.TextOptions): PDFKit.PDFDocument {
  if (typeof x === 'object') return writeText(doc, text, undefined, undefined, x);
  const runs = scriptRuns(String(text ?? ''));
  // PDFKit reads an undefined x as the options, so the position is passed only when given.
  const write = (t: string, o?: PDFKit.Mixins.TextOptions) => (x === undefined && y === undefined ? doc.text(t, o) : doc.text(t, x as number, y as number, o));
  if (runs.every((r) => r.script === null)) return write(text, options);
  // shortcut: restores the current font by name, so it assumes a standard font; register the font by name if that changes.
  const latin = currentFont(doc);
  const bold = /bold/i.test(latin);
  // Every run sits on the current font's baseline (PDFKit otherwise hangs each font from its own, taller, ascender).
  const f = doc as unknown as {
    _font: { ascender: number };
    _fontSize: number;
  };
  const baseline = options?.baseline ?? -(f._font.ascender / 1000) * f._fontSize;
  runs.forEach((r, i) => {
    doc.font(r.script ? fontFile(r.script, bold) : latin);
    const o = {
      ...options,
      baseline,
      continued: i < runs.length - 1 || !!options?.continued,
    };
    // ActualText keeps copy and search in the typed order (a pre-base vowel sign is drawn before its consonant).
    if (r.script) doc.markContent('Span', { actual: r.text } as never);
    if (i === 0) write(r.text, o);
    else doc.text(r.text, o);
    if (r.script) doc.endMarkedContent();
  });
  return doc.font(latin);
}

/** doc.heightOfString for text that may mix scripts (measured per run in its own font). */
export function heightOfText(doc: PDFKit.PDFDocument, text: string, options: PDFKit.Mixins.TextOptions & { width: number }): number {
  const runs = scriptRuns(String(text ?? ''));
  if (runs.every((r) => r.script === null)) return doc.heightOfString(text, options);
  const latin = currentFont(doc);
  const bold = /bold/i.test(latin);
  let width = 0;
  let line = 0;
  let tallest = 0;
  for (const r of runs) {
    doc.font(r.script ? fontFile(r.script, bold) : latin);
    width += doc.widthOfString(r.text);
    line = Math.max(line, doc.currentLineHeight(true));
    tallest = Math.max(tallest, doc.heightOfString(r.text, options));
  }
  doc.font(latin);
  // shortcut: lines estimated from the total width (word breaks can add one); exact for the short names and cells this sizes.
  return Math.max(tallest, Math.ceil(width / options.width) * line);
}
