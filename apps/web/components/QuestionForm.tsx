'use client';

import { useState } from 'react';
import { Button, Input, Select, Checkbox, RadioGroup, RadioGroupItem } from '../components/ui';
import { Question, QuestionType, Difficulty, Tag, CodeLanguage, CODE_LANGUAGE_OPTIONS } from '../lib/types';
import { QuestionInput } from '../lib/hooks/useQuestions';

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
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(initialQuestion?.tags?.map((tag) => tag.id) ?? []);
  const [codeLanguage, setCodeLanguage] = useState<CodeLanguage>(initialQuestion?.codeLanguage ?? 'javascript');
  const [starterCode, setStarterCode] = useState(initialQuestion?.starterCode ?? '');
  const [options, setOptions] = useState<OptionDraft[]>(
    initialQuestion ? initialQuestion.options.map((option) => ({ text: option.text, isCorrect: option.isCorrect })) : defaultOptionsFor(type),
  );

  function handleTypeChange(nextType: string) {
    const typed = nextType as QuestionType;
    setType(typed);
    setOptions(defaultOptionsFor(typed));
  }

  function updateOptionText(index: number, value: string) {
    setOptions((current) => current.map((option, i) => (i === index ? { ...option, text: value } : option)));
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
      tags: selectedTagIds,
      codeLanguage: type === 'code' ? codeLanguage : undefined,
      starterCode: type === 'code' ? starterCode : undefined,
      options,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-4">
      <Select label="Question type" value={type} onChange={handleTypeChange} options={TYPE_OPTIONS} />
      <div className="flex flex-col gap-1">
        <label htmlFor="question-text" className="text-sm font-medium text-gray-700">
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
      <Select label="Difficulty" value={difficulty} onChange={(value) => setDifficulty(value as Difficulty)} options={DIFFICULTY_OPTIONS} />
      <div className="flex gap-4">
        <Input label="Marks" type="number" min={1} value={marks} onChange={setMarks} />
        <Input label="Negative marks" type="number" min={0} value={negativeMarks} onChange={setNegativeMarks} />
      </div>

      {type === 'code' ? (
        <div className="flex flex-col gap-2">
          <Select label="Language" value={codeLanguage} onChange={(value) => setCodeLanguage(value as CodeLanguage)} options={LANGUAGE_OPTIONS} />
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-700">Starter code</span>
            <textarea
              aria-label="Starter code"
              value={starterCode}
              onChange={(e) => setStarterCode(e.target.value)}
              className="rounded border border-gray-300 px-3 py-2 font-mono text-sm"
              rows={6}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-gray-700">Options</span>
          {type === 'single_mcq' || type === 'true_false' ? (
            <RadioGroup
              value={String(options.findIndex((option) => option.isCorrect))}
              onChange={(value) => setSingleCorrect(Number(value))}
            >
              {options.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <RadioGroupItem value={String(index)} label={`Option ${index + 1} correct`} />
                  <input
                    aria-label={`Option ${index + 1} text`}
                    value={option.text}
                    onChange={(e) => updateOptionText(index, e.target.value)}
                    className="rounded border border-gray-300 px-2 py-1 text-sm"
                    readOnly={type === 'true_false'}
                  />
                </div>
              ))}
            </RadioGroup>
          ) : (
            options.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <Checkbox label={`Option ${index + 1} correct`} checked={option.isCorrect} onChange={(checked) => toggleMultiCorrect(index, checked)} />
                <input
                  aria-label={`Option ${index + 1} text`}
                  value={option.text}
                  onChange={(e) => updateOptionText(index, e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1 text-sm"
                />
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
