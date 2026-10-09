'use client';

import { useState } from 'react';
import { TranslationsScreen, type SubjectType, type TranslationList } from '@yukthix/ui/global';
import { loadState, useYxPermissions } from '../../../../../lib/yx-org';
import { useGlobal, useGlobalWrite } from '../../../../../lib/yx-global';

// Settings › Organisation › Translations (G1-GLOBAL-CORE-BUILD-DESIGN §7): the company's words in Hindi, Tamil
// and Telugu. The API checks org.settings.manage for the whole company.
export default function YxTranslationsPage() {
  const [subjectType, setSubjectType] = useState<SubjectType>('leave_type');
  const list = useGlobal<TranslationList>(`/translations?subjectType=${subjectType}`);
  const perms = useYxPermissions();
  const write = useGlobalWrite();
  return (
    <TranslationsScreen
      state={loadState(list)}
      onRetry={() => void list.refetch()}
      subjectType={subjectType}
      onSubjectType={setSubjectType}
      list={list.data ?? null}
      canManage={perms.has('org.settings.manage')}
      onSave={async (subjectId, language, text) => void (await write('PUT', '/translations', { subjectType, subjectId, language, text }))}
    />
  );
}
