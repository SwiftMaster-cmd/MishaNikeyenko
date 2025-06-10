// netlify/functions/brave-search.js
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

exports.handler = async function(event, context) {
  const BRAVE_API_KEY = process.env.BRAVE_API_KEY || 'BSAPL_WUWCZ7JdfD5oCeZ1bAYlhc9n5'; // env or fallback

  // Parse querystring (GET) or body (POST)
  let q, count;
  if (event.httpMethod === "GET") {
    const params = new URLSearchParams(event.queryStringParameters);
    q = params.get("q");
    count = params.get("count");
  } else {
    const body = JSON.parse(event.body || "{}");
    q = body.q;
    count = body.count;
  }

  if (!q) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing 'q' parameter" })
    };
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
      return {
        statusCode: braveRes.status,
        body: JSON.stringify({ error: errorBody })
      };
    }

    const data = await braveRes.json();
    return {
      statusCode: 200,
      body: JSON.stringify(data)
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Unknown error" })
    };
  }
};