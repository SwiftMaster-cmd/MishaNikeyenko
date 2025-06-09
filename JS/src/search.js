// search.js – Brave Search API (Pro) integration
const BRAVE_API_KEY = 'BSAPL_WUWCZ7JdfD5oCeZ1bAYlhc9n5'; // <-- your real Pro key

export async function webSearchBrave(query, opts = {}) {
  window.debug?.(`[SEARCH] Sending query to Brave: "${query}" with opts: ${JSON.stringify(opts)}`);
  const endpoint = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${opts.count || 5}`;
  let response;
  try {
    response = await fetch(endpoint, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': BRAVE_API_KEY
      }
    });
  } catch (err) {
    window.debug?.("[SEARCH ERROR] Brave fetch failed:", err);
    throw new Error('Brave Search network error');
  }

  if (!response.ok) {
    let errorMsg = `Brave Search failed [${response.status}]`;
    try {
      const errData = await response.json();
      if (errData && errData.error) errorMsg += `: ${errData.error}`;
    } catch {}
    window.debug?.("[SEARCH ERROR]", errorMsg);
    throw new Error(errorMsg);
  }

  let data;
  try {
    data = await response.json();
    window.debug?.("[SEARCH RESPONSE]", data); // logs full raw data
  } catch (err) {
    window.debug?.("[SEARCH ERROR] Error parsing response:", err);
    throw new Error('Brave Search parse error');
  }

  const resultsArr = Array.isArray(data.web?.results) ? data.web.results : [];
  const infobox = data.infobox || null;
  const faq = Array.isArray(data.faq) ? data.faq : [];
  const discussions = Array.isArray(data.discussions) ? data.discussions : [];
  const locations = Array.isArray(data.locations) ? data.locations : [];

  window.debug?.(`[SEARCH] Results: ${resultsArr.length}, Infobox: ${!!infobox}, FAQ: ${faq.length}, Discussions: ${discussions.length}, Locations: ${locations.length}`);

  return {
    results: resultsArr.map(r => ({
      title: r.title || "",
      url: r.url || "",
      snippet: r.description || ""
    })),
    infobox,
    faq,
    discussions,
    locations
  };
}