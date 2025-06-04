// netlify/functions/chatgpt.js

const fetch = require("node-fetch");

exports.handler = async (event) => {
  try {
    const { prompt, history } = JSON.parse(event.body || "{}");
    if (!prompt) return { statusCode: 400, body: "Missing prompt" };

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, body: "Missing OpenAI API key" };
    }

    const messages = [
      ...(Array.isArray(history) ? history : []),
      { role: "user", content: prompt }
    ];

    const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages,
        temperature: 0.7
      })
    });

    const data = await gptRes.json();

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
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};