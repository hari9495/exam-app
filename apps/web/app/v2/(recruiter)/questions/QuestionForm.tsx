'use client';

// v2 QuestionForm — re-skin of components/QuestionForm.tsx on v2 primitives; submit logic + field
// behavior preserved verbatim (format only). Reuses the Monaco CodeEditor + image-upload/code-language
// hooks (infra). Layout: side-label sections (21st Form Layout #4347) on the left + a sticky live
// candidate preview on the right. Used by the v2 new/edit question pages.
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { CodeEditor } from '../../../../components/ui/CodeEditor';
import { type Question, type QuestionType, type Difficulty, type Tag, type CodeLanguage, CODE_LANGUAGE_OPTIONS } from '../../../../lib/types';
import { type QuestionInput, useUploadQuestionImage, useCodeLanguages } from '../../../../lib/hooks/useQuestions';
import { monacoLanguageFor } from '../../../../lib/monaco-language';
import { Combobox, Cb, dt } from '../../../../components/ui-v2';
import { VIZ } from '../../../../components/ui-v2/viz';

const TYPE_OPTIONS = [
  { value: 'single_mcq', label: 'Single-correct MCQ' },
  { value: 'multi_mcq', label: 'Multiple-correct MCQ' },
  { value: 'true_false', label: 'True / False' },
  { value: 'code', label: 'Code' },
];
const DIFFICULTY_OPTIONS = [{ value: 'easy', label: 'Easy' }, { value: 'medium', label: 'Medium' }, { value: 'hard', label: 'Hard' }];
const LANGUAGE_OPTIONS = CODE_LANGUAGE_OPTIONS.map((value) => ({ value, label: value }));
const DIFF_LABEL: Record<string, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

interface OptionDraft { text: string; isCorrect: boolean; imageUrl?: string }
interface QuestionFormProps {
  initialQuestion?: Question; tags: Tag[]; onSubmit: (input: QuestionInput) => void; submitLabel: string;
  submitting?: boolean;
}

function defaultOptionsFor(type: QuestionType): OptionDraft[] {
  if (type === 'code') return [];
  if (type === 'true_false') return [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }];
  return [{ text: '', isCorrect: false }, { text: '', isCorrect: false }];
}

const textInput: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', fontSize: 13, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--ink) 15%, var(--hair))', background: 'var(--paper)', color: 'var(--ink)', outline: 'none' };
const rowLabel: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink)', cursor: 'pointer' };
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 14 };
const primaryBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, padding: '9px 16px', borderRadius: 9, border: 'none', background: 'var(--org-primary)', color: 'var(--org-on-primary)', cursor: 'pointer' };

