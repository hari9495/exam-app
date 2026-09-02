'use client';

// v2 ExamSectionsPanel — re-skin of components/ExamSectionsPanel.tsx on v2 primitives. All hooks,
// lock rules, blur-save behavior and mutations are preserved verbatim (format only). The
// SectionQuestionPicker modal is reused as-is for now (transient; v2 restyle later).
import { useMemo, useState } from 'react';
import { ChevronDown, MoreHorizontal, Search, Trash2 } from 'lucide-react';
import { useExam } from '../../../../lib/hooks/useExams';
import {
  useCreateSection, useDeleteSection, useDuplicateSection, useReplaceSectionQuestions,
  useUpdateSection, usePoolPreview, useSectionTitles,
} from '../../../../lib/hooks/useExamSections';
import { SectionQuestionPicker } from '../../../../components/SectionQuestionPicker';
import { useToast } from '../../../../components/ui';
import { TYPE_LABEL, DIFFICULTY_LABEL } from '../../../../lib/question-display';
import { ExamSection, QuestionType, Difficulty, PoolPreview } from '../../../../lib/types';
import { Dialog, Dropdown, DropdownItem, dt, Pill } from '../../../../components/ui-v2';
import { VIZ } from '../../../../components/ui-v2/viz';

const TYPE_COLOR: Record<string, string> = { single_mcq: VIZ.azure, multi_mcq: VIZ.violet, true_false: VIZ.teal, code: VIZ.amber };
const TYPE_OPTIONS = [{ value: 'all', label: 'All types' }, ...(Object.keys(TYPE_LABEL) as QuestionType[]).map((value) => ({ value, label: TYPE_LABEL[value] }))];
const DIFFICULTY_OPTIONS = [{ value: 'all', label: 'All difficulties' }, ...(Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((value) => ({ value, label: DIFFICULTY_LABEL[value] }))];

const input: React.CSSProperties = { boxSizing: 'border-box', padding: '8px 11px', fontSize: 13, borderRadius: 8, border: '1px solid var(--hair)', background: 'var(--surface)', color: 'var(--ink)', outline: 'none' };
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 14, padding: 16 };
const smallNum: React.CSSProperties = { width: 60, textAlign: 'right', padding: '4px 7px', fontSize: 13, borderRadius: 6, border: '1px solid var(--hair)', background: 'var(--surface)', color: 'var(--ink)', outline: 'none' };

function TypePill({ type }: { type: QuestionType }) {
  return <Pill c={TYPE_COLOR[type] ?? 'var(--muted)'} label={TYPE_LABEL[type] ?? type} />;
}

