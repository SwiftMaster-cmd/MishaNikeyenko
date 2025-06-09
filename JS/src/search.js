// search.js – Brave Search API via Netlify Function Proxy with GPT-powered query refinement

import { fetchLast20Messages, getAssistantReply } from "./backgpt.js";

/**
 * Performs a context-aware Brave search:
 * 1. Pulls recent chat to refine the user’s query
 * 2. (Optionally) adds geolocation
 * 3. Sends to the Brave-search proxy
 */
export async function webSearchBrave(rawQuery, opts = {}) {
  window.debug?.(`[SEARCH] Raw Query: ${rawQuery}`);

  // ── 1) Refine the query via GPT ─────────────────────────────────────
  let refinedQuery = rawQuery;
  try {
    // Pull last few messages for context
    const recent = await fetchLast20Messages(opts.uid);
    const context = recent
      .filter(m => m.role === "user" || m.role === "assistant")
      .slice(-6)  // last 6 messages
      .map(m => `${m.role === "assistant" ? "AI" : "User"}: ${m.content}`)
      .join("\n");

    const rewritePrompt = [
      {
        role: "system",
        content: `
You are a search-optimization engine. Given the user’s recent conversation and their raw search phrase,
produce a concise, effective search query--but do NOT include any commentary or markup.
`
      },
      { role: "assistant", content: context },
      { role: "user", content: `Search for: "${rawQuery}"` }
    ];

    const improved = await getAssistantReply(rewritePrompt);
    refinedQuery = improved.trim().replace(/^Search for[:\s]*/i, "") || rawQuery;
    window.debug?.(`[SEARCH] Refined Query: ${refinedQuery}`);
  } catch (err) {
    window.debug?.("[SEARCH] Query rewrite failed, using raw:", err.message);
  }

  // ── 2) (Optional) Attach geolocation ───────────────────────────────
  let geoParams = "";
  if (navigator.geolocation) {
    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 })
      );
      const { latitude, longitude } = pos.coords;
      geoParams = `&lat=${latitude.toFixed(4)}&lon=${longitude.toFixed(4)}`;
    } catch {
      /* ignore if denied or timed out */
    }
  }

  // ── 3) Call Brave proxy ─────────────────────────────────────────────
  const count = opts.count || 5;
  const endpoint = `/.netlify/functions/brave-search?q=${encodeURIComponent(
    refinedQuery
  )}&count=${count}${geoParams}`;
  window.debug?.(`[SEARCH] Endpoint: ${endpoint}`);

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

  // ── 4) Normalize ───────────────────────────────────────────────────
  const web = data.web || {};
  const resultsArr = Array.isArray(web.results) ? web.results : [];
  return {
    results: resultsArr.map(r => ({
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