const fetch = require("node-fetch");

exports.handler = async (event) => {
  try {
    const { messages, prompt } = JSON.parse(event.body || "{}");

    if (!messages && !prompt) {
      return { statusCode: 400, body: "Missing input (messages or prompt)" };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return { statusCode: 500, body: "Missing OpenAI API key" };

    const payload = messages
      ? { model: "gpt-4o", messages, temperature: 0.4 }
      : {
          model: "gpt-4o",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.4
        };

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (data.error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: data.error.message })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(data)
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};