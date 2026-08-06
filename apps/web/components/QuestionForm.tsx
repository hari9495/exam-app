'use client';

import { useState } from 'react';
import { Button, Input, Select, Checkbox, RadioGroup, RadioGroupItem, RequiredFieldsNote } from '../components/ui';
import { CodeEditor } from '../components/ui/CodeEditor';
import { Question, QuestionType, Difficulty, Tag, CodeLanguage, CODE_LANGUAGE_OPTIONS } from '../lib/types';
import { QuestionInput, useUploadQuestionImage, useCodeLanguages } from '../lib/hooks/useQuestions';
import { monacoLanguageFor } from '../lib/monaco-language';

const TYPE_OPTIONS = [
  { value: 'single_mcq', label: 'Single-correct MCQ' },
  { value: 'multi_mcq', label: 'Multiple-correct MCQ' },
  { value: 'true_false', label: 'True / False' },
  { value: 'code', label: 'Code' },
];

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
];

const LANGUAGE_OPTIONS = CODE_LANGUAGE_OPTIONS.map((value) => ({ value, label: value }));

interface OptionDraft {
  text: string;
  isCorrect: boolean;
  imageUrl?: string;
}

interface QuestionFormProps {
  initialQuestion?: Question;
  tags: Tag[];
  onSubmit: (input: QuestionInput) => void;
  submitLabel: string;
}

function defaultOptionsFor(type: QuestionType): OptionDraft[] {
  if (type === 'code') {
    return [];
  }
  if (type === 'true_false') {
    return [
      { text: 'True', isCorrect: true },
      { text: 'False', isCorrect: false },
    ];
  }
  return [
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
  ];
}

