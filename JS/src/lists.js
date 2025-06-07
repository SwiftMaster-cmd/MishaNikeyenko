// lists.js -- universal info card/list renderer (multi-card, robust, future-proof)

/**
 * Renders one or more info cards as beautiful lists.
 * @param {Object|Array} data - Either a single card options object or array of such objects.
 * @param {Object} options - Global options.
 * @param {string} options.containerId - Target DOM id (default "main")
 * @param {boolean} options.clear - Whether to clear container before rendering (default true)
 * @param {function} options.onItemClick - Optional callback(item, cardIdx, itemIdx)
 */
export function renderInfoList(data, options = {}) {
  // Support: single card (object) or multiple cards (array)
  const cards = Array.isArray(data) ? data : [data];
  const containerId = options.containerId || cards[0].containerId || "main";
  const clear = options.clear !== false; // default true
  const onItemClick = options.onItemClick;

  const container = document.getElementById(containerId);
  if (!container) return;

  if (clear) container.innerHTML = "";

  cards.forEach((card, cardIdx) => {
    const {
      title = "",
      icon = "",
      items = [],
      emptyMessage = "No items found."
    } = card;

    // Create card section
    const section = document.createElement("section");
    section.className = "info-card";
    section.tabIndex = 0; // for accessibility

    // Card header
    section.innerHTML = `
      <header>
        <h2>${icon ? icon + " " : ""}${title}</h2>
      </header>
      <ul class="info-list" ${onItemClick ? 'style="cursor:pointer;"' : ""}>
        ${
          items && items.length
            ? items
                .map((i, itemIdx) => `
                  <li tabindex="0" data-card-idx="${cardIdx}" data-item-idx="${itemIdx}">
                    ${i.label ? `<span class="label">${i.label}</span>` : ""}
                    ${i.desc ? `<span class="desc">${i.desc}</span>` : ""}
                  </li>
                `).join("")
            : `<li class="desc">${emptyMessage}</li>`
        }
      </ul>
    `;

    // Optional: Add click/callback support for future interaction
    if (onItemClick && items && items.length) {
      section.querySelectorAll("ul.info-list > li").forEach(li => {
        li.addEventListener("click", e => {
          const cIdx = parseInt(li.getAttribute("data-card-idx"), 10);
          const iIdx = parseInt(li.getAttribute("data-item-idx"), 10);
          onItemClick(cards[cIdx].items[iIdx], cIdx, iIdx);
        });
        li.addEventListener("keydown", e => {
          if (e.key === "Enter" || e.key === " ") {
            li.click();
          }
        });
      });
    }

    container.appendChild(section);
  });
}