import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const InspectModule = require('docxtemplater/js/inspect-module.js') as new () => { getAllTags(): Record<string, unknown> };

// LIFE-2.04 Word (.docx) letter templates (P05 Q1 / Q3, YX-DOC-15; design §9.3, §15). Pure functions, no Nest.
//   - safety first: a real .docx (a zip with the Word main part), no macros, no external links or remote images, zip
//     limits against zip bombs;
//   - placeholders are {{field}}, sections {{#field}} … {{/field}} (shown when the field is set; repeated for a list);
//   - our parser only looks a field name up: no expressions, no property paths, so an uploaded template never runs code.

export class TemplateProblem extends Error {}

const FIELD = /^[a-z][a-z0-9_]{0,39}$/;
const MAX_ZIP = 20 * 1024 * 1024;
const MAX_UNZIPPED = 100 * 1024 * 1024;
const MAX_ENTRIES = 2000;
const MAIN = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';
const MACRO_MAIN = 'application/vnd.ms-word.document.macroEnabled.main+xml';

type ZipEntry = { name: string; dir: boolean; _data?: { uncompressedSize?: number } };

/** Opens and checks an uploaded template. Throws TemplateProblem with a plain reason. */
export function openDocx(buf: Buffer): PizZip {
  if (buf.length > MAX_ZIP) throw new TemplateProblem('The Word file is larger than 20 MB.');
  let zip: PizZip;
  try {
    zip = new PizZip(buf);
  } catch {
    throw new TemplateProblem('This is not a Word (.docx) file.');
  }
  const entries = Object.values(zip.files) as unknown as ZipEntry[];
  if (entries.length > MAX_ENTRIES) throw new TemplateProblem('The Word file has too many parts.');
  const unzipped = entries.reduce((n, e) => n + (e._data?.uncompressedSize ?? 0), 0);
  if (unzipped > MAX_UNZIPPED) throw new TemplateProblem('The Word file unpacks to more than 100 MB.');
  const types = zip.file('[Content_Types].xml')?.asText() ?? '';
  if (types.includes(MACRO_MAIN) || entries.some((e) => /vbaProject\.bin$|vbaData\.xml$/i.test(e.name))) throw new TemplateProblem('Files with macros are not accepted. Save it as a normal Word document (.docx).');
  if (!types.includes(MAIN) || !zip.file('word/document.xml')) throw new TemplateProblem('This is not a Word (.docx) document.');
  if (entries.some((e) => /\.(zip|docx|docm|xlsx|xlsm|pptx|exe|dll|js|vbs)$/i.test(e.name) || /^word\/embeddings\//.test(e.name))) throw new TemplateProblem('Embedded files are not accepted in letter templates.');
  for (const e of entries.filter((x) => x.name.endsWith('.rels'))) {
    const rels = zip.file(e.name)?.asText() ?? '';
    // A clickable https or mailto link is fine; anything Word would fetch by itself (a web image, a linked file) is not.
    const outside = (rels.match(/<Relationship\b[^>]*>/g) ?? []).filter((r) => /TargetMode\s*=\s*"External"/i.test(r));
    if (outside.some((r) => !/Type="[^"]*\/hyperlink"/.test(r) || !/Target="(https:\/\/|mailto:)/i.test(r))) throw new TemplateProblem('The template links to something outside the file (a web image, a linked file or a link that is not https). Insert pictures into the document instead.');
  }
  return zip;
}

function engine(zip: PizZip, modules: object[] = []) {
  return new Docxtemplater(zip, {
    delimiters: { start: '{{', end: '}}' },
    paragraphLoop: true,
    linebreaks: true,
    modules,
    nullGetter: () => '',
    parser: (tag: string) => {
      const t = tag.trim();
      if (!FIELD.test(t)) throw new TemplateProblem(`"{{${tag}}}" is not a field name. Use lower-case letters, digits and _ only.`);
      return { get: (scope: Record<string, unknown>) => scope?.[t] };
    },
  });
}

const flatten = (tags: Record<string, unknown>, out = new Set<string>()): Set<string> => {
  for (const [k, v] of Object.entries(tags)) {
    out.add(k.trim());
    if (v && typeof v === 'object') flatten(v as Record<string, unknown>, out);
  }
  return out;
};

/** The field names a template uses (sections included). Throws TemplateProblem for broken or unsafe placeholders. */
export function templateFields(buf: Buffer): string[] {
  const zip = openDocx(buf);
  const inspect = new InspectModule();
  try {
    engine(zip, [inspect]);
  } catch (e) {
    if (e instanceof TemplateProblem) throw e;
    const err = e as { properties?: { errors?: { properties?: { explanation?: string } }[] } };
    const why = err.properties?.errors?.map((x) => x.properties?.explanation).filter(Boolean)[0];
    const bad = why?.match(/scope parser for the tag "([^"]+)"/)?.[1];
    if (bad) throw new TemplateProblem(`"{{${bad}}}" is not a field name. Use lower-case letters, digits and _ only.`);
    throw new TemplateProblem(`A placeholder is broken${why ? `: ${why}` : ''}. Check every {{ has a matching }}.`);
  }
  return [...flatten(inspect.getAllTags())].sort();
}

