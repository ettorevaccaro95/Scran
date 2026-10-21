// Scran AI planner: takes the meal-plan prompt the app builds, asks Claude, and streams the answer back as plain text.
// Your API key stays here on the server and never reaches the browser.

const PREFIX = {
  plan: "You plan a week of meals for a UK household on a budget.",
  swap: "You suggest ONE replacement evening meal for a UK household on a budget.",
};
const MAX_TOKENS = { plan: 8000, swap: 1500 };
const MAX_PROMPT_CHARS = 20000;

// Very simple per-visitor limit. It resets when Netlify starts a fresh copy of the function,
// so also set a monthly spend limit in the Claude Console.
const hits = new Map();
function allowed(ip, perHour) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 3600_000);
  if (recent.length >= perHour) return false;
  recent.push(now);
  hits.set(ip, recent);
  return true;
}

const env = (k) => (globalThis.Netlify?.env?.get(k) ?? process.env[k]);

export default async (req, context) => {
  if (req.method !== "POST") return new Response("Use POST", { status: 405 });

  const key = env("ANTHROPIC_API_KEY");
  if (!key) return new Response("No Claude key: turn on Netlify AI features or set ANTHROPIC_API_KEY", { status: 503 });

  let body;
  try { body = await req.json(); } catch { return new Response("Bad request", { status: 400 }); }
  const { kind, prompt } = body || {};
  if (!PREFIX[kind] || typeof prompt !== "string" || !prompt.startsWith(PREFIX[kind]) || prompt.length > MAX_PROMPT_CHARS) {
    return new Response("Bad request", { status: 400 });
  }

  const perHour = Number(env("PLANS_PER_HOUR") || 20);
  if (!allowed(context?.ip || "unknown", perHour)) return new Response("Too many requests", { status: 429 });

  // On Netlify, the AI Gateway sets ANTHROPIC_API_KEY and ANTHROPIC_BASE_URL for you (billed as Netlify credits).
  // If you add your own ANTHROPIC_API_KEY instead, Netlify leaves it alone and this calls Claude directly.
  const base = (env("ANTHROPIC_BASE_URL") || "https://api.anthropic.com").replace(/\/+$/, "");
  const upstream = await fetch(`${base}/v1/messages`, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env("ANTHROPIC_MODEL") || "claude-haiku-5-5",
      max_tokens: MAX_TOKENS[kind],
      stream: true,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: req.signal,
  }).catch((e) => ({ ok: false, status: 502, text: async () => String(e) }));

  if (!upstream.ok) {
    console.error("Claude API error", upstream.status, (await upstream.text()).slice(0, 500));
    return new Response("Upstream error", { status: upstream.status === 429 || upstream.status === 529 ? 429 : 502 });
  }

  // Turn Claude's server-sent events into a plain stream of text.
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  const reader = upstream.body.getReader();
  let buf = "";
  const stream = new ReadableStream({
    async pull(ctrl) {
      for (;;) {
        const cut = buf.indexOf("\n\n");
        if (cut > -1) {
          const event = buf.slice(0, cut);
          buf = buf.slice(cut + 2);
          const line = event.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          let d;
          try { d = JSON.parse(line.slice(5)); } catch { continue; }
          if (d.type === "content_block_delta" && d.delta?.type === "text_delta") {
            ctrl.enqueue(enc.encode(d.delta.text));
            return;
          }
          if (d.type === "error") {
            console.error("Claude stream error", d.error);
            ctrl.error(new Error(d.error?.message || "stream error"));
            return;
          }
          continue;
        }
        const { done, value } = await reader.read();
        if (done) { ctrl.close(); return; }
        buf += dec.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      }
    },
    cancel() { reader.cancel().catch(() => {}); },
  });

  return new Response(stream, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
};

export const config = { path: "/api/plan" };
