// Builds one Word functional specification from YukthiX/design/*.md + reference screenshots.
const fs = require('fs'), path = require('path');
const d = require('docx');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType,
  ImageRun, AlignmentType, PageBreak, TableLayoutType, TableOfContents, Footer, Header, PageNumber, LevelFormat, BorderStyle } = d;

const ROOT = process.argv[2];                 // .../YukthiX
const OUT = process.argv[3];
const DESIGN = path.join(ROOT, 'design'), REF = path.join(ROOT, 'reference');
const SHOTS = path.join(REF, 'ui-screens'), UIREF = path.join(REF, 'frappe-hrms-functional-spec');
const CONTENT_W = 9638;                       // A4 with 2 cm margins, DXA
const FONT = 'Calibri';

// ---------- screenshot captions from the UI reference docs ----------
const captions = {};
for (const f of fs.readdirSync(UIREF).filter(f => /ui-reference\.md$|11-analytics\.md$/.test(f))) {
  for (const line of fs.readFileSync(path.join(UIREF, f), 'utf8').split(/\r?\n/)) {
    if (!line.includes('.png')) continue;
    // a heading may hold several "Title — [n](x.png), qualifier [m](y.png)" segments separated by " · "
    const segs = line.startsWith('#') ? line.replace(/^#+\s*[\d.]*\s*/, '').split(/\s+·\s+/)
      : line.startsWith('|') ? [line.split('|')[1] + ' — ' + line] : [line];
    for (const seg of segs) {
      const title = seg.split(' — ')[0].replace(/\*\*/g, '').replace(/\[[^\]]*\]\([^)]*\)/g, '').replace(/[,·–-]\s*$/, '').trim();
      const re = /([A-Za-z&' -]*?)\s*\[([^\]]+)\]\(([^)]+\.png)\)/g; let m;
      while ((m = re.exec(seg))) {
        const file = path.basename(m[3]);
        const qual = m[1].replace(/^[,·—\s]+/, '').replace(/^e\.g\.?/, '').trim();
        if (!captions[file]) captions[file] = title + (qual && !title.toLowerCase().includes(qual.toLowerCase()) ? ' — ' + qual : '');
      }
    }
  }
}
const human = f => f.replace(/\.png$/, '').replace(/^m?\d+[a-z]?-/, '').replace(/-/g, ' ');

// ---------- which screens go with which design doc ----------
const folder = (dir, filter = () => true) => fs.readdirSync(path.join(SHOTS, dir)).filter(f => f.endsWith('.png')).filter(filter).sort().map(f => path.join(dir, f));
const SCREENS = {
  P01: folder('09-training-grievance', f => /hr-settings/.test(f)),
  P03: folder('09-training-grievance', f => /department-approvers/.test(f)),
  P09: folder('11-analytics'),
  M01: folder('05-lifecycle'),
  M02: [...folder('01-leave'), ...folder('02-attendance')],
  M03: [...folder('03-payroll'), ...folder('04-india-statutory')],
  M04: folder('10-mobile'),
  M05: folder('06-expenses'),
  M06: folder('07-performance'),
  M07: folder('09-training-grievance', f => /training|skill-map/.test(f)),
  M08: folder('09-training-grievance', f => /grievance/.test(f)),
  M10: folder('08-recruitment'),
};

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), data: b };
}

