import { francAll } from 'franc-min';

// Founder decision 9 Oct 2026: a WhatsApp / SMS / Teams / Slack ticket takes the contact's saved language, otherwise
// the language of its first message, guessed with franc-min (pure JS, trigram model of ~80 languages) and kept only
// when it is one the desk's agents answer in and the guess is clear. Anything unsure: no language (routing ignores it).

/** franc's ISO 639-3 codes → the 639-1 codes agents' languages use (other codes compare as they are). */
const ISO1: Record<string, string> = {
  eng: 'en', hin: 'hi', tam: 'ta', tel: 'te', kan: 'kn', mal: 'ml', mar: 'mr', ben: 'bn', guj: 'gu', pan: 'pa', urd: 'ur', ory: 'or', npi: 'ne',
  spa: 'es', fra: 'fr', deu: 'de', por: 'pt', ita: 'it', nld: 'nl', rus: 'ru', arb: 'ar', cmn: 'zh', jpn: 'ja', kor: 'ko', ind: 'id', zlm: 'ms', tha: 'th', vie: 'vi', tur: 'tr',
};
/** Shorter text is too thin to tell ("Wi-Fi drops"). */
const MIN_LETTERS = 15;
/** Another language the desk supports scoring this close to the best one (1.0) makes the guess unsure. */
const RIVAL = 0.9;

export function detectLanguage(text: string, supported: readonly string[]): string | null {
  if (!supported.length || text.replace(/[^\p{L}]/gu, '').length < MIN_LETTERS) return null;
  const ranked = francAll(text, { minLength: 10 });
  const code = (l: string) => ISO1[l] ?? l;
  const [top] = ranked[0] ?? ['und'];
  if (top === 'und' || !supported.includes(code(top))) return null;
  const rival = ranked.find(([l]) => l !== top && supported.includes(code(l)));
  return rival && rival[1] >= RIVAL ? null : code(top);
}
