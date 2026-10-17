/**
 * "Ask about the numbers" on the Money page (server-only): a plain-English
 * question answered by Claude from the month's summary.
 *
 * Off unless ANTHROPIC_API_KEY is set on the server. What's sent is the
 * summary the page already shows — totals, rooms, makers' business names,
 * item names, bills — never customers' names, emails or card details.
 */

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

export function canAsk() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const SYSTEM = `You are the bookkeeper's assistant for The Alley On Center, a small retail shop and event building in Logan, Utah.
It earns money from: its shop (its own stock, plus a share of makers' consigned items), room rentals, its own event tickets,
tenants' rent, tenants' share of staff cost, and a co-payer's share of utilities. It pays: makers their share, staff,
the mortgage, utilities, insurance and other bills. Sales tax collected is owed to the state and is NOT income;
refundable deposits are NOT income.
Answer the owner's question from the JSON summary only. Be brief and plain: a direct answer first, then at most a few
short bullet points with the numbers that matter. Use dollars. If the summary doesn't contain what's needed, say what's
missing and where on the Money page to add it. Never invent numbers.`;

export async function askAboutMoney(question, summary) {
  if (!canAsk()) throw new Error("Asking isn't switched on yet.");
  const q = String(question || "").trim().slice(0, 500);
  if (!q) throw new Error("Type a question.");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      system: SYSTEM,
      messages: [{ role: "user", content: `Summary (JSON):\n${JSON.stringify(summary)}\n\nQuestion: ${q}` }],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[ask] Anthropic API error:", res.status, data?.error?.message);
    throw new Error("Couldn't get an answer just now — try again in a minute.");
  }
  return (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
}
