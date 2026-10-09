# T08 · YukthiX Secure Client

> **Status:** ✅ Decided (5/5), 26 Sep 2026. Q2 and Q4 are company choices under D17.
> **Covers:** GAP-REGISTER **A12** and spec §1.1.6: a proprietary proctored browser installed before the test, kiosk mode, VM / emulator detection, screenshot and screen-recording blocking, virtual camera / audio driver detection, blocked-process list at launch and polled, screen mirroring / casting, remote-control tools, and second-device hints on the local network. It fills T04 Q2's "own client later".
>
> Competitors: Respondus LockDown Browser, Mettl Secure Browser, Talview, Proctorio / Honorlock extensions, Safe Exam Browser (what we use today).
>
> **Builds on:**
> - T03: device policy and readiness check;
> - T04: modes, action matrix, SEB today, signals, flags only;
> - T05: evidence, retention, consent;
> - P12: code signing, secure SDLC, vulnerability management;
> - M04: the Capacitor app approach for the mobile candidate app;
> - T07: workspaces run inside the client.
>
> **Pricing (D18):** included in the per-attempt price.
> **Build:** Proctoring track, phase 2. SEB stays supported alongside.
> Policies in this module are P19 policy points (D19): companies can change them and use any field, including custom fields; the values in this doc are starter rules.

---

## 1. Purpose & scope
For high-stakes tests, give companies a lock-down environment YukthiX controls end to end. It can:
- see and block what a browser can't (other processes, virtual machines, fake cameras, screen capture, remote control);
- keep the candidate experience simple: one download, one click, auto-update;
- replace Safe Exam Browser for customers who want one branded client.

## 2. What exists today
- Third-party **Safe Exam Browser** (SEB) with a ConfigKey check (T04 Q2).
- Browser-level detections: fullscreen exit, devtools, tab switch, multi-monitor, AI screen analysis flags for background apps / remote tools.
- **Missing:**
  - process-level blocking;
  - VM / virtual-camera / virtual-audio / mirroring detection;
  - screenshot and recording blocking;
  - LAN device hints.

## 3. Concepts
- **Secure Client:** a signed desktop application that hosts the YukthiX test runner in a locked-down window (kiosk). It runs only for the duration of an attempt and exits cleanly. No background service keeps running after the test (Q3).
- **Tiers:**

  | Tier | What it can do |
  |---|---|
  | **Desktop client** (full) | Process control, VM / driver detection, capture blocking, kiosk |
  | **Browser extension** (light) | Tab / window control, screen-capture API detection, extension blocking, within browser limits; no install of native code |
  | **SEB** (existing) | Kept as an option |

  The test's proctoring mode and device policy (T03 / T04) decide which tiers are allowed or required.
- **Detections** (flags per the T04 action matrix):
  - blocked processes (configurable list: conferencing, remote control, screen recorders, AI assistants, messaging), checked at launch and polled;
  - VM / emulator / sandbox detection;
  - virtual camera and virtual audio drivers;
  - screen mirroring / casting and extra displays;
  - screenshot / screen-recording attempts (blocked where the OS allows);
  - clipboard control;
  - remote-desktop sessions;
  - **LAN second-device hints** (optional, consent-based, Q4);
  - **overlay assistants** (G16): always-on-top, transparent or click-through windows layered over the runner that a screen share does not show — detected from the window-layer enumeration, not from the shared image;
  - **second-device voice tools** (G16): a phone or other device running a voice LLM assistant, inferred only from the T04 audio signals (Q6 voice activity / second speaker) and the optional LAN hint; flag only.
- **Launch handshake:**
  1. The test page detects that the client is required.
  2. It offers a download or opens the installed client via a deep link.
  3. The client verifies its signature and version with the server.
  4. The server issues a one-time launch token bound to the attempt.
  5. The runner loads inside the kiosk.

  A client failing integrity checks can't start the test.
- **Auto-update:** signed updates with a minimum version per test. Old versions are refused.

## 4. Data model (main additions)

| Table | Purpose |
|---|---|
| `client_releases` | Platform, version, signature hash, min-supported flag, release notes, rollout % |
| `client_sessions` | Attempt × client: platform, OS version, client version, integrity result, launch token (hashed), start / end |
| `client_detections` | Session × detection type (process / VM / virtual device / capture / mirroring / remote / LAN), details (process name, driver), action taken per T04 matrix, time — flows into T04 `detection_events` |
| `blocked_process_lists` | Platform catalogue list + tenant additions / exceptions (e.g. allow screen reader), version |

Platform tables are catalogue tables (P07 YX-STAT-10 pattern); session / detection tables carry `organization_id` + RLS. Collected device data is limited to what the rules need (T05 consent lists it).

## 5. Rules (YX-SCL)