// A pool never stores which questions it drew — this shows what it WOULD currently draw from, and
// whether there are even enough matching questions to fill poolSize. Fetches lazily (only while open).
function PoolPreviewDialog({ examId, sectionId, sectionTitle, onClose }: { examId: string; sectionId: string; sectionTitle: string; onClose: () => void }) {
  const { data, isLoading, isError } = usePoolPreview(examId, sectionId, true);
  const shortfall = data ? data.totalMatching < data.poolSize : false;
  return (
    <Dialog open onClose={onClose} title={`Preview pool — ${sectionTitle}`}>
      {isLoading ? (
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>Loading…</p>
      ) : isError || !data ? (
        <p style={{ fontSize: 13, color: 'var(--danger)' }}>Failed to load the pool preview.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)' }}>
            <span>Criteria:</span>
            {data.poolDifficulty && <Pill c="var(--muted)" label={DIFFICULTY_LABEL[data.poolDifficulty] ?? data.poolDifficulty} />}
            {data.poolTags.map((tag) => <Pill key={tag.id} c={VIZ.azure} label={tag.name} />)}
            {!data.poolDifficulty && data.poolTags.length === 0 && <span>none</span>}
          </div>
          <p style={{ fontSize: 13, fontWeight: 500, color: shortfall ? 'var(--danger)' : 'var(--ink)', margin: 0 }}>
            {data.totalMatching} question{data.totalMatching === 1 ? '' : 's'} currently match{data.totalMatching === 1 ? 'es' : ''} this pool
            {shortfall ? ` — fewer than the configured pool size of ${data.poolSize}. Candidates will get a shorter section than intended.` : ` (configured pool size: ${data.poolSize}).`}
          </p>
          {data.questions.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>No active questions currently match this pool&apos;s criteria.</p>
          ) : (
            <>
              <div style={{ maxHeight: 384, overflowY: 'auto', border: '1px solid var(--hair)', borderRadius: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={dt.th}>#</th><th style={dt.th}>Question</th><th style={dt.th}>Type</th><th style={dt.th}>Difficulty</th><th style={dt.th}>Marks</th></tr></thead>
                  <tbody>
                    {data.questions.map((q: PoolPreview['questions'][number], i) => (
                      <tr key={q.id}>
                        <td style={{ ...dt.td, ...dt.muted }}>{i + 1}</td>
                        <td style={dt.td}><span style={{ display: 'block', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={q.text}>{q.text}</span></td>
                        <td style={dt.td}><TypePill type={q.type} /></td>
                        <td style={{ ...dt.td, ...dt.muted }}>{DIFFICULTY_LABEL[q.difficulty] ?? q.difficulty}</td>
                        <td style={{ ...dt.td, ...dt.muted }}>{q.marks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.totalMatching > data.questions.length && <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>Showing the first {data.questions.length} of {data.totalMatching} matching questions.</p>}
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}

type SectionQuestion = ExamSection['questions'][number];
type NumberedSectionQuestion = SectionQuestion & { number: number };

// One section's question list. Owns its own replace hook so the remove action is section-scoped.
function SectionQuestionList({ examId, section, locked }: { examId: string; section: ExamSection; locked: boolean }) {
  const replaceQuestions = useReplaceSectionQuestions(examId, section.id);
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [difficultyFilter, setDifficultyFilter] = useState('all');

  const numbered: NumberedSectionQuestion[] = useMemo(() => section.questions.map((q, index) => ({ ...q, number: index + 1 })), [section.questions]);
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return numbered.filter((q) => {
      if (query && !(q.question?.text ?? q.questionId).toLowerCase().includes(query)) return false;
      if (typeFilter !== 'all' && q.question?.type !== typeFilter) return false;
      if (difficultyFilter !== 'all' && q.question?.difficulty !== difficultyFilter) return false;
      return true;
    });
  }, [numbered, search, typeFilter, difficultyFilter]);

  function handleRemove(questionId: string) {
    const remaining = section.questions.map((q) => q.questionId).filter((id) => id !== questionId);
    replaceQuestions.mutate(remaining, { onError: (error) => toast(error instanceof Error ? error.message : 'Failed to remove question.', 'error') });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 320 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search this section's questions…" aria-label="Search this section's questions" style={{ ...input, width: '100%', paddingLeft: 32 }} />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Filter by type" style={input}>
          {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={difficultyFilter} onChange={(e) => setDifficultyFilter(e.target.value)} aria-label="Filter by difficulty" style={input}>
          {DIFFICULTY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      {visible.length === 0 ? (
        <p style={{ padding: '16px 0', textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>No questions match your search.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={dt.th}>#</th><th style={dt.th}>Question</th><th style={dt.th}>Type</th><th style={dt.th}>Difficulty</th><th style={dt.th}>Marks</th>{!locked && <th style={dt.th} />}</tr></thead>
            <tbody>
              {visible.map((q) => (
                <tr key={q.questionId}>
                  <td style={{ ...dt.td, ...dt.muted }}>{q.number}</td>
                  <td style={dt.td}><span style={{ display: 'block', maxWidth: 520, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }} title={q.question?.text}>{q.question?.text ?? q.questionId}</span></td>
                  <td style={dt.td}>{q.question ? <TypePill type={q.question.type} /> : '—'}</td>
                  <td style={{ ...dt.td, ...dt.muted }}>{q.question ? DIFFICULTY_LABEL[q.question.difficulty] ?? q.question.difficulty : '—'}</td>
                  <td style={{ ...dt.td, ...dt.muted }}>{q.question?.marks ?? '—'}</td>
                  {!locked && (
                    <td style={{ ...dt.td, textAlign: 'right' }}>
                      <button type="button" onClick={() => handleRemove(q.questionId)} disabled={replaceQuestions.isPending} aria-label={`Remove question ${q.number}`} title="Remove" style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', opacity: replaceQuestions.isPending ? 0.5 : 1, display: 'inline-flex' }}><Trash2 size={15} /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SectionWeightInput({ examId, section, locked }: { examId: string; section: ExamSection; locked: boolean }) {
  const updateSection = useUpdateSection(examId, section.id);
  const { toast } = useToast();
  const [value, setValue] = useState(String(section.weightPercent));
  if (locked) return <span style={{ fontSize: 13, color: 'var(--muted)' }}>{section.weightPercent}% weight</span>;
  // Saved on blur rather than per-keystroke: a PATCH per character would spam the API and briefly persist a weight never meant.
  function handleBlur() {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100 || parsed === section.weightPercent) { setValue(String(section.weightPercent)); return; }
    updateSection.mutate({ weightPercent: parsed }, { onError: (error) => { toast(error instanceof Error ? error.message : 'Failed to update weight.', 'error'); setValue(String(section.weightPercent)); } });
  }
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--muted)' }}>Weight
      <input type="number" min={0} max={100} value={value} onChange={(e) => setValue(e.target.value)} onBlur={handleBlur} aria-label={`Weight % for ${section.title}`} style={smallNum} />%
    </label>
  );
}

function SectionRequiredCountInput({ examId, section, locked }: { examId: string; section: ExamSection; locked: boolean }) {
  const updateSection = useUpdateSection(examId, section.id);
  const { toast } = useToast();
  const total = section.selectionMode === 'pool' ? (section.poolSize ?? 0) : section.questions.length;
  const [value, setValue] = useState(section.requiredCount == null ? '' : String(section.requiredCount));
  if (locked) return section.requiredCount == null ? null : <span style={{ fontSize: 13, color: 'var(--muted)' }}>answer any {section.requiredCount} of {total}</span>;
  // Blank clears the requirement back to "answer all" (null server-side).
  function handleBlur() {
    const trimmed = value.trim();
    const parsed = trimmed === '' ? null : Number(trimmed);
    if (parsed !== null && (!Number.isInteger(parsed) || parsed < 1 || parsed > total)) { setValue(section.requiredCount == null ? '' : String(section.requiredCount)); return; }
    if (parsed === section.requiredCount) return;
    updateSection.mutate({ requiredCount: parsed }, { onError: (error) => { toast(error instanceof Error ? error.message : 'Failed to update required answers.', 'error'); setValue(section.requiredCount == null ? '' : String(section.requiredCount)); } });
  }
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--muted)' }}>Required
      <input type="number" min={1} max={total} value={value} placeholder="all" onChange={(e) => setValue(e.target.value)} onBlur={handleBlur} aria-label={`Required answers for ${section.title}`} style={smallNum} />of {total}
    </label>
  );
}

export function ExamSectionsPanel({ examId }: { examId: string }) {
  const { data: exam } = useExam(examId);
  const { data: sectionTitlesData } = useSectionTitles();
  const sectionTitles = Array.isArray(sectionTitlesData) ? sectionTitlesData : [];
  const createSection = useCreateSection(examId);
  const deleteSection = useDeleteSection(examId);
  const duplicateSection = useDuplicateSection(examId);
  const [newTitle, setNewTitle] = useState('');
  const [pickerSectionId, setPickerSectionId] = useState<string | null>(null);
  const [poolPreviewSectionId, setPoolPreviewSectionId] = useState<string | null>(null);
  const [sectionPendingDelete, setSectionPendingDelete] = useState<ExamSection | null>(null);
  // Accordion: only one section's body open at a time; adding one opens it immediately.
  const [expandedSectionId, setExpandedSectionId] = useState<string | null>(null);
  const { toast } = useToast();
  // Same two lock reasons as the Details tab.
  const locked = (exam?.hasStartedAttempts || exam?.status === 'published') ?? false;
  const lockedMessage = exam?.hasStartedAttempts
    ? 'Sections and questions are locked because a candidate has already started this exam.'
    : 'This exam is published, so its sections and questions are locked. Click Unpublish above to make changes.';
  const weightLocked = false;
  const showRescoreNotice = exam?.hasStartedAttempts ?? false;
  const sections = (exam?.sections ?? []).slice().sort((a, b) => a.orderIndex - b.orderIndex);
  const weightTotal = sections.reduce((sum, section) => sum + section.weightPercent, 0);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    createSection.mutate({ title: newTitle }, {
      onSuccess: (created: ExamSection) => { setNewTitle(''); setExpandedSectionId(created.id); },
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to add section.', 'error'),
    });
  }
  function handleDuplicateSection(sectionId: string) {
    duplicateSection.mutate(sectionId, {
      onSuccess: () => toast('Section duplicated.'),
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to duplicate section.', 'error'),
    });
  }
  function handleConfirmDeleteSection() {
    if (!sectionPendingDelete) return;
    deleteSection.mutate(sectionPendingDelete.id, {
      onSuccess: () => { toast('Section deleted.'); setSectionPendingDelete(null); },
      onError: (error) => { toast(error instanceof Error ? error.message : 'Failed to delete section.', 'error'); setSectionPendingDelete(null); },
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {locked && <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>{lockedMessage}</p>}
      {showRescoreNotice && (
        <p style={{ fontSize: 13, fontWeight: 500, color: '#a16207', margin: 0 }}>
          Candidates have already started this exam, but section weight can still be changed to adjust the pass/fail criteria — saving a new weight re-scores every candidate who has already submitted.
        </p>
      )}
      {!locked && (
        <form onSubmit={handleAdd} style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ flex: '1 1 auto', maxWidth: 360 }}>
            <label className="v2-label">New section title</label>
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} required list="section-titles" style={{ ...input, width: '100%' }} />
            <datalist id="section-titles">{sectionTitles.map((title) => <option key={title} value={title} />)}</datalist>
          </div>
          <button type="submit" style={dt.primaryBtn} disabled={createSection.isPending}>Add section</button>
        </form>
      )}
      {!weightLocked && sections.length > 0 && (
        <p style={{ fontSize: 13, fontWeight: 500, color: weightTotal === 100 ? VIZ.green : '#a16207', margin: 0 }}>
          {weightTotal === 100 ? `Weights total: ${weightTotal}%` : `Weights total: ${weightTotal}% — add ${100 - weightTotal}% more before publishing`}
        </p>
      )}
      {sections.map((section) => {
        const isOpen = expandedSectionId === section.id;
        return (
          <div key={section.id} style={{ ...card, display: 'flex', flexDirection: 'column', gap: isOpen ? 12 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => setExpandedSectionId(isOpen ? null : section.id)} aria-expanded={isOpen} aria-label={isOpen ? `Collapse ${section.title}` : `Expand ${section.title}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'inline-flex', padding: 2 }}>
                  <ChevronDown size={16} style={{ transform: isOpen ? 'none' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
                </button>
                <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>{section.title}</span>
                <SectionWeightInput examId={examId} section={section} locked={weightLocked} />
                <SectionRequiredCountInput examId={examId} section={section} locked={locked} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {!locked && section.selectionMode !== 'pool' && <button type="button" style={dt.toolBtn} onClick={() => setPickerSectionId(section.id)}>Manage questions</button>}
                {section.selectionMode === 'pool' && <button type="button" style={dt.toolBtn} onClick={() => setPoolPreviewSectionId(section.id)}>Preview pool</button>}
                {!locked && (
                  <Dropdown align="end" menuWidth={150} trigger={<span style={{ display: 'inline-grid', placeItems: 'center', width: 30, height: 30, color: 'var(--muted)', cursor: 'pointer' }}><MoreHorizontal size={17} /></span>}>
                    {(close) => (<>
                      <DropdownItem onClick={() => { close(); handleDuplicateSection(section.id); }}>Duplicate</DropdownItem>
                      <DropdownItem danger onClick={() => { close(); setSectionPendingDelete(section); }}>Delete</DropdownItem>
                    </>)}
                  </Dropdown>
                )}
              </div>
            </div>
            {isOpen && (section.selectionMode === 'pool' ? (
              <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>Pool of {section.poolSize ?? 0} question{section.poolSize === 1 ? '' : 's'}{section.poolDifficulty ? ` (${section.poolDifficulty})` : ''}</p>
            ) : section.questions.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>No questions added yet.</p>
            ) : (
              <SectionQuestionList examId={examId} section={section} locked={locked} />
            ))}
          </div>
        );
      })}
      {pickerSectionId && (
        <SectionQuestionPicker examId={examId} sectionId={pickerSectionId} open onClose={() => setPickerSectionId(null)}
          existingQuestionIds={exam?.sections.find((s) => s.id === pickerSectionId)?.questions.map((q) => q.questionId) ?? []} />
      )}
      {poolPreviewSectionId && (
        <PoolPreviewDialog examId={examId} sectionId={poolPreviewSectionId} sectionTitle={exam?.sections.find((s) => s.id === poolPreviewSectionId)?.title ?? ''} onClose={() => setPoolPreviewSectionId(null)} />
      )}
      <Dialog open={!!sectionPendingDelete} onClose={() => setSectionPendingDelete(null)} title="Delete section">
        <p style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5, margin: '0 0 18px' }}>Delete <strong style={{ color: 'var(--ink)' }}>{sectionPendingDelete?.title}</strong> and remove its questions from this exam?</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" onClick={() => setSectionPendingDelete(null)} style={dt.toolBtn}>Cancel</button>
          <button type="button" onClick={handleConfirmDeleteSection} disabled={deleteSection.isPending} style={{ fontSize: 13, fontWeight: 500, padding: '8px 14px', borderRadius: 9, border: 'none', background: 'var(--danger)', color: '#fff', cursor: 'pointer' }}>Delete</button>
        </div>
      </Dialog>
    </div>
  );
}
