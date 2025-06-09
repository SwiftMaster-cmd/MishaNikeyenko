// searchResults.js
export function renderSearchResults(results, container) {
  if (!Array.isArray(results) || results.length === 0) {
    container.innerHTML = `<div class="search-result-card"><div class="result-snippet">No results found.</div></div>`;
    return;
  }
  container.innerHTML = results.map(r => `
    <div class="search-result-card">
      <div class="result-title">
        <a href="${r.url}" target="_blank" rel="noopener noreferrer">${r.title}</a>
      </div>
      <div class="result-snippet">${r.snippet}</div>
    </div>
  `).join('');
}