| ID | Rule |
|---|---|
| YX-SCL-01 | The client is code-signed, verifies its own integrity at start, and must be at or above the test's minimum version. The server accepts a session only with a valid one-time launch token bound to the attempt. |
| YX-SCL-02 | The client runs only during an attempt. It installs **no always-on background service or kernel driver**, keeps no data after exit except crash logs, and uninstalls cleanly (Q3). |
| YX-SCL-03 | Detections are signals routed through the T04 action matrix (flag / warn / pause / terminate). Nothing auto-fails a candidate (T04 YX-PROC-02). |
| YX-SCL-04 | Blocked-process lists are platform-maintained, and tenants may add entries or allow exceptions per test (e.g. an assistive technology approved as an accommodation, T03 YX-DLV-10). Accommodations always take precedence. |
| YX-SCL-05 | The client collects only the data listed in the consent (process names, device types, display count, VM indicators). It never reads files, keystroke content outside the test, browsing history or personal documents. |
| YX-SCL-06 | The LAN second-device hint is optional per test, consent-based, passive (e.g. discovering devices advertising on the local network), stores only a count and device class, and is never used as a sole reason for action. |
| YX-SCL-07 | Releases pass the P12 secure-SDLC gates and a security review. A vulnerability in the client follows P12 SLAs, and affected versions are blocked via minimum-version. |
| YX-SCL-08 | If the client crashes or the device fails mid-test, T03 session continuity applies (auto-save, time credit, re-auth). Crashes are logged, not treated as violations. |
| YX-SCL-09 | **Overlay assistants and second-device voice tools (G16).** The client enumerates the window layers over the runner and raises an **overlay assistant** signal for always-on-top, transparent or click-through windows that are invisible in the screen share; the shared screen image alone is never trusted to show everything on the display. A **second-device voice tool** is inferred only from the T04 audio signals (Q6) and the optional LAN hint (YX-SCL-06), never from listening to the room's content. Both are T04 AI-assistance signals (YX-PROC-03): review flags with their evidence, never an automatic action on their own (YX-SCL-03). An assistive overlay approved as an accommodation (screen reader, magnifier, captioning) is allow-listed per test and takes precedence (YX-SCL-04). |

## 6. Flows
1. **Pre-test:**
   1. Readiness check (T03) detects the required client.
   2. Download (one click) or deep-link to the installed client.
   3. Self-test (camera, mic, processes) in the client.
   4. Candidate closes the listed apps with guidance.
2. **Test start:** handshake (§3) → kiosk opens → T04 identity steps → test.
3. **During:** process polling and device checks → signals → T04 matrix actions → evidence (T05).
4. **End:** submit → client exits → kiosk released → nothing left running.
5. **Release management:** build → sign → staged rollout (%) → monitor crash / detection rates → raise minimum version.

## 7. UI
- **Candidate:**
  - one-page "install and check" with OS-specific steps;
  - the client self-test screen;
  - a clear list of apps to close;
  - a kiosk status bar (what is monitored).
- **Admin:**
  - test settings › proctoring › client tier (required / allowed / not used);
  - blocked-process exceptions per test;
  - client version policy.
- **Staff console (P14):** releases, rollout, crash and detection dashboards.

## 8. Migration & rollout
Proctoring track phase 2:
All platforms ship together in phase 2 (Q1): Windows, macOS and Linux desktop clients, a ChromeOS client, and the Chrome / Edge browser extension. One shared runner core with a thin native layer per OS keeps this affordable.

SEB stays supported, and tests can allow either the client or SEB during the transition.

## 9. Acceptance tests (samples)
- A tampered client binary fails the signature check and can't start a test (YX-SCL-01).
- After the test, no YukthiX process or service remains running (YX-SCL-02).
- Running an unapproved screen recorder raises a flag and, per the test's matrix, a warning; the candidate isn't auto-failed (YX-SCL-03).
- A candidate with an approved screen-reader accommodation isn't flagged for it (YX-SCL-04).
- A virtual-camera driver active at launch is detected and handled per the matrix (§3).
- The client never uploads file names from the candidate's documents folder (YX-SCL-05).

## 10. Open questions (answer one at a time)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Platforms | Decided: **all platforms at once**: Windows, macOS, Linux, ChromeOS and the Chrome / Edge extension. |
| Q2 | Tiers & SEB | **Company decides per test (D17)** which tiers are allowed / required (desktop client, extension, SEB); starter template: Live and certification tests require the desktop client or SEB; Record & review allows the extension. |
| Q3 | Install footprint | **Runs only during the attempt**: no always-on service, no kernel driver, clean uninstall; admin rights needed only for the first install where the OS requires it. |
| Q4 | LAN second-device hints | **Optional per test, off by default**, consent-based, passive discovery only, count and device class stored, advisory flag only. |
| Q5 | Timing vs SEB | Build in **Proctoring track phase 2**: Windows first, then macOS, then the extension; SEB supported in parallel until the client covers all tenants' needs; no forced migration. |

## 11. Decisions
| # | Decision | Date |
|---|---|---|
| Q1 | **All platforms at once:** Windows, macOS, Linux and ChromeOS desktop clients plus the Chrome / Edge browser extension, released together in phase 2. Built as one shared runner core with a thin native layer per OS. Phones stay with the candidate app for Open / AI-only modes. Team action: size the per-OS native work and test matrix. | 26 Sep 2026 |
| Q2 | **Company decides per test (D17)** which tiers are allowed or required: desktop client, browser extension or SEB. Starter template: Live and certification tests require the desktop client or SEB, and Record & review also allows the extension. | 26 Sep 2026 |
| Q3 | **Runs only during the test:** no always-on background service and no kernel driver; clean uninstall; admin rights only at first install where the OS requires it (YX-SCL-02). | 26 Sep 2026 |
| Q4 | **Company decides per test (D17):** LAN second-device hints are an option, off in the starter template. When on, they are consent-based, passive discovery only, store only a count and device class, and give an advisory flag only (YX-SCL-06). | 26 Sep 2026 |
| Q5 | **Run both, no forced switch:** SEB stays supported alongside the YukthiX client, chosen per test (Q2). SEB is retired only when no tenant uses it. | 26 Sep 2026 |
| Market analysis additions (G16) | **Overlay assistants and second-device voice tools named** ([MARKET-COMPETITOR-ANALYSIS](MARKET-COMPETITOR-ANALYSIS.md) §4 G16): §3 detections list screen overlays that a screen share does not show and second-device voice LLM tools; detected via window-layer enumeration and the T04 audio / LAN signals, flags only, accommodation overlays allow-listed (YX-SCL-09; T04 YX-PROC-03 wording). | 26 Sep 2026 |
