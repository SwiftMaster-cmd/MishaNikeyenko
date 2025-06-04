// /JS/chatgpt.js

const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt) return;

  // Add user message to chat log
  const userLine = document.createElement("div");
  userLine.textContent = `🧑 You: ${prompt}`;
  log.appendChild(userLine);

  // Add GPT placeholder
  const gptLine = document.createElement("div");
  gptLine.textContent = `🤖 GPT: ...thinking...`;
  log.appendChild(gptLine);
  input.value = "";

  try {
    const res = await fetch("/.netlify/functions/chatgpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });

    if (!res.ok) {
      const err = await res.text();
      gptLine.textContent = `❌ Server error: ${err}`;
      return;
    }

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();

    gptLine.textContent = reply
      ? `🤖 GPT: ${reply}`
      : `🤖 GPT: No response received.`;
  } catch (err) {
    gptLine.textContent = `❌ Error: ${err.message}`;
  }
});