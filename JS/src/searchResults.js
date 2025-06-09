// searchResults.js

/**
 * Renders search results into a container element.
 * @param {Array<Object>} results - Array of result objects:
 *    { title, url, snippet, source?, date?, thumbnail? }
 * @param {HTMLElement} container - The element to render into.
 */
export function renderSearchResults(results, container) {
  // Clear existing
  container.innerHTML = "";

  if (!Array.isArray(results) || results.length === 0) {
    const noRes = document.createElement("div");
    noRes.className = "search-result-card";
    const msg = document.createElement("div");
    msg.className = "result-snippet";
    msg.textContent = "No results found.";
    noRes.appendChild(msg);
    container.appendChild(noRes);
    return;
  }

  const fragment = document.createDocumentFragment();

  results.forEach(res => {
    const card = document.createElement("div");
    card.className = "search-result-card";
    card.setAttribute("role", "group");
    card.setAttribute("tabindex", "0");

    // Thumbnail (optional)
    if (res.thumbnail) {
      const thumbWrap = document.createElement("div");
      thumbWrap.className = "result-thumbnail";
      const img = document.createElement("img");
      img.src = res.thumbnail;
      img.alt = res.title || "Thumbnail";
      img.loading = "lazy";
      thumbWrap.appendChild(img);
      card.appendChild(thumbWrap);
    }

    // Content wrapper
    const content = document.createElement("div");
    content.className = "result-content";

    // Title
    const titleDiv = document.createElement("div");
    titleDiv.className = "result-title";
    const link = document.createElement("a");
    link.href = res.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = res.title || res.url;
    link.setAttribute("aria-label", res.title || res.url);
    titleDiv.appendChild(link);
    content.appendChild(titleDiv);

    // Meta (source & date)
    if (res.source || res.date) {
      const metaDiv = document.createElement("div");
      metaDiv.className = "result-meta";
      if (res.source) {
        const src = document.createElement("span");
        src.className = "result-source";
        src.textContent = res.source;
        metaDiv.appendChild(src);
      }
      if (res.date) {
        const dt = document.createElement("span");
        dt.className = "result-date";
        dt.textContent = res.date;
        metaDiv.appendChild(dt);
      }
      content.appendChild(metaDiv);
    }

    // Snippet
    if (res.snippet) {
      const snip = document.createElement("div");
      snip.className = "result-snippet";
      snip.textContent = res.snippet;
      content.appendChild(snip);
    }

    card.appendChild(content);
    fragment.appendChild(card);
  });

  container.appendChild(fragment);
}