import type { SystemEventEntry } from './hooks/useSystemEvents';

export interface PlainEvent {
  // One line for the table: what happened, in words an org admin can act on.
  summary: string;
  // Why it happened / what it actually means. Shown in the detail modal.
  meaning: string;
  // What the reader should do about it -- including "nothing", which is the
  // honest answer for most of these and stops them being chased as incidents.
  whatToDo: string;
}

// Every system_events row stores a message written for engineers: "js_error: Script
// error.", "ServiceUnavailableException: ... timed out after 5000ms". Org admins are
// who actually opens System Logs, so each known shape gets a plain-English sentence.
//
// Same shape as friendlyAction() in audit-display.ts -- a table of known cases plus a
// fallback that degrades into readable prose instead of a blank.
//
// Matching is on the message TEXT rather than a stored code, deliberately: it applies
// retroactively to every event already in the database, so this needs no backend
// change, no new column and no migration. The raw message is still shown in the detail
// modal, so nothing is hidden from whoever needs the technical form.
const STATUS_WORDS: Record<string, string> = {
  paused: 'paused',
  blocked: 'blocked',
  submitted: 'already submitted',
  expired: 'expired',
};

const RULES: { match: RegExp; plain: (groups: RegExpMatchArray) => PlainEvent }[] = [
  {
    // The browser's opaque cross-origin error: it withholds the message, file and line
    // on purpose. Ours are all same-origin (Monaco and MediaPipe are self-hosted), so a
    // blank one is something in the candidate's own browser, typically an extension.
    match: /^js_error: Script error\.$/,
    plain: () => ({
      summary: "Something in the candidate's browser crashed (no details available)",
      meaning:
        "The browser refused to say what failed. It does that when the broken script came from outside our site — normally a browser extension the candidate has installed. Every script the exam itself loads is served from this site, so this is almost certainly not the exam app.",
      whatToDo:
        'Nothing, unless the candidate also reported a problem. This does not stop or affect their exam.',
    }),
  },
  {
    // The Monaco AMD loader being initialised twice -- the code editor hangs on "Loading…".
    match: /anonymous define call/,
    plain: () => ({
      summary: 'The code editor failed to load for this candidate',
      meaning:
        'The code editor was started twice on the same page, so it stopped instead of opening. The candidate would have seen the editor stuck on "Loading…" and been unable to type their answer.',
      whatToDo:
        'Ask the candidate to refresh the page — that normally fixes it. If several candidates hit this on the same exam, raise it with the developers.',
    }),
  },
  {
    match: /^answer_save_failed: .*status is "([a-z_]+)"/,
    plain: (m) => ({
      summary: `The candidate tried to answer while their exam was ${STATUS_WORDS[m[1]] ?? m[1]}`,
      meaning: `Their answer was not saved, because the attempt was ${STATUS_WORDS[m[1]] ?? m[1]} at that moment.`,
      whatToDo:
        m[1] === 'paused'
          ? 'Expected if you or the proctoring rules paused them. If they should not have been paused, resume the attempt from Live monitoring.'
          : 'Check the attempt in Live monitoring to confirm it is in the state you expect.',
    }),
  },
  {
    match: /^answer_save_failed:/,
    plain: () => ({
      summary: "The candidate's answer failed to save",
      meaning:
        'The exam server rejected or did not receive the answer. Usually a dropped network connection on the candidate’s side.',
      whatToDo:
        'Check whether the answer is present on their report. If not, contact the candidate — they may need to re-enter it.',
    }),
  },
  {
    // The AI code-review call giving up. Grading is unaffected; only the commentary is missing.
    match: /generate-code-review .*timed out after (\d+)ms/,
    plain: (m) => ({
      summary: 'AI code review took too long and was skipped',
      meaning: `The AI review of a candidate's code did not finish within ${Number(m[1]) / 1000} seconds, so it was given up on. Their answer and their score are not affected — only the AI's written comments are missing.`,
      whatToDo:
        "Open the candidate's report and use Regenerate if you want the review. Repeated timeouts usually mean the AI key is missing or the provider is slow.",
    }),
  },
  {
    match: /internal call to \S+ timed out after (\d+)ms/,
    plain: (m) => ({
      summary: 'One part of the system did not answer in time',
      meaning: `An internal request between our own services passed ${Number(m[1]) / 1000} seconds with no reply and was abandoned. Whatever the staff member was doing at that moment would have shown a "please try again" message.`,
      whatToDo: 'Retry the action. If it keeps happening, the exam runtime service needs looking at.',
    }),
  },
  {
    // status=0 means the browser completed no HTTP exchange at all. Everything else in the app
    // goes over 443, but code runs go to exam-runtime on :3002 -- so a candidate whose network
    // filters that port sees the whole exam work and only Run fail.
    match: /^code_run_failed:.*\(error 0\)/,
    plain: () => ({
      summary: "The candidate's network blocked the code runner",
      meaning:
        "Running code goes to a different port (3002) than the rest of the exam, and their network let everything else through but blocked that one. The candidate saw \"Something unexpected went wrong (error 0)\" and could not run their code — though they could still type it and submit it.",
      whatToDo:
        'Nothing you can fix mid-exam. If it happens repeatedly, moving the code runner onto the standard port is the permanent fix — the plan is written up as the exam-runtime subdomain change.',
    }),
  },
  {
    match: /^code_run_failed: (.+)$/,
    plain: (m) => ({
      summary: "The candidate couldn't run their code",
      meaning: `The exam told them: "${m[1]}". Their answer is unaffected — running is a check, not a submission.`,
      whatToDo:
        'Check the detail for the HTTP status. A run limit or a sandbox outage will say so; "status=0" means their network blocked the code runner.',
    }),
  },
  {
    match: /^unhandled_rejection: (.+)$/,
    plain: (m) => ({
      summary: "A background task in the candidate's browser failed",
      meaning: `Something running in the background — saving, uploading or fetching — failed and was not caught. The browser reported: "${m[1]}".`,
      whatToDo: "Check the candidate's attempt looks complete. Isolated occurrences are usually a brief network drop.",
    }),
  },
  {
    match: /^js_error: (.+)$/,
    plain: (m) => ({
      summary: "An error occurred on the candidate's exam page",
      meaning: `The candidate's browser reported: "${m[1]}".`,
      whatToDo: "Ask the candidate to refresh. If it repeats, send this message and the candidate's name to the developers.",
    }),
  },
];

// Unknown message: strip the engineering prefix ("SomeException: ", "some_kind: ")
// and present the remainder as a sentence, so a newly-added event type still reads
// as words rather than as a raw token.
function fallback(message: string): PlainEvent {
  const stripped = message.replace(/^[A-Za-z]+(Exception|Error):\s*/, '').replace(/^[a-z_]+:\s*/, '');
  const text = stripped.trim() || message;
  return {
    summary: text.charAt(0).toUpperCase() + text.slice(1),
    meaning: 'This error has not been given a plain-English description yet.',
    whatToDo: 'Send this message to the developers if it keeps appearing.',
  };
}

export function plainEnglish(entry: SystemEventEntry): PlainEvent {
  for (const rule of RULES) {
    const matched = entry.message.match(rule.match);
    if (matched) return rule.plain(matched);
  }
  return fallback(entry.message);
}
