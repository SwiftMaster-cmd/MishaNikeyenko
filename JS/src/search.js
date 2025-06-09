// search.js – Brave Search API via Netlify Function Proxy with built-in smart logic

import { fetchLast20Messages, getAssistantReply } from "./backgpt.js";

/**
 * Performs a context- and location-aware Brave search:
 * 1. Classify if local context is needed
 * 2. Refine the query via GPT using chat history
 * 3. Optionally append geolocation
 * 4. Fetch and normalize results
 *
 * @param {string} rawQuery – User’s original search phrase
 * @param {object} opts
 *   @property {string} uid       – Firebase user ID (for context)
 *   @property {number} count     – Number of results (default 5)
 */
export async function webSearchBrave(rawQuery, opts = {}) {
  window.debug?.(`[SEARCH] Raw Query: ${rawQuery}`);

  // ── 1) Classify if we need "near me" ─────────────────────────────
  let shouldLocalize = false;
  try {
    const clsPrompt = [
      { role: "system", content:
          "Answer only 'yes' or 'no'. Should this search query benefit from adding local context like 'near me'?" },
      { role: "user", content: `Search: "${rawQuery}"` }
    ];
    const decision = (await getAssistantReply(clsPrompt)).trim().toLowerCase();
    shouldLocalize = decision.startsWith("y");
    window.debug?.(`[SEARCH] Localize? ${shouldLocalize}`);
  } catch (e) {
    window.debug?.("[SEARCH] Classification failed:", e.message);
  }

  // ── 2) Refine the query via GPT ─────────────────────────────────
  let refined = rawQuery;
  try {
    const recent = await fetchLast20Messages(opts.uid);
    const context = recent
      .filter(m => m.role === "user" || m.role === "assistant")
      .slice(-6)
      .map(m => `${m.role === "assistant" ? "AI" : "User"}: ${m.content}`)
      .join("\n");
    const rewritePrompt = [
      { role: "system", content:
          "You are a search-query optimizer. Given chat context and a raw search, craft a concise search phrase." },
      { role: "assistant", content: context },
      { role: "user", content: `Search for: "${rawQuery}"` }
    ];
    const out = await getAssistantReply(rewritePrompt);
    const candidate = out.trim().replace(/^Search for[:\s]*/i, "");
    if (candidate) refined = candidate;
    window.debug?.(`[SEARCH] Refined Query: ${refined}`);
  } catch (e) {
    window.debug?.("[SEARCH] Refinement failed:", e.message);
  }

  // ── 3) Optionally append "near me" + geolocation ─────────────────
  let locQuery = refined;
  if (shouldLocalize && navigator.geolocation) {
    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 })
      );
      const { latitude, longitude } = pos.coords;
      locQuery += ` near me`; // natural language hint
      // Also pass coords in URL if proxy can forward them
      locQuery += `&lat=${latitude.toFixed(4)}&lon=${longitude.toFixed(4)}`;
    } catch {
      window.debug?.("[SEARCH] Geolocation unavailable");
      locQuery += ` near me`;
    }
  }

  // ── 4) Call the Brave proxy ───────────────────────────────────────
  const count = opts.count || 5;
  const endpoint = `/.netlify/functions/brave-search?q=${encodeURIComponent(
    locQuery
  )}&count=${count}`;
  window.debug?.("[SEARCH] Fetching", endpoint);

  const res = await fetch(endpoint, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    let msg = `Proxy error [${res.status}]`;
    try {
      const err = await res.json();
      if (err.error) msg += `: ${err.error}`;
    } catch {}
    window.debug?.("[SEARCH] Error:", msg);
    throw new Error(msg);
  }

  const data = await res.json();
  window.debug?.("[SEARCH] Response:", data);

  // ── 5) Normalize output ───────────────────────────────────────────
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