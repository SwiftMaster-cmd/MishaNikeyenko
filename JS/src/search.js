// search.js – Brave Search API (Pro) integration
const BRAVE_API_KEY = 'BSAPL_WUWCZ7JdfD5oCeZ1bAYlhc9n5'; // <-- put your key here

export async function webSearchBrave(query, opts = {}) {
  const endpoint = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${opts.count || 5}`;
  const response = await fetch(endpoint, {
    headers: {
      'Accept': 'application/json',
      'X-Subscription-Token': BRAVE_API_KEY
    }
  });
  if (!response.ok) throw new Error('Brave Search failed');
  const data = await response.json();
  // Richer data: web results, infoboxes, FAQs, discussions, etc.
  return {
    results: (data.web?.results || []).map(r => ({
      title: r.title,
      url: r.url,
      snippet: r.description
    })),
    infobox: data.infobox || null,
    faq: data.faq || [],
    discussions: data.discussions || [],
    locations: data.locations || []
  };
}