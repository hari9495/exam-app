'use client';

// v2 QuestionForm — re-skin of components/QuestionForm.tsx on v2 primitives; submit logic + field
// behavior preserved verbatim (format only). Reuses the Monaco CodeEditor + image-upload/code-language
// hooks (infra). Used by the v2 new/edit question pages.
import { useState } from 'react';
import { CodeEditor } from '../../../../components/ui/CodeEditor';
import { type Question, type QuestionType, type Difficulty, type Tag, type CodeLanguage, CODE_LANGUAGE_OPTIONS } from '../../../../lib/types';
import { type QuestionInput, useUploadQuestionImage, useCodeLanguages } from '../../../../lib/hooks/useQuestions';
import { monacoLanguageFor } from '../../../../lib/monaco-language';
import { Combobox, Cb, Button, dt } from '../../../../components/ui-v2';

const TYPE_OPTIONS = [
  { value: 'single_mcq', label: 'Single-correct MCQ' },
  { value: 'multi_mcq', label: 'Multiple-correct MCQ' },
  { value: 'true_false', label: 'True / False' },
  { value: 'code', label: 'Code' },
];
const DIFFICULTY_OPTIONS = [{ value: 'easy', label: 'Easy' }, { value: 'medium', label: 'Medium' }, { value: 'hard', label: 'Hard' }];
const LANGUAGE_OPTIONS = CODE_LANGUAGE_OPTIONS.map((value) => ({ value, label: value }));

interface OptionDraft { text: string; isCorrect: boolean; imageUrl?: string }
interface QuestionFormProps { initialQuestion?: Question; tags: Tag[]; onSubmit: (input: QuestionInput) => void; submitLabel: string; submitting?: boolean }

function defaultOptionsFor(type: QuestionType): OptionDraft[] {
  if (type === 'code') return [];
  if (type === 'true_false') return [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }];
  return [{ text: '', isCorrect: false }, { text: '', isCorrect: false }];
}

const label: React.CSSProperties = { display: 'block', marginBottom: 6 };
const textInput: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', fontSize: 13, borderRadius: 8, border: '1px solid var(--hair)', background: 'var(--surface)', color: 'var(--ink)', outline: 'none' };
const rowLabel: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink)', cursor: 'pointer' };
const fieldLabelCls = 'v2-label';

