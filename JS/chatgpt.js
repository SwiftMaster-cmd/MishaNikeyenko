// ---- Split API key (obscured in 3 chunks) ----
const key1 = "sk-proj-_F8x1C4wqqVn4qQEIkwaw9RpLCgbax4RFdCPll3OKbeFbLwFB";
const key2 = "a7A0UVKnmieOqRQ3pK_HWS42fT3BlbkFJ7V71XUizaXr3LOZFoQdU";
const key3 = "J6ta3IGzUqcansaxCQjYimYEA_9fHh2zdvnYLSlWUvj5-2VyzgJ7gA";
const apiKey = key1 + key2 + key3;

const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt) return;

  // Display user message
  const userLine = document.createElement("div");
  userLine.textContent = `🧑 You: ${prompt}`;
  log.appendChild(userLine);

  // Show thinking placeholder
  const gptLine = document.createElement("div");
  gptLine.textContent = `🤖 GPT: ...thinking...`;
  log.appendChild(gptLine);
  input.value = "";

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
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

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();

    gptLine.textContent = reply
      ? `🤖 GPT: ${reply}`
      : `🤖 GPT: No response received.`;
  } catch (err) {
    gptLine.textContent = `❌ Error: ${err.message}`;
  }
});