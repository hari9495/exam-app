'use client';

import { MyLanguageScreen, type MyLanguage } from '@yukthix/ui/global';
import { loadState } from '../../../../../lib/yx-org';
import { useGlobal, useGlobalWrite } from '../../../../../lib/yx-global';

// Me › Language (G1-GLOBAL-CORE-BUILD-DESIGN §7): the person's language for the company's own words.
export default function YxMyLanguagePage() {
  const mine = useGlobal<MyLanguage>('/me/language');
  const write = useGlobalWrite();
  return <MyLanguageScreen state={loadState(mine)} onRetry={() => void mine.refetch()} data={mine.data ?? null} onSave={async (language) => void (await write('PUT', '/me/language', { language }))} />;
}
