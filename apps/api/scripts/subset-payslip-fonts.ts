import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FONT_DIR, FONT_FILE, labelText, type LocalLanguage } from '../src/documents/payslip-languages';

// Cuts the Google Noto fonts down to the glyphs the payslip labels use (decision 5b-D2), keeping the shaping tables so
// conjuncts and vowel signs still join. Needs fonttools (pip install fonttools) and the original fonts from
// https://github.com/notofonts/notofonts.github.io/tree/main/fonts/<Family>/hinted/ttf/ in one folder:
//   npx ts-node scripts/subset-payslip-fonts.ts <folder with NotoSans{Devanagari,Tamil,Telugu,Kannada}-Regular.ttf>
const source = process.argv[2];
if (!source) {
  console.error('Usage: subset-payslip-fonts.ts <folder with the original Noto fonts>');
  process.exit(1);
}
const work = mkdtempSync(join(tmpdir(), 'payslip-fonts-'));
for (const lang of Object.keys(FONT_FILE) as LocalLanguage[]) {
  const original = join(source, FONT_FILE[lang].replace('.subset', ''));
  const text = join(work, `${lang}.txt`);
  // Digits, separators and the space are kept too, for anything printed beside a label.
  // The decomposed forms too (the layout engine splits two-part vowel signs) and the dotted circle it may insert.
  writeFileSync(text, `${labelText(lang)}${labelText(lang).normalize('NFD')}◌ 0123456789/:.,-()`, 'utf8');
  execFileSync('pyftsubset', [original, `--text-file=${text}`, '--layout-features=*', '--no-hinting', '--desubroutinize', `--output-file=${join(FONT_DIR, FONT_FILE[lang])}`], { stdio: 'inherit' });
  console.log(`${lang}: ${FONT_FILE[lang]}`);
}