// ---------- inline markdown ----------
function runs(text, base = {}) {
  const out = [];
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1').replace(/<br\s*\/?>/g, ' ');
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const t = m[0];
    if (t.startsWith('**')) out.push(new TextRun({ text: t.slice(2, -2).replace(/`/g, ''), bold: true, ...base }));
    else if (t.startsWith('`')) out.push(new TextRun({ text: t.slice(1, -1).replace(/([._\/])/g, '$1​'), font: 'Consolas', ...base, size: (base.size || 21) - 2 }));
    else out.push(new TextRun({ text: t.slice(1, -1), italics: true, ...base }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out;
}

// ---------- tables ----------
function table(rows) {
  const cells = rows.map(r => r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split(/(?<!\\)\|/).map(c => c.trim()));
  const header = cells[0], body = cells.slice(2);
  const n = header.length;
  const len = Array(n).fill(4);
  for (const r of [header, ...body]) r.forEach((c, i) => { if (i < n) len[i] = Math.max(len[i], Math.min(c.length, 60)); });
  const total = len.reduce((a, b) => a + b, 0);
  let widths = len.map((l, i) => Math.max(Math.min(900, 180 * Math.max(3, header[i].replace(/[*`]/g, '').length) + 180), Math.round(CONTENT_W * l / total)));
  const scale = CONTENT_W / widths.reduce((a, b) => a + b, 0);
  widths = widths.map(w => Math.floor(w * scale));
  widths[n - 1] += CONTENT_W - widths.reduce((a, b) => a + b, 0);
  const fs = n >= 7 ? 15 : n >= 5 ? 17 : 18;
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'BFC7D5' };
  const borders = { top: border, bottom: border, left: border, right: border };
  const mk = (r, head) => new TableRow({
    tableHeader: head,
    children: Array.from({ length: n }, (_, i) => new TableCell({
      width: { size: widths[i], type: WidthType.DXA }, borders,
      margins: { top: 50, bottom: 50, left: 90, right: 90 },
      shading: head ? { type: ShadingType.CLEAR, color: 'auto', fill: 'E8EEF7' } : undefined,
      children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: runs(r[i] || '', { size: fs, bold: head || undefined }) })],
    })),
  });
  return new Table({ layout: TableLayoutType.FIXED, width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: widths, rows: [mk(header, true), ...body.map(r => mk(r, false))] });
}

// ---------- markdown blocks ----------
const HL = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5];
function convert(md, chapterTitle) {
  const out = [];
  const lines = md.split(/\r?\n/);
  let i = 0, firstH1 = true;
  while (i < lines.length) {
    let line = lines[i];
    if (/^```/.test(line)) {
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        out.push(new Paragraph({ spacing: { after: 0 }, shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F3F4F6' }, children: [new TextRun({ text: lines[i] || ' ', font: 'Consolas', size: 17 })] }));
        i++;
      }
      i++; continue;
    }
    const h = line.match(/^(#{1,5})\s+(.*)/);
    if (h) {
      if (h[1].length === 1 && firstH1) {       // doc title becomes the chapter heading
        out.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: runs(chapterTitle || h[2]) }));
        firstH1 = false;
      } else out.push(new Paragraph({ heading: HL[Math.min(h[1].length, 4)], children: runs(h[2]) }));
      i++; continue;
    }
    if (/^\s*\|/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
      if (rows.length >= 2) { out.push(table(rows)); out.push(new Paragraph({ spacing: { after: 60 }, children: [] })); }
      continue;
    }
    if (/^---+\s*$/.test(line)) { i++; continue; }
    if (/^>/.test(line)) {                     // blockquote (may contain bullets)
      while (i < lines.length && /^>/.test(lines[i])) {
        const t = lines[i].replace(/^>\s?/, '');
        if (t.trim()) {
          const b = t.match(/^(\s*)[-*]\s+(.*)/);
          out.push(new Paragraph({
            indent: { left: 360 + (b ? 360 : 0) }, spacing: { after: 40 },
            border: { left: { style: BorderStyle.SINGLE, size: 12, color: '2E5AAC', space: 8 } },
            children: runs((b ? '• ' : '') + (b ? b[2] : t), { color: '374151' }),
          }));
        }
        i++;
      }
      continue;
    }
    const li = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)/);
    if (li) {
      const level = Math.min(Math.floor(li[1].length / 2), 3);
      const numbered = /\d/.test(li[2]);
      out.push(new Paragraph({ numbering: { reference: numbered ? 'num' : 'bul', level, instance: numbered ? numInstance(level) : undefined }, spacing: { after: 30 }, children: runs(li[3]) }));
      i++; continue;
    }
    if (!line.trim()) { resetNum(); i++; continue; }
    // paragraph: join continuation lines
    let text = line.trim(); i++;
    while (i < lines.length && lines[i].trim() && !/^(\s*[-*]\s|\s*\d+\.\s|#|>|\||```)/.test(lines[i])) text += ' ' + lines[i++].trim();
    out.push(new Paragraph({ spacing: { after: 100 }, children: runs(text) }));
  }
  return out;
}
let numCounter = 0, numActive = false;
function numInstance(level) { if (!numActive) { numCounter++; numActive = true; } return numCounter; }
function resetNum() { numActive = false; }

function screensSection(code) {
  const list = SCREENS[code];
  if (!list || !list.length) return [];
  const out = [
    new Paragraph({ heading: HeadingLevel.HEADING_2, pageBreakBefore: true, children: [new TextRun(`Reference screens — ${code}`)] }),
    new Paragraph({ spacing: { after: 120 }, children: runs(`*Current behaviour captured from a local Frappe HR test instance with demo data (${list.length} screens). Shown only for comparison with the YukthiX design above; the U-numbers in the text refer to issues seen here. Internal reference — not for distribution; no Frappe code, text, logos or icons are reused (clean-room rule).*`, { color: '4B5563', size: 19 }) }),
  ];
  const MAXW = 16.0 * 360000 / 9525, MAXH = 20.5 * 360000 / 9525; // cm → px at 96 dpi (EMU/9525)
  list.forEach((rel, k) => {
    const file = path.join(SHOTS, rel), { w, h, data } = pngSize(file);
    const s = Math.min(MAXW / w, MAXH / h, 1.0);
    const fname = path.basename(rel);
    out.push(new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 160, after: 40 },
      children: [new ImageRun({ type: 'png', data, transformation: { width: Math.round(w * s), height: Math.round(h * s) }, altText: { title: fname, description: captions[fname] || human(fname), name: fname } })] }));
    out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 },
      children: [new TextRun({ text: `Figure ${code}-${k + 1}. ${captions[fname] || human(fname)}`, italics: true, size: 18, color: '4B5563' }), new TextRun({ text: `  (${fname})`, size: 16, color: '9CA3AF' })] }));
  });
  return out;
}

// ---------- assemble ----------
const docs = fs.readdirSync(DESIGN).filter(f => /^[PMT]\d\d-.*\.md$/.test(f)).sort((a, b) => (a[0] === b[0] ? a.localeCompare(b) : 'PMT'.indexOf(a[0]) - 'PMT'.indexOf(b[0])));
const title = f => fs.readFileSync(path.join(DESIGN, f), 'utf8').split(/\r?\n/).find(l => l.startsWith('# ')).slice(2);
const extraFile = path.join(DESIGN, 'CONSISTENCY-REVIEW.md');
const extra = fs.existsSync(extraFile) ? fs.readFileSync(extraFile, 'utf8').replace(/^# .*/, '') : '';

const children = [];
// cover
children.push(
  new Paragraph({ spacing: { before: 2600 }, children: [new TextRun({ text: 'YukthiX HR Suite', size: 64, bold: true, color: '1F3A6E', font: FONT })] }),
  new Paragraph({ spacing: { after: 300 }, children: [new TextRun({ text: 'Functional Design Specification', size: 40, color: '2E5AAC' })] }),
  new Paragraph({ children: [new TextRun({ text: 'Phase 3 design — platform (P01–P23), HR & ATS modules (M01–M13) and proctoring (T01–T08), with reference screens', size: 24, color: '4B5563' })] }),
  new Paragraph({ spacing: { before: 1200 }, children: [new TextRun({ text: 'Version 1.16 — for team review', size: 24, bold: true })] }),
  new Paragraph({ children: [new TextRun({ text: 'Date: 26 September 2026', size: 22 })] }),
  new Paragraph({ children: [new TextRun({ text: 'Status: all 26 design documents decided; consistency review, design-defect fixes and India lifecycle events and catalogues (A–G) applied', size: 22 })] }),
  new Paragraph({ spacing: { before: 1600 }, children: [new TextRun({ text: 'CONFIDENTIAL — internal use only. Contains reference screenshots of a third-party product for comparison; do not share outside the YukthiX team.', size: 18, color: 'B91C1C' })] }),
  new Paragraph({ children: [new PageBreak()] }),
);
// how to review
children.push(...convert(`## How to review this document

- **One file for everything.** Each chapter is one design document; the chapter number (P01…M10) matches the source file in \`YukthiX/design/\`.
- **Read the decisions first.** Section 11 "Decisions" in each chapter is the final answer; section 10 shows the original question and recommendation.
- **Comment in Word.** Use *Review → New Comment* on the exact text, and *Track Changes* for wording proposals. Start each comment with the rule or decision ID (e.g. "YX-PAY-11" or "M03 Q5") so it can be traced.
- **Reference screens** at the end of module chapters show how Frappe HR behaves today (issue numbers U1–U103 refer to them). They are for comparison only.
- **Assign reviewers per part:** platform (P01–P10) to tech leads; each module chapter to its functional owner (payroll, HR operations, L&D, recruitment).
- Changes agreed in review are made in the source Markdown files and this document is regenerated, so nothing drifts.
`, null).slice(0));
children.push(new Paragraph({ pageBreakBefore: true, spacing: { after: 160 }, children: [new TextRun({ text: 'Contents', size: 36, bold: true, color: '1F3A6E' })] }));
children.push(new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-2' }));
// introduction = README
children.push(...convert(fs.readFileSync(path.join(DESIGN, 'README.md'), 'utf8'), 'Introduction — method, order and status'));
for (const f of docs) {
  const code = f.slice(0, 3);
  if (f === docs.find(x => x.startsWith('P'))) children.push(partPage('Part A', 'Platform design (P01–P23)'));
  if (f === docs.find(x => x.startsWith('M'))) children.push(partPage('Part B', 'Module design (M01–M13)'));
  if (f === docs.find(x => x.startsWith('T'))) children.push(partPage('Part C', 'Proctoring design (T01–T08)'));
  children.push(...convert(fs.readFileSync(path.join(DESIGN, f), 'utf8'), `${code} · ${title(f).replace(/^[PMT]\d\d\s*·\s*/, '')}`));
  children.push(...screensSection(code));
}
const apx = fs.readdirSync(DESIGN).filter(f => /^APX-[A-Z]-.*\.md$/.test(f)).sort();
if (apx.length) {
  children.push(partPage('Part D', 'Catalogues & appendices (A–G)'));
  for (const f of apx) children.push(...convert(fs.readFileSync(path.join(DESIGN, f), 'utf8'), title(f)));
}
if (extra) { children.push(partPage('Appendix', 'Consistency review (25 Sep 2026) and open team actions')); children.push(...convert(extra, null)); }

function partPage(kicker, t) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, spacing: { before: 3000 }, children: [new TextRun({ text: `${kicker} — ${t}` })] });
}

const levels = (fmt, txt) => [0, 1, 2, 3].map(l => ({ level: l, format: fmt, text: txt(l), alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360 + l * 360, hanging: 260 } } } }));
const doc = new Document({
  creator: 'YukthiX', title: 'YukthiX HR Suite — Functional Design Specification',
  features: { updateFields: true },
  styles: {
    default: { document: { run: { font: FONT, size: 21 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 36, bold: true, color: '1F3A6E' }, paragraph: { spacing: { before: 240, after: 160 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 28, bold: true, color: '2E5AAC' }, paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1, keepNext: true } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 24, bold: true, color: '1F2937' }, paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2, keepNext: true } },
      { id: 'Heading4', name: 'Heading 4', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 22, bold: true, italics: true }, paragraph: { spacing: { before: 160, after: 60 }, outlineLevel: 3, keepNext: true } },
    ],
  },
  numbering: { config: [
    { reference: 'bul', levels: levels(LevelFormat.BULLET, l => ['•', '◦', '▪', '•'][l]) },
    { reference: 'num', levels: levels(LevelFormat.DECIMAL, l => `%${l + 1}.`) },
  ] },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'YukthiX HR Suite — Functional Design Specification v1.16 · Confidential', size: 16, color: '9CA3AF' })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES], size: 16, color: '6B7280' })] })] }) },
    children,
  }],
});
Packer.toBuffer(doc).then(b => { fs.writeFileSync(OUT, b); console.log('written', OUT, (b.length / 1048576).toFixed(1) + ' MB'); });
