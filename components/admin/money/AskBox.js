"use client";
import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";

const SUGGESTIONS = [
  "How did we do compared with last month?",
  "What's costing us the most?",
  "Which room earns the most for its hours?",
  "Which makers should we talk to about slow items?",
];

/** A plain-English question about the month's numbers; the answer appears below. */
export default function AskBox({ ask, month }) {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState(null);
  const [error, setError] = useState(null);
  const [pending, start] = useTransition();

  const go = (question) => {
    const text = (question ?? q).trim();
    if (!text) return;
    setQ(text);
    setError(null);
    start(async () => {
      const r = await ask(text, month);
      if (r?.error) {
        setError(r.error);
        setAnswer(null);
      } else setAnswer(r?.answer || "");
    });
  };

  return (
    <div className="rounded-2xl border border-line bg-paper p-4 shadow-card">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <label className="sr-only" htmlFor="ask">Ask about the numbers</label>
        <div className="relative min-w-0 flex-1">
          <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-verde-deep" aria-hidden="true" />
          <input
            id="ask"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ask about the numbers — e.g. why was this month lower?"
            className="field pl-9"
            maxLength={500}
          />
        </div>
        <button type="submit" disabled={pending || !q.trim()} className="ui-btn ui-btn--primary inline-flex h-10 items-center justify-center rounded-xl bg-ink px-4 text-sm font-semibold text-paper disabled:opacity-50">
          {pending ? "Thinking…" : "Ask"}
        </button>
      </form>
      {!answer && !pending && !error ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" onClick={() => go(s)} className="rounded-full border border-line px-3 py-1 text-xs text-ink-soft hover:border-ink/40 hover:text-ink">
              {s}
            </button>
          ))}
        </div>
      ) : null}
      {error ? <p className="mt-3 text-sm text-rust">{error}</p> : null}
      {answer ? <div className="mt-3 whitespace-pre-line border-t border-line pt-3 text-sm leading-relaxed text-ink">{answer}</div> : null}
    </div>
  );
}
