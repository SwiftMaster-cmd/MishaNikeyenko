// netlify/functions/brave-search.js
export default async (req, res) => {
  const BRAVE_API_KEY = process.env.BRAVE_API_KEY || 'BSAPL_WUWCZ7JdfD5oCeZ1bAYlhc9n5'; // env or fallback
  const { q, count } = req.query || req.body || {};

  if (!q) {
    res.status(400).json({ error: "Missing 'q' parameter" });
    return;
  }

  const endpoint = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=${count || 5}`;

  try {
    const braveRes = await fetch(endpoint, {
      headers: {
        "Accept": "application/json",
        "X-Subscription-Token": BRAVE_API_KEY,
      },
    });

    if (!braveRes.ok) {
      const errorBody = await braveRes.text();
      res.status(braveRes.status).json({ error: errorBody });
      return;
    }

    const data = await braveRes.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message || "Unknown error" });
  }
};