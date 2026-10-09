import sanitizeHtml from 'sanitize-html';

// §14.2 inline HTML: every reply, note and saved reply is cleaned with the sanitize-html allow-list before it is
// stored, so what reaches a browser or an email is only simple formatting and safe links. No images (remote images
// are tracking pixels; pasted images come with attachments), no styles, no scripts, no event handlers.
const ALLOW: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'a', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'h3', 'h4', 'hr'],
  allowedAttributes: { a: ['href', 'rel', 'target'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesAppliedToAttributes: ['href'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  // Links always open away from YukthiX and pass nothing back.
  transformTags: { a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer nofollow', target: '_blank' }, true) },
};

const TEXT_ONLY: sanitizeHtml.IOptions = { allowedTags: [], allowedAttributes: {} };
const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

/** Clean HTML from the editor or a saved reply. */
export function cleanHtml(html: string): string {
  return sanitizeHtml(html, ALLOW).trim();
}

/** The plain text of cleaned HTML (search, email text part, emptiness check). */
export function htmlToText(html: string): string {
  const withBreaks = html.replace(/<br\s*\/?>|<\/(p|li|h3|h4|blockquote|pre)>/gi, '$&\n');
  return sanitizeHtml(withBreaks, TEXT_ONLY)
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (e) => ENTITIES[e])
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Plain text typed by a requester, as safe HTML paragraphs. */
export function textToHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return text
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br />')}</p>`)
    .join('');
}
