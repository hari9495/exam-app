// Batch G1 · global core (G1-GLOBAL-CORE-BUILD-DESIGN): the shapes the /global API returns and accepts.

export type { LoadState } from '../org/types';

export type Language = 'en' | 'hi' | 'ta' | 'te';

/** Each language in its own script, so a person finds theirs. */
export const LANGUAGE_LABEL: Record<Language, string> = { en: 'English', hi: 'हिन्दी (Hindi)', ta: 'தமிழ் (Tamil)', te: 'తెలుగు (Telugu)' };

/** A P07 country pack, as listed for the guide. */
export interface CountryPack {
  country: string;
  name: string;
  version: string;
  /** Still being confirmed by the YukthiX compliance owner. */
  verify: boolean;
  currency: string;
  fyStartMonth: number;
  dataRegion: string;
  /** Decimal string: the legal full-time week. */
  normalWeekHours: string;
  languages: Language[];
  entityIds: { key: string; required: boolean }[];
  registrations: string[];
}

export interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
  /** The screen that closes it. */
  href: string;
}

export interface CountrySetup {
  id: string;
  country: string;
  countryName: string;
  legalEntity: { id: string; name: string; shortName: string } | null;
  status: 'in_progress' | 'done';
  version: number;
  finishedAt: string | null;
  checklist: ChecklistItem[];
  open: number;
}

export interface GuideEntity {
  id: string;
  name: string;
  shortName: string;
  country: string;
  archivedAt: string | null;
}

export interface NewEntityInput {
  name: string;
  shortName: string;
  country: string;
  currency: string;
  fyStartMonth: number;
  dataRegion: string;
}

/** The entity's working week and language (settings for the legal entity). */
export interface EntityDefaults {
  /** 'pack' = the country pack's week. */
  normalWeek: string;
  language: Language;
}

export type SubjectType = 'leave_type' | 'designation' | 'department' | 'grade' | 'employment_type' | 'location' | 'journey_template' | 'journey_task' | 'rating_level' | 'rating_band' | 'review_section' | 'competency';

export const SUBJECT_LABEL: Record<SubjectType, string> = {
  leave_type: 'Leave types',
  designation: 'Job titles (designations)',
  department: 'Departments',
  grade: 'Grades',
  employment_type: 'Employment types',
  location: 'Locations',
  journey_template: 'Journeys and checklists',
  journey_task: 'Journey steps',
  rating_level: 'Rating labels',
  rating_band: 'Rating bands',
  review_section: 'Review sections',
  competency: 'Competencies',
};

export interface TranslationList {
  subjectType: SubjectType;
  companyLanguage: Language;
  /** The languages to translate into (all but the company's). */
  languages: Language[];
  items: { id: string; name: string; translations: Partial<Record<Language, string>> }[];
}

export interface MyLanguage {
  language: Language;
  /** The person chose it (else it comes from their entity or the company). */
  chosen: boolean;
  companyLanguage: Language;
  choices: Language[];
}