/** Fills a checked template with values (strings, booleans for sections). */
export function fillDocx(buf: Buffer, data: Record<string, unknown>): Buffer {
  const doc = engine(openDocx(buf));
  doc.render(data);
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
}

const PARA = /<w:p[ >][\s\S]*?<\/w:p>/g;
const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const textOf = (xml: string) =>
  unesc(
    (xml.match(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>|<w:br\/>/g) ?? [])
      .map((r) => (r === '<w:br/>' ? '\n' : r.replace(/<[^>]+>/g, '')))
      .join(''),
  );

/** The paragraphs' text of a .docx (the laptop stand-in for PDF conversion uses it). */
export function docxParagraphs(buf: Buffer): string[] {
  return (new PizZip(buf).file('word/document.xml')?.asText().match(PARA) ?? []).map(textOf);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A run of text and its marks, as the letter editor makes it. */
export type Run = { text: string; bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; color?: string; highlight?: string; size?: number; link?: string };
export const BLOCK_KINDS = ['normal', 'heading', 'subheading', 'bullet', 'numbered', 'quote'] as const;
/** A paragraph: its kind, the list level (0–3) for list items, and its runs. `align` is for the starters' letterhead. */
export type Block = { kind?: (typeof BLOCK_KINDS)[number]; level?: number; align?: 'center'; runs: Run[] };

// The letter editor's presets (yx-ui components/editor.tsx); compose refuses anything else. Highlights are Word's own
// highlight colours, by their hex in the editor.
export const TEXT_COLOURS = ['#595959', '#C00000', '#C55A11', '#548235', '#2F5496', '#7030A0'];
export const HIGHLIGHTS: Record<string, string> = { '#FFFF00': 'yellow', '#00FF00': 'green', '#00FFFF': 'cyan', '#C0C0C0': 'lightGray' };
/** Points; no size is the normal size. */
export const FONT_SIZES = [9, 14, 18];
export const SAFE_LINK = /^(https:\/\/|mailto:)[^\s"<>]+$/i;

const TAG = /\{\{[^{}]*\}\}/g;
/** docxtemplater reads a tag from one run: a tag that formatting split takes the marks of its first character. */
function keepTagsWhole(runs: Run[]): Run[] {
  const chars = runs.flatMap(({ text, ...marks }) => text.split('').map((ch) => ({ ch, marks })));
  const text = chars.map((c) => c.ch).join('');
  for (const m of text.matchAll(TAG)) for (let i = m.index + 1; i < m.index + m[0].length; i++) chars[i].marks = chars[m.index].marks;
  const out: { text: string; marks: Omit<Run, 'text'> }[] = [];
  for (const c of chars) {
    const last = out[out.length - 1];
    if (last?.marks === c.marks) last.text += c.ch;
    else out.push({ text: c.ch, marks: c.marks });
  }
  return out.map((r) => ({ ...r.marks, text: r.text }));
}

// Run properties in the order Word's schema wants them.
const rPr = (r: Run) => {
  const p = [r.link && '<w:rStyle w:val="Hyperlink"/>', r.bold && '<w:b/>', r.italic && '<w:i/>', r.strike && '<w:strike/>', r.color && `<w:color w:val="${r.color.slice(1)}"/>`, r.size && `<w:sz w:val="${r.size * 2}"/><w:szCs w:val="${r.size * 2}"/>`, r.highlight && `<w:highlight w:val="${HIGHLIGHTS[r.highlight]}"/>`, r.underline && '<w:u w:val="single"/>'].filter(Boolean).join('');
  return p ? `<w:rPr>${p}</w:rPr>` : '';
};
const runXml = (r: Run) => `<w:r>${rPr(r)}${r.text.split('\n').map((t) => `<w:t xml:space="preserve">${esc(t)}</w:t>`).join('<w:br/>')}</w:r>`;

const STYLE = { heading: 'Heading2', subheading: 'Heading3', quote: 'Quote' } as const;
const STYLES = `<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:keepNext/><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:pPr><w:keepNext/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="BFBFBF"/></w:pBdr><w:ind w:left="720"/></w:pPr><w:rPr><w:color w:val="595959"/></w:rPr></w:style><w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>`;
const lvls = (fmt: (i: number) => [string, string]) =>
  [0, 1, 2, 3].map((i) => `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${fmt(i)[0]}"/><w:lvlText w:val="${fmt(i)[1]}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 * (i + 1)}" w:hanging="360"/></w:pPr></w:lvl>`).join('');
const BULLETS = lvls((i) => ['bullet', ['•', '◦', '▪', '•'][i]]);
const NUMBERS = lvls((i) => [['decimal', 'lowerLetter', 'lowerRoman', 'decimal'][i], `%${i + 1}.`]);
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/**
 * A Word document from the letter editor's paragraphs (and the YukthiX starter letters): Word styles for headings and
 * quotes, Word numbering for lists, real hyperlinks; companies can download and edit it in Word.
 */
export function buildDocx(blocks: Block[]): Buffer {
  const links: string[] = [];
  const nums: number[] = []; // one Word list per numbered list, so each starts at 1
  let prev: Block | undefined;
  let topKind: Block['kind'];
  const body = blocks
    .map((b) => {
      const list = b.kind === 'bullet' || b.kind === 'numbered';
      const level = list ? Math.min(Math.max(b.level ?? 0, 0), 3) : 0;
      const wasList = prev?.kind === 'bullet' || prev?.kind === 'numbered';
      if (b.kind === 'numbered' && (!nums.length || !wasList || (level === 0 && topKind === 'bullet'))) nums.push(nums.length + 2);
      if (list && level === 0) topKind = b.kind;
      prev = b;
      const style = b.kind === 'heading' || b.kind === 'subheading' || b.kind === 'quote' ? STYLE[b.kind] : null;
      const pPr = [style && `<w:pStyle w:val="${style}"/>`, list && `<w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${b.kind === 'bullet' ? 1 : nums[nums.length - 1]}"/></w:numPr>`, b.align && '<w:jc w:val="center"/>'].filter(Boolean).join('');
      const runs = keepTagsWhole(b.runs);
      let xml = '';
      for (let i = 0; i < runs.length; ) {
        const link = runs[i].link;
        let j = i + 1;
        while (j < runs.length && runs[j].link === link) j++;
        const group = runs.slice(i, j).map(runXml).join('');
        xml += link ? `<w:hyperlink r:id="rIdLink${links.push(link)}" w:history="1">${group}</w:hyperlink>` : group;
        i = j;
      }
      return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${xml}</w:p>`;
    })
    .join('');
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="${MAIN}"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`,
  );
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="${REL}/styles" Target="styles.xml"/><Relationship Id="rIdNumbering" Type="${REL}/numbering" Target="numbering.xml"/>${links.map((l, i) => `<Relationship Id="rIdLink${i + 1}" Type="${REL}/hyperlink" Target="${esc(l)}" TargetMode="External"/>`).join('')}</Relationships>`,
  );
  zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}>${STYLES}</w:styles>`);
  zip.file(
    'word/numbering.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${W}><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${BULLETS}</w:abstractNum><w:abstractNum w:abstractNumId="2"><w:multiLevelType w:val="hybridMultilevel"/>${NUMBERS}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>${nums.map((n) => `<w:num w:numId="${n}"><w:abstractNumId w:val="2"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`).join('')}</w:numbering>`,
  );
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W} ${R}><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1700" w:left="1440"/></w:sectPr></w:body></w:document>`);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
}

const COLOUR_OF = Object.fromEntries(Object.entries(HIGHLIGHTS).map(([hex, name]) => [name, hex]));
function runsOf(xml: string, link: string | undefined, heading: boolean): Run[] {
  return (xml.match(/<w:r[ >][\s\S]*?<\/w:r>/g) ?? []).map((r) => {
    const val = (tag: string) => r.match(new RegExp(`<w:${tag} w:val="([^"]+)"`))?.[1];
    const color = `#${val('color')?.toUpperCase()}`;
    const highlight = COLOUR_OF[val('highlight') ?? ''];
    const size = Number(val('sz')) / 2;
    // A heading's bold and size come from the heading itself (older templates also set them on the run).
    return {
      text: textOf(r),
      ...(!heading && r.includes('<w:b/>') && { bold: true }),
      ...(r.includes('<w:i/>') && { italic: true }),
      ...(!link && /<w:u w:val="(?!none)/.test(r) && { underline: true }),
      ...(r.includes('<w:strike/>') && { strike: true }),
      ...(TEXT_COLOURS.includes(color) && { color }),
      ...(highlight && { highlight }),
      ...(!heading && FONT_SIZES.includes(size) && { size }),
      ...(link && { link }),
    };
  });
}

/**
 * PPL-29 editor tab (lifecycle 6e): a template made in YukthiX (or a YukthiX starter) read back as the editor's
 * paragraphs. Older ones had no Word styles: a centred bold paragraph was the heading. An uploaded Word file keeps its
 * own formatting and is edited in Word.
 */
export function docxBlocks(buf: Buffer): Block[] {
  const zip = new PizZip(buf);
  const xml = zip.file('word/document.xml')?.asText() ?? '';
  const rels = Object.fromEntries([...(zip.file('word/_rels/document.xml.rels')?.asText() ?? '').matchAll(/<Relationship [^>]*?Id="([^"]+)"[^>]*?Target="([^"]+)"/g)].map((m) => [m[1], unesc(m[2])]));
  return (xml.match(PARA) ?? []).map((p) => {
    const style = p.match(/<w:pStyle w:val="([^"]+)"/)?.[1];
    const num = p.match(/<w:ilvl w:val="(\d)"\/><w:numId w:val="(\d+)"\/>/);
    const legacyHeading = !style && p.includes('<w:jc w:val="center"/>') && p.includes('<w:b/>');
    const kind: Block['kind'] = style === 'Heading2' || legacyHeading ? 'heading' : style === 'Heading3' ? 'subheading' : style === 'Quote' ? 'quote' : num ? (num[2] === '1' ? 'bullet' : 'numbered') : 'normal';
    const heading = kind === 'heading' || kind === 'subheading';
    const runs = [...p.matchAll(/<w:hyperlink r:id="([^"]+)"[^>]*>([\s\S]*?)<\/w:hyperlink>|<w:r[ >][\s\S]*?<\/w:r>/g)].flatMap((m) => (m[1] ? runsOf(m[2], rels[m[1]], heading) : runsOf(m[0], undefined, heading)));
    return { kind, ...(num && { level: Number(num[1]) }), runs };
  });
}

/**
 * PPL-29 "Use suggestion": renames placeholders ({{from}}, {{#from}}, {{/from}}) in the document, headers and footers,
 * also when Word split the tag across runs (spell-check marks do): the text moves into the first run, the XML tags in
 * between stay in order, so the document stays well-formed. The result is checked again like any upload.
 */
export function renameFields(buf: Buffer, renames: Record<string, string>): Buffer {
  const zip = openDocx(buf);
  const gap = '(?:<[^>]*>)*';
  for (const part of Object.keys(zip.files).filter((n) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n))) {
    let xml = zip.file(part)!.asText();
    for (const [from, to] of Object.entries(renames)) {
      const re = new RegExp(['\\{', '\\{', '([#/^]?)', ...from].join(gap) + gap + '\\}' + gap + '\\}', 'g');
      xml = xml.replace(re, (m: string, mark: string) => `{{${mark}${to}}}${(m.match(/<[^>]*>/g) ?? []).join('')}`);
    }
    zip.file(part, xml);
  }
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
}
