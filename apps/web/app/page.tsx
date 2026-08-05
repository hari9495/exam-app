import Link from 'next/link';
import { Sparkles, ShieldCheck, BarChart3, Cpu, Code2, Users, Building2, Lock, FileCheck2, MonitorX, KeyRound } from 'lucide-react';
import { PrudentMark } from '../components/PrudentMark';
import LandingHero from './LandingHero';
import { Reveal } from './Reveal';

const PRIMARY_LINK_CLASSES =
  'rounded-lg bg-white px-6 py-3 text-sm font-medium text-brand-navy transition hover:bg-brand-sail/40';
const OUTLINE_LINK_CLASSES =
  'rounded-lg border border-white/30 px-6 py-3 text-sm font-medium text-white/90 transition hover:border-white/60 hover:bg-white/10';
const NAV_LOGIN_CLASSES =
  'rounded-lg border border-white/30 px-5 py-2.5 text-sm font-medium text-white/90 transition hover:border-white/60 hover:bg-white/10';
const NAV_CTA_CLASSES = 'rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-brand-navy transition hover:bg-brand-sail/40';

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
    title: "Resumes don't test anything",
    body: "A polished resume says nothing about whether someone can write the code or reason through the problem you'll actually hand them on day one.",
  },
  {
    title: "Early-round calls don't scale",
    body: "Every phone screen burns thirty minutes of a recruiter's time asking the same questions, before you even know if the candidate can do the job.",
  },
  {
    title: 'Remote rounds are easy to game',
    body: "An unmonitored video call can't tell you whether the person answering is the person who applied, or whether they're reading off a second screen.",
  },
];

const WALKTHROUGH_STEPS = [
  {
    number: '1',
    title: 'Build the exam',
    body: 'Write sections and questions yourself, or describe a topic and difficulty and let AI draft them -- you review and publish.',
  },
  {
    number: '2',
    title: 'Invite candidates',
    body: 'Send a secure, single-use link. No account signup required on the candidate side.',
  },
  {
    number: '3',
    title: 'Candidate takes a proctored exam',
    body: 'Webcam monitoring, required screen share, tab and copy-paste detection, and an optional lockdown browser -- with a live leaderboard if you want candidates to see how they stack up in real time.',
  },
  {
    number: '4',
    title: 'AI-assisted scoring',
    body: 'Code runs in a real sandbox across 8 languages; written answers get an AI-drafted evaluation with a risk narrative attached to anything that looked off.',
  },
  {
    number: '5',
    title: 'Review structured results',
    body: 'Pass/fail breakdowns, topic-level performance, and trend charts -- so the decision is a five-minute review, not a fresh read of a resume.',
  },
];

const FEATURE_DEEP_DIVES = [
  {
    icon: Sparkles,
    kicker: 'Questions. Generated.',
    title: 'AI drafts the questions, you keep the final say',
    body: 'Give it a topic and a difficulty level and it drafts MCQ or code questions in seconds -- nothing publishes without a human reviewing it first.',
  },
  {
    icon: ShieldCheck,
    kicker: 'Integrity. Verified.',
    title: 'A real proctoring stack, not a single webcam check',
    body: 'On-device face detection catches no-face and multiple-faces violations, screen share is required for the whole session, tab-switching and copy-paste are logged, and AI reads periodic screenshots for remote-access tools running in the background. A lockdown browser mode is available for exams that need it.',
  },
  {
    icon: Code2,
    kicker: 'Code. Executed.',
    title: 'Code questions that actually run',
    body: 'Candidates write and execute real code against a sandbox supporting 8 languages, with a limited number of runs so testing code output never becomes a crutch.',
  },
  {
    icon: BarChart3,
    kicker: 'Results. Clear.',
    title: 'Reports built for a hiring decision, not a data dump',
    body: 'Pass/fail breakdowns, per-topic performance, and trend charts for every exam, plus a side-by-side candidate comparison once you are down to a shortlist.',
  },
];

const CONSOLES = [
  { icon: Users, title: 'Candidate', body: 'A focused, distraction-free exam flow with a practice run before the clock starts.' },
  { icon: Building2, title: 'Recruiter', body: 'Build exams, invite candidates, watch live sessions, and review results.' },
  { icon: Lock, title: 'Org admin', body: 'Manage users and roles, branding, SSO, and integrations for the whole organization.' },
];

const ENTERPRISE_ITEMS = [
  { icon: KeyRound, title: 'SAML SSO', body: 'Org-scoped single sign-on, tested against real identity providers.' },
  { icon: FileCheck2, title: 'GDPR data controls', body: 'Candidates and staff can export or erase their data on request.' },
  { icon: MonitorX, title: 'Audit log', body: 'Every sensitive action is recorded, per organization.' },
  { icon: Cpu, title: 'Bring your own AI provider', body: 'Anthropic, Azure OpenAI, or any OpenAI-compatible endpoint -- configurable per organization.' },
];

