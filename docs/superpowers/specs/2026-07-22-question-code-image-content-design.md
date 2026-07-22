# Question Code Snippet & Image Content — Design Spec

## 1. Context & Scope

The platform today has four question types: `single_mcq`, `multi_mcq`, `true_false` (all auto-graded from `QuestionOption.isCorrect`), and `code` (the already-shipped Code Run Execution feature — a candidate writes and runs source code in a Piston sandbox, with zero `QuestionOption` rows, and `Question.codeLanguage`/`Question.starterCode`/`Question.allowStdin` driving the editor and sandbox).

This phase adds **no new question type and no new grading logic**. It lets the three existing auto-graded types optionally show a **decorative code snippet** and/or **images** as part of the question prompt and answer options — e.g. "What does this code print?" with four plain-text options, or an arithmetic/reasoning question built around a symbol-sequence image where each option is itself a small image. Grading stays exactly as it is today: the candidate still just picks option(s), `QuestionOption.isCorrect` still decides right/wrong, `gradeAnswer()`/`computeResult()` are untouched.

An earlier, unexecuted plan (`docs/superpowers/plans/2026-07-15-code-question-type.md`, spec `docs/superpowers/specs/2026-07-15-code-question-type-design.md`) proposed a fifth question type with a Monaco editor and **manual recruiter grading**. That plan is superseded and not used here — confirmed with the user that what's wanted is much simpler: existing auto-graded MCQ/true-false questions with extra display content, not a new manually-graded type. Those old files are left in place as historical record but nothing in this phase builds on them.

**Naming collision avoided:** because `codeLanguage`/`starterCode` are already taken by the Code Run Execution type, this phase's new columns are named `snippetCode`/`snippetLanguage` to make the distinction unambiguous in the schema itself — one is "the code the candidate runs", the other is "the code shown as read-only context in an MCQ prompt".

**Existing infrastructure this reuses directly, confirmed by codebase survey:**
- **File upload pattern**: `POST /organizations/branding/logo` (`apps/api/src/organizations/organizations.controller.ts:118-124`) — `multer` memory storage, a MIME whitelist (`image/png`, `image/jpeg`, `image/svg+xml`) and a 2MB size cap enforced in the service, bytes written to local disk under `UPLOADS_ROOT` (`apps/api/src/organizations/uploads-path.ts`), served back by the already-mounted static-uploads module at the `/uploads` prefix with `X-Content-Type-Options: nosniff` and a locked-down CSP already applied to every response under that prefix. This phase's image upload follows the identical recipe, just a different subfolder (`question-images/` instead of `logos/`) and a generic (not organization-scoped) endpoint, since a question may not exist yet at authoring time.
- **Flat-column convention**: `Question.topic`, `Question.category`, `Question.codeLanguage`/`starterCode` are all nullable flat columns for optional per-question metadata — this phase's four new columns follow the same convention, no new side table.

## 2. Scope Decisions

- **No new question type.** `single_mcq`, `multi_mcq`, `true_false` gain optional display content; the `code` (execution) type is untouched and not eligible for these new fields (it already has its own editor and zero options, so a decorative snippet or per-option image would be meaningless there).
- **Code snippet is question-stem only, plain text, no execution.** No Monaco editor, no syntax-highlighting library (none is installed in `apps/web`; none is added). Rendered as a monospace block with a small language label above it. Not per-option — only the question prompt can carry a snippet, matching what was actually asked for ("like in mcq, I want to give code, ask to choose the correct answer").
- **Images can appear on the question stem AND on each answer option.** Both are independently optional — a question can have a stem image with no option images, option images with no stem image, both, or neither (in which case behavior is byte-identical to today).
- **Option text stays required.** An option with an image still needs its existing `text` (e.g. a short label); the image is additive decoration, not a replacement for existing per-type option-count/correct-count validation, which is entirely unchanged.
- **Images stored as files on local disk, not base64.** Reuses the org-logo upload pattern exactly (2MB cap, `image/png`/`image/jpeg`/`image/svg+xml` whitelist) rather than the webcam-proctoring pattern (base64 in a JSON column), because question images are fetched on every exam list/candidate load — unlike attempt-scoped evidence fetched rarely, embedding base64 here would bloat every payload.
- **One generic upload endpoint, not per-question.** `POST /questions/images` (recruiter, `exam:manage`) accepts a file and returns `{ imageUrl }` before the question itself is created — the question-authoring form uploads an image the moment the recruiter picks a file, then sends the returned URL string alongside the rest of the question payload on save. This avoids a two-phase "create then attach image" flow.

## 3. Data Model

**`Question`** gains four new nullable columns:
- `snippetCode: String? @db.NVarChar(Max)` — the decorative code text shown in the question prompt.
- `snippetLanguage: String?` — a label only (e.g. `python`), for display above the code block; reuses the same fixed language list as the execution type's `codeLanguage` (`javascript`, `typescript`, `python`, `java`, `csharp`, `cpp`, `go`, `ruby`) for a consistent recruiter-facing dropdown, but is a distinct column with no relation to `codeLanguage`.
- `imageUrl: String?` — the question-stem image, stored as a relative path (e.g. `question-images/<uuid>.png`), synthesized into a full URL on read exactly like `Organization.logoPath` → `logoUrl` is today.

**`QuestionOption`** gains one new nullable column:
- `imageUrl: String?` — same storage/serving shape as `Question.imageUrl`.

**`question-validation.ts`**: no new `type` value. A new validation rule: `snippetCode`/`snippetLanguage`/stem `imageUrl` are only accepted (silently ignored if sent, not an error — matching how e.g. `topic` is optional for every type today) when `type !== 'code'`; since the execution type already requires zero options, per-option `imageUrl` is naturally inapplicable there too.

## 4. Backend Surface

**New endpoint**: `POST /questions/images` (recruiter, `exam:manage`, `@UseInterceptors(FileInterceptor('file'))`, `@Throttle(MODERATE_UPLOAD_THROTTLE)` — same tier as the logo upload). Validates MIME type (`image/png`, `image/jpeg`, `image/svg+xml`) and size (2MB cap) with the same constants/logic as `organizations.service.ts`'s logo validation (extracted or duplicated — implementer's call, following whatever keeps the code cleanest), writes to `UPLOADS_ROOT/question-images/<uuid><ext>`, and returns `{ imageUrl: '<API_ORIGIN>/uploads/question-images/<uuid><ext>' }`. No association with any question ID at upload time — the returned URL is just a string the frontend later includes in a create/update question payload, exactly like it already does for `topic`/`category`.

**`CreateQuestionDto`/`UpdateQuestionDto`**: gain optional `snippetCode`, `snippetLanguage` (validated against the same fixed list, only meaningful when set alongside `snippetCode`), and `imageUrl`. `QuestionOptionDto` gains optional `imageUrl`.

**`QuestionsService`**: passes the four new fields straight through into the existing `tx.question.create`/`tx.question.update` and `tx.questionOption.create` calls — no new logic beyond field pass-through, since grading and every existing validation branch are untouched.

**Candidate-facing exposure**: wherever a `Question`/`QuestionOption` is currently serialized to the candidate (attempt-start, get-current, etc.), the four new fields pass through alongside the existing ones — same shape as how `topic`/`category` already flow to the client today (i.e., no new endpoint needed here, just extending existing response shapes).

## 5. Frontend

**Recruiter authoring** (`apps/web/components/QuestionForm.tsx`): for `single_mcq`/`multi_mcq`/`true_false` only, the form gains: a language dropdown + monospace textarea for `snippetCode`/`snippetLanguage` (both optional, shown collapsed/optional-looking, not required fields), an "upload image" button for the question stem that calls the new upload endpoint on file selection and stores the returned URL in form state, and a small image-upload affordance next to each option row that does the same. Removing an already-uploaded image just clears the URL from form state (the orphaned file on disk is not cleaned up — acceptable, matching how the org-logo path already has no explicit orphan-cleanup either).

**Candidate exam-taking** (`apps/web/app/(candidate)/exam/page.tsx`): when `question.snippetCode` is present, render a `<pre>` monospace block with the `snippetLanguage` shown as a small label above it (no syntax-highlighting library). When `question.imageUrl` is present, render it as an `<img>` above/alongside the option list. When an individual option's `imageUrl` is present, render it inside that option's row alongside its existing text. All purely additive — a question with none of these four fields set renders byte-identical to today.

## 6. Error Handling & Empty States

- **Oversized or wrong-mimetype image upload**: rejected with a 400 by the same validation shape as the existing logo upload; the frontend shows an inline error and the form is otherwise unaffected (no partial state — the question payload simply doesn't get the new URL until a valid upload succeeds).
- **`snippetLanguage` set without `snippetCode` (or vice versa)**: both render fine independently (the label is just not shown if there's no snippet to label; a snippet with no language shows the code block with no label) — no hard validation coupling the two, since neither is required and there's no advantage to being strict here.
- **`type === 'code'` (execution type) with any of these fields set**: silently ignored server-side (not persisted), consistent with how unrelated optional fields already behave across question types today.
- **Missing image (broken URL, deleted file)**: browser's normal broken-image behavior — no special handling, matching how the org-logo `<img>` tag behaves today.

## 7. Testing

- **Backend unit**: `question-validation.ts`'s exclusion of the new fields for `type === 'code'`; `CreateQuestionDto`/`UpdateQuestionDto` accept the new optional fields; `QuestionsService.create`/`update` persist all four new columns correctly.
- **Backend unit — upload endpoint**: accepts valid PNG/JPEG/SVG under 2MB and returns the expected URL shape; rejects oversized files and disallowed MIME types with 400s — mirrors the existing logo-upload test file's structure.
- **Frontend component**: `QuestionForm`'s new snippet/image fields (for the three eligible types, hidden/inapplicable for `code`); the candidate exam page's new snippet/image rendering (present and absent cases).
- **Backend e2e**: a recruiter creates a `single_mcq` question with a snippet and a stem image plus one option image, builds an exam, a candidate fetches the attempt and sees all four fields in the response, submits an answer, and the attempt settles exactly as any other MCQ attempt does today (no change to scoring).
