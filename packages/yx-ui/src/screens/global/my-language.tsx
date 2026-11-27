import { useState } from 'react';
import { Button } from '../../components/button';
import { InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Text } from '../../components/foundations';
import { Segment } from '../../components/segment';
import { Card } from '../../components/shell';
import { OrgPage, useRun } from '../org/org-kit';
import { LANGUAGE_LABEL, type Language, type LoadState, type MyLanguage } from './types';
import { useYxT } from '../../i18n';

// Me › Language (G1-GLOBAL-CORE-BUILD-DESIGN §7): the person picks their language. Leave names, job titles and
// other company words show in it where the company translated them; otherwise in the company's own words.

export interface MyLanguageScreenProps {
  state: LoadState;
  onRetry?: () => void;
  data: MyLanguage | null;
  onSave: (language: Language) => Promise<void>;
}

export function MyLanguageScreen({ state, onRetry, data, onSave }: MyLanguageScreenProps) {
  const [picked, setPicked] = useState<Language | null>(null);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useRun();
  // T2-G 84b: this page is in the reader's language (Hindi or English).
  const t = useYxT('myLanguage');
  const value = picked ?? data?.language ?? 'en';
  return (
    <OrgPage group={t('group')} crumb={t('title')} title={t('title')} description={t('description')} state={state} onRetry={onRetry} what="your language">
      {data && (
        <Card title={t('card')}>
          <div className="yx-glb__stack">
            <FormField label={t('field')} helper={t('helper', { company: LANGUAGE_LABEL[data.companyLanguage] })}>
              <Segment label={t('field')} options={data.choices.map((l) => ({ value: l, label: LANGUAGE_LABEL[l] }))} value={value} onChange={(l) => {
                  setPicked(l);
                  setSaved(false);
                }} />
            </FormField>
            {!data.chosen && !picked && <Text as="p" tone="secondary">{t('notChosen')}</Text>}
            {data.choices.includes('hi') && <Text as="p" tone="secondary">{t('hindi')}</Text>}
            {saved && <InlineAlert tone="success">{t('saved', { language: LANGUAGE_LABEL[value] })}</InlineAlert>}
            {error && <InlineAlert tone="danger" title={t('notSaved')}>{error}</InlineAlert>}
            <span>
              <Button variant="primary" loading={busy === 'save'} disabled={!picked || picked === data.language} onClick={() =>
                  void run('save', async () => {
                    await onSave(picked!);
                    setSaved(true);
                  })
                }>
                {t('save')}
              </Button>
            </span>
          </div>
        </Card>
      )}
    </OrgPage>
  );
}
