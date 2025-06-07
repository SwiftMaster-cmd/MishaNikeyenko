// 🔹 lists.js -- universal info card/list renderer (robust, responsive, accessible)

/**
 * Renders one or more info cards as styled lists.
 * @param {Object|Array} data - Single card object or array of such objects.
 * @param {Object} options - Global render options.
 * @param {string} options.containerId - Target DOM id (default "main")
 * @param {boolean} options.clear - Whether to clear container before rendering (default true)
 * @param {function} options.onItemClick - Optional callback(item, cardIdx, itemIdx)
 */
export function renderInfoList(data, options = {}) {
  const cards = Array.isArray(data) ? data : [data];
  const containerId = options.containerId || cards[0]?.containerId || "main";
  const clear = options.clear !== false;
  const onItemClick = options.onItemClick;

  const container = document.getElementById(containerId);
  if (!container) return console.warn(`renderInfoList: No container #${containerId}`);

  if (clear) container.innerHTML = "";

  cards.forEach((card = {}, cardIdx) => {
    const {
      title = "Untitled",
      icon = "",
      items = [],
      emptyMessage = "No items found.",
      highlight = false
    } = card;

    const section = document.createElement("section");
    section.className = "info-card";
    section.tabIndex = 0;

    // Compose inner HTML with fallback-safe mapping
    const listHTML = Array.isArray(items) && items.length > 0
      ? items.map((item = {}, itemIdx) => `
          <li
            tabindex="0"
            data-card-idx="${cardIdx}"
            data-item-idx="${itemIdx}"
            class="${highlight ? 'highlight' : ''}"
          >
            ${item.label ? `<span class="label">${item.label}</span>` : ""}
            ${item.desc ? `<span class="desc">${item.desc}</span>` : ""}
          </li>
        `).join("")
      : `<li class="desc empty">${emptyMessage}</li>`;

    section.innerHTML = `
      <header>
        <h2>${icon ? `${icon} ` : ""}${title}</h2>
      </header>
      <ul class="info-list" ${onItemClick ? 'style="cursor:pointer;"' : ""}>
        ${listHTML}
      </ul>
    `;

    // Add interaction support
    if (onItemClick && Array.isArray(items)) {
      section.querySelectorAll("ul.info-list > li").forEach(li => {
        li.addEventListener("click", () => {
          const cIdx = parseInt(li.getAttribute("data-card-idx"), 10);
          const iIdx = parseInt(li.getAttribute("data-item-idx"), 10);
          const item = cards[cIdx]?.items?.[iIdx];
          if (item) onItemClick(item, cIdx, iIdx);
        });
        li.addEventListener("keydown", e => {
          if (e.key === "Enter" || e.key === " ") li.click();
        });
      });
    }

    container.appendChild(section);
  });
}