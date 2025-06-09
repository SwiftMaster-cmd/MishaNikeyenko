// searchResults.js

/**
 * Renders search results into a container element, using the "minimal outer container"
 * and capping the list at 60vh so it never exceeds the viewport height.
 *
 * @param {Array<Object>} results
 *    Each object may have: { title, url, snippet, source?, date?, thumbnail? }
 * @param {HTMLElement} container
 */
export function renderSearchResults(results, container) {
  // Clear container
  container.innerHTML = "";

  // Outer wrapper with minimal styling (CSS handles most, we ensure it's present)
  const wrapper = document.createElement("div");
  wrapper.className = "search-results";
  // inline safety fallback
  wrapper.style.background = "transparent";
  wrapper.style.boxShadow = "none";
  wrapper.style.padding = "4px 0";
  wrapper.style.margin = "var(--gap) 0";

  // If no results, show message and return
  if (!Array.isArray(results) || results.length === 0) {
    const empty = document.createElement("div");
    empty.className = "search-result-card";
    const msg = document.createElement("div");
    msg.className = "result-snippet";
    msg.textContent = "No results found.";
    empty.appendChild(msg);
    wrapper.appendChild(empty);
    container.appendChild(wrapper);
    return;
  }

  // Create scrollable <ul>
  const list = document.createElement("ul");
  list.style.maxHeight = "60vh";
  list.style.overflowY = "auto";
  list.setAttribute("role", "list");

  const fragment = document.createDocumentFragment();

  results.forEach(res => {
    const li = document.createElement("li");
    li.className = "search-result-card";
    li.setAttribute("role", "listitem");
    li.tabIndex = 0;

    // Thumbnail (optional)
    if (res.thumbnail) {
      const thumb = document.createElement("div");
      thumb.className = "result-thumbnail";
      const img = document.createElement("img");
      img.src = res.thumbnail;
      img.alt = res.title || "";
      img.loading = "lazy";
      thumb.appendChild(img);
      li.appendChild(thumb);
    }

    // Content block
    const content = document.createElement("div");
    content.className = "result-content";

    // Title
    const titleWrap = document.createElement("div");
    titleWrap.className = "result-title";
    const a = document.createElement("a");
    a.href = res.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = res.title || res.url;
    titleWrap.appendChild(a);
    content.appendChild(titleWrap);

    // Meta (source + date)
    if (res.source || res.date) {
      const meta = document.createElement("div");
      meta.className = "result-meta";
      if (res.source) {
        const sp = document.createElement("span");
        sp.className = "result-source";
        sp.textContent = res.source;
        meta.appendChild(sp);
      }
      if (res.date) {
        const sp = document.createElement("span");
        sp.className = "result-date";
        sp.textContent = res.date;
        meta.appendChild(sp);
      }
      content.appendChild(meta);
    }

    // Snippet
    if (res.snippet) {
      const sn = document.createElement("div");
      sn.className = "result-snippet";
      sn.textContent = res.snippet;
      content.appendChild(sn);
    }

    // URL line
    if (res.url) {
      const urlLine = document.createElement("div");
      urlLine.className = "result-url";
      urlLine.textContent = res.url;
      content.appendChild(urlLine);
    }

    li.appendChild(content);
    fragment.appendChild(li);
  });

  list.appendChild(fragment);
  wrapper.appendChild(list);
  container.appendChild(wrapper);
}