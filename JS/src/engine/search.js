// 🔍 search.js – Brave Search API with date‐, context‐, and location‐aware enhancements

import { fetchLast20Messages, getAssistantReply } from "./backgpt.js";

/**
 * Performs a smart Brave search with context, geolocation, and optional tagging.
 * @param {string} rawQuery
 * @param {object} opts { uid, count?, tags?, context?, track? }
 */
export async function webSearchBrave(rawQuery, opts = {}) {
  const today = new Date().toISOString().slice(0, 10);
  window.debug?.(`[SEARCH] Raw Query: ${rawQuery}`);

  // 1️⃣ Decide if localization helps
  let shouldLocalize = false;
  try {
    const classifyPrompt = [
      { role: "system", content:
        `Date: ${today}
You are a query classifier. Respond ONLY with 'yes' or 'no'.
If the query would benefit from "near me" (like restaurants, stores, events), say yes.` },
      { role: "user", content: `Search: "${rawQuery}"` }
    ];
    const result = await getAssistantReply(classifyPrompt);
    shouldLocalize = result.trim().toLowerCase().startsWith("y");
    window.debug?.(`[SEARCH] Localize: ${shouldLocalize}`);
  } catch (e) {
    window.debug?.("[SEARCH] Classification error:", e.message);
  }

  // 2️⃣ Refine search via chat context
  let refined = rawQuery;
  try {
    const chat = opts.context || await fetchLast20Messages(opts.uid);
    const context = chat
      .filter(m => m.role !== "assistant")
      .slice(-6)
      .map(m => `${m.role === "assistant" ? "AI" : "User"}: ${m.content}`)
      .join("\n");

    const refinePrompt = [
      { role: "system", content:
        `Date: ${today}
You are a query rewriter. Improve the raw query using this context:` },
      { role: "assistant", content: context },
      { role: "user", content: `Search for: "${rawQuery}"` }
    ];
    const out = await getAssistantReply(refinePrompt);
    const candidate = out.trim().replace(/^Search for[:\s]*/i, "");
    if (candidate) refined = candidate;
    window.debug?.(`[SEARCH] Refined: ${refined}`);
  } catch (e) {
    window.debug?.("[SEARCH] Refinement error:", e.message);
  }

  // 3️⃣ Add "near me" and geolocation
  let locQuery = refined;
  if (shouldLocalize) {
    locQuery += " near me";
    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 4000 })
      );
      locQuery += `&lat=${pos.coords.latitude.toFixed(4)}&lon=${pos.coords.longitude.toFixed(4)}`;
    } catch {
      window.debug?.("[SEARCH] Geolocation failed or denied");
    }
  }

  // 4️⃣ Fetch from Brave Search proxy
  const count = opts.count || 5;
  const url = `/.netlify/functions/brave-search?q=${encodeURIComponent(locQuery)}&count=${count}`;
  window.debug?.("[SEARCH] Fetching:", url);

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    let msg = `Brave proxy error [${res.status}]`;
    try {
      const json = await res.json();
      if (json.error) msg += `: ${json.error}`;
    } catch {}
    throw new Error(msg);
  }

  const data = await res.json();
  window.debug?.("[SEARCH] Raw Response:", data);

  // 5️⃣ Normalize result format
  const web = data.web || {};
  const arr = Array.isArray(web.results) ? web.results : [];
  return {
    query: refined,
    tags: opts.tags || [],
    date: today,
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