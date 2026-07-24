import Link from 'next/link';
import { Sparkles, ShieldCheck, BarChart3, Cpu } from 'lucide-react';
import { Card } from '../components/ui';
import LandingHero from './LandingHero';

const PRIMARY_LINK_CLASSES = 'rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90';

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
        <Link href="/login" className={PRIMARY_LINK_CLASSES}>
          Login
        </Link>
      </header>

      <LandingHero>
        <section className="relative overflow-hidden px-6 py-20 md:px-16 md:py-28">
          <div className="relative grid items-center gap-12 md:grid-cols-2">
            <div className="flex flex-col items-start gap-6">
              <h1 className="max-w-2xl text-4xl font-bold leading-tight tracking-tight text-recruiter-text md:text-5xl">
                Automate early screens. Focus human judgment on what matters.
              </h1>
              <p className="max-w-xl text-lg text-recruiter-text-secondary">
                Prudent Hire runs AI-assisted screening, live proctoring, and structured evaluation so your team
                spends time on the candidates who matter.
              </p>
              <Link href="/login" className={PRIMARY_LINK_CLASSES}>
                Get Started
              </Link>
            </div>
            <div className="relative hidden justify-self-center md:block">
              <div aria-hidden="true" className="pointer-events-none absolute -right-6 -top-6">
                <div className="h-24 w-24 rotate-45 rounded-2xl bg-primary/10" />
                <div className="ml-20 mt-4 h-16 w-16 rotate-45 rounded-xl bg-primary/20" />
              </div>
              <img
                src="/hero-portrait.png"
                alt="Prudent Hire helps recruiters focus on candidates who matter"
                className="relative h-auto w-full max-w-sm object-contain"
              />
            </div>
          </div>
        </section>
      </LandingHero>

      <section className="px-6 py-16 md:px-16">
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

      <section className="border-t border-recruiter-border px-6 py-16 md:px-16">
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
