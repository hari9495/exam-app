'use client';

import { useQueryClient } from '@tanstack/react-query';
import { MyLanguageScreen, type MyLanguage } from '@yukthix/ui/global';
import { loadState } from '../../../../../lib/yx-org';
import { useGlobal, useGlobalWrite } from '../../../../../lib/yx-global';

// Me › Language (G1-GLOBAL-CORE-BUILD-DESIGN §7): the person's language for the company's own words and, in Hindi
// (T2-G 84b), for the menu of their own pages and their notification emails (the frame reads it again on save).
export default function YxMyLanguagePage() {
  const mine = useGlobal<MyLanguage>('/me/language');
  const write = useGlobalWrite();
  const qc = useQueryClient();
  return (
    <MyLanguageScreen
      state={loadState(mine)}
      onRetry={() => void mine.refetch()}
      data={mine.data ?? null}
      onSave={async (language) => {
        await write('PUT', '/me/language', { language });
        void qc.invalidateQueries({ queryKey: ['yx', 'org', '/display'] });
      }}
    />
  );
}