function Field({ label: l, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <div><label className="v2-label">{l}{required && <span style={{ color: 'var(--danger)', marginLeft: 3 }}>*</span>}</label>{children}</div>;
}
// Section card (design C, matches the exam form): title + description on top, fields filling the
// card width below.
function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div style={{ ...card, padding: '18px 20px' }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>{title}</div>
      <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3, marginBottom: 16, lineHeight: 1.5 }}>{description}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>{children}</div>
    </div>
  );
}
function RemoveOptionBtn({ index, onRemove }: { index: number; onRemove: (i: number) => void }) {
  return (
    <button type="button" onClick={() => onRemove(index)} aria-label={`Remove option ${index + 1}`} title="Remove option"
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--ink) 24%, var(--hair))', background: 'var(--paper)', color: 'var(--danger)', cursor: 'pointer', flexShrink: 0, boxShadow: '0 1px 2px rgba(11,18,32,.08)' }}>
      <Trash2 size={15} />
    </button>
  );
}
function RadioDot({ checked, onChange, ariaLabel }: { checked: boolean; onChange: () => void; ariaLabel: string }) {
  return (
    <span role="radio" aria-checked={checked} aria-label={ariaLabel} onClick={onChange} style={{ width: 16, height: 16, borderRadius: '50%', border: `1.5px solid ${checked ? 'var(--org-primary)' : '#cbd5e1'}`, display: 'inline-grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
      {checked && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--org-primary)' }} />}
    </span>
  );
}

function LivePreview({ type, text, options, marks, difficulty }: { type: QuestionType; text: string; options: OptionDraft[]; marks: string; difficulty: Difficulty }) {
  const isMulti = type === 'multi_mcq';
  const correct = options.filter((o) => o.isCorrect).map((o) => o.text).filter(Boolean).join(', ');
  return (
    <div style={{ ...card, padding: 20, position: 'sticky', top: 20 }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 10 }}>Candidate preview</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 12, whiteSpace: 'pre-wrap' }}>{text.trim() || <span style={{ color: 'var(--muted)', fontWeight: 400 }}>Question text…</span>}</div>
      {type === 'code' ? (
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Code question — candidates write and run code in the editor.</div>
      ) : options.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Add options to preview them.</div>
      ) : options.map((o, i) => (
        <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: '1px solid var(--hair)', borderRadius: 9, marginBottom: 8, fontSize: 13, background: o.isCorrect ? 'color-mix(in srgb, var(--org-primary) 6%, transparent)' : 'var(--surface)' }}>
          <span style={{ width: 15, height: 15, borderRadius: isMulti ? 4 : '50%', border: `1.5px solid ${o.isCorrect ? 'var(--org-primary)' : '#cbd5e1'}`, background: o.isCorrect ? 'var(--org-primary)' : 'transparent', flexShrink: 0 }} />
          {o.text.trim() || <span style={{ color: 'var(--muted)' }}>Option {i + 1}</span>}
        </label>
      ))}
      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {type !== 'code' && correct && <span><i style={{ width: 8, height: 8, borderRadius: 2, background: VIZ.green, display: 'inline-block', marginRight: 6 }} />Correct: {correct}</span>}
        <span>{marks || 0} mark{Number(marks) === 1 ? '' : 's'}</span>
        <span>{DIFF_LABEL[difficulty] ?? difficulty}</span>
      </div>
    </div>
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
  const removeOption = (i: number) => setOptions((c) => c.filter((_, j) => j !== i));

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

  const answerSection = type === 'code' ? (
    <>
      <Field label="Language mode">
        <Combobox options={[{ value: 'fixed', label: 'Fixed — choose specific languages' }, { value: 'any', label: 'Any — every language the sandbox supports' }]} value={languageMode} onChange={(v) => setLanguageMode(v as 'fixed' | 'any')} width="100%" />
      </Field>
      {languageMode === 'fixed' && (
        <div>
          <label className="v2-label">Allowed languages</label>
          {codeLanguagesQuery.isLoading ? <span style={{ fontSize: 13, color: 'var(--muted)' }}>Loading languages…</span> : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px 16px' }}>
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
    </>
  ) : (
    <>
      {options.map((option, index) => (
        <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {type === 'multi_mcq'
              ? <Cb checked={option.isCorrect} onChange={(checked) => toggleMultiCorrect(index, checked)} />
              : <RadioDot checked={option.isCorrect} onChange={() => setSingleCorrect(index)} ariaLabel={`Option ${index + 1} correct`} />}
            <input aria-label={`Option ${index + 1} text`} value={option.text} onChange={(e) => updateOptionText(index, e.target.value)} readOnly={type === 'true_false'} style={{ ...textInput, flex: 1 }} />
            {type !== 'true_false' && options.length > 2 && <RemoveOptionBtn index={index} onRemove={removeOption} />}
          </div>
          <QuestionImageUpload label={`Option ${index + 1} image (optional)`} value={option.imageUrl ?? ''} onChange={(url) => updateOptionImage(index, url)} />
        </div>
      ))}
      {type !== 'true_false' && <button type="button" onClick={addOption} className="v2-hoverbtn" style={{ ...dt.toolBtn, alignSelf: 'flex-start' }}>Add option</button>}
      <details style={{ borderTop: '1px solid var(--hair)', paddingTop: 12, marginTop: 2 }}>
        <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--muted)', listStyle: 'revert' }}>Code snippet &amp; question image (optional)</summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
          <Field label="Snippet language"><Combobox options={LANGUAGE_OPTIONS} value={snippetLanguage} onChange={(v) => setSnippetLanguage(v as CodeLanguage)} width="100%" /></Field>
          <Field label="Code snippet"><CodeEditor ariaLabel="Code Snippet" language={snippetLanguage} value={snippetCode} onChange={setSnippetCode} height="180px" /></Field>
          <QuestionImageUpload label="Question image" value={imageUrl} onChange={setImageUrl} />
        </div>
      </details>
    </>
  );

  return (
    <form onSubmit={handleSubmit}>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 12px' }}>Fields marked <span style={{ color: 'var(--danger)' }}>*</span> are required.</p>
      <div className="wf-editor">
      <div className="wf-editor-grid">
        <div className="wf-editor" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Section title="Basics" description="Type, prompt and difficulty.">
            <div className="wf-pair">
              <Field label="Question type" required><Combobox options={TYPE_OPTIONS} value={type} onChange={handleTypeChange} width="100%" /></Field>
              <Field label="Difficulty" required><Combobox options={DIFFICULTY_OPTIONS} value={difficulty} onChange={(v) => setDifficulty(v as Difficulty)} width="100%" /></Field>
            </div>
            <Field label="Question text" required>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} required style={{ ...textInput, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
            </Field>
          </Section>
          <Section title="Scoring" description="Marks awarded and deducted.">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              <div style={{ width: 180 }}><Field label="Marks" required><input type="number" min={1} value={marks} onChange={(e) => setMarks(e.target.value)} required style={textInput} /></Field></div>
              <div style={{ width: 180 }}><Field label="Negative marks"><input type="number" min={0} value={negativeMarks} onChange={(e) => setNegativeMarks(e.target.value)} style={textInput} /></Field></div>
            </div>
          </Section>
          <Section title={type === 'code' ? 'Code answer' : 'Answer options'} description={type === 'code' ? 'How candidates write and run code.' : 'The choices candidates pick from.'}>
            {answerSection}
          </Section>
          <Section title="Organize" description="Topic, category and tags for filtering.">
            <div className="wf-pair">
              <Field label="Topic (optional)"><input value={topic} onChange={(e) => setTopic(e.target.value)} style={textInput} /></Field>
              <Field label="Category (optional)"><input value={category} onChange={(e) => setCategory(e.target.value)} style={textInput} /></Field>
            </div>
            {tags.length > 0 && (
              <div>
                <label className="v2-label">Tags</label>
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
          </Section>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 2 }}>
            <button type="submit" className="v2-hoverbtn" disabled={submitting} style={{ ...primaryBtn, opacity: submitting ? 0.6 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }}>{submitting ? 'Saving…' : submitLabel}</button>
          </div>
        </div>
        <LivePreview type={type} text={text} options={options} marks={marks} difficulty={difficulty} />
      </div>
      </div>
    </form>
  );
}

function QuestionImageUpload({ label: l, value, onChange }: { label: string; value: string; onChange: (url: string) => void }) {
  const upload = useUploadQuestionImage();
  return (
    <div>
      <label style={{ display: 'block', marginBottom: 6, fontSize: 11.5, color: 'var(--muted)', fontWeight: 500 }}>{l}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input type="file" accept="image/png,image/jpeg,image/svg+xml" aria-label={l} style={{ fontSize: 12.5, color: 'var(--muted)' }}
          onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; upload.mutate(file, { onSuccess: (result) => onChange(result.imageUrl) }); }} />
        {value && (<><img src={value} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} /><button type="button" onClick={() => onChange('')} className="v2-hoverbtn" style={dt.toolBtn}>Remove</button></>)}
      </div>
    </div>
  );
}
