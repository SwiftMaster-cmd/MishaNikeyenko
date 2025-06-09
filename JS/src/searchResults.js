// searchResults.js
export function renderSearchResults(results, container) {
  if (!Array.isArray(results) || results.length === 0) {
    container.innerHTML = `<div class="search-result-card"><div class="result-snippet">No results found.</div></div>`;
    return;
  }
  container.innerHTML = results.map(r => `
    <div class="search-result-card">
      ${r.thumbnail ? `<div class="result-thumbnail"><img src="${r.thumbnail}" alt="Thumbnail" loading="lazy"></div>` : ''}
      <div class="result-content">
        <div class="result-title">
          <a href="${r.url}" target="_blank" rel="noopener noreferrer">${r.title}</a>
        </div>
        <div class="result-meta">
          ${r.source ? `<span class="result-source">${r.source}</span>` : ''}
          ${r.date ? `<span class="result-date">${r.date}</span>` : ''}
        </div>
        <div class="result-snippet">${r.snippet}</div>
      </div>
    </div>
  `).join('');
}