'use client';

// Public careers-site chat assistant (rendered only when the org opts in). Unauthenticated raw
// fetch, same idiom as the rest of the careers/apply flow. Bounded history; the API is grounded on
// the org's listed roles, rate-limited, quota-capped, and fail-soft (a null answer shows a fallback).
import { useRef, useState } from 'react';
import { API_BASE } from '../../../lib/api-client';

interface Turn { role: 'user' | 'assistant'; content: string }
const UNAVAILABLE = "Sorry — I can't answer that right now. Browse the open roles above, or apply and a recruiter will follow up.";

export function CareersAssistant({ orgSlug, orgName }: { orgSlug: string; orgName: string }) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || busy) return;
    const history = turns.slice(-8);
    setTurns((t) => [...t, { role: 'user', content: question }]);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/public/careers/${orgSlug}/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history }),
      });
      const data = res.ok ? ((await res.json()) as { answer: string | null }) : { answer: null };
      setTurns((t) => [...t, { role: 'assistant', content: data.answer?.trim() || UNAVAILABLE }]);
    } catch {
      setTurns((t) => [...t, { role: 'assistant', content: UNAVAILABLE }]);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }));
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ask about these roles"
        className="fixed bottom-5 right-5 z-40 rounded-full px-5 py-3 text-sm font-semibold text-white shadow-lg"
        style={{ backgroundColor: 'var(--careers-primary, #0053e2)' }}
      >
        Ask about these roles
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 flex h-[28rem] w-[min(22rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl">
      <div className="flex items-center justify-between px-4 py-3 text-white" style={{ backgroundColor: 'var(--careers-primary, #0053e2)' }}>
        <span className="text-sm font-semibold">Ask about roles at {orgName}</span>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-white/90 hover:text-white">✕</button>
      </div>
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {turns.length === 0 && (
          <p className="text-sm text-gray-500">Ask me about the open roles, what a job involves, or how to apply. I only know what&apos;s posted here.</p>
        )}
        {turns.map((t, i) => (
          <div key={i} className={t.role === 'user' ? 'text-right' : 'text-left'}>
            <span
              className="inline-block max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm"
              style={t.role === 'user' ? { backgroundColor: 'var(--careers-primary, #0053e2)', color: '#fff' } : { backgroundColor: '#f1f5f9', color: '#0f172a' }}
            >
              {t.content}
            </span>
          </div>
        ))}
        {busy && <p className="text-sm text-gray-400">Thinking…</p>}
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-black/10 p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={500}
          placeholder="Ask a question…"
          aria-label="Ask a question"
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-400"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: 'var(--careers-primary, #0053e2)' }}
        >
          Send
        </button>
      </form>
    </div>
  );
}
