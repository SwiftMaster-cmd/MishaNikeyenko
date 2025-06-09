// search.js – Brave Search API via Netlify Function Proxy with status hooks

import { fetchLast20Messages, getAssistantReply } from "./backgpt.js";
import { get_user_info } from "./user_info.js";

/**
 * Performs a context-aware Brave search.
 *
 * @param {string} rawQuery           The user’s raw search string.
 * @param {object} opts
 *   @property {string} uid          Firebase user ID (for context).
 *   @property {number} count        Number of results to fetch (default 5).
 *   @property {Function} onStart    Called when search begins.
 *   @property {Function} onComplete Called with results when done.
 *   @property {Function} onError    Called with error message on failure.
 *
 * @returns {Promise<object>} Resolves to:
 *   {
 *     results: Array<{title,url,snippet,source,date,thumbnail}>,
 *     infobox, faq, discussions, locations,
 *     error: string|null
 *   }
 */
export async function webSearchBrave(
  rawQuery,
  {
    uid,
    count = 5,
    onStart = () => {},
    onComplete = () => {},
    onError = () => {}
  } = {}
) {
  onStart();
  window.debug?.(`[SEARCH] Raw Query: ${rawQuery}`);

  // 1) Get location for possible hint (silent fail)
  let locationHint = "";
  try {
    const info = await get_user_info();
    const city = info.location?.city || info.location?.region;
    if (city) locationHint = ` near ${city}`;
  } catch {
    // ignore
  }

  // 2) Decide if we should inject location
  try {
    if (locationHint) {
      const decisionPrompt = [
        { role: "system", content:
            "Answer 'yes' or 'no'. Should we add local context to this search?" },
        { role: "user", content: `Search: "${rawQuery}"${locationHint}` }
      ];
      const decision = (await getAssistantReply(decisionPrompt)).trim().toLowerCase();
      if (!decision.startsWith("y")) locationHint = "";
    }
  } catch {
    // ignore
  }

  // 3) Refine via GPT
  let refined = rawQuery + locationHint;
  try {
    const recent = await fetchLast20Messages(uid);
    const context = recent.map(m => `${m.role}: ${m.content}`).slice(-4).join("\n");
    const rewritePrompt = [
      { role: "system", content:
          "You are a search optimizer. Refine the search term concisely." },
      { role: "assistant", content: context },
      { role: "user", content: `Search for: "${refined}"` }
    ];
    const out = await getAssistantReply(rewritePrompt);
    refined = out.trim().replace(/^Search for[:\s]*/i, "") || refined;
    window.debug?.(`[SEARCH] Refined Query: ${refined}`);
  } catch {
    // fallback to raw
  }

  // 4) Build endpoint
  const q = encodeURIComponent(refined);
  const endpoint = `/.netlify/functions/brave-search?q=${q}&count=${count}`;
  window.debug?.("[SEARCH] Fetching", endpoint);

  // 5) Fetch and normalize
  try {
    const res = await fetch(endpoint, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Proxy error ${res.status}`);
    const data = await res.json();

    const web = data.web || {};
    const resultsArr = Array.isArray(web.results) ? web.results : [];

    const payload = {
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
      locations: Array.isArray(data.locations) ? data.locations : [],
      error: null
    };

    onComplete(payload);
    return payload;
  } catch (err) {
    const msg = err.message || "Unknown error";
    window.debug?.("[SEARCH ERROR]", msg);
    const payload = {
      results: [],
      infobox: null,
      faq: [],
      discussions: [],
      locations: [],
      error: msg
    };
    onError(msg);
    return payload;
  }
}