import Link from 'next/link';
import { Sparkles, ShieldCheck, BarChart3, Cpu, Code2, Users, Building2, Lock, FileCheck2, MonitorX, KeyRound } from 'lucide-react';
import { Card } from '../components/ui';
import LandingHero from './LandingHero';
import { Reveal } from './Reveal';

const PRIMARY_LINK_CLASSES = 'rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90';
const OUTLINE_LINK_CLASSES =
  'rounded-md border border-recruiter-border px-4 py-2 text-sm font-medium text-recruiter-text hover:bg-recruiter-bg-subtle';

const NAV_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#security', label: 'Security' },
];

const TRUST_ITEMS = ['SAML SSO', 'GDPR data controls', '8 sandboxed languages'];

const PROOF_STATS = [
  { value: '8', label: 'sandboxed code languages' },
  { value: '3', label: 'consoles — candidate, recruiter, org admin' },
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
    kicker: 'QUESTIONS. Generated.',
    title: 'AI Drafts The Questions, You Keep The Final Say',
    body: 'Give it a topic and a difficulty level and it drafts MCQ or code questions in seconds -- nothing publishes without a human reviewing it first.',
  },
  {
    icon: ShieldCheck,
    kicker: 'INTEGRITY. Verified.',
    title: 'A Real Proctoring Stack, Not A Single Webcam Check',
    body: 'On-device face detection catches no-face and multiple-faces violations, screen share is required for the whole session, tab-switching and copy-paste are logged, and AI reads periodic screenshots for remote-access tools running in the background. A lockdown browser mode is available for exams that need it.',
  },
  {
    icon: Code2,
    kicker: 'CODE. Executed.',
    title: 'Code Questions That Actually Run',
    body: 'Candidates write and execute real code against a sandbox supporting 8 languages, with a limited number of runs so testing code output never becomes a crutch.',
  },
  {
    icon: BarChart3,
    kicker: 'RESULTS. Clear.',
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

export default function Home() {
  return (
    <main>
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-recruiter-border bg-white px-6 py-4 md:px-16">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Prudent Hire" className="h-9 w-9 object-contain" />
          <span className="text-lg font-bold tracking-tight text-recruiter-text">Prudent Hire</span>
        </div>
        <nav className="hidden items-center gap-7 text-sm font-medium text-recruiter-text-secondary md:flex">
          {NAV_LINKS.map(({ href, label }) => (
            <a key={href} href={href} className="hover:text-recruiter-text">
              {label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm font-medium text-recruiter-text hover:text-primary">
            Login
          </Link>
          <Link href="/get-started" className={PRIMARY_LINK_CLASSES}>
            Get Started
          </Link>
        </div>
      </header>

      <LandingHero>
        <section className="relative overflow-hidden px-6 py-20 md:px-16 md:py-28">
          <div className="relative grid items-center gap-12 md:grid-cols-2">
            <div className="flex w-fit flex-col items-start gap-5 md:justify-self-end">
              <h1 className="max-w-md text-4xl font-bold leading-tight tracking-tight text-recruiter-text md:text-5xl">
                Hiring Exams That Run Themselves — And Prove Their Results.
              </h1>
              <p className="max-w-sm text-base text-recruiter-text-secondary md:text-lg">
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
              <div className="flex flex-wrap gap-4 text-xs text-recruiter-text-secondary">
                {TRUST_ITEMS.map((item) => (
                  <span key={item} className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-status-success" aria-hidden="true" />
                    {item}
                  </span>
                ))}
              </div>
            </div>

            {/* A stylized mock of the real exam UI (same dark IDE chrome as the candidate code
                editor) -- stands in for a generic stock photo with something that actually
                shows what the product does. */}
            <div className="relative hidden justify-self-center md:block">
              <div aria-hidden="true" className="pointer-events-none absolute -right-6 -top-6">
                <div className="h-24 w-24 rotate-45 rounded-2xl bg-primary/10" />
                <div className="ml-20 mt-4 h-16 w-16 rotate-45 rounded-xl bg-primary/20" />
              </div>
              <div className="relative w-full max-w-sm overflow-hidden rounded-xl border border-[#2D2D2D] shadow-xl">
                <div className="flex items-center gap-1.5 bg-[#1E1E1E] px-3 py-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F56]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#27C93F]" />
                </div>
                <div className="bg-white p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-recruiter-text">
                      <span className="h-4 w-4 rounded bg-primary" aria-hidden="true" />
                      Acme Corp — Backend Round
                    </span>
                    <span className="rounded bg-recruiter-bg-subtle px-2 py-0.5 text-[11px] font-semibold text-recruiter-text-secondary">
                      18:42 left
                    </span>
                  </div>
                  <div className="mb-2.5 rounded-lg border border-recruiter-border p-3">
                    <p className="mb-2 text-xs font-semibold text-recruiter-text">
                      Q3. Which HTTP status best fits a successful async job enqueue?
                    </p>
                    <div className="flex gap-1.5 text-[11px]">
                      <span className="flex-1 rounded border-[1.5px] border-primary bg-primary/10 px-2 py-1 text-center font-semibold text-primary">
                        202 Accepted
                      </span>
                      <span className="flex-1 rounded border border-recruiter-border px-2 py-1 text-center text-recruiter-text-secondary">
                        200 OK
                      </span>
                      <span className="flex-1 rounded border border-recruiter-border px-2 py-1 text-center text-recruiter-text-secondary">
                        201 Created
                      </span>
                    </div>
                  </div>
                  <div className="rounded-lg border border-recruiter-border p-3">
                    <p className="mb-2 text-xs font-semibold text-recruiter-text">Q4. Fix the off-by-one in this loop</p>
                    <pre className="overflow-x-auto rounded bg-[#1E1E1E] px-2.5 py-2 font-mono text-[10.5px] leading-relaxed text-[#9cdcfe]">
                      {'for (let i = 0; i <= arr.length; i++) {\n  sum += arr[i];\n}'}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </LandingHero>

      <section id="security" className="grid grid-cols-2 divide-x divide-recruiter-border border-y border-recruiter-border md:grid-cols-4">
        {PROOF_STATS.map(({ value, label }) => (
          <div key={label} className="px-4 py-6 text-center">
            <p className="text-xl font-extrabold text-primary">{value}</p>
            <p className="mt-1 text-[11.5px] text-recruiter-text-secondary">{label}</p>
          </div>
        ))}
      </section>

      {/* The problem this product exists to solve -- names the pain before the pitch, so the
          feature list that follows reads as an answer instead of a spec sheet. */}
      <section className="px-6 py-16 md:px-16">
        <Reveal>
          <h2 className="mb-8 max-w-xl text-2xl font-bold tracking-tight text-recruiter-text md:text-3xl">
            Screening Still Looks Like It Did Ten Years Ago.
          </h2>
        </Reveal>
        <div className="grid gap-6 md:grid-cols-3">
          {PROBLEM_POINTS.map(({ title, body }, i) => (
            <Reveal key={title} delay={i * 0.08}>
              <div className="h-full rounded-lg border border-recruiter-border bg-recruiter-bg-subtle p-5">
                <h3 className="mb-2 text-base font-semibold text-recruiter-text">{title}</h3>
                <p className="text-sm text-recruiter-text-secondary">{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="border-t border-recruiter-border px-6 py-16 md:px-16">
        <Reveal>
          <h2 className="mb-2 text-2xl font-bold tracking-tight text-recruiter-text md:text-3xl">From Blank Exam To Hiring Decision</h2>
          <p className="mb-10 max-w-xl text-sm text-recruiter-text-secondary">Five steps, most of which run themselves.</p>
        </Reveal>
        <div className="grid gap-8 md:grid-cols-5">
          {WALKTHROUGH_STEPS.map(({ number, title, body }, i) => (
            <Reveal key={title} delay={i * 0.08}>
              <div className="flex flex-col gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                  {number}
                </span>
                <h3 className="text-base font-semibold text-recruiter-text">{title}</h3>
                <p className="text-sm text-recruiter-text-secondary">{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="features" className="border-t border-recruiter-border px-6 py-16 md:px-16">
        <Reveal>
          <h2 className="mb-10 text-2xl font-bold tracking-tight text-recruiter-text md:text-3xl">What's Actually Under The Hood</h2>
        </Reveal>
        <div className="flex flex-col gap-14">
          {FEATURE_DEEP_DIVES.map(({ icon: Icon, kicker, title, body }, i) => (
            <Reveal key={title}>
              <div className={`grid items-center gap-8 md:grid-cols-2 ${i % 2 === 1 ? 'md:[&>*:first-child]:order-2' : ''}`}>
                <div>
                  <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-primary text-primary">
                    <Icon size={22} aria-hidden="true" />
                  </span>
                  <p className="mb-1.5 text-sm font-semibold text-primary">{kicker}</p>
                  <h3 className="mb-2 text-xl font-bold text-recruiter-text">{title}</h3>
                  <p className="text-sm text-recruiter-text-secondary">{body}</p>
                </div>
                <div className="flex h-40 items-center justify-center rounded-xl border border-recruiter-border bg-recruiter-bg-subtle">
                  <Icon size={56} strokeWidth={1.25} aria-hidden="true" className="text-primary/30" />
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="border-t border-recruiter-border px-6 py-16 md:px-16">
        <Reveal>
          <h2 className="mb-2 text-2xl font-bold tracking-tight text-recruiter-text md:text-3xl">Built For The Whole Hiring Team</h2>
          <p className="mb-10 max-w-xl text-sm text-recruiter-text-secondary">
            Three separate consoles, each scoped to what that person actually needs to do.
          </p>
        </Reveal>
        <div className="grid gap-6 md:grid-cols-3">
          {CONSOLES.map(({ icon: Icon, title, body }, i) => (
            <Reveal key={title} delay={i * 0.08}>
              <Card className="flex h-full flex-col gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-primary text-primary">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <h3 className="text-lg font-semibold text-recruiter-text">{title}</h3>
                <p className="text-sm text-recruiter-text-secondary">{body}</p>
              </Card>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="border-t border-recruiter-border px-6 py-16 md:px-16">
        <Reveal>
          <h2 className="mb-10 text-2xl font-bold tracking-tight text-recruiter-text md:text-3xl">Enterprise-Ready From Day One</h2>
        </Reveal>
        <div className="grid gap-6 md:grid-cols-2">
          {ENTERPRISE_ITEMS.map(({ icon: Icon, title, body }, i) => (
            <Reveal key={title} delay={i * 0.06}>
              <div className="flex items-start gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <div>
                  <h3 className="mb-1 text-base font-semibold text-recruiter-text">{title}</h3>
                  <p className="text-sm text-recruiter-text-secondary">{body}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <Reveal>
        <section className="border-t border-recruiter-border bg-recruiter-bg-subtle px-6 py-16 text-center md:px-16">
          <h2 className="mb-3 text-2xl font-bold tracking-tight text-recruiter-text md:text-3xl">
            Ready To Run An Exam Instead Of Another Call?
          </h2>
          <p className="mx-auto mb-6 max-w-md text-sm text-recruiter-text-secondary">
            Create an organization and build your first exam in a few minutes.
          </p>
          <Link href="/get-started" className={PRIMARY_LINK_CLASSES}>
            Get Started
          </Link>
        </section>
      </Reveal>

      <footer className="flex items-center justify-center gap-2 border-t border-recruiter-border px-6 py-8 text-sm text-recruiter-text-secondary md:px-16">
        <img src="/logo.png" alt="Prudent Hire" className="h-6 w-6 object-contain" />
        <span>&copy; {new Date().getFullYear()} Prudent Hire</span>
      </footer>
    </main>
  );
}
