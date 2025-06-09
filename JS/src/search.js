export async function webSearchBrave(query, opts = {}) {
  window.debug?.(`[SEARCH] Query: ${query}`);
  const endpoint = `/.netlify/functions/brave-search?q=${encodeURIComponent(query)}&count=${opts.count || 5}`;
  let response;
  try {
    response = await fetch(endpoint, {
      headers: { "Accept": "application/json" }
    });
  } catch (err) {
    window.debug?.("[SEARCH ERROR] Proxy fetch failed:", err.message || err);
    throw new Error('Proxy network error');
  }

  if (!response.ok) {
    let errorMsg = `Proxy failed [${response.status}]`;
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
    window.debug?.("[SEARCH RESPONSE]", JSON.stringify(data, null, 2));
  } catch (err) {
    window.debug?.("[SEARCH ERROR] Error parsing proxy response:", err.message || err);
    throw new Error('Proxy parse error');
  }

  // ...same as before for summary and return
}