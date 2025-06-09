// search.js – Brave Search API via Netlify Function Proxy with smart context & location

import { fetchLast20Messages, getAssistantReply } from "./backgpt.js";
import { get_user_info } from "./user_info.js";

/**
 * Performs a context– and optionally location–aware Brave search:
 * 1. Classifies whether local context is helpful
 * 2. Refines the query via GPT using recent chat context
 * 3. Attaches location parameters only if beneficial
 * 4. Sends to the Brave‐search proxy and normalizes results
 *
 * @param {string} rawQuery – User’s original search phrase
 * @param {object} opts
 *   @property {string} uid     – Firebase user ID (for chat context)
 *   @property {number} count   – Number of results (default 5)
 */
export async function webSearchBrave(rawQuery, opts = {}) {
  window.debug?.(`[SEARCH] Raw Query: ${rawQuery}`);

  // ── 1) Decide if adding "near {city}" makes sense ────────────────
  let locationHint = "";
  try {
    const info = await get_user_info();
    const city = info.location?.city || info.location?.region;
    if (city) {
      const clsPrompt = [
        { role: "system", content:
            "Answer only 'yes' or 'no'. Should we add local context (e.g. 'near City') to this search?" },
        { role: "user", content: `Query: "${rawQuery}"` }
      ];
      const decision = (await getAssistantReply(clsPrompt)).trim().toLowerCase();
      if (decision.startsWith("y")) locationHint = ` near ${city}`;
      window.debug?.(`[SEARCH] Location decision: ${decision}`);
    }
  } catch (e) {
    window.debug?.("[SEARCH] Location classification failed:", e.message);
  }

  // ── 2) Refine the query via GPT ─────────────────────────────────
  let refined = rawQuery + locationHint;
  try {
    const recent = await fetchLast20Messages(opts.uid);
    const context = recent
      .filter(m => m.role !== "assistant")
      .slice(-6)
      .map(m => `${m.role === "assistant" ? "AI" : "User"}: ${m.content}`)
      .join("\n");
    const rewritePrompt = [
      { role: "system", content:
          "You are a search‐query optimizer. Given chat context and a raw search, produce a concise query." },
      { role: "assistant", content: context },
      { role: "user", content: `Search for: "${refined}"` }
    ];
    const out = await getAssistantReply(rewritePrompt);
    const cand = out.trim().replace(/^Search for[:\s]*/i, "");
    refined = cand || refined;
    window.debug?.(`[SEARCH] Refined Query: ${refined}`);
  } catch (e) {
    window.debug?.("[SEARCH] Query refinement failed:", e.message);
  }

  // ── 3) Build and call proxy ─────────────────────────────────────
  const count = opts.count || 5;
  const endpoint = `/.netlify/functions/brave-search` +
                   `?q=${encodeURIComponent(refined)}` +
                   `&count=${count}`;
  window.debug?.("[SEARCH] Fetching", endpoint);

  const res = await fetch(endpoint, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    let msg = `Proxy error [${res.status}]`;
    try {
      const err = await res.json();
      if (err.error) msg += `: ${err.error}`;
    } catch {}
    window.debug?.("[SEARCH] Proxy failed:", msg);
    throw new Error(msg);
  }

  const data = await res.json();
  window.debug?.("[SEARCH] Response:", data);

  // ── 4) Normalize output ─────────────────────────────────────────
  const web = data.web || {};
  const arr = Array.isArray(web.results) ? web.results : [];
  return {
    results: arr.map(r => ({
      title: r.title || "",
      url: r.url || "",
      snippet: r.description || "",
      source: r.source || "",
      date: r.date || "",
      thumbnail: r.thumbnail || ""
    })),
    infobox: data.infobox || null,
    faq: Array.isArray(data.faq) ? data.faq : [],
    discussions: Array.isArray(data.discussions) ? data.discussions : [],
    locations: Array.isArray(data.locations) ? data.locations : []
  };
}