export function QuestionForm({ initialQuestion, tags, onSubmit, submitLabel }: QuestionFormProps) {
  const [type, setType] = useState<QuestionType>(initialQuestion?.type ?? 'single_mcq');
  const [text, setText] = useState(initialQuestion?.text ?? '');
  const [difficulty, setDifficulty] = useState<Difficulty>(initialQuestion?.difficulty ?? 'easy');
  const [marks, setMarks] = useState(String(initialQuestion?.marks ?? 1));
  const [negativeMarks, setNegativeMarks] = useState(String(initialQuestion?.negativeMarks ?? 0));
  const [topic, setTopic] = useState(initialQuestion?.topic ?? '');
  const [category, setCategory] = useState(initialQuestion?.category ?? '');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(initialQuestion?.tags?.map((tag) => tag.id) ?? []);
  const [languageMode, setLanguageMode] = useState<'fixed' | 'any'>(initialQuestion?.languageMode ?? 'fixed');
  const [allowedLanguages, setAllowedLanguages] = useState<string[]>(initialQuestion?.allowedLanguages ?? []);
  const [starterCode, setStarterCode] = useState(initialQuestion?.starterCode ?? '');
  const [allowStdin, setAllowStdin] = useState(initialQuestion?.allowStdin ?? false);
  const [snippetCode, setSnippetCode] = useState(initialQuestion?.snippetCode ?? '');
  const [snippetLanguage, setSnippetLanguage] = useState<CodeLanguage>(initialQuestion?.snippetLanguage ?? 'javascript');
  const [imageUrl, setImageUrl] = useState(initialQuestion?.imageUrl ?? '');
  const [options, setOptions] = useState<OptionDraft[]>(
    initialQuestion
      ? initialQuestion.options.map((option) => ({ text: option.text, isCorrect: option.isCorrect, imageUrl: option.imageUrl ?? undefined }))
      : defaultOptionsFor(type),
  );
  const codeLanguagesQuery = useCodeLanguages();

  function handleTypeChange(nextType: string) {
    const typed = nextType as QuestionType;
    setType(typed);
    setOptions(defaultOptionsFor(typed));
  }

  function updateOptionText(index: number, value: string) {
    setOptions((current) => current.map((option, i) => (i === index ? { ...option, text: value } : option)));
  }

  function updateOptionImage(index: number, value: string) {
    setOptions((current) => current.map((option, i) => (i === index ? { ...option, imageUrl: value || undefined } : option)));
  }

  function setSingleCorrect(index: number) {
    setOptions((current) => current.map((option, i) => ({ ...option, isCorrect: i === index })));
  }

  function toggleMultiCorrect(index: number, checked: boolean) {
    setOptions((current) => current.map((option, i) => (i === index ? { ...option, isCorrect: checked } : option)));
  }

  function addOption() {
    setOptions((current) => [...current, { text: '', isCorrect: false }]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      type,
      text,
      difficulty,
      marks: Number(marks),
      negativeMarks: Number(negativeMarks),
      topic: topic.trim() || undefined,
      category: category.trim() || undefined,
      // The API resolves this list by NAME (upsert-or-reuse, see resolveTagIds), not by id --
      // sending ids here silently created a new tag literally named after each UUID and left
      // the real selected tag unlinked, which is why tags (and everything saved alongside them
      // in the same request) appeared to "not save".
      tags: tags.filter((tag) => selectedTagIds.includes(tag.id)).map((tag) => tag.name),
      languageMode: type === 'code' ? languageMode : undefined,
      allowedLanguages: type === 'code' && languageMode === 'fixed' ? allowedLanguages : undefined,
      starterCode: type === 'code' && languageMode === 'fixed' && allowedLanguages.length === 1 ? starterCode : undefined,
      allowStdin: type === 'code' ? allowStdin : undefined,
      snippetCode: type === 'code' ? undefined : snippetCode || undefined,
      snippetLanguage: type === 'code' ? undefined : (snippetCode ? snippetLanguage : undefined),
      imageUrl: type === 'code' ? undefined : imageUrl || undefined,
      options: options.map((option) => ({ text: option.text, isCorrect: option.isCorrect, imageUrl: option.imageUrl })),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-4">
      <RequiredFieldsNote />
      <Select label="Question Type" value={type} onChange={handleTypeChange} options={TYPE_OPTIONS} required />
      <div className="flex flex-col gap-1">
        <label
          htmlFor="question-text"
          className="text-sm font-medium text-gray-700 after:ml-0.5 after:text-status-danger after:content-['*']"
        >
          Question text
        </label>
        <textarea
          id="question-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          rows={3}
          required
        />
      </div>
      <Select label="Difficulty" value={difficulty} onChange={(value) => setDifficulty(value as Difficulty)} options={DIFFICULTY_OPTIONS} required />
      <div className="flex gap-4">
        <Input label="Marks" type="number" min={1} value={marks} onChange={setMarks} required />
        <Input label="Negative Marks" type="number" min={0} value={negativeMarks} onChange={setNegativeMarks} />
      </div>
      {/* Topic and Category are what the question-bank "Group by" filter groups on, so the form
          has to let a recruiter set them -- otherwise those grouping options are always empty. */}
      <div className="flex gap-4">
        <Input label="Topic (Optional)" value={topic} onChange={setTopic} />
        <Input label="Category (Optional)" value={category} onChange={setCategory} />
      </div>

      {type === 'code' ? (
        <div className="flex flex-col gap-2">
          <Select
            label="Language Mode"
            value={languageMode}
            onChange={(value) => setLanguageMode(value as 'fixed' | 'any')}
            options={[
              { value: 'fixed', label: 'Fixed — choose specific languages' },
              { value: 'any', label: 'Any — every language the sandbox supports' },
            ]}
          />
          {languageMode === 'fixed' && (
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">Allowed languages</span>
              {codeLanguagesQuery.isLoading ? (
                <span className="text-sm text-gray-500">Loading languages…</span>
              ) : (
                (codeLanguagesQuery.data ?? []).map((entry) => (
                  <Checkbox
                    key={entry.language}
                    label={entry.language}
                    checked={allowedLanguages.includes(entry.language)}
                    onChange={(checked) =>
                      setAllowedLanguages((current) =>
                        checked ? [...current, entry.language] : current.filter((lang) => lang !== entry.language),
                      )
                    }
                  />
                ))
              )}
            </div>
          )}
          {languageMode === 'fixed' && allowedLanguages.length === 1 && (
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">Starter code</span>
              {/* allowedLanguages holds raw PISTON language strings from /code-languages, so it
                  has to be mapped before Monaco sees it -- passing `c++` or `sqlite3` straight
                  through silently loses syntax highlighting. (snippetLanguage below is a
                  different, already-Monaco-valid list, so it needs no mapping.) */}
              <CodeEditor ariaLabel="Starter Code" language={monacoLanguageFor(allowedLanguages[0])} value={starterCode} onChange={setStarterCode} height="220px" />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={allowStdin}
              onChange={(e) => setAllowStdin(e.target.checked)}
              aria-label="Allow Candidates To Provide Input (Stdin)"
            />
            Allow candidates to provide input (stdin)
          </label>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Select
                label="Snippet Language"
                value={snippetLanguage}
                onChange={(value) => setSnippetLanguage(value as CodeLanguage)}
                options={LANGUAGE_OPTIONS}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">Code snippet (optional)</span>
              <CodeEditor ariaLabel="Code Snippet" language={snippetLanguage} value={snippetCode} onChange={setSnippetCode} height="180px" />
            </div>
            <QuestionImageUpload label="Question Image (Optional)" value={imageUrl} onChange={setImageUrl} />
          </div>
          <span className="text-sm font-medium text-gray-700">Options</span>
          {type === 'single_mcq' || type === 'true_false' ? (
            <RadioGroup
              value={String(options.findIndex((option) => option.isCorrect))}
              onChange={(value) => setSingleCorrect(Number(value))}
            >
              {options.map((option, index) => (
                <div key={index} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value={String(index)} label={`Option ${index + 1} Correct`} />
                    <input
                      aria-label={`Option ${index + 1} text`}
                      value={option.text}
                      onChange={(e) => updateOptionText(index, e.target.value)}
                      className="rounded border border-gray-300 px-2 py-1 text-sm"
                      readOnly={type === 'true_false'}
                    />
                  </div>
                  <QuestionImageUpload label={`Option ${index + 1} Image (Optional)`} value={option.imageUrl ?? ''} onChange={(url) => updateOptionImage(index, url)} />
                </div>
              ))}
            </RadioGroup>
          ) : (
            options.map((option, index) => (
              <div key={index} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Checkbox label={`Option ${index + 1} Correct`} checked={option.isCorrect} onChange={(checked) => toggleMultiCorrect(index, checked)} />
                  <input
                    aria-label={`Option ${index + 1} text`}
                    value={option.text}
                    onChange={(e) => updateOptionText(index, e.target.value)}
                    className="rounded border border-gray-300 px-2 py-1 text-sm"
                  />
                </div>
                <QuestionImageUpload label={`Option ${index + 1} Image (Optional)`} value={option.imageUrl ?? ''} onChange={(url) => updateOptionImage(index, url)} />
              </div>
            ))
          )}
          {type !== 'true_false' && (
            <Button type="button" variant="secondary" onClick={addOption}>
              Add option
            </Button>
          )}
        </div>
      )}

      {tags.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">Tags</span>
          {tags.map((tag) => (
            <Checkbox
              key={tag.id}
              label={tag.name}
              checked={selectedTagIds.includes(tag.id)}
              onChange={(checked) =>
                setSelectedTagIds((current) => (checked ? [...current, tag.id] : current.filter((id) => id !== tag.id)))
              }
            />
          ))}
        </div>
      )}

      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}

function QuestionImageUpload({ label, value, onChange }: { label: string; value: string; onChange: (url: string) => void }) {
  const upload = useUploadQuestionImage();
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="file"
          accept="image/png,image/jpeg,image/svg+xml"
          aria-label={label}
          className="text-sm text-gray-600 file:mr-2 file:rounded file:border file:border-recruiter-border file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-on-primary hover:file:opacity-90"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            upload.mutate(file, { onSuccess: (result) => onChange(result.imageUrl) });
          }}
        />
        {value ? (
          <>
            <img src={value} alt="" className="h-10 w-10 rounded object-cover" />
            <Button type="button" variant="secondary" onClick={() => onChange('')}>
              Remove
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