function Field({ label: l, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <div><label className={fieldLabelCls}>{l}{required && <span style={{ color: 'var(--danger)', marginLeft: 3 }}>*</span>}</label>{children}</div>;
}

function RadioDot({ checked, onChange, ariaLabel }: { checked: boolean; onChange: () => void; ariaLabel: string }) {
  return (
    <span role="radio" aria-checked={checked} aria-label={ariaLabel} onClick={onChange} style={{ width: 16, height: 16, borderRadius: '50%', border: `1.5px solid ${checked ? 'var(--org-primary)' : '#cbd5e1'}`, display: 'inline-grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
      {checked && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--org-primary)' }} />}
    </span>
  );
}

export function QuestionForm({ initialQuestion, tags, onSubmit, submitLabel, submitting }: QuestionFormProps) {
  const [type, setType] = useState<QuestionType>(initialQuestion?.type ?? 'single_mcq');
  const [text, setText] = useState(initialQuestion?.text ?? '');
  const [difficulty, setDifficulty] = useState<Difficulty>(initialQuestion?.difficulty ?? 'easy');
  const [marks, setMarks] = useState(String(initialQuestion?.marks ?? 1));
  const [negativeMarks, setNegativeMarks] = useState(String(initialQuestion?.negativeMarks ?? 0));
  const [topic, setTopic] = useState(initialQuestion?.topic ?? '');
  const [category, setCategory] = useState(initialQuestion?.category ?? '');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(initialQuestion?.tags?.map((t) => t.id) ?? []);
  const [languageMode, setLanguageMode] = useState<'fixed' | 'any'>(initialQuestion?.languageMode ?? 'fixed');
  const [allowedLanguages, setAllowedLanguages] = useState<string[]>(initialQuestion?.allowedLanguages ?? []);
  const [starterCode, setStarterCode] = useState(initialQuestion?.starterCode ?? '');
  const [allowStdin, setAllowStdin] = useState(initialQuestion?.allowStdin ?? false);
  const [snippetCode, setSnippetCode] = useState(initialQuestion?.snippetCode ?? '');
  const [snippetLanguage, setSnippetLanguage] = useState<CodeLanguage>(initialQuestion?.snippetLanguage ?? 'javascript');
  const [imageUrl, setImageUrl] = useState(initialQuestion?.imageUrl ?? '');
  const [options, setOptions] = useState<OptionDraft[]>(
    initialQuestion ? initialQuestion.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect, imageUrl: o.imageUrl ?? undefined })) : defaultOptionsFor(type),
  );
  const codeLanguagesQuery = useCodeLanguages();

  function handleTypeChange(next: string) { const t = next as QuestionType; setType(t); setOptions(defaultOptionsFor(t)); }
  const updateOptionText = (i: number, v: string) => setOptions((c) => c.map((o, j) => (j === i ? { ...o, text: v } : o)));
  const updateOptionImage = (i: number, v: string) => setOptions((c) => c.map((o, j) => (j === i ? { ...o, imageUrl: v || undefined } : o)));
  const setSingleCorrect = (i: number) => setOptions((c) => c.map((o, j) => ({ ...o, isCorrect: j === i })));
  const toggleMultiCorrect = (i: number, checked: boolean) => setOptions((c) => c.map((o, j) => (j === i ? { ...o, isCorrect: checked } : o)));
  const addOption = () => setOptions((c) => [...c, { text: '', isCorrect: false }]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      type, text, difficulty, marks: Number(marks), negativeMarks: Number(negativeMarks),
      topic: topic.trim() || undefined, category: category.trim() || undefined,
      tags: tags.filter((t) => selectedTagIds.includes(t.id)).map((t) => t.name),
      languageMode: type === 'code' ? languageMode : undefined,
      allowedLanguages: type === 'code' && languageMode === 'fixed' ? allowedLanguages : undefined,
      starterCode: type === 'code' && languageMode === 'fixed' && allowedLanguages.length === 1 ? starterCode : undefined,
      allowStdin: type === 'code' ? allowStdin : undefined,
      snippetCode: type === 'code' ? undefined : snippetCode || undefined,
      snippetLanguage: type === 'code' ? undefined : (snippetCode ? snippetLanguage : undefined),
      imageUrl: type === 'code' ? undefined : imageUrl || undefined,
      options: options.map((o) => ({ text: o.text, isCorrect: o.isCorrect, imageUrl: o.imageUrl })),
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>Fields marked <span style={{ color: 'var(--danger)' }}>*</span> are required.</p>
      <Field label="Question type" required><Combobox options={TYPE_OPTIONS} value={type} onChange={handleTypeChange} width="100%" /></Field>
      <Field label="Question text" required>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} required style={{ ...textInput, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
      </Field>
      <Field label="Difficulty" required><Combobox options={DIFFICULTY_OPTIONS} value={difficulty} onChange={(v) => setDifficulty(v as Difficulty)} width="100%" /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Field label="Marks" required><input type="number" min={1} value={marks} onChange={(e) => setMarks(e.target.value)} required style={textInput} /></Field>
        <Field label="Negative marks"><input type="number" min={0} value={negativeMarks} onChange={(e) => setNegativeMarks(e.target.value)} style={textInput} /></Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Field label="Topic (optional)"><input value={topic} onChange={(e) => setTopic(e.target.value)} style={textInput} /></Field>
        <Field label="Category (optional)"><input value={category} onChange={(e) => setCategory(e.target.value)} style={textInput} /></Field>
      </div>

      {type === 'code' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Language mode">
            <Combobox options={[{ value: 'fixed', label: 'Fixed — choose specific languages' }, { value: 'any', label: 'Any — every language the sandbox supports' }]} value={languageMode} onChange={(v) => setLanguageMode(v as 'fixed' | 'any')} width="100%" />
          </Field>
          {languageMode === 'fixed' && (
            <div>
              <label className={fieldLabelCls}>Allowed languages</label>
              {codeLanguagesQuery.isLoading ? <span style={{ fontSize: 13, color: 'var(--muted)' }}>Loading languages…</span> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {(codeLanguagesQuery.data ?? []).map((entry) => (
                    <label key={entry.language} style={rowLabel}>
                      <Cb checked={allowedLanguages.includes(entry.language)} onChange={(checked) => setAllowedLanguages((c) => (checked ? [...c, entry.language] : c.filter((l) => l !== entry.language)))} />
                      {entry.language}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
          {languageMode === 'fixed' && allowedLanguages.length === 1 && (
            <Field label="Starter code"><CodeEditor ariaLabel="Starter Code" language={monacoLanguageFor(allowedLanguages[0])} value={starterCode} onChange={setStarterCode} height="220px" /></Field>
          )}
          <label style={rowLabel}><Cb checked={allowStdin} onChange={setAllowStdin} /> Allow candidates to provide input (stdin)</label>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Snippet language"><Combobox options={LANGUAGE_OPTIONS} value={snippetLanguage} onChange={(v) => setSnippetLanguage(v as CodeLanguage)} width={220} /></Field>
          <Field label="Code snippet (optional)"><CodeEditor ariaLabel="Code Snippet" language={snippetLanguage} value={snippetCode} onChange={setSnippetCode} height="180px" /></Field>
          <QuestionImageUpload label="Question image (optional)" value={imageUrl} onChange={setImageUrl} />
          <label className={fieldLabelCls} style={{ marginBottom: 0 }}>Options</label>
          {type === 'single_mcq' || type === 'true_false' ? (
            options.map((option, index) => (
              <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <RadioDot checked={option.isCorrect} onChange={() => setSingleCorrect(index)} ariaLabel={`Option ${index + 1} correct`} />
                  <input aria-label={`Option ${index + 1} text`} value={option.text} onChange={(e) => updateOptionText(index, e.target.value)} readOnly={type === 'true_false'} style={{ ...textInput, flex: 1 }} />
                </div>
                <QuestionImageUpload label={`Option ${index + 1} image (optional)`} value={option.imageUrl ?? ''} onChange={(url) => updateOptionImage(index, url)} />
              </div>
            ))
          ) : (
            options.map((option, index) => (
              <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Cb checked={option.isCorrect} onChange={(checked) => toggleMultiCorrect(index, checked)} />
                  <input aria-label={`Option ${index + 1} text`} value={option.text} onChange={(e) => updateOptionText(index, e.target.value)} style={{ ...textInput, flex: 1 }} />
                </div>
                <QuestionImageUpload label={`Option ${index + 1} image (optional)`} value={option.imageUrl ?? ''} onChange={(url) => updateOptionImage(index, url)} />
              </div>
            ))
          )}
          {type !== 'true_false' && <button type="button" onClick={addOption} style={{ ...dt.toolBtn, alignSelf: 'flex-start' }}>Add option</button>}
        </div>
      )}

      {tags.length > 0 && (
        <div>
          <label className={fieldLabelCls}>Tags</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px 16px' }}>
            {tags.map((tag) => (
              <label key={tag.id} style={rowLabel}>
                <Cb checked={selectedTagIds.includes(tag.id)} onChange={(checked) => setSelectedTagIds((c) => (checked ? [...c, tag.id] : c.filter((id) => id !== tag.id)))} />
                {tag.name}
              </label>
            ))}
          </div>
        </div>
      )}

      <div><Button type="submit" loading={submitting}>{submitLabel}</Button></div>
    </form>
  );
}

function QuestionImageUpload({ label: l, value, onChange }: { label: string; value: string; onChange: (url: string) => void }) {
  const upload = useUploadQuestionImage();
  return (
    <div>
      <label style={{ ...label, fontSize: 11.5, color: 'var(--muted)', fontWeight: 500 }}>{l}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input type="file" accept="image/png,image/jpeg,image/svg+xml" aria-label={l}
          style={{ fontSize: 12.5, color: 'var(--muted)' }}
          onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; upload.mutate(file, { onSuccess: (result) => onChange(result.imageUrl) }); }} />
        {value && (<><img src={value} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} /><button type="button" onClick={() => onChange('')} style={dt.toolBtn}>Remove</button></>)}
      </div>
    </div>
  );
}
