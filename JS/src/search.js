// search.js – Brave Search API via Netlify Function Proxy with smart location injection

import { fetchLast20Messages, getAssistantReply } from "./backgpt.js";
import { get_user_info } from "./user_info";

/**
 * Smart Brave search:
 * - Optionally injects "near {city}" if query type benefits
 * - Refines query via GPT using chat context
 * - Proxies to Brave
 */
export async function webSearchBrave(rawQuery, opts = {}) {
  window.debug?.(`[SEARCH] Raw Query: ${rawQuery}`);

  // ── A) Determine if location injection is needed ──────────────
  let locationHint = "";
  try {
    const info = await get_user_info();
    const city = info.location?.city || info.location?.region;
    if (city) {
      // Ask GPT whether to add "near {city}"
      const decisionPrompt = [
        { role: "system", content:
            "You are a query classifier. Answer ONLY 'yes' or 'no'.\n" +
            "If the user's search would benefit from local context (restaurants, stores, services), answer yes. Otherwise no." },
        { role: "user", content: `Should I add "near ${city}" to this search: "${rawQuery}"?` }
      ];
      const decision = (await getAssistantReply(decisionPrompt)).trim().toLowerCase();
      if (decision.startsWith("y")) {
        locationHint = ` near ${city}`;
      }
      window.debug?.(`[SEARCH] Location injection decision: ${decision}`);
    }
  } catch (e) {
    window.debug?.("[SEARCH] Location inference failed:", e.message);
  }

  // ── B) Refine the query via GPT ──────────────────────────────
  let refined = rawQuery + locationHint;
  try {
    const recent = await fetchLast20Messages(opts.uid);
    const context = recent
      .filter(m => m.role !== "assistant")
      .slice(-4)
      .map(m => m.content)
      .join("\n");
    const rewritePrompt = [
      { role: "system", content:
          "You are a search optimizer. Given this context and user search, produce a concise search query." },
      { role: "assistant", content: context },
      { role: "user", content: `Search for: "${refined}"` }
    ];
    const out = await getAssistantReply(rewritePrompt);
    refined = out.trim().replace(/^Search for[:\s]*/i, "") || refined;
    window.debug?.(`[SEARCH] Refined Query: ${refined}`);
  } catch (e) {
    window.debug?.("[SEARCH] Query rewrite failed:", e.message);
  }

  // ── C) Call the Brave proxy ──────────────────────────────────
  const count = opts.count || 5;
  const endpoint = `/.netlify/functions/brave-search?q=${encodeURIComponent(refined)}&count=${count}`;
  window.debug?.("[SEARCH] Endpoint:", endpoint);

  const res = await fetch(endpoint, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Proxy error [${res.status}]: ${err}`);
  }
  const data = await res.json();
  window.debug?.("[SEARCH] Response:", data);

  // ── D) Normalize output ───────────────────────────────────────
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