// search.js – Brave Search API (Pro) integration
const BRAVE_API_KEY = 'BSAPL_WUWCZ7JdfD5oCeZ1bAYlhc9n5'; // <-- your real Pro key

export async function webSearchBrave(query, opts = {}) {
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
    console.error("Brave Search fetch failed:", err);
    throw new Error('Brave Search network error');
  }

  if (!response.ok) {
    // Show detailed error if available
    let errorMsg = `Brave Search failed [${response.status}]`;
    try {
      const errData = await response.json();
      if (errData && errData.error) errorMsg += `: ${errData.error}`;
    } catch {}
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  let data;
  try {
    data = await response.json();
    console.log("BRAVE RAW DATA:", data); // Debug output
  } catch (err) {
    console.error("Error parsing Brave Search response:", err);
    throw new Error('Brave Search parse error');
  }

  // Defensive: handle changes in Brave's API response shape
  const resultsArr = Array.isArray(data.web?.results) ? data.web.results : [];
  const infobox = data.infobox || null;
  const faq = Array.isArray(data.faq) ? data.faq : [];
  const discussions = Array.isArray(data.discussions) ? data.discussions : [];
  const locations = Array.isArray(data.locations) ? data.locations : [];

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