# Lockdown Browser — Scoping Plan (planning only, no code yet)

## Why

Incident 2026-08-01: a candidate gave a helper remote access (AnyDesk-style screen share +
control) before starting the exam. Browser JavaScript cannot enumerate processes or network
connections, so no web-only proctoring can reliably detect or prevent this. The periodic AI
screen-analysis feature (ADO #6853) catches remote-tool UI *visible on the shared monitor*,
but a determined cheater can hide it (tool minimized on a virtual desktop, second machine,
hardware KVM). Process-level blocking requires a native component.

## Options

### Option A — Safe Exam Browser (SEB) integration (recommended first step)
Open-source (Windows/macOS/iOS), purpose-built lockdown browser used by Moodle/Canvas/etc.
- **How it works with us:** we generate a `.seb` config file per exam (start URL, allowed
  domains, quit password, prohibited-processes list including AnyDesk/TeamViewer/RustDesk/
  Chrome Remote Desktop). Candidate installs SEB, opens the `.seb` file, SEB kills/refuses to
  start while prohibited processes run, locks the machine to our exam URL, blocks task
  switching.
- **Server-side verification:** SEB sends a `ConfigKey`/`BrowserExamKey` hash header with
  every request. We verify it server-side (hash of URL + our config) → the exam page can
  *prove* it is being rendered inside a locked-down SEB with OUR config, not a normal
  browser. This is the critical piece — without header verification, a candidate just uses
  Chrome.
- **Effort:** small-medium. Config generator + download button on the welcome page, one
  middleware/guard verifying the SEB hash headers on candidate routes, per-exam toggle
  (`lockdownRequired`), recruiter UI checkbox, docs for candidates.
- **Risks/limits:** desktop-install friction (corporate machines may block installs); macOS
  coverage weaker than Windows; SEB is a client — a sufficiently determined attacker with a
  patched build could spoof, but the bar rises enormously vs today.

### Option B — Custom Electron/Tauri companion app
Our own kiosk app: process scan (AnyDesk/TeamViewer/etc.), screen-recording-detection APIs,
single-window kiosk, heartbeat to exam-runtime.
- **Effort:** large (multi-week): code signing certs (Windows + notarized macOS), auto-update
  pipeline, per-OS process-enumeration code, kiosk escape-proofing — essentially rebuilding
  what SEB already does, plus permanent maintenance.
- **Only worth it if** SEB's UX is unacceptable or we need custom telemetry SEB can't provide.

### Option C — Commercial (Respondus, Proctorio, etc.)
Per-exam licensing cost, fastest to "enterprise-grade", but vendor lock-in and per-seat fees.
Not aligned with the self-hosted model. Keep as fallback.

## Recommendation

Phase 1 (next build slot): **Option A — SEB with server-side ConfigKey verification**, behind
a per-exam `lockdownRequired` toggle so low-stakes exams keep the friction-free flow.
Detection layers then stack: SEB blocks the tools at process level; AI screen analysis
(#6853) covers non-SEB exams and catches what slips through; webcam + multi-monitor +
tab-switch signals remain as today.

## Phase 1 task sketch (when picked up)

1. Schema: `lockdownRequired` on Exam + recruiter toggle (mirror screenCaptureEnabled end to end).
2. SEB config generator endpoint (`GET /exams/:id/seb-config`, staff-authed): start URL with
   invite token placeholder, allowed domains, prohibited-process list, quit password.
3. Candidate welcome page: when required and SEB headers absent → block start, show SEB
   download + "open exam in SEB" instructions.
4. Guard on candidate routes verifying `X-SafeExamBrowser-ConfigKeyHash` (hash of request URL
   + config key) when the exam requires lockdown; e2e test with a simulated SEB client.
5. Pilot with one internal exam before enabling for real candidates.

## Explicitly out of scope for Phase 1

Custom companion app (Option B), mobile/tablet candidates (SEB iOS exists but our exam UI is
desktop-oriented), VM detection (SEB has basic VM detection flags — enable, don't build).
