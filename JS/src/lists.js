// lists.js -- universal info card/list renderer

/**
 * Render a card with a header and a styled list.
 * @param {Object} options
 * @param {string} options.containerId - DOM id for render target
 * @param {string} options.title - Card title
 * @param {string} [options.icon] - Emoji or icon for title
 * @param {Array} options.items - Array of objects. Each: { label: "...", desc: "..." }
 *   - `label` can be command, note, timestamp, etc.
 *   - `desc` can be the description, value, details, etc.
 */
export function renderInfoList({ containerId = "main", title = "", icon = "", items = [] }) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const card = document.createElement("section");
  card.className = "info-card";
  card.innerHTML = `
    <h2>${icon ? icon + " " : ""}${title}</h2>
    <ul class="info-list">
      ${
        (items && items.length)
          ? items.map(i =>
              `<li>
                <span class="label">${i.label ?? ""}</span>
                ${i.desc ? `<span class="desc">${i.desc}</span>` : ""}
              </li>`
            ).join("")
          : `<li><span class="desc">No items found.</span></li>`
      }
    </ul>
  `;
  container.innerHTML = ""; // wipe before inject
  container.appendChild(card);
}