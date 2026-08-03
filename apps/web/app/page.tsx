import Link from 'next/link';
import { Sparkles, ShieldCheck, BarChart3, Cpu } from 'lucide-react';
import { Card } from '../components/ui';
import LandingHero from './LandingHero';

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

const CAPABILITIES = [
  {
    icon: Sparkles,
    kicker: 'QUESTIONS. Generated.',
    title: 'AI-generated questions',
    body: 'AI drafts exam questions from a topic and difficulty level, reviewed before publishing.',
  },
  {
    icon: ShieldCheck,
    kicker: 'INTEGRITY. Verified.',
    title: 'Live proctoring & integrity',
    body: 'Webcam monitoring, tab and copy-paste detection, and AI-assessed risk narratives during every attempt.',
  },
  {
    icon: BarChart3,
    kicker: 'RESULTS. Clear.',
    title: 'Structured reports & dashboards',
    body: 'Pass/fail breakdowns, topic performance, and trend charts for every exam.',
  },
  {
    icon: Cpu,
    kicker: 'AI. Your choice.',
    title: 'Flexible AI providers',
    body: 'Use Anthropic, Azure OpenAI, or any OpenAI-compatible endpoint -- configurable per organization.',
  },
];

const STEPS = [
  {
    number: '1',
    title: 'Create an exam',
    body: 'Build sections and questions, or let AI draft them for you.',
  },
  {
    number: '2',
    title: 'Invite candidates',
    body: 'Send secure links; candidates take the exam with live proctoring.',
  },
  {
    number: '3',
    title: 'Review AI-assisted results',
    body: 'Get scored reports, integrity flags, and evaluation summaries instantly.',
  },
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
          <Link href="/login" className={PRIMARY_LINK_CLASSES}>
            Get Started
          </Link>
        </div>
      </header>

      <LandingHero>
        <section className="relative overflow-hidden px-6 py-20 md:px-16 md:py-28">
          <div className="relative grid items-center gap-12 md:grid-cols-2">
            <div className="flex w-fit flex-col items-start gap-5 md:justify-self-end">
              <h1 className="max-w-md text-4xl font-bold leading-tight tracking-tight text-recruiter-text md:text-5xl">
                Hiring exams that run themselves — and prove their results.
              </h1>
              <p className="max-w-sm text-base text-recruiter-text-secondary md:text-lg">
                AI-drafted questions, sandboxed code execution in 8 languages, live webcam proctoring, and
                SSO-ready org accounts -- built to replace a folder of shared docs and a Zoom call, not imitate one.
              </p>
              <div className="flex gap-3">
                <Link href="/login" className={PRIMARY_LINK_CLASSES}>
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

      <section id="features" className="px-6 py-16 md:px-16">
        <div className="grid gap-6 md:grid-cols-2">
          {CAPABILITIES.map(({ icon: Icon, kicker, title, body }) => (
            <Card key={title} className="flex flex-col gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-primary text-primary">
                <Icon size={20} aria-hidden="true" />
              </span>
              <h2 className="text-lg font-semibold text-recruiter-text">{title}</h2>
              <p className="text-sm font-medium text-primary">{kicker}</p>
              <p className="text-sm text-recruiter-text-secondary">{body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="border-t border-recruiter-border px-6 py-16 md:px-16">
        <div className="grid gap-8 md:grid-cols-3">
          {STEPS.map(({ number, title, body }) => (
            <div key={title} className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-primary">{number}</span>
              <h3 className="text-lg font-semibold text-recruiter-text">{title}</h3>
              <p className="text-sm text-recruiter-text-secondary">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="flex items-center justify-center gap-2 border-t border-recruiter-border px-6 py-8 text-sm text-recruiter-text-secondary md:px-16">
        <img src="/logo.png" alt="Prudent Hire" className="h-6 w-6 object-contain" />
        <span>&copy; {new Date().getFullYear()} Prudent Hire</span>
      </footer>
    </main>
  );
}
