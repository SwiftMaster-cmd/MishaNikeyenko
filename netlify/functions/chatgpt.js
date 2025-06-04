// netlify/functions/chatgpt.js

exports.handler = async (event) => {
  const { prompt } = JSON.parse(event.body || "{}");
  if (!prompt) {
    return { statusCode: 400, body: "Missing prompt" };
  }

  try {
    // --- BASIC: Only return a canned test reply for "test" prompt
    if (prompt === "test") {
      return {
        statusCode: 200,
        body: JSON.stringify({
          choices: [
            { message: { content: "✅ Backend function is working and prompt received!" } }
          ]
        })
      };
    }

    // --- LIVE: Call OpenAI API if NOT a test
    const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
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