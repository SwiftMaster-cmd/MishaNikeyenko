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