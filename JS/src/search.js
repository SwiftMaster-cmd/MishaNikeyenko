// search.js – Brave Search API via Netlify proxy with GPT query refinement

import { fetchLast20Messages, getAssistantReply } from "./backgpt.js";

/**
 * Performs a context‐aware Brave search:
 * 1. Refines the user’s raw query via GPT using recent chat context
 * 2. (Optionally) attaches browser geolocation if available
 * 3. Proxies to your Netlify function
 */
export async function webSearchBrave(rawQuery, opts = {}) {
  window.debug?.(`[SEARCH] Raw Query: ${rawQuery}`);

  // 1) Refine via GPT
  let refined = rawQuery;
  try {
    const recent = await fetchLast20Messages(opts.uid);
    const context = recent
      .filter(m => m.role !== "assistant")
      .slice(-6)
      .map(m => `${m.role === "assistant" ? "AI" : "User"}: ${m.content}`)
      .join("\n");
    const prompt = [
      { role: "system", content:
          "You are a search‐query optimizer. Given chat context and a raw search, return a concise query." },
      { role: "assistant", content: context },
      { role: "user", content: `Search for: "${rawQuery}"` }
    ];
    const out = await getAssistantReply(prompt);
    const candidate = out.trim().replace(/^Search for[:\s]*/i, "");
    if (candidate) refined = candidate;
    window.debug?.(`[SEARCH] Refined Query: ${refined}`);
  } catch (e) {
    window.debug?.("[SEARCH] Refinement failed:", e.message);
  }

  // 2) Optional geolocation
  let geo = "";
  if (navigator.geolocation) {
    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 })
      );
      geo = `&lat=${pos.coords.latitude.toFixed(4)}&lon=${pos.coords.longitude.toFixed(4)}`;
      window.debug?.("[SEARCH] Geo params:", geo);
    } catch {
      window.debug?.("[SEARCH] Geolocation unavailable");
    }
  }

  // 3) Call the proxy
  const count = opts.count || 5;
  const endpoint = `/.netlify/functions/brave-search?q=${encodeURIComponent(refined)}&count=${count}${geo}`;
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

  // 4) Normalize
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