export default function Home() {
  return (
    <main>
      <header className="sticky top-0 z-20 flex items-center justify-between bg-brand-navy px-6 py-4 md:px-16">
        <div className="flex items-center gap-3">
          <PrudentMark className="h-8 w-[5.5rem] text-white" />
          <span className="text-lg font-medium tracking-tight text-white">Prudent Hire</span>
        </div>
        <nav className="hidden items-center gap-7 text-sm font-medium text-white/70 md:flex">
          {NAV_LINKS.map(({ href, label }) => (
            <a key={href} href={href} className="hover:text-white">
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
        <div className="relative flex min-h-[560px] items-stretch overflow-hidden md:min-h-[640px]">
          <div
            className="absolute inset-0 bg-brand-navy"
            style={{ clipPath: 'polygon(0 0, 62% 0, 50% 100%, 0 100%)' }}
          />
          <div
            className="absolute inset-0 hidden bg-white md:block"
            style={{ clipPath: 'polygon(62% 0, 100% 0, 100% 100%, 50% 100%)' }}
          />
          <div className="relative z-10 grid w-full grid-cols-1 items-center gap-12 px-6 py-16 md:grid-cols-2 md:px-16 md:py-24">
            <div className="flex w-fit flex-col items-start gap-5">
              <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-brand-picton">
                <span className="h-0.5 w-5 bg-brand-picton" aria-hidden="true" />
                Hiring intelligence platform
              </p>
              <h1 className="max-w-md text-4xl font-medium leading-tight tracking-tight text-white md:text-5xl">
                Hiring exams that run themselves, and{' '}
                <span className="text-brand-picton">prove their results.</span>
              </h1>
              <p className="max-w-sm text-base text-white/70 md:text-lg">
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
                    className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/60"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>

            {/* A stylized mock of the real exam UI, standing in for a generic stock photo
                with something that actually shows what the product does. */}
            <div className="hidden justify-self-center md:block">
              <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-[#CDD8F0] bg-white shadow-[0_24px_72px_rgba(0,30,96,0.22)]">
                <div className="flex items-center gap-1.5 border-b border-[#CDD8F0] bg-[#F2F6FF] px-4 py-2.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F56]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#27C93F]" />
                </div>
                <div className="p-4">
                  <div className="mb-3.5 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-brand-navy">
                      <span className="h-3.5 w-3.5 rounded-sm bg-primary" aria-hidden="true" />
                      Acme Corp: Backend Round
                    </span>
                    <span className="rounded-md border border-primary/25 bg-primary/8 px-2 py-0.5 text-[11px] font-semibold text-primary">
                      18:42 left
                    </span>
                  </div>
                  <div className="mb-2.5 rounded-lg border border-[#CDD8F0] bg-[#F7FAFF] p-3">
                    <p className="mb-2 text-xs font-semibold text-brand-navy">
                      Q3. Which HTTP status best fits a successful async job enqueue?
                    </p>
                    <div className="flex gap-1.5 text-[11px]">
                      <span className="flex-1 rounded border-[1.5px] border-primary bg-primary/8 px-2 py-1 text-center font-semibold text-primary">
                        202 Accepted
                      </span>
                      <span className="flex-1 rounded border border-[#CDD8F0] px-2 py-1 text-center text-[#586590]">
                        200 OK
                      </span>
                      <span className="flex-1 rounded border border-[#CDD8F0] px-2 py-1 text-center text-[#586590]">
                        201 Created
                      </span>
                    </div>
                  </div>
                  <div className="overflow-hidden rounded-lg border border-[#CDD8F0]">
                    <div className="bg-[#1E1E30] px-3 py-2">
                      <p className="mb-0 text-xs font-semibold text-white/85">Q4. Fix the off-by-one in this loop</p>
                    </div>
                    <pre className="overflow-x-auto bg-[#1E1E30] px-2.5 py-2 font-mono text-[10.5px] leading-relaxed text-[#9cdcfe]">
                      {'for (let i = 0; i <= arr.length; i++) {\n  sum += arr[i];\n}'}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </LandingHero>

      <section id="security" className="grid grid-cols-2 divide-x divide-recruiter-border border-y border-recruiter-border md:grid-cols-4">
        {PROOF_STATS.map(({ value, label }) => (
          <div key={label} className="px-4 py-8 text-center">
            <p className="text-3xl font-bold tabular-nums tracking-tight text-brand-navy md:text-4xl">{value}</p>
            <p className="mt-1.5 text-[11.5px] text-recruiter-text-secondary">{label}</p>
          </div>
        ))}
      </section>

      {/* The problem this product exists to solve -- names the pain before the pitch, so the
          feature list that follows reads as an answer instead of a spec sheet. */}
      <section className="px-6 py-16 md:px-16">
        <Reveal>
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-primary">The problem</p>
          <h2 className="mb-10 max-w-xl text-2xl font-medium tracking-tight text-recruiter-text md:text-3xl">
            Screening still looks like it did ten years ago.
          </h2>
        </Reveal>
        <div>
          {PROBLEM_POINTS.map(({ title, body }, i) => (
            <Reveal key={title} delay={i * 0.08}>
              <div className={`grid gap-4 py-6 md:grid-cols-[100px_1fr] md:items-start ${i === 0 ? '' : 'border-t border-recruiter-border'}`}>
                <span className="text-5xl font-bold tabular-nums text-recruiter-border">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3 className="mb-2 text-base font-semibold text-recruiter-text">{title}</h3>
                  <p className="text-sm text-recruiter-text-secondary">{body}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="border-t border-recruiter-border px-6 py-16 md:px-16">
        <Reveal>
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-primary">The process</p>
          <h2 className="mb-2 text-2xl font-medium tracking-tight text-recruiter-text md:text-3xl">From blank exam to hiring decision</h2>
          <p className="mb-10 max-w-xl text-sm text-recruiter-text-secondary">Five steps, most of which run themselves.</p>
        </Reveal>
        <div className="relative grid gap-8 md:grid-cols-5">
          <div className="absolute left-[10%] right-[10%] top-[18px] hidden h-px bg-recruiter-border md:block" aria-hidden="true" />
          {WALKTHROUGH_STEPS.map(({ number, title, body }, i) => (
            <Reveal key={title} delay={i * 0.08}>
              <div className="relative flex flex-col gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-primary bg-white text-sm font-bold text-primary">
                  {number}
                </span>
                <h3 className="text-base font-semibold text-recruiter-text">{title}</h3>
                <p className="text-sm text-recruiter-text-secondary">{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="features" className="bg-brand-navy px-6 py-16 md:px-16">
        <Reveal>
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-white/35">What's under the hood</p>
          <h2 className="mb-10 text-2xl font-medium tracking-tight text-white md:text-3xl">What's actually under the hood</h2>
        </Reveal>
        <div className="grid gap-4 md:grid-cols-2">
          {FEATURE_DEEP_DIVES.map(({ icon: Icon, kicker, title, body }, i) => (
            <Reveal key={title} delay={i * 0.06}>
              <div className="h-full rounded-xl border border-white/10 bg-white/[0.04] p-7 transition hover:bg-white/[0.07] hover:border-white/15">
                <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white">
                  <Icon size={22} aria-hidden="true" />
                </span>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-brand-picton">{kicker}</p>
                <h3 className="mb-2 text-xl font-medium text-white">{title}</h3>
                <p className="text-sm text-white/50">{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="border-t border-recruiter-border px-6 py-16 md:px-16">
        <Reveal>
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-primary">Three consoles</p>
          <h2 className="mb-2 text-2xl font-medium tracking-tight text-recruiter-text md:text-3xl">Built for the whole hiring team</h2>
          <p className="mb-10 max-w-xl text-sm text-recruiter-text-secondary">
            Three separate consoles, each scoped to what that person actually needs to do.
          </p>
        </Reveal>
        <div className="grid gap-5 md:grid-cols-3">
          {CONSOLES.map(({ icon: Icon, title, body }, i) => (
            <Reveal key={title} delay={i * 0.08}>
              <div className="relative flex h-full flex-col gap-3 overflow-hidden rounded-xl border border-recruiter-border p-7">
                <span className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-primary to-brand-picton" aria-hidden="true" />
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <h3 className="text-lg font-medium text-recruiter-text">{title}</h3>
                <p className="text-sm text-recruiter-text-secondary">{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="border-t border-recruiter-border px-6 py-16 md:px-16">
        <Reveal>
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-primary">Enterprise-ready</p>
          <h2 className="mb-10 text-2xl font-medium tracking-tight text-recruiter-text md:text-3xl">Enterprise-ready from day one</h2>
        </Reveal>
        <div className="grid gap-6 md:grid-cols-2">
          {ENTERPRISE_ITEMS.map(({ icon: Icon, title, body }, i) => (
            <Reveal key={title} delay={i * 0.06}>
              <div className="flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
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
        <section className="relative overflow-hidden bg-brand-navy px-6 py-20 text-center md:px-16">
          <div
            className="pointer-events-none absolute left-1/2 top-[-80px] h-[600px] w-[600px] -translate-x-1/2 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(0,83,226,0.3) 0%, transparent 70%)' }}
            aria-hidden="true"
          />
          <p className="relative mb-4 text-xs font-medium uppercase tracking-wider text-brand-picton">Get started today</p>
          <h2 className="relative mb-3 text-2xl font-medium tracking-tight text-white md:text-3xl">
            Ready to run an exam instead of another call?
          </h2>
          <p className="relative mx-auto mb-8 max-w-md text-sm text-white/55">
            Create an organization and build your first exam in a few minutes.
          </p>
          <Link href="/get-started" className={`relative inline-block ${PRIMARY_LINK_CLASSES}`}>
            Get Started
          </Link>
        </section>
      </Reveal>

      <footer className="flex items-center justify-center gap-2 bg-[#000D28] px-6 py-8 text-sm text-white/30 md:px-16">
        <PrudentMark className="h-5 w-[3.4rem] text-white/30" />
        <span>&copy; 2026 Prudent Consulting</span>
      </footer>
    </main>
  );
}
