// netlify/functions/chatgpt.js
export const handler = async (event) => {
  const body = JSON.parse(event.body || '{}');
  const prompt = body.prompt;

  if (!prompt) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing prompt" }),
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();

    return {
      statusCode: 200,
      body: JSON.stringify(data),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};