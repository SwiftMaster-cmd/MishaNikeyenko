// tokenTracker.js – Tracks tokens and estimates cost using accurate model pricing

const TOKEN_KEY = "assistantTokenStats";

// ⚠️ Prices are per 1K tokens (input/output costs combined where available)
const MODEL_COSTS = {
  "gpt-4o": 0.005,         // $0.005 per 1K tokens (input+output same)
  "gpt-4": 0.06,           // $0.03 input + $0.06 output avg ~ $0.06
  "gpt-4-0613": 0.06,
  "gpt-4-32k": 0.12,
  "gpt-3.5": 0.002,        // $0.0015 input + $0.002 output avg
  "gpt-3.5-turbo": 0.002
};

export function getTokenStats() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? JSON.parse(raw) : { total: 0, cost: 0, model: "gpt-4o" };
  } catch {
    return { total: 0, cost: 0, model: "gpt-4o" };
  }
}

export function addTokens(count) {
  const stats = getTokenStats();
  stats.total += count;

  const rate = MODEL_COSTS[stats.model] ?? 0.005;
  stats.cost = (stats.total / 1000) * rate;

  localStorage.setItem(TOKEN_KEY, JSON.stringify(stats));
  renderTokenStats();
}

export function setTokenModel(model) {
  const stats = getTokenStats();
  stats.model = model;

  const rate = MODEL_COSTS[model] ?? 0.005;
  stats.cost = (stats.total / 1000) * rate;

  localStorage.setItem(TOKEN_KEY, JSON.stringify(stats));
  renderTokenStats();
}

export function clearTokenStats() {
  localStorage.removeItem(TOKEN_KEY);
  renderTokenStats();
}

export function renderTokenStats() {
  const el = document.getElementById("token-stats");
  if (!el) return;

  const stats = getTokenStats();
  el.innerHTML = `
    <div style="font-size: 0.75rem; color: #aaa;">
      Tokens used: <strong>${stats.total}</strong><br>
      Est. Cost: <strong>$${stats.cost.toFixed(4)}</strong><br>
      Model: <code>${stats.model}</code>
    </div>
  `;
}