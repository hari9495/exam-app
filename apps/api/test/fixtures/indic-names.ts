import { fontFile, scriptRuns } from '../../src/documents/pdf-text';
import { pdfActualTexts, pdfText } from './pdf-text';
// fontkit is what pdfkit lays text out with (a dependency of pdfkit).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fontkit = require('fontkit') as {
  openSync(p: string): {
    layout(t: string): { glyphs: { id: number; codePoints: number[] }[] };
  };
};

/** A real name in each Indian script the PDFs carry a font for (Hindi with a conjunct too). */
export const INDIC_NAMES: Record<string, string> = {
  Tamil: 'ரவி குமார்',
  Devanagari: 'रवि कुमार',
  DevanagariConjunct: 'क्षितिज',
  Telugu: 'రవి కుమార్',
  Kannada: 'ರವಿ ಕುಮಾರ್',
  Malayalam: 'രവി കുമാർ',
  Bengali: 'রবি কুমার',
  Gujarati: 'રવિ કુમાર',
};

/** The text in the order the shaped glyphs are drawn, which is what pdf.js reads back (null: a glyph is missing). */
export function drawnOrder(text: string): string | null {
  let out = '';
  for (const r of scriptRuns(text)) {
    if (!r.script) {
      out += r.text;
      continue;
    }
    const glyphs = fontkit.openSync(fontFile(r.script)).layout(r.text).glyphs;
    if (glyphs.some((g) => g.id === 0)) return null;
    out += glyphs.map((g) => String.fromCodePoint(...g.codePoints)).join('');
  }
  return out;
}

/** Each name is in the PDF: drawn with real glyphs (read back by pdf.js) and copyable in the typed order (ActualText). */
export function expectNamesIn(pdf: Buffer, names: string[]) {
  const text = pdfText(pdf);
  const actual = pdfActualTexts(pdf).join('');
  for (const n of names) {
    expect({ n, drawn: text.includes(drawnOrder(n)!) }).toEqual({
      n,
      drawn: true,
    });
    expect({ n, typed: actual.includes(n) }).toEqual({ n, typed: true });
  }
}
