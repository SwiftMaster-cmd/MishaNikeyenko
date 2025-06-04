const apiKey = "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"; // your hardcoded key

const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");

form.onsubmit = async e => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt) return;

  // Add user message
  const userMsg = document.createElement("div");
  userMsg.innerHTML = `🧑‍💻 You: ${prompt}`;
  log.appendChild(userMsg);

  // Add loading placeholder
  const botMsg = document.createElement("div");
  botMsg.innerHTML = "🤖 GPT: <em>Thinking...</em>";
  log.appendChild(botMsg);

  input.value = "";

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

    if (data?.choices?.[0]?.message?.content) {
      botMsg.innerHTML = `🤖 GPT: ${data.choices[0].message.content}`;
    } else {
      botMsg.innerHTML = `❌ Error: ${JSON.stringify(data, null, 2)}`;
    }

  } catch (err) {
    botMsg.innerHTML = `❌ Network or API Error: ${err.message}`;
  }
};