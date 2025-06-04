// /netlify/functions/chatgpt.js
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let prompt;
  try {
    prompt = JSON.parse(event.body).prompt;
  } catch {
    return { statusCode: 400, body: "Missing or invalid prompt" };
  }
  if (!prompt) return { statusCode: 400, body: "Missing prompt" };

  const apiKey = process.env.OPENAI_API_KEY; // Set this in Netlify's UI (Site > Settings > Environment Variables)
  if (!apiKey) return { statusCode: 500, body: "API key not found" };

  try {
    const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await gptRes.json();
    return {
      statusCode: 200,
      body: JSON.stringify(data)
    };
  } catch (err) {
    return { statusCode: 500, body: err.message };
  }
};