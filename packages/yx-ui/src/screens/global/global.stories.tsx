import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { CountryGuideScreen } from './country-guide';
import { TranslationsScreen } from './translations';
import { MyLanguageScreen } from './my-language';
import { INDIA, SETUP_DONE, SETUP_NEW, TRANSLATIONS } from './data';
import type { Language, SubjectType } from './types';

const meta: Meta = { title: 'Screens/Settings/Global core', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const wait = (ms = 400) => new Promise<void>((r) => setTimeout(r, ms));

export const Countries: S = {
  name: 'Countries · Add a country',
  render: () => (
    <CountryGuideScreen
      state="ready"
      countries={[INDIA]}
      setups={[SETUP_DONE]}
      entities={[]}
      entityDefaults={{}}
      canManage
      onStart={() => wait().then(() => SETUP_NEW)}
      onCreateEntity={() => wait().then(() => ({ id: 'le-new' }))}
      onLinkEntity={() => wait().then(() => ({ ...SETUP_NEW, legalEntity: { id: 'le-new', name: 'Kaveri South India', shortName: 'KSI' }, version: 2 }))}
      onSaveDefaults={() => wait()}
      onFinish={() => wait().then(() => ({ ...SETUP_NEW, status: 'done' as const }))}
      onRefresh={() => wait()}
    />
  ),
};

function Translations() {
  const [t, setT] = useState<SubjectType>('leave_type');
  return <TranslationsScreen state="ready" subjectType={t} onSubjectType={setT} list={TRANSLATIONS} canManage onSave={() => wait()} />;
}
export const CompanyWords: S = { name: 'Translations · leave types', render: () => <Translations /> };

function Language() {
  const [language, setLanguage] = useState<Language>('en');
  return <MyLanguageScreen state="ready" data={{ language, chosen: language !== 'en', companyLanguage: 'en', choices: ['en', 'hi', 'ta', 'te'] }} onSave={(l) => wait().then(() => setLanguage(l))} />;
}
export const MyLanguage: S = { name: 'Me › Language', render: () => <Language /> };
