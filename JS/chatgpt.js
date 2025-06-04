const apiKey = "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"; // replace with your actual key

const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const prompt = input.value.trim();
  if (!prompt) return;

  const userMsg = document.createElement("div");
  userMsg.textContent = `🧑‍💻 You: ${prompt}`;
  log.appendChild(userMsg);

  input.value = "";

  const botMsg = document.createElement("div");
  botMsg.textContent = "🤖 Thinking...";
  log.appendChild(botMsg);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await res.json();
    botMsg.textContent = `🤖 GPT: ${data?.choices?.[0]?.message?.content.trim() || "No response."}`;
  } catch (err) {
    botMsg.textContent = "❌ Error getting response.";
    console.error(err);
  }
});