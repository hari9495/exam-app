import Link from 'next/link';
import { Sparkles, ShieldCheck, BarChart3, Cpu, Code2, Users, Building2, Lock, FileCheck2, MonitorX, KeyRound } from 'lucide-react';
import { PrudentMark } from '../components/PrudentMark';
import LandingHero from './LandingHero';
import { Reveal } from './Reveal';

// The one place chroma is spent on the navy surfaces: a light "paper" button for the primary
// action (primary blue on navy is too low-contrast), and quiet rule outlines for everything else.
const PRIMARY_LINK_CLASSES =
  'rounded-lg bg-[#f4f7fb] px-6 py-3 font-body text-sm font-semibold text-[#001E60] transition hover:opacity-90';
const OUTLINE_LINK_CLASSES =
  'rounded-lg border border-white/25 px-6 py-3 font-body text-sm font-medium text-[#dbe3f0] transition hover:border-white/50 hover:bg-white/5';
const NAV_LOGIN_CLASSES =
  'rounded-lg border border-white/25 px-5 py-2.5 font-body text-sm font-medium text-[#dbe3f0] transition hover:border-white/50 hover:bg-white/5';
const NAV_CTA_CLASSES =
  'rounded-lg bg-[#f4f7fb] px-5 py-2.5 font-body text-sm font-semibold text-[#001E60] transition hover:opacity-90';

const NAV_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#security', label: 'Security' },
];

const TRUST_ITEMS = ['SAML SSO', 'GDPR data controls', '8 sandboxed languages'];

const PROOF_STATS = [
  { value: '8', label: 'sandboxed code languages' },
  { value: '3', label: 'consoles: candidate, recruiter, org admin' },
  { value: 'SSO', label: 'SAML 2.0, org-scoped' },
  { value: 'GDPR', label: 'export & erase, built in' },
];

const PROBLEM_POINTS = [
  {
    title: "Resumes Don't Test Anything",
    body: "A polished resume says nothing about whether someone can write the code or reason through the problem you'll actually hand them on day one.",
  },
  {
    title: "Early-Round Calls Don't Scale",
    body: "Every phone screen burns thirty minutes of a recruiter's time asking the same questions, before you even know if the candidate can do the job.",
  },
  {
    title: 'Remote Rounds Are Easy To Game',
    body: "An unmonitored video call can't tell you whether the person answering is the person who applied, or whether they're reading off a second screen.",
  },
];

const WALKTHROUGH_STEPS = [
  {
    number: '1',
    title: 'Build The Exam',
    body: 'Write sections and questions yourself, or describe a topic and difficulty and let AI draft them -- you review and publish.',
  },
  {
    number: '2',
    title: 'Invite Candidates',
    body: 'Send a secure, single-use link. No account signup required on the candidate side.',
  },
  {
    number: '3',
    title: 'Candidate Takes A Proctored Exam',
    body: 'Webcam monitoring, required screen share, tab and copy-paste detection, and an optional lockdown browser -- with a live leaderboard if you want candidates to see how they stack up in real time.',
  },
  {
    number: '4',
    title: 'AI-Assisted Scoring',
    body: 'Code runs in a real sandbox across 8 languages; written answers get an AI-drafted evaluation with a risk narrative attached to anything that looked off.',
  },
  {
    number: '5',
    title: 'Review Structured Results',
    body: 'Pass/fail breakdowns, topic-level performance, and trend charts -- so the decision is a five-minute review, not a fresh read of a resume.',
  },
];

const FEATURE_DEEP_DIVES = [
  {
    icon: Sparkles,
    kicker: 'Questions. Generated.',
    title: 'AI Drafts The Questions, You Keep The Final Say',
    body: 'Give it a topic and a difficulty level and it drafts MCQ or code questions in seconds -- nothing publishes without a human reviewing it first.',
  },
  {
    icon: ShieldCheck,
    kicker: 'Integrity. Verified.',
    title: 'A Real Proctoring Stack, Not A Single Webcam Check',
    body: 'On-device face detection catches no-face and multiple-faces violations, screen share is required for the whole session, tab-switching and copy-paste are logged, and AI reads periodic screenshots for remote-access tools running in the background. A lockdown browser mode is available for exams that need it.',
  },
  {
    icon: Code2,
    kicker: 'Code. Executed.',
    title: 'Code Questions That Actually Run',
    body: 'Candidates write and execute real code against a sandbox supporting 8 languages, with a limited number of runs so testing code output never becomes a crutch.',
  },
  {
    icon: BarChart3,
    kicker: 'Results. Clear.',
    title: 'Reports Built For A Hiring Decision, Not A Data Dump',
    body: 'Pass/fail breakdowns, per-topic performance, and trend charts for every exam, plus a side-by-side candidate comparison once you are down to a shortlist.',
  },
];

