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
    if (/TargetMode\s*=\s*"External"/i.test(rels)) throw new TemplateProblem('The template links to something outside the file (a web image or linked file). Insert pictures into the document instead.');
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

/** The paragraphs' text of a .docx (the laptop stand-in for PDF conversion uses it). */
export function docxParagraphs(buf: Buffer): string[] {
  const xml = new PizZip(buf).file('word/document.xml')?.asText() ?? '';
  return (xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []).map((p) =>
    (p.match(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>|<w:br\/>/g) ?? [])
      .map((r) => (r === '<w:br/>' ? '\n' : r.replace(/<[^>]+>/g, '')))
      .join('')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&'),
  );
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A minimal Word document from paragraphs (YukthiX starter letters; companies download and edit it in Word). */
export function buildDocx(paragraphs: { text: string; bold?: boolean; heading?: boolean }[]): Buffer {
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="${MAIN}"/></Types>`,
  );
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  const body = paragraphs
    .map((p) => `<w:p>${p.heading ? '<w:pPr><w:jc w:val="center"/></w:pPr>' : ''}<w:r>${p.bold || p.heading ? `<w:rPr><w:b/>${p.heading ? '<w:sz w:val="28"/>' : ''}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(p.text)}</w:t></w:r></w:p>`)
    .join('');
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1700" w:left="1440"/></w:sectPr></w:body></w:document>`);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
}
