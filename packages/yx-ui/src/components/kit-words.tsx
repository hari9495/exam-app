import { createContext, useContext } from 'react';

/**
 * The few words the kit itself shows or reads out (field tags, the password eye, the footer). English everywhere by
 * default; a page written in another language (the sign-in pages in Hindi) provides its own through KitWordsContext.
 */
export interface KitWords {
  /** The tag next to a required field's label. */
  required: string;
  /** The tag next to an optional field's label. */
  optional: string;
  showPassword: string;
  hidePassword: string;
  /** "Powered by YukthiX": the words before and after the logo, and the link's name for screen readers. */
  poweredBy: { before: string; after: string; label: string };
  /** The footer's list of legal notices (screen-reader name). */
  legalNotices: string;
  /** The language picker (screen-reader name). */
  language: string;
}

export const KIT_WORDS_EN: KitWords = {
  required: 'Required',
  optional: 'Optional',
  showPassword: 'Show password',
  hidePassword: 'Hide password',
  poweredBy: { before: 'Powered by', after: '', label: 'Powered by YukthiX' },
  legalNotices: 'Legal notices',
  language: 'Language',
};

export const KitWordsContext = createContext<KitWords>(KIT_WORDS_EN);

export const useKitWords = () => useContext(KitWordsContext);