const CONSOLES = [
  { icon: Users, title: 'Candidate', body: 'A focused, distraction-free exam flow with a practice run before the clock starts.' },
  { icon: Building2, title: 'Recruiter', body: 'Build exams, invite candidates, watch live sessions, and review results.' },
  { icon: Lock, title: 'Org Admin', body: 'Manage users and roles, branding, SSO, and integrations for the whole organization.' },
];

const ENTERPRISE_ITEMS = [
  { icon: KeyRound, title: 'SAML SSO', body: 'Org-scoped single sign-on, tested against real identity providers.' },
  { icon: FileCheck2, title: 'GDPR Data Controls', body: 'Candidates and staff can export or erase their data on request.' },
  { icon: MonitorX, title: 'Audit Log', body: 'Every sensitive action is recorded, per organization.' },
  { icon: Cpu, title: 'Bring Your Own AI Provider', body: 'Anthropic, Azure OpenAI, or any OpenAI-compatible endpoint -- configurable per organization.' },
];

// Eyebrow kicker on the light (slate) sections -- primary is the single rationed accent.
function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 font-body text-[11px] font-semibold uppercase tracking-[0.11em] text-primary">{children}</p>;
}

export default function Home() {
  return (
    <main className="bg-ground">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/10 bg-[#001E60] px-6 py-4 md:px-16">
        <div className="flex items-center gap-2.5">
          <PrudentMark className="h-7 aspect-[100/148] text-white" />
          <span className="font-display text-lg font-bold tracking-tight text-white">Prudent Hire</span>
        </div>
        <nav className="hidden items-center gap-7 font-body text-sm font-medium text-[#a7b3c8] md:flex">
          {NAV_LINKS.map(({ href, label }) => (
            <a key={href} href={href} className="transition-colors hover:text-white">
              {label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/login" className={NAV_LOGIN_CLASSES}>
            Login
          </Link>
          <Link href="/get-started" className={NAV_CTA_CLASSES}>
            Get Started
          </Link>
        </div>
      </header>

      <LandingHero>
        {/* A clean navy stage, no diagonal clip -- the display type carries it, the way the login
            panel does. A single lit hairline along the bottom seams it to the proof strip. */}
        <div className="relative overflow-hidden bg-[#001E60] shadow-[inset_0_-1px_0_rgba(255,255,255,0.06)]">
          <div className="relative z-10 grid w-full grid-cols-1 items-center gap-12 px-6 py-16 md:grid-cols-2 md:px-16 md:py-24">
            <div className="flex w-fit flex-col items-start gap-5">
              <p className="flex items-center gap-2 font-body text-[11px] font-semibold uppercase tracking-[0.11em] text-[#8ea0c2]">
                <span className="h-2 w-2 rounded-[2px] bg-[#5b6e9c]" aria-hidden="true" />
                Hiring intelligence platform
              </p>
              <h1 className="max-w-md font-display text-4xl font-bold leading-[1.05] tracking-[-0.03em] text-[#f4f7fb] md:text-5xl">
                Hiring Exams That Run Themselves, And{' '}
                <span className="text-[#8fb0ee]">Prove Their Results.</span>
              </h1>
              <p className="max-w-sm font-body text-base leading-relaxed text-[#a7b3c8] md:text-lg">
                AI-drafted questions, sandboxed code execution in 8 languages, live webcam proctoring, and
                SSO-ready org accounts -- built to replace a folder of shared docs and a Zoom call, not imitate one.
              </p>
              <div className="flex gap-3">
                <Link href="/get-started" className={PRIMARY_LINK_CLASSES}>
                  Get Started
                </Link>
                <a href="#how-it-works" className={OUTLINE_LINK_CLASSES}>
                  See how it works
                </a>
              </div>
              <div className="flex flex-wrap gap-2">
                {TRUST_ITEMS.map((item) => (
                  <span
                    key={item}
                    className="rounded border border-white/15 bg-white/[0.04] px-3 py-1 font-body text-xs font-medium text-[#a7b3c8]"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>

            {/* A stylized mock of the real exam UI, standing in for a generic stock photo
                with something that actually shows what the product does. A floating showpiece,
                so a considered shadow is warranted here even though on-page cards use hairlines. */}
            <div className="hidden justify-self-center md:block">
              <div className="w-full max-w-sm overflow-hidden rounded-lg border border-rule bg-paper shadow-[0_24px_72px_rgba(0,10,40,0.35)]">
                <div className="flex items-center gap-1.5 border-b border-rule bg-ground px-4 py-2.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F56]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#27C93F]" />
                </div>
                <div className="p-4">
                  <div className="mb-3.5 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 font-body text-xs font-bold text-ink">
                      <span className="h-3.5 w-3.5 rounded-sm bg-primary" aria-hidden="true" />
                      Acme Corp: Backend Round
                    </span>
                    <span className="rounded border border-primary/25 bg-primary/10 px-2 py-0.5 font-body text-[11px] font-semibold text-primary">
                      18:42 left
                    </span>
                  </div>
                  <div className="mb-2.5 rounded-lg border border-rule bg-ground p-3">
                    <p className="mb-2 font-body text-xs font-semibold text-ink">
                      Q3. Which HTTP status best fits a successful async job enqueue?
                    </p>
                    <div className="flex gap-1.5 font-body text-[11px]">
                      <span className="flex-1 rounded border-[1.5px] border-primary bg-primary/10 px-2 py-1 text-center font-semibold text-primary">
                        202 Accepted
                      </span>
                      <span className="flex-1 rounded border border-rule px-2 py-1 text-center text-muted">
                        200 OK
                      </span>
                      <span className="flex-1 rounded border border-rule px-2 py-1 text-center text-muted">
                        201 Created
                      </span>
                    </div>
                  </div>
                  <div className="overflow-hidden rounded-lg border border-[#2D2D2D]">
                    <div className="bg-[#1E1E1E] px-3 py-2">
                      <p className="mb-0 font-body text-xs font-semibold text-gray-300">Q4. Fix the off-by-one in this loop</p>
                    </div>
                    <pre className="overflow-x-auto bg-[#1E1E1E] px-2.5 py-2 font-mono text-[10.5px] leading-relaxed text-[#9cdcfe]">
                      {'for (let i = 0; i <= arr.length; i++) {\n  sum += arr[i];\n}'}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </LandingHero>

      <section id="security" className="grid grid-cols-2 divide-x divide-rule border-b border-rule bg-paper md:grid-cols-4">
        {PROOF_STATS.map(({ value, label }) => (
          <div key={label} className="px-4 py-8 text-center">
            <p className="font-display text-3xl font-bold tabular-nums tracking-tight text-ink md:text-4xl">{value}</p>
            <p className="mt-1.5 font-body text-[11.5px] text-muted">{label}</p>
          </div>
        ))}
      </section>

      {/* The problem this product exists to solve -- names the pain before the pitch, so the
          feature list that follows reads as an answer instead of a spec sheet. */}
      <section className="bg-paper px-6 py-16 md:px-16">
        <Reveal>
          <Eyebrow>The problem</Eyebrow>
          <h2 className="mb-10 max-w-xl font-display text-2xl font-bold tracking-[-0.02em] text-ink md:text-3xl">
            Screening Still Looks Like It Did Ten Years Ago.
          </h2>
        </Reveal>
        <div>
          {PROBLEM_POINTS.map(({ title, body }, i) => (
            <Reveal key={title} delay={i * 0.08}>
              <div className={`grid gap-4 py-6 md:grid-cols-[100px_1fr] md:items-start ${i === 0 ? '' : 'border-t border-rule'}`}>
                <span className="font-display text-5xl font-bold tabular-nums text-rule">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3 className="mb-2 font-display text-base font-bold text-ink">{title}</h3>
                  <p className="font-body text-sm text-muted">{body}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="border-t border-rule bg-ground px-6 py-16 md:px-16">
        <Reveal>
          <Eyebrow>The process</Eyebrow>
          <h2 className="mb-2 font-display text-2xl font-bold tracking-[-0.02em] text-ink md:text-3xl">From Blank Exam To Hiring Decision</h2>
          <p className="mb-10 max-w-xl font-body text-sm text-muted">Five steps, most of which run themselves.</p>
        </Reveal>
        <div className="relative grid gap-8 md:grid-cols-5">
          <div className="absolute left-[10%] right-[10%] top-[18px] hidden h-px bg-rule md:block" aria-hidden="true" />
          {WALKTHROUGH_STEPS.map(({ number, title, body }, i) => (
            <Reveal key={title} delay={i * 0.08}>
              <div className="relative flex flex-col gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-primary bg-paper font-display text-sm font-bold text-primary">
                  {number}
                </span>
                <h3 className="font-display text-base font-bold text-ink">{title}</h3>
                <p className="font-body text-sm text-muted">{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="features" className="bg-[#001E60] px-6 py-16 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] md:px-16">
        <Reveal>
          <p className="mb-3 font-body text-[11px] font-semibold uppercase tracking-[0.11em] text-[#8ea0c2]">What&apos;s under the hood</p>
          <h2 className="mb-10 font-display text-2xl font-bold tracking-[-0.02em] text-[#f4f7fb] md:text-3xl">What&apos;s Actually Under The Hood</h2>
        </Reveal>
        <div className="grid gap-4 md:grid-cols-2">
          {FEATURE_DEEP_DIVES.map(({ icon: Icon, kicker, title, body }, i) => (
            <Reveal key={title} delay={i * 0.06}>
              <div className="h-full rounded-lg border border-white/10 bg-white/[0.04] p-7 transition-colors hover:border-white/20">
                <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg border border-white/15 bg-white/[0.06] text-[#dbe3f0]">
                  <Icon size={22} aria-hidden="true" />
                </span>
                <p className="mb-2 font-body text-[11px] font-semibold uppercase tracking-[0.11em] text-[#8ea0c2]">{kicker}</p>
                <h3 className="mb-2 font-display text-xl font-bold text-[#f4f7fb]">{title}</h3>
                <p className="font-body text-sm leading-relaxed text-[#a7b3c8]">{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="border-t border-rule bg-paper px-6 py-16 md:px-16">
        <Reveal>
          <Eyebrow>Three consoles</Eyebrow>
          <h2 className="mb-2 font-display text-2xl font-bold tracking-[-0.02em] text-ink md:text-3xl">Built For The Whole Hiring Team</h2>
          <p className="mb-10 max-w-xl font-body text-sm text-muted">
            Three separate consoles, each scoped to what that person actually needs to do.
          </p>
        </Reveal>
        <div className="grid gap-5 md:grid-cols-3">
          {CONSOLES.map(({ icon: Icon, title, body }, i) => (
            <Reveal key={title} delay={i * 0.08}>
              <div className="relative flex h-full flex-col gap-3 overflow-hidden rounded-lg border border-rule bg-paper p-7 transition-colors hover:border-primary/30">
                <span className="absolute inset-x-0 top-0 h-[3px] bg-primary" aria-hidden="true" />
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <h3 className="font-display text-lg font-bold text-ink">{title}</h3>
                <p className="font-body text-sm text-muted">{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="border-t border-rule bg-ground px-6 py-16 md:px-16">
        <Reveal>
          <Eyebrow>Enterprise-ready</Eyebrow>
          <h2 className="mb-10 font-display text-2xl font-bold tracking-[-0.02em] text-ink md:text-3xl">Enterprise-Ready From Day One</h2>
        </Reveal>
        <div className="grid gap-6 md:grid-cols-2">
          {ENTERPRISE_ITEMS.map(({ icon: Icon, title, body }, i) => (
            <Reveal key={title} delay={i * 0.06}>
              <div className="flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <div>
                  <h3 className="mb-1 font-display text-base font-bold text-ink">{title}</h3>
                  <p className="font-body text-sm text-muted">{body}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <Reveal>
        <section className="bg-[#001E60] px-6 py-20 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] md:px-16">
          <p className="mb-4 font-body text-[11px] font-semibold uppercase tracking-[0.11em] text-[#8ea0c2]">Get started today</p>
          <h2 className="mb-3 font-display text-2xl font-bold tracking-[-0.02em] text-[#f4f7fb] md:text-3xl">
            Ready To Run An Exam Instead Of Another Call?
          </h2>
          <p className="mx-auto mb-8 max-w-md font-body text-sm text-[#a7b3c8]">
            Create an organization and build your first exam in a few minutes.
          </p>
          <Link href="/get-started" className={`inline-block ${PRIMARY_LINK_CLASSES}`}>
            Get Started
          </Link>
        </section>
      </Reveal>

      <footer className="flex items-center justify-center gap-2 bg-[#000D28] px-6 py-8 font-body text-sm text-white/35 md:px-16">
        <PrudentMark className="h-5 aspect-[100/148] text-white/35" />
        <span>&copy; 2026 Prudent Consulting</span>
      </footer>
    </main>
  );
}
