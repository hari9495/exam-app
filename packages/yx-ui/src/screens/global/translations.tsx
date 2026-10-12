import { useState } from 'react';
import { Button } from '../../components/button';
import { EmptyState, Skeleton } from '../../components/feedback';
import { FormField, FormSection } from '../../components/field';
import { Text } from '../../components/foundations';
import { TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { Card } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { EditorDrawer, OrgPage, useRun } from '../org/org-kit';
import { LANGUAGE_LABEL, SUBJECT_LABEL, type Language, type LoadState, type SubjectType, type TranslationList } from './types';

// Settings › Organisation › Translations (G1-GLOBAL-CORE-BUILD-DESIGN §7, gap pass G1): the company's own words
// (leave types, job titles, journey steps…) in Hindi, Tamil and Telugu. People see their language where a
// translation exists, else the company's words. An empty box removes the translation.

export interface TranslationsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  subjectType: SubjectType;
  onSubjectType: (t: SubjectType) => void;
  /** null while the chosen list loads. */
  list: TranslationList | null;
  canManage: boolean;
  onSave: (subjectId: string, language: Language, text: string | null) => Promise<void>;
}

type Item = TranslationList['items'][number];

function Editor({ item, list, onClose, onSave }: { item: Item; list: TranslationList; onClose: () => void; onSave: TranslationsScreenProps['onSave'] }) {
  const [draft, setDraft] = useState<Partial<Record<Language, string>>>({ ...item.translations });
  const [dirty, setDirty] = useState(false);
  const { busy, error, run } = useRun();
  const save = () =>
    void run('save', async () => {
      for (const l of list.languages) {
        const next = (draft[l] ?? '').trim();
        if (next !== (item.translations[l] ?? '')) await onSave(item.id, l, next || null);
      }
    }).then((ok) => ok && onClose());
  return (
    <EditorDrawer open onClose={onClose} dirty={dirty} title={`Translate "${item.name}"`} subtitle={`Typed in ${LANGUAGE_LABEL[list.companyLanguage]}. Leave a box empty to show the company's words.`} errors={[]} saving={busy === 'save'} failed={error} saveLabel="Save" onSave={save}>
      <FormSection title="Translations">
        {list.languages.map((l) => (
          <FormField key={l} id={`tr-${l}`} label={LANGUAGE_LABEL[l]} optional>
            <TextField value={draft[l] ?? ''} onChange={(v) => {
                setDraft((d) => ({ ...d, [l]: v }));
                setDirty(true);
              }} maxLength={150} lang={l} />
          </FormField>
        ))}
      </FormSection>
    </EditorDrawer>
  );
}

export function TranslationsScreen({ state, onRetry, subjectType, onSubjectType, list, canManage, onSave }: TranslationsScreenProps) {
  const [editing, setEditing] = useState<Item | null>(null);
  const columns: TableColumn<Item>[] = [
    { key: 'name', header: 'Company words', value: (i) => i.name, render: (i) => <Text weight="medium">{i.name}</Text>, hideable: false },
    ...(list?.languages ?? []).map(
      (l): TableColumn<Item> => ({
        key: l,
        header: LANGUAGE_LABEL[l],
        value: (i) => i.translations[l] ?? '',
        render: (i) => (i.translations[l] ? <span lang={l}>{i.translations[l]}</span> : <Text tone="secondary">Not translated</Text>),
      }),
    ),
    ...(canManage ? [{ key: 'edit', header: 'Action', sortable: false, value: () => '', render: (i: Item) => <Button size="sm" onClick={() => setEditing(i)} aria-label={`Translate ${i.name}`}>Translate</Button>, width: 120 } as TableColumn<Item>] : []),
  ];
  return (
    <OrgPage crumb="Translations" title="Translations" description="Your company's own words in your people's languages. Each person sees their language where you translated it." state={state} onRetry={onRetry} what="translations">
      <FormField label="What to translate">
        <Select value={subjectType} onChange={(v) => v && onSubjectType(v as SubjectType)} options={(Object.keys(SUBJECT_LABEL) as SubjectType[]).map((t) => ({ value: t, label: SUBJECT_LABEL[t] }))} aria-label="What to translate" />
      </FormField>
      <Card title={SUBJECT_LABEL[subjectType]}>
        {!list ? (
          <Skeleton height={160} />
        ) : (
          <DataTable label={SUBJECT_LABEL[subjectType]} columns={columns} rows={list.items} getRowId={(i) => i.id} rowNoun={['item', 'items']} cardSummary empty={<EmptyState compact title="Nothing to translate here yet." description="Items appear once your company adds them." />} />
        )}
      </Card>
      {editing && list && <Editor item={editing} list={list} onClose={() => setEditing(null)} onSave={onSave} />}
    </OrgPage>
  );
}
