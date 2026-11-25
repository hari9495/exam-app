import type { LiveConsent, LiveResult, LiveRunner, LiveSelfie } from './candidate';

// AS-4a (PRC-26, PRC-27): a live runner and result as the web page builds them, for stories and tests.
export const LIVE_RUNNER: LiveRunner = {
  testName: 'Java Backend Developer · L2',
  candidateName: 'Arjun Nair',
  proctored: true,
  proctoringNote: 'Camera on · Screen shared',
  seconds: 1930,
  status: 'running',
  breaksLeft: 1,
  breakMinutes: 5,
  onStartBreak: async () => undefined,
  onEndBreak: async () => undefined,
  connection: 'online',
  queued: 0,
  offlineSeconds: 0,
  offlineMinutes: 5,
  creditSeconds: 0,
  creditCapMinutes: 10,
  saveStatus: 'saved',
  savedAt: '10:41',
  sections: [
    { name: 'Aptitude', count: 2 },
    { name: 'Java', count: 2 },
  ],
  questions: [
    { id: 'q1', type: 'single', text: 'Which operation is lazy and returns a new stream?', marks: 2, options: [{ id: 'a', label: 'filter() is terminal' }, { id: 'b', label: 'map() is lazy and returns a new stream' }], value: ['b'], answerText: '', answered: true, markedForReview: false },
    { id: 'q2', type: 'multiple', text: 'Which are checked exceptions?', marks: 2, options: [{ id: 'a', label: 'IOException' }, { id: 'b', label: 'NullPointerException' }, { id: 'c', label: 'SQLException' }], value: [], answerText: '', answered: false, markedForReview: true },
    { id: 'q3', type: 'essay', text: 'Explain how you would find a memory leak in a running service.', marks: 9, options: [], value: [], answerText: 'Take a heap dump first…', answered: true, markedForReview: false },
    { id: 'q4', type: 'other', text: 'Write topK.', marks: 10, options: [], value: [], answerText: '', answered: false, markedForReview: false },
  ],
  current: 0,
  onNavigate: () => undefined,
  onAnswer: () => undefined,
  onAnswerText: () => undefined,
  onMark: () => undefined,
  calculator: 'basic',
  onFinish: () => undefined,
  survey: { done: false, onSend: async () => undefined },
};

export const LIVE_RESULT: LiveResult = { testName: 'Java Backend Developer · L2', takenOn: '16 Nov 2026', state: 'released', passed: true, percentage: 72, sections: [{ title: 'Aptitude', score: 8, maxScore: 10 }] };

// Answer 2201: the designed consent (PRC-24) and selfie (PRC-25) on /welcome, as the page builds them.
export const LIVE_CONSENT: LiveConsent = {
  candidateName: 'Arjun Nair',
  companyName: 'Kaveri Foods',
  testName: 'Java Backend Developer · L2',
  rows: [
    { what: 'Camera', how: 'Snapshots and checks that your face is in view', on: true },
    { what: 'Screen', how: 'Screenshots of your whole screen when a rule is broken', on: true },
    { what: 'Browser activity', how: 'Tab switches, leaving full screen, copy and paste, right-click, developer tools', on: true },
    { what: 'Code editor activity', how: 'Paste sizes and typing amounts in code answers', on: true },
    { what: 'Photo check', how: 'A photo at the start, to check it is still you during the test', on: true },
  ],
  retentionDays: 30,
  faceChecks: true,
  faceRequired: false,
  attestation: 'I have closed all other applications, browser windows and tabs, including messaging apps and any screen-sharing or remote-access tools',
  declined: false,
  manual: null,
  onAgree: () => undefined,
  onDecline: () => undefined,
};
export const LIVE_SELFIE: LiveSelfie = { candidateName: 'Arjun Nair', companyName: 'Kaveri Foods', camera: null, hint: 'Look at the camera and blink.', tries: 0, maxTries: 3, failed: false, blocked: false, manual: null };
