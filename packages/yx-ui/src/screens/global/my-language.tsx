import { useState } from 'react';
import { Button } from '../../components/button';
import { InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Text } from '../../components/foundations';
import { Segment } from '../../components/segment';
import { Card } from '../../components/shell';
import { OrgPage, useRun } from '../org/org-kit';
import { LANGUAGE_LABEL, type Language, type LoadState, type MyLanguage } from './types';

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
  const value = picked ?? data?.language ?? 'en';
  return (
    <OrgPage group="Me" crumb="Language" title="Language" description="The language for your company's own words: leave names, job titles and journey steps." state={state} onRetry={onRetry} what="your language">
      {data && (
        <Card title="Your language">
          <div className="yx-glb__stack">
            <FormField label="Show company words in" helper={`Your company writes them in ${LANGUAGE_LABEL[data.companyLanguage]}. Where it has no translation, you see those words.`}>
              <Segment label="Show company words in" options={data.choices.map((l) => ({ value: l, label: LANGUAGE_LABEL[l] }))} value={value} onChange={(l) => {
                  setPicked(l);
                  setSaved(false);
                }} />
            </FormField>
            {!data.chosen && !picked && <Text as="p" tone="secondary">You have not chosen yet: this is your company's choice for you.</Text>}
            {saved && <InlineAlert tone="success">{`Saved. Company words now show in ${LANGUAGE_LABEL[value]} where translated.`}</InlineAlert>}
            {error && <InlineAlert tone="danger" title="Not saved">{error}</InlineAlert>}
            <span>
              <Button variant="primary" loading={busy === 'save'} disabled={!picked || picked === data.language} onClick={() =>
                  void run('save', async () => {
                    await onSave(picked!);
                    setSaved(true);
                  })
                }>
                Save
              </Button>
            </span>
          </div>
        </Card>
      )}
    </OrgPage>
  );
}
