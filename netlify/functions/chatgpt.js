const fetch = require("node-fetch");

exports.handler = async (event) => {
  try {
    const {
      messages,
      prompt,
      model = "gpt-4o",
      temperature = 0.7
    } = JSON.parse(event.body || "{}");

    if (!messages && !prompt) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing input (messages or prompt)" })
      };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing OpenAI API key" })
      };
    }

    const payload = messages
      ? { model, messages, temperature }
      : {
          model,
          messages: [{ role: "user", content: prompt }],
          temperature
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

    const reply = data.choices?.[0]?.message?.content || "";
    const tokens = data.usage?.total_tokens || 0;
    const modelUsed = data.model;

    return {
      statusCode: 200,
      body: JSON.stringify({
        reply,
        tokens,
        model: modelUsed
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};