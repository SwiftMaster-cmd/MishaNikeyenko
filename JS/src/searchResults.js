// searchResults.js
export function renderSearchResults(results, container) {
  if (!container) return;
  container.innerHTML = ''; // Clear previous

  if (!Array.isArray(results) || results.length === 0) {
    container.innerHTML = `<div class="search-result-card"><div class="result-snippet">No results found.</div></div>`;
    return;
  }

  results.forEach(r => {
    // Extract domain for meta
    let domain = '';
    try { domain = (new URL(r.url)).hostname.replace(/^www\./, ''); } catch {}
    const card = document.createElement('div');
    card.className = 'search-result-card';
    card.innerHTML = `
      <a class="result-title" href="${r.url}" target="_blank" rel="noopener">${r.title || 'Untitled result'}</a>
      <div class="result-snippet">${r.snippet || ''}</div>
      <div class="result-meta">${domain}</div>
    `;
    container.appendChild(card);
  });
}