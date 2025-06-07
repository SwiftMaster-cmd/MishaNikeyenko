const fetch = require("node-fetch");

exports.handler = async (event) => {
  try {
    const {
      messages,
      prompt,
      model = "gpt-4o",
      temperature = 0.7
    } = JSON.parse(event.body || "{}");

    // Ensure there's at least some content
    if ((!messages || !Array.isArray(messages) || messages.length === 0) && !prompt) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing input: messages or prompt required" })
      };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing OpenAI API key" })
      };
    }

    // Sanitize messages (remove bad items)
    const validMessages = Array.isArray(messages)
      ? messages.filter(m =>
          m &&
          typeof m === "object" &&
          typeof m.role === "string" &&
          typeof m.content === "string"
        )
      : [];

    const payload = {
      model,
      messages: validMessages.length > 0
        ? validMessages
        : [{ role: "user", content: prompt }],
      temperature
    };

    console.log("Sending payload to OpenAI:", JSON.stringify(payload, null, 2));

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
      console.error("OpenAI error:", data.error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: data.error.message })
      };
    }

    const reply = data.choices?.[0]?.message?.content || "";
    const tokens = data.usage?.total_tokens || 0;
    const modelUsed = data.model || model;

    return {
      statusCode: 200,
      body: JSON.stringify({
        reply,
        tokens,
        model: modelUsed
      })
    };
  } catch (err) {
    console.error("Function error:", err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};