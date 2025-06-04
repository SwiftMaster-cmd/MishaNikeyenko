// JS/chat.js
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

async function askChatGPT(promptText) {
  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}` // Netlify env var (named VITE_OPENAI_API_KEY)
    },
    body: JSON.stringify({
      model: "gpt-4",
      messages: [{ role: "user", content: promptText }],
      temperature: 0.7
    })
  });

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "No response.";
}

window.askChatGPT = askChatGPT;