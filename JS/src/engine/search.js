// search.js – Brave Search API with date‐aware, context & location logic

import { fetchLast20Messages, getAssistantReply } from "./backgpt.js";

/**
 * Performs a context‐, date‐ and optionally location‐aware Brave search:
 * 1. Classifies whether to add local bias
 * 2. Refines the query via GPT using chat context + today’s date
 * 3. Appends geolocation if needed
 * 4. Calls the Brave proxy and normalizes results
 */
export async function webSearchBrave(rawQuery, opts = {}) {
  window.debug?.(`[SEARCH] Raw Query: ${rawQuery}`);
  const today = new Date().toISOString().slice(0, 10);

  // ── 1) Decide if "near me" helps ────────────────────────────────
  let shouldLocalize = false;
  try {
    const clsPrompt = [
      { role: "system", content:
          `Date: ${today}
You are a query classifier. Answer ONLY 'yes' or 'no'.  
If the search would benefit from "near me" (restaurants, stores, events), say yes.` },
      { role: "user", content: `Search: "${rawQuery}"` }
    ];
    const decision = (await getAssistantReply(clsPrompt)).trim().toLowerCase();
    shouldLocalize = decision.startsWith("y");
    window.debug?.(`[SEARCH] Localize? ${shouldLocalize}`);
  } catch (e) {
    window.debug?.("[SEARCH] Classification error:", e.message);
  }

  // ── 2) Refine the query via GPT ─────────────────────────────────
  let refined = rawQuery;
  try {
    const recent = await fetchLast20Messages(opts.uid);
    const context = recent
      .filter(m => m.role !== "assistant")
      .slice(-6)
      .map(m => `${m.role === "assistant" ? "AI" : "User"}: ${m.content}`)
      .join("\n");
    const rewritePrompt = [
      { role: "system", content:
          `Date: ${today}
You are a search‐query optimizer. Given this chat context and the raw query, produce a concise, effective search phrase.` },
      { role: "assistant", content: context },
      { role: "user", content: `Search for: "${rawQuery}"` }
    ];
    const out = await getAssistantReply(rewritePrompt);
    const candidate = out.trim().replace(/^Search for[:\s]*/i, "");
    if (candidate) refined = candidate;
    window.debug?.(`[SEARCH] Refined Query: ${refined}`);
  } catch (e) {
    window.debug?.("[SEARCH] Refinement error:", e.message);
  }

  // ── 3) Append "near me" + geolocation ───────────────────────────
  let locQuery = refined;
  if (shouldLocalize) {
    locQuery += " near me";
    if (navigator.geolocation) {
      try {
        const pos = await new Promise((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 })
        );
        locQuery += `&lat=${pos.coords.latitude.toFixed(4)}&lon=${pos.coords.longitude.toFixed(4)}`;
      } catch {
        window.debug?.("[SEARCH] Geolocation unavailable");
      }
    }
  }

  // ── 4) Proxy call ─────────────────────────────────────────────────
  const count = opts.count || 5;
  const endpoint = `/.netlify/functions/brave-search?q=${encodeURIComponent(locQuery)}&count=${count}`;
  window.debug?.("[SEARCH] Fetching", endpoint);
  const res = await fetch(endpoint, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    let msg = `Proxy error [${res.status}]`;
    try { const err = await res.json(); if (err.error) msg += `: ${err.error}`; } catch {}
    window.debug?.("[SEARCH] Error:", msg);
    throw new Error(msg);
  }
  const data = await res.json();
  window.debug?.("[SEARCH] Response:", data);

  // ── 5) Normalize ─────────────────────────────────────────────